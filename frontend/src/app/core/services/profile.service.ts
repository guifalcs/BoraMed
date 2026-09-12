import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { compressImage } from '../utils/image-compress.util';
import type { Profile } from '../models/auth.types';
import type { FaculdadeUnidade } from '../models/faculdade-unidade';
import type { ChangePasswordInput, UpdateProfileInput } from '../models/profile.schemas';

export type ProfileResult = { ok: true } | { ok: false; error: string };

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  private readonly _profile = signal<Profile | null>(null);
  private readonly _isLoading = signal(false);
  private loadPromise: Promise<void> | null = null;

  readonly profile = this._profile.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  /** Campos que o perfil legado pode não ter e o modal obrigatório cobra. */
  readonly faltaFaculdadeUnidade = computed(() => this._profile()?.faculdade_unidade == null);
  readonly faltaPeriodo = computed(() => this._profile()?.periodo == null);

  /**
   * Gate obrigatório de unidade Afya + período: enquanto verdadeiro, o shell do
   * dashboard suprime avisos/onboarding/paywall (ver dashboard.component)
   * para que Esc/setas globais desses overlays não vazem por trás do modal
   * de dados obrigatórios, que não tem esses atalhos de fechar.
   */
  readonly precisaDadosObrigatorios = computed(() => {
    const profile = this._profile();
    if (profile === null || this.auth.impersonando()) return false;
    return profile.faculdade_unidade === null || profile.periodo === null;
  });

  clear(): void {
    this._profile.set(null);
  }

  async loadProfile(): Promise<void> {
    const user = this.auth.user();
    if (!user) return;

    // Dedup: o guard e o effect do dashboard disparam quase juntos no load
    // inicial; sem isto, seriam duas buscas idênticas em paralelo.
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.fetchProfile(user.id).finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  private async fetchProfile(userId: string): Promise<void> {
    this._isLoading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
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
      // faculdade_unidade só é limpo se explicitamente enviado como null — omitir
      // a chave preserva o valor já preenchido pelo modal obrigatório em vez de
      // zerá-lo numa race entre o modal e este form (mesma linha de perfis).
      const payload: Record<string, unknown> = {
        nome_completo: input.nome_completo,
        tipo_usuario: input.tipo_usuario ?? null,
        periodo: input.periodo ?? null,
      };
      if ('faculdade_unidade' in input) {
        payload['faculdade_unidade'] = input.faculdade_unidade ?? null;
      }

      const { data, error } = await this.supabase
        .from('profiles')
        .update(payload)
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

  /**
   * Grava só os campos que o modal obrigatório pediu — quem já tinha unidade ou
   * período não tem o valor atual sobrescrito.
   */
  async updateDadosObrigatorios(input: {
    faculdade_unidade?: FaculdadeUnidade;
    periodo?: number;
  }): Promise<ProfileResult> {
    const user = this.auth.user();
    if (!user) return { ok: false, error: 'Usuário não autenticado.' };

    const payload: Record<string, unknown> = {};
    if (input.faculdade_unidade !== undefined) payload['faculdade_unidade'] = input.faculdade_unidade;
    if (input.periodo !== undefined) payload['periodo'] = input.periodo;
    if (Object.keys(payload).length === 0) return { ok: true };

    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .update(payload)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      this._profile.set(data as Profile);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Não foi possível salvar seus dados. Tente novamente.' };
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
