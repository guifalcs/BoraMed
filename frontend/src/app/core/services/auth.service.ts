import { Injectable, OnDestroy, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import type { LoginInput, RecoverPasswordInput, ResetPasswordInput, SignupInput } from '../models/auth.schemas';
import type { AuthErrorCode, AuthResult, ImpersonacaoInfo } from '../models/auth.types';
import { SupabaseService } from './supabase.service';
import { CacheService } from './cache.service';

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly supabase = inject(SupabaseService).client;
  private readonly router = inject(Router);
  private readonly cache = inject(CacheService);

  private readonly _user = signal<User | null>(null);
  private readonly _isReady = signal(false);

  readonly user = this._user.asReadonly();
  readonly isReady = this._isReady.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  private readonly ADMIN_SESSION_KEY = 'boramed_admin_session';
  private readonly _impersonando = signal<ImpersonacaoInfo | null>(null);
  readonly impersonando = this._impersonando.asReadonly();

  private readonly platformId = inject(PLATFORM_ID);
  private authSubscription?: { unsubscribe: () => void };
  private initializePromise: Promise<void> | null = null;

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;
    const { data } = this.supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        this._user.set(session?.user ?? null);

        if (event === 'SIGNED_OUT' && !this.router.getCurrentNavigation()) {
          void this.router.navigate(['/login']);
        }
        if (event === 'PASSWORD_RECOVERY' && !this.router.getCurrentNavigation()) {
          void this.router.navigate(['/redefinir-senha']);
        }
      },
    );
    this.authSubscription = data.subscription;
  }

  async initialize(): Promise<void> {
    if (this._isReady()) return;
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = this.loadInitialSession().finally(() => {
      this.initializePromise = null;
    });

    return this.initializePromise;
  }

  private async loadInitialSession(): Promise<void> {
    try {
      const { data } = await this.supabase.auth.getUser();
      this._user.set(data.user ?? null);
      if (isPlatformBrowser(this.platformId) && data.user) {
        try {
          const saved = sessionStorage.getItem(this.ADMIN_SESSION_KEY);
          if (saved) {
            const backup = JSON.parse(saved);
            const targetName = data.user.user_metadata?.['full_name'] ?? data.user.email ?? 'Usuário';
            this._impersonando.set({ adminName: backup.adminName, targetName });
          }
        } catch { /* ignorar */ }
      }
    } catch {
      this._user.set(null);
    } finally {
      this._isReady.set(true);
    }
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const { error } = await this.supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    return error ? { ok: false, error: this.mapError(error.message) } : { ok: true };
  }

  async signup(input: SignupInput): Promise<AuthResult> {
    const { data, error } = await this.supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { full_name: input.fullName } },
    });
    if (error) return { ok: false, error: this.mapError(error.message) };
    return { ok: true, needsConfirmation: data.session === null };
  }

  async recoverPassword(input: RecoverPasswordInput): Promise<AuthResult> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
    });
    return error ? { ok: false, error: this.mapError(error.message) } : { ok: true };
  }

  async resetPassword(input: ResetPasswordInput): Promise<AuthResult> {
    const { error } = await this.supabase.auth.updateUser({ password: input.password });
    return error ? { ok: false, error: this.mapError(error.message) } : { ok: true };
  }

  async signInWithGoogle(): Promise<AuthResult> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    return error ? { ok: false, error: this.mapError(error.message) } : { ok: true };
  }

  async signOut(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.removeItem(this.ADMIN_SESSION_KEY);
      this._impersonando.set(null);
      this.cache.clear();
    }
    await this.supabase.auth.signOut();
  }

  async impersonar(
    tokenHash: string,
    targetUserId: string,
    targetName: string | null,
    adminName: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isPlatformBrowser(this.platformId)) return { ok: false, error: 'SSR' };

    const { data: sessionData } = await this.supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) return { ok: false, error: 'Sem sessão ativa' };

    try {
      // Não persistir tokens: refresh token de admin em sessionStorage é
      // exfiltrável por XSS. Guardamos só o nome do admin para exibir o banner;
      // a reversão imediata (mismatch abaixo) usa a `session` em memória, e a
      // saída da impersonação re-autentica o admin (voltarParaAdmin).
      sessionStorage.setItem(this.ADMIN_SESSION_KEY, JSON.stringify({ adminName }));
    } catch {
      return { ok: false, error: 'Erro ao salvar sessão' };
    }

    const { error } = await this.supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    });

    if (error) {
      sessionStorage.removeItem(this.ADMIN_SESSION_KEY);
      return { ok: false, error: error.message };
    }

    const { data: userData, error: userError } = await this.supabase.auth.getUser();
    if (userError || userData.user?.id !== targetUserId) {
      await this.supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      sessionStorage.removeItem(this.ADMIN_SESSION_KEY);
      this._impersonando.set(null);
      return { ok: false, error: 'Sessão incorporada não corresponde ao usuário selecionado.' };
    }

    this._user.set(userData.user);
    this._impersonando.set({ adminName, targetName: targetName ?? 'Usuário' });
    void this.router.navigate(['/dashboard']);
    return { ok: true };
  }

  async voltarParaAdmin(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    // Sem tokens de admin persistidos (por segurança): encerramos a sessão
    // impersonada e enviamos o admin para re-autenticar.
    sessionStorage.removeItem(this.ADMIN_SESSION_KEY);
    this._impersonando.set(null);
    this.cache.clear();
    await this.supabase.auth.signOut();
    void this.router.navigate(['/login']);
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  private mapError(message: string): AuthErrorCode {
    const m = message.toLowerCase();
    if (m.includes('invalid login') || m.includes('invalid credentials')) return 'INVALID_CREDENTIALS';
    if (m.includes('email not confirmed')) return 'EMAIL_NOT_CONFIRMED';
    if (m.includes('already registered') || m.includes('already been registered')) return 'EMAIL_IN_USE';
    if (m.includes('password')) return 'WEAK_PASSWORD';
    if (m.includes('rate limit') || m.includes('too many')) return 'RATE_LIMITED';
    if (m.includes('fetch') || m.includes('network')) return 'NETWORK_ERROR';
    return 'UNKNOWN';
  }
}
