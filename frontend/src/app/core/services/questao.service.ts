import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { QuestaoComAlternativas } from '../models/questao';
import type { ProvaResult } from './prova.service';

@Injectable({ providedIn: 'root' })
export class QuestaoService {
  private readonly supabase = inject(SupabaseService).client;

  async listarPorProva(provaId: string): Promise<ProvaResult<QuestaoComAlternativas[]>> {
    try {
      const { data, error } = await this.supabase
        .from('questao')
        .select(`
          *,
          alternativas:alternativa(*),
          temas:questao_tema(tema(*))
        `)
        .eq('prova_id', provaId)
        .eq('status', 'ativa')
        .order('ordem_na_prova', { ascending: true });

      if (error) throw error;

      const questoes = (data ?? []).map((q: Record<string, unknown>) => ({
        ...q,
        temas: ((q['temas'] as Array<{ tema: unknown }>) ?? []).map((qt) => qt.tema),
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
