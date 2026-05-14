import { Injectable, OnDestroy, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import type { LoginInput, RecoverPasswordInput, ResetPasswordInput, SignupInput } from '../models/auth.schemas';
import type { AuthErrorCode, AuthResult } from '../models/auth.types';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly supabase = inject(SupabaseService).client;
  private readonly router = inject(Router);

  private readonly _user = signal<User | null>(null);
  private readonly _isReady = signal(false);

  readonly user = this._user.asReadonly();
  readonly isReady = this._isReady.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  private readonly platformId = inject(PLATFORM_ID);
  private authSubscription?: { unsubscribe: () => void };

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;
    const { data } = this.supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        this._user.set(session?.user ?? null);

        if (event === 'SIGNED_OUT') {
          void this.router.navigate(['/login']);
        }
        if (event === 'PASSWORD_RECOVERY') {
          void this.router.navigate(['/redefinir-senha']);
        }
      },
    );
    this.authSubscription = data.subscription;
  }

  async initialize(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      this._isReady.set(true);
      return;
    }
    try {
      const { data } = await this.supabase.auth.getUser();
      this._user.set(data.user);
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
      redirectTo: `${window.location.origin}/redefinir-senha`,
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
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    return error ? { ok: false, error: this.mapError(error.message) } : { ok: true };
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
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
