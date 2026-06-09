import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { MinhaPosicaoRanking, RankingItem } from '../models/gamificacao';

type RankingResult<T> = { ok: true; data: T } | { ok: false; error: string };

@Injectable({ providedIn: 'root' })
export class RankingService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly _rankingGlobal = signal<RankingItem[]>([]);
  private readonly _rankingSemana = signal<RankingItem[]>([]);
  private readonly _minhaPosicao = signal<MinhaPosicaoRanking | null>(null);

  readonly rankingGlobal = this._rankingGlobal.asReadonly();
  readonly rankingSemana = this._rankingSemana.asReadonly();
  readonly minhaPosicao = this._minhaPosicao.asReadonly();

  async carregarRankingGlobal(limite = 10): Promise<RankingResult<RankingItem[]>> {
    try {
      const { data, error } = await this.supabase.rpc('get_ranking_global', { p_limite: limite });
      if (error) throw error;
      const ranking = parseRanking(data);
      this._rankingGlobal.set(ranking);
      return { ok: true, data: ranking };
    } catch {
      return { ok: false, error: 'Não foi possível carregar o ranking global.' };
    }
  }

  async carregarRankingSemana(limite = 10): Promise<RankingResult<RankingItem[]>> {
    try {
      const { data, error } = await this.supabase.rpc('get_ranking_semana', { p_limite: limite });
      if (error) throw error;
      const ranking = parseRanking(data);
      this._rankingSemana.set(ranking);
      return { ok: true, data: ranking };
    } catch {
      return { ok: false, error: 'Não foi possível carregar o ranking da semana.' };
    }
  }

  async carregarMinhaPosicao(): Promise<RankingResult<MinhaPosicaoRanking>> {
    try {
      const { data, error } = await this.supabase.rpc('get_minha_posicao_ranking');
      if (error) throw error;
      const posicao = parseMinhaPosicao(data);
      this._minhaPosicao.set(posicao);
      return { ok: true, data: posicao };
    } catch {
      return { ok: false, error: 'Não foi possível carregar sua posição.' };
    }
  }
}

function parseRanking(value: unknown): RankingItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseRankingItem).filter((item): item is RankingItem => item !== null);
}

function parseRankingItem(value: unknown): RankingItem | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const userId = record['user_id'];
  const nomeDisplay = record['nome_display'];
  // user_id pode vir NULL (perfil privado mascarado pelo backend); só nome_display é obrigatório.
  if (typeof nomeDisplay !== 'string') return null;

  return {
    user_id: typeof userId === 'string' ? userId : null,
    nome_display: nomeDisplay,
    avatar_url: typeof record['avatar_url'] === 'string' ? record['avatar_url'] : null,
    nivel: toNumber(record['nivel']),
    xp_total: toNumber(record['xp_total']),
    xp_semana_atual: toNumber(record['xp_semana_atual']),
    posicao: toNumber(record['posicao']),
    is_me: record['is_me'] === true,
  };
}

function parseMinhaPosicao(value: unknown): MinhaPosicaoRanking {
  const record = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    posicao_global: toNullableNumber(record['posicao_global']),
    posicao_semana: toNullableNumber(record['posicao_semana']),
    total_global: toNumber(record['total_global']),
    total_semana: toNumber(record['total_semana']),
  };
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
