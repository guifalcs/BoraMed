import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { parseConquistas } from './conquista.service';
import type { ConcederXpTentativaResult, GamificacaoStats } from '../models/gamificacao';

type GamificacaoResult<T> = { ok: true; data: T } | { ok: false; error: string };

const emptyStats: GamificacaoStats = {
  xp_total: 0,
  xp_semana_atual: 0,
  semana_iso: null,
  nivel: 0,
  streak_atual: 0,
  streak_recorde: 0,
  freezes_disponiveis: 0,
  competir_publico: true,
};

@Injectable({ providedIn: 'root' })
export class GamificacaoService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly _stats = signal<GamificacaoStats>(emptyStats);

  readonly stats = this._stats.asReadonly();

  async getMeuXp(): Promise<GamificacaoResult<GamificacaoStats>> {
    try {
      const { data, error } = await this.supabase.rpc('get_meu_xp');
      if (error) throw error;

      const stats = parseStats(data);
      this._stats.set(stats);
      return { ok: true, data: stats };
    } catch {
      return { ok: false, error: 'Não foi possível carregar seu XP.' };
    }
  }

  async concederXpTentativa(tentativaId: string): Promise<GamificacaoResult<ConcederXpTentativaResult>> {
    try {
      const { data, error } = await this.supabase.rpc('conceder_xp_tentativa', {
        p_tentativa_id: tentativaId,
      });
      if (error) throw error;

      const result = parseConcederXpResult(data);
      this._stats.set(result.stats);
      return { ok: true, data: result };
    } catch {
      return { ok: false, error: 'Não foi possível registrar XP da tentativa.' };
    }
  }
}

function parseConcederXpResult(value: unknown): ConcederXpTentativaResult {
  const record = asRecord(value);

  return {
    xp_ganho: toNumber(record['xp_ganho']),
    ja_concedido: record['ja_concedido'] === true,
    novas_conquistas: parseConquistas(record['novas_conquistas']),
    stats: parseStats(record['stats']),
  };
}

function parseStats(value: unknown): GamificacaoStats {
  const record = asRecord(value);

  return {
    xp_total: toNumber(record['xp_total']),
    xp_semana_atual: toNumber(record['xp_semana_atual']),
    semana_iso: typeof record['semana_iso'] === 'string' ? record['semana_iso'] : null,
    nivel: toNumber(record['nivel']),
    streak_atual: toNumber(record['streak_atual']),
    streak_recorde: toNumber(record['streak_recorde']),
    freezes_disponiveis: toNumber(record['freezes_disponiveis']),
    competir_publico: typeof record['competir_publico'] === 'boolean' ? record['competir_publico'] : true,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
