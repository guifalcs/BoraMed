import { PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ResolveFn } from '@angular/router';
import { ProvaService } from '../services/prova.service';
import { SupabaseService } from '../services/supabase.service';
import type { ProvaComFaculdade } from '../models/prova';
import type { QuestaoComAlternativas } from '../models/questao';
import type { Tentativa, TentativaResposta } from '../models/tentativa';

export interface ProvaVisualizarResolvedData {
  provaResult: { ok: true; data: ProvaComFaculdade } | { ok: false; error: string };
  questoesResult: { ok: true; data: QuestaoComAlternativas[] } | { ok: false; error: string };
  respostasResult: { ok: true; data: TentativaResposta[] } | { ok: false; error: string };
  tentativaResult: { ok: true; data: Tentativa } | { ok: false; error: string };
}

interface RevisaoData {
  questoes: QuestaoComAlternativas[];
  tentativa: Tentativa | null;
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

  const provaId = route.paramMap.get('provaId')   '';
  const tentativaId = route.paramMap.get('tentativaId')   '';

  const [provaResult, revisaoResult, respostasResult] = await Promise.all([
    provaService.buscarProva(provaId),
    tentativaId
      fetchQuestoesRevisaoTentativa(supabase, tentativaId)
      : fetchQuestoesRevisaoProva(supabase, provaId),
    tentativaId fetchRespostasTentativa(supabase, tentativaId) : Promise.resolve(undefined),
  ]);

  const resolved: ProvaVisualizarResolvedData = {
    provaResult,
    questoesResult: revisaoResult.ok
      { ok: true, data: revisaoResult.data.questoes }
      : revisaoResult,
    respostasResult,
    tentativaResult: revisaoResult.ok && revisaoResult.data.tentativa
      { ok: true, data: revisaoResult.data.tentativa }
      : undefined,
  };

  if (!isBrowser) {
    transferState.set(PROVA_VISUALIZAR_STATE_KEY, resolved);
  }

  return resolved;
};

async function fetchQuestoesRevisaoProva(
  supabase: InstanceType<typeof SupabaseService>['client'],
  provaId: string,
): Promise<{ ok: true; data: RevisaoData } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('get_revisao_prova', { p_prova_id: provaId });
    if (error) throw error;

    const questoes = ((data as { questoes: unknown } | null).questoes ?? []) as QuestaoComAlternativas[];
    return { ok: true, data: { questoes, tentativa: null } };
  } catch (e: unknown) {
    const message = e instanceof Error e.message : '';
    if (message.includes('Revisao disponivel apenas apos finalizar')) {
      return { ok: false, error: 'A revisao fica disponivel apos voce finalizar a prova.' };
    }
    return { ok: false, error: 'Nao foi possivel carregar as questoes.' };
  }
}

async function fetchQuestoesRevisaoTentativa(
  supabase: InstanceType<typeof SupabaseService>['client'],
  tentativaId: string,
): Promise<{ ok: true; data: RevisaoData } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc('get_revisao_tentativa', {
      p_tentativa_id: tentativaId,
    });
    if (error) throw error;

    const payload = data as { questoes: unknown; tentativa: unknown } | null;
    return {
      ok: true,
      data: {
        questoes: (payload.questoes ?? []) as QuestaoComAlternativas[],
        tentativa: payload.tentativa as Tentativa,
      },
    };
  } catch (e: unknown) {
    const message = e instanceof Error e.message : '';
    if (message.includes('Revisao disponivel apenas apos finalizar')) {
      return { ok: false, error: 'A revisao fica disponivel apos voce finalizar a tentativa.' };
    }
    if (message.includes('Tentativa nao encontrada') || message.includes('sem permissao')) {
      return { ok: false, error: 'Tentativa nao encontrada ou sem permissao para acesso.' };
    }
    return { ok: false, error: 'Nao foi possivel carregar as questoes desta tentativa.' };
  }
}

async function fetchRespostasTentativa(
  supabase: InstanceType<typeof SupabaseService>['client'],
  tentativaId: string,
): Promise<{ ok: true; data: TentativaResposta[] } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase
      .from('tentativa_resposta')
      .select('*')
      .eq('tentativa_id', tentativaId)
      .order('ordem_na_tentativa', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;

    return { ok: true, data: (data ?? []) as TentativaResposta[] };
  } catch {
    return { ok: false, error: 'Nao foi possivel carregar suas respostas.' };
  }
}
