import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
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
        .select('id, prova_id, modo, nota, total_questoes, acertos, finalizada_em, prova:prova_id(nome)')
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
        prova: { nome: string } | null;
      };

      const items: TentativaHistoricoItem[] = ((data ?? []) as RawRow[]).map((r) => ({
        id: r.id,
        prova_id: r.prova_id,
        modo: r.modo,
        nota: r.nota,
        total_questoes: r.total_questoes,
        acertos: r.acertos,
        finalizada_em: r.finalizada_em,
        prova_nome: r.prova?.nome ?? 'Prova',
      }));

      return { ok: true, data: items };
    } catch {
      return { ok: false, error: 'Não foi possível carregar o histórico.' };
    }
  }
}
