import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { ConquistaUsuario } from '../models/gamificacao';

type ConquistaResult<T> = { ok: true; data: T } | { ok: false; error: string };

@Injectable({ providedIn: 'root' })
export class ConquistaService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly _conquistas = signal<ConquistaUsuario[]>([]);

  readonly conquistas = this._conquistas.asReadonly();

  async listarMinhasConquistas(): Promise<ConquistaResult<ConquistaUsuario[]>> {
    try {
      const { data, error } = await this.supabase.rpc('get_minhas_conquistas');
      if (error) throw error;

      const conquistas = parseConquistas(data);
      this._conquistas.set(conquistas);
      return { ok: true, data: conquistas };
    } catch {
      return { ok: false, error: 'Não foi possível carregar conquistas.' };
    }
  }
}

export function parseConquistas(value: unknown): ConquistaUsuario[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseConquista).filter((item): item is ConquistaUsuario => item !== null);
}

function parseConquista(value: unknown): ConquistaUsuario | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = record['id'];
  const nome = record['nome'];
  const descricao = record['descricao'];
  const icone = record['icone'];
  const categoria = record['categoria'];

  if (
    typeof id !== 'string' ||
    typeof nome !== 'string' ||
    typeof descricao !== 'string' ||
    typeof icone !== 'string' ||
    typeof categoria !== 'string'
  ) {
    return null;
  }

  return {
    id,
    nome,
    descricao,
    icone,
    categoria,
    xp_recompensa: toNumber(record['xp_recompensa']),
    secreta: typeof record['secreta'] === 'boolean' ? record['secreta'] : false,
    desbloqueada_em: typeof record['desbloqueada_em'] === 'string' ? record['desbloqueada_em'] : null,
  };
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
