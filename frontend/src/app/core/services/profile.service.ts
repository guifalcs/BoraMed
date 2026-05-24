import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { compressImage } from '../utils/image-compress.util';
import type { Profile } from '../models/auth.types';
import type { ChangePasswordInput, UpdateProfileInput } from '../models/profile.schemas';

export type ProfileResult = { ok: true } | { ok: false; error: string };

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  private readonly _profile = signal<Profile | null>(null);
  private readonly _isLoading = signal(false);

  readonly profile = this._profile.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  clear(): void {
    this._profile.set(null);
  }

  async loadProfile(): Promise<void> {
    const user = this.auth.user();
    if (!user) return;

    this._isLoading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      this._profile.set(data as Profile);
    } catch {
      this._profile.set(null);
    } finally {
      this._isLoading.set(false);
    }
  }

  async updateProfile(input: UpdateProfileInput): Promise<ProfileResult> {
    const user = this.auth.user();
    if (!user) return { ok: false, error: 'Usuário não autenticado.' };

    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .update({
          nome_completo: input.nome_completo,
          tipo_usuario: input.tipo_usuario ?? null,
          periodo: input.periodo ?? null,
          faculdade_rede: input.faculdade_rede ?? null,
        })
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      this._profile.set(data as Profile);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Não foi possível salvar os dados. Tente novamente.' };
    }
  }

  async updateCompetirPublico(competirPublico: boolean): Promise<ProfileResult> {
    const user = this.auth.user();
    if (!user) return { ok: false, error: 'Usuário não autenticado.' };

    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .update({ competir_publico: competirPublico })
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      this._profile.set(data as Profile);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Não foi possível salvar a privacidade competitiva.' };
    }
  }

  async uploadAvatar(file: File): Promise<ProfileResult> {
    const user = this.auth.user();
    if (!user) return { ok: false, error: 'Usuário não autenticado.' };

    try {
      const compressed = await compressImage(file, { maxWidth: 512, maxHeight: 512, quality: 0.80 });
      const path = `${user.id}/avatar.webp`;

      const { error: uploadError } = await this.supabase.storage
        .from('avatars')
        .upload(path, compressed, { upsert: true, contentType: compressed.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = this.supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { data, error: updateError } = await this.supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)
        .select()
        .single();

      if (updateError) throw updateError;

      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => resolve();
        img.src = publicUrl;
      });

      this._profile.set(data as Profile);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Não foi possível enviar a foto. Verifique sua conexão e tente novamente.' };
    }
  }

  async removeAvatar(): Promise<ProfileResult> {
    const user = this.auth.user();
    if (!user) return { ok: false, error: 'Usuário não autenticado.' };

    const currentProfile = this._profile();
    if (!currentProfile?.avatar_url) return { ok: false, error: 'Nenhum avatar para remover.' };

    try {
      // Extract the storage path from the public URL
      const url = new URL(currentProfile.avatar_url);
      const pathParts = url.pathname.split('/avatars/');
      const storagePath = pathParts[1] ?? '';

      if (storagePath) {
        const { error: deleteError } = await this.supabase.storage
          .from('avatars')
          .remove([storagePath]);

        if (deleteError) throw deleteError;
      }

      const { data, error: updateError } = await this.supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', user.id)
        .select()
        .single();

      if (updateError) throw updateError;
      this._profile.set(data as Profile);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Não foi possível remover a foto. Tente novamente.' };
    }
  }

  async changePassword(input: ChangePasswordInput): Promise<ProfileResult> {
    const user = this.auth.user();
    if (!user) return { ok: false, error: 'Usuário não autenticado.' };

    try {
      const { error: signInError } = await this.supabase.auth.signInWithPassword({
        email: user.email ?? '',
        password: input.currentPassword,
      });

      if (signInError) return { ok: false, error: 'Senha atual incorreta.' };

      const { error: updateError } = await this.supabase.auth.updateUser({
        password: input.newPassword,
      });

      if (updateError) throw updateError;
      return { ok: true };
    } catch {
      return { ok: false, error: 'Não foi possível alterar a senha. Tente novamente.' };
    }
  }
}
