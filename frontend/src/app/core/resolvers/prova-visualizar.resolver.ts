import { PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ResolveFn } from '@angular/router';
import { ProvaService } from '../services/prova.service';
import { SupabaseService } from '../services/supabase.service';
import type { ProvaComFaculdade } from '../models/prova';
import type { QuestaoComAlternativas } from '../models/questao';

export interface ProvaVisualizarResolvedData {
  provaResult: { ok: true; data: ProvaComFaculdade } | { ok: false; error: string };
  questoesResult: { ok: true; data: QuestaoComAlternativas[] } | { ok: false; error: string };
}

const PROVA_VISUALIZAR_STATE_KEY = makeStateKey<ProvaVisualizarResolvedData>('prova-visualizar-data');

export const provaVisualizarResolver: ResolveFn<ProvaVisualizarResolvedData> = async (route) => {
  const transferState = inject(TransferState);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const provaService = inject(ProvaService);
  const supabase = inject(SupabaseService).client;

  if (isBrowser && transferState.hasKey(PROVA_VISUALIZAR_STATE_KEY)) {
    const data = transferState.get(PROVA_VISUALIZAR_STATE_KEY, null) as ProvaVisualizarResolvedData;
    transferState.remove(PROVA_VISUALIZAR_STATE_KEY);
    return data;
  }

  const provaId = route.paramMap.get('provaId') ?? '';

  const [provaResult, questoesResult] = await Promise.all([
    provaService.buscarProva(provaId),
    fetchQuestoesRevisao(supabase, provaId),
  ]);

  const resolved: ProvaVisualizarResolvedData = { provaResult, questoesResult };

  if (!isBrowser) {
    transferState.set(PROVA_VISUALIZAR_STATE_KEY, resolved);
  }

  return resolved;
};

/**
 * Gabarito da revisão vem da RPC `get_revisao_prova`, que só libera as respostas
 * para provas que o usuário já FINALIZOU (admin vê sempre). As colunas de
 * resposta foram revogadas das tabelas, então não há leitura direta.
 */
async function fetchQuestoesRevisao(
  supabase: InstanceType<typeof SupabaseService>['client'],
  provaId: string,
): Promise<{ ok: true; data: QuestaoComAlternativas[] } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('get_revisao_prova', { p_prova_id: provaId });
    if (error) throw error;
    const questoes = ((data as { questoes?: unknown } | null)?.questoes ?? []) as QuestaoComAlternativas[];
    return { ok: true, data: questoes };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '';
    if (message.includes('Revisao disponivel apenas apos finalizar')) {
      return { ok: false, error: 'A revisão fica disponível após você finalizar a prova.' };
    }
    return { ok: false, error: 'Não foi possível carregar as questões.' };
  }
}
