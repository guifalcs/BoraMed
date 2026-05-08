import type { User } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  email: string;
  criado_em: string;
}

export type AuthResult = { ok: true } | { ok: false; error: AuthErrorCode };

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'EMAIL_IN_USE'
  | 'WEAK_PASSWORD'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export type { User };
