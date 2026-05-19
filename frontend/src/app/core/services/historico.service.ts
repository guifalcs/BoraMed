import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { StreakEstudoV2 } from '../models/gamificacao';
import type { HistoricoKpis, DesempenhoTema, TentativaHistoricoItem } from '../models/historico';
import type { ModoProva } from '../models/tentativa';

type HistoricoResult<T> = { ok: true; data: T } | { ok: false; error: string };

@Injectable({ providedIn: 'root' })
export class HistoricoService {
  private readonly supabase = inject(SupabaseService).client;

  async getKpis(): Promise<HistoricoResult<HistoricoKpis>> {
    try {
      const { data, error } = await this.supabase.rpc('get_historico_kpis');
      if (error) throw error;
      return { ok: true, data: data as HistoricoKpis };
    } catch {
      return { ok: false, error: 'Não foi possível carregar os KPIs.' };
    }
  }

  async getDesempenhoTemas(): Promise<HistoricoResult<DesempenhoTema[]>> {
    try {
      const { data, error } = await this.supabase.rpc('get_desempenho_por_tema');
      if (error) throw error;
      return { ok: true, data: (data ?? []) as DesempenhoTema[] };
    } catch {
      return { ok: false, error: 'Não foi possível carregar o desempenho por tema.' };
    }
  }

  async listarTentativas(limit = 50): Promise<HistoricoResult<TentativaHistoricoItem[]>> {
    try {
      const { data, error } = await this.supabase
        .from('tentativa')
        .select('id, prova_id, modo, nota, total_questoes, acertos, finalizada_em, prova:prova_id(nome, tipo, origem, formato)')
        .eq('status', 'finalizada')
        .neq('modo', 'visualizar')
        .order('finalizada_em', { ascending: false })
        .limit(limit);

      if (error) throw error;

      type RawRow = {
        id: string;
        prova_id: string;
        modo: ModoProva;
        nota: number | null;
        total_questoes: number;
        acertos: number;
        finalizada_em: string | null;
        prova:
          | { nome: string; tipo: string; origem: string | null; formato: string | null }
          | { nome: string; tipo: string; origem: string | null; formato: string | null }[]
          | null;
      };

      const items: TentativaHistoricoItem[] = ((data ?? []) as unknown as RawRow[]).map((r) => {
        const prova = Array.isArray(r.prova) ? r.prova[0] : r.prova;
        const tipo = prova?.formato ?? prova?.tipo ?? 'nacional';
        const nome = prova?.origem === 'personalizado' ? 'Simulado Personalizado' : (prova?.nome ?? 'Prova');
        return {
          id: r.id,
          prova_id: r.prova_id,
          modo: r.modo,
          nota: r.nota,
          total_questoes: r.total_questoes,
          acertos: r.acertos,
          finalizada_em: r.finalizada_em,
          prova_nome: nome,
          tipo_prova: tipo,
        };
      });

      return { ok: true, data: items };
    } catch {
      return { ok: false, error: 'Não foi possível carregar o histórico.' };
    }
  }

  async getStreak(): Promise<HistoricoResult<number>> {
    try {
      const { data, error } = await this.supabase.rpc('get_streak_estudo');
      if (error) throw error;
      return { ok: true, data: (data as number) ?? 0 };
    } catch {
      return { ok: false, error: 'Não foi possível carregar o streak.' };
    }
  }

  async getStreakV2(): Promise<HistoricoResult<StreakEstudoV2>> {
    try {
      const { data, error } = await this.supabase.rpc('get_streak_estudo_v2');
      if (error) throw error;
      return { ok: true, data: parseStreakV2(data) };
    } catch {
      return { ok: false, error: 'Não foi possível carregar o streak.' };
    }
  }
}

function parseStreakV2(value: unknown): StreakEstudoV2 {
  const record = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    atual: toNumber(record['atual']),
    recorde: toNumber(record['recorde']),
    freezes_disponiveis: toNumber(record['freezes_disponiveis']),
    freeze_usado_hoje: record['freeze_usado_hoje'] === true,
    dias_para_proximo_marco: toNumber(record['dias_para_proximo_marco']),
  };
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
