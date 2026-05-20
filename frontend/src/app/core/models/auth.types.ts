import type { User } from '@supabase/supabase-js';

export const TIPO_USUARIO_VALUES = [
  'estudante_medicina',
  'medico',
  'residente',
  'cursinho',
  'ensino_medio',
  'outro',
] as const;

export type TipoUsuario = (typeof TIPO_USUARIO_VALUES)[number];

export const FACULDADE_REDE_VALUES = ['rede_afya', 'outros'] as const;
export type FaculdadeRede = (typeof FACULDADE_REDE_VALUES)[number];

export type PapelUsuario = 'aluno' | 'admin' | 'super_admin';

export interface Profile {
  id: string;
  email: string;
  criado_em: string;
  nome_completo: string | null;
  avatar_url: string | null;
  tipo_usuario: TipoUsuario | null;
  periodo: number | null;
  faculdade_rede: FaculdadeRede | null;
  competir_publico: boolean;
  papel: PapelUsuario;
  atualizado_em: string;
}

export type AuthResult = { ok: true; needsConfirmation?: boolean } | { ok: false; error: AuthErrorCode };

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'EMAIL_IN_USE'
  | 'WEAK_PASSWORD'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface AdminSessionBackup {
  access_token: string;
  refresh_token: string;
  adminName: string;
}

export interface ImpersonacaoInfo {
  adminName: string;
  targetName: string;
}

export type { User };
