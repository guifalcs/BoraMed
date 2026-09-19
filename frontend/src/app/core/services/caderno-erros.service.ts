import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { QuestaoComAlternativas } from '../models/questao';
import type { Tentativa } from '../models/tentativa';
import type {
  CadernoErrosPagina,
  CadernoErrosResumo,
  FiltrosCadernoErros,
  QuestaoErroItem,
  TipoQuestaoCadernoErros,
} from '../models/caderno-erros';

/**
 * Formato bruto (snake_case) devolvido pela RPC `get_caderno_erros`
 * (migration 20260918120000_caderno_de_erros.sql).
 */
interface QuestaoErroItemRaw {
  questao_id: string;
  enunciado: string;
  tipo_questao: TipoQuestaoCadernoErros;
  formato: string;
  formato_prova: string | null;
  temas: string[] | null;
  tema_principal: string;
  tema_origem: 'tema' | 'disciplina' | 'tipo';
  disciplina: string | null;
  prova_id: string | null;
  tentativa_id: string | null;
  erro_em: string | null;
  status: 'pendente' | 'dominada';
  ultima_redo_correta: boolean | null;
  ultima_redo_em: string | null;
  total_count: number;
}

/** Formato bruto (snake_case) devolvido pela RPC `get_caderno_erros_resumo`. */
interface CadernoErrosResumoRaw {
  total_pendentes: number;
  por_tipo_questao: Record<TipoQuestaoCadernoErros, number> | null;
  tema_mais_fraco: string | null;
  dominadas_ultimos_7_dias: number;
}

/** Formato bruto (snake_case) devolvido pela RPC `responder_questao_avulsa`. */
interface RespostaAvulsaRaw {
  correta: boolean;
  alternativa_correta_id?: string | null;
  explicacao?: string | null;
}

/** Formato bruto devolvido pela RPC `gerar_simulado_personalizado` (mesmo shape usado em TentativaService). */
interface SimuladoGeradoRaw {
  prova_id: string;
  tentativa: Tentativa;
}

@Injectable({ providedIn: 'root' })
export class CadernoErrosService {
  private readonly supabase = inject(SupabaseService).client;

  async getCadernoErros(
    filtros: FiltrosCadernoErros = {},
    pagina = 1,
    porPagina = 20,
  ): Promise<CadernoErrosPagina> {
    const { data, error } = await this.supabase.rpc('get_caderno_erros', {
      p_tema_ids: filtros.temaIds?.length ? filtros.temaIds : null,
      p_disciplina_ids: filtros.disciplinaIds?.length ? filtros.disciplinaIds : null,
      p_tipo_questao: filtros.tipoQuestao?.length ? filtros.tipoQuestao : null,
      p_status: filtros.status ?? null,
      p_busca: filtros.busca?.trim() ? filtros.busca.trim() : null,
      p_pagina: pagina,
      p_por_pagina: porPagina,
    });
    if (error) throw error;
    const rows = (data ?? []) as QuestaoErroItemRaw[];
    const totalCount = rows[0]?.total_count ?? 0;
    return {
      itens: rows.map(mapQuestaoErroItem),
      totalCount,
      pagina,
      porPagina,
      totalPaginas: Math.max(1, Math.ceil(totalCount / porPagina)),
    };
  }

  async getResumo(): Promise<CadernoErrosResumo> {
    const { data, error } = await this.supabase.rpc('get_caderno_erros_resumo');
    if (error) throw error;
    return mapResumo(data as CadernoErrosResumoRaw);
  }

  async getQuestaoParaRefazer(questaoId: string): Promise<QuestaoComAlternativas> {
    const { data, error } = await this.supabase.rpc('get_questao_para_refazer', {
      p_questao_id: questaoId,
    });
    if (error) throw error;
    return data as QuestaoComAlternativas;
  }

  async responderAvulsa(
    questaoId: string,
    alternativaId?: string,
    respostaTexto?: string,
  ): Promise<{ correta: boolean; alternativaCorretaId?: string; explicacao?: string }> {
    const { data, error } = await this.supabase.rpc('responder_questao_avulsa', {
      p_questao_id: questaoId,
      p_alternativa_id: alternativaId ?? null,
      p_resposta_texto: respostaTexto ?? null,
    });
    if (error) throw error;
    const raw = data as RespostaAvulsaRaw;
    return {
      correta: raw.correta,
      alternativaCorretaId: raw.alternativa_correta_id ?? undefined,
      explicacao: raw.explicacao ?? undefined,
    };
  }

  async marcarDominada(questaoId: string, dominada: boolean): Promise<void> {
    const { error } = await this.supabase.rpc('marcar_questao_dominada', {
      p_questao_id: questaoId,
      p_dominada: dominada,
    });
    if (error) throw error;
  }

  async gerarSimuladoComErros(
    filtros: FiltrosCadernoErros & { qtd: number },
  ): Promise<{ provaId: string; tentativaId: string }> {
    const { data, error } = await this.supabase.rpc('gerar_simulado_personalizado', {
      p_tema_ids: filtros.temaIds?.length ? filtros.temaIds : null,
      p_qtd: filtros.qtd,
      p_modo: 'simulado',
      p_tipo_questao: filtros.tipoQuestao?.length === 1 ? filtros.tipoQuestao[0] : null,
      p_apenas_erros: true,
    });
    if (error) throw error;
    const raw = data as SimuladoGeradoRaw;
    return { provaId: raw.prova_id, tentativaId: raw.tentativa.id };
  }
}

function mapQuestaoErroItem(raw: QuestaoErroItemRaw): QuestaoErroItem {
  return {
    questaoId: raw.questao_id,
    enunciado: raw.enunciado,
    tipoQuestao: raw.tipo_questao,
    formato: raw.formato,
    formatoProva: raw.formato_prova,
    temas: raw.temas ?? [],
    temaPrincipal: raw.tema_principal,
    temaOrigem: raw.tema_origem,
    disciplina: raw.disciplina,
    provaId: raw.prova_id ?? null,
    tentativaId: raw.tentativa_id ?? null,
    erroEm: raw.erro_em ?? '',
    status: raw.status,
    ultimaRedoCorreta: raw.ultima_redo_correta,
    ultimaRedoEm: raw.ultima_redo_em,
  };
}

function mapResumo(raw: CadernoErrosResumoRaw): CadernoErrosResumo {
  return {
    totalPendentes: raw.total_pendentes,
    porTipoQuestao: raw.por_tipo_questao ?? { nacional: 0, processual: 0, laboratorio: 0 },
    temaMaisFraco: raw.tema_mais_fraco,
    dominadasUltimos7Dias: raw.dominadas_ultimos_7_dias,
  };
}
