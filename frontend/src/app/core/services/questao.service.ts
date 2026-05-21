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
            *,
            alternativas:alternativa(*),
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
          *,
          alternativas:alternativa(*),
          temas:questao_tema(tema(*))
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      const questao = {
        ...data,
        temas: ((data['temas'] as Array<{ tema: unknown }>) ?? []).map((qt) => qt.tema),
      } as QuestaoComAlternativas;

      return { ok: true, data: questao };
    } catch {
      return { ok: false, error: 'Questão não encontrada.' };
    }
  }
}
