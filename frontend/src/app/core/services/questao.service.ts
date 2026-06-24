import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { QuestaoComAlternativas } from '../models/questao';
import type { Tema } from '../models/tema';
import type { ProvaResult } from './prova.service';

type RawQuestao = Omit<QuestaoComAlternativas, 'temas'> & {
  temas: { tema: Tema }[];
};

type RawProvaQuestao = {
  ordem: number;
  questao: RawQuestao | null;
};

// Colunas de gabarito/solução foram revogadas das tabelas-base
// (migration 20260624120000): `alternativa.correta` e
// `questao.{resposta_correta_texto,respostas_aceitas,explicacao,
// explicacao_alternativas}` só são retornadas por RPCs SECURITY DEFINER
// (get_revisao_*, get_simulado_impressao, admin_get_questao). Selecionar `*`
// aqui causaria permission denied — listamos apenas as colunas públicas.
const QUESTAO_COLUNAS_PUBLICAS = [
  'id', 'prova_id', 'ordem_na_prova', 'codigo_externo', 'enunciado_apoio',
  'enunciado', 'imagem_url', 'imagem_legenda', 'formato', 'referencia', 'fonte',
  'vezes_respondida', 'vezes_acertada', 'taxa_acerto', 'status', 'revisado',
  'criado_em', 'atualizado_em', 'autor_id', 'revisor_id', 'aprovada_em',
  'publicada_em', 'origem_geracao', 'nivel_bloom', 'formato_prova',
  'apto_desafio_diario', 'disciplina_id', 'tipo_questao',
].join(',');
const ALTERNATIVA_COLUNAS_PUBLICAS = [
  'id', 'questao_id', 'letra', 'texto', 'ordem', 'imagem_url',
].join(',');

@Injectable({ providedIn: 'root' })
export class QuestaoService {
  private readonly supabase = inject(SupabaseService).client;

  async listarPorProva(provaId: string): Promise<ProvaResult<QuestaoComAlternativas[]>> {
    try {
      const { data, error } = await this.supabase
        .from('prova_questao')
        .select(`
          ordem,
          questao:questao_id!inner(
            ${QUESTAO_COLUNAS_PUBLICAS},
            alternativas:alternativa(${ALTERNATIVA_COLUNAS_PUBLICAS}),
            temas:questao_tema(tema(*))
          )
        `)
        .eq('prova_id', provaId)
        .eq('questao.status', 'ativa')
        .order('ordem', { ascending: true });

      if (error) throw error;

      const questoes = ((data ?? []) as unknown as RawProvaQuestao[])
        .filter((row): row is RawProvaQuestao & { questao: RawQuestao } => row.questao !== null)
        .map((row) => ({
          ...row.questao,
          prova_id: provaId,
          ordem_na_prova: row.ordem,
          temas: row.questao.temas.map((qt) => qt.tema),
        })) as QuestaoComAlternativas[];

      return { ok: true, data: questoes };
    } catch {
      return { ok: false, error: 'Não foi possível carregar as questões.' };
    }
  }

  async buscarPorId(id: string): Promise<ProvaResult<QuestaoComAlternativas>> {
    try {
      const { data, error } = await this.supabase
        .from('questao')
        .select(`
          ${QUESTAO_COLUNAS_PUBLICAS},
          alternativas:alternativa(${ALTERNATIVA_COLUNAS_PUBLICAS}),
          temas:questao_tema(tema(*))
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      const row = data as unknown as RawQuestao;
      const questao = {
        ...row,
        temas: (row.temas ?? []).map((qt) => qt.tema),
      } as unknown as QuestaoComAlternativas;

      return { ok: true, data: questao };
    } catch {
      return { ok: false, error: 'Questão não encontrada.' };
    }
  }
}
