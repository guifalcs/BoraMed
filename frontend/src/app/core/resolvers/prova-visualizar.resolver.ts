import { PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ResolveFn } from '@angular/router';
import { ProvaService } from '../services/prova.service';
import { SupabaseService } from '../services/supabase.service';
import type { ProvaComFaculdade } from '../models/prova';
import type { QuestaoComAlternativas } from '../models/questao';
import type { Tema } from '../models/tema';

export interface ProvaVisualizarResolvedData {
  provaResult: { ok: true; data: ProvaComFaculdade } | { ok: false; error: string };
  questoesResult: { ok: true; data: QuestaoComAlternativas[] } | { ok: false; error: string };
}

const PROVA_VISUALIZAR_STATE_KEY = makeStateKey<ProvaVisualizarResolvedData>('prova-visualizar-data');

type RawQuestao = Omit<QuestaoComAlternativas, 'temas'> & {
  temas: { tema: Tema }[];
};

type RawProvaQuestao = {
  ordem: number;
  questao: RawQuestao | null;
};

type RawTentativaResposta = {
  id: string;
  ordem_na_tentativa: number | null;
  questao: RawQuestao | null;
};

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

  // Prova e questões regulares em paralelo; o caminho personalizado (raro) busca depois.
  const [provaResult, questoesRegularesResult] = await Promise.all([
    provaService.buscarProva(provaId),
    fetchQuestoesRegulares(supabase, provaId),
  ]);

  let questoesResult: ProvaVisualizarResolvedData['questoesResult'];

  if (!provaResult.ok) {
    questoesResult = { ok: false, error: 'Prova não encontrada.' };
  } else {
    const isPersonalizado = provaResult.data.origem === 'personalizado';
    questoesResult = isPersonalizado
      ? await fetchQuestoesPersonalizado(supabase, provaId)
      : questoesRegularesResult;
  }

  const resolved: ProvaVisualizarResolvedData = { provaResult, questoesResult };

  if (!isBrowser) {
    transferState.set(PROVA_VISUALIZAR_STATE_KEY, resolved);
  }

  return resolved;
};

async function fetchQuestoesRegulares(
  supabase: InstanceType<typeof SupabaseService>['client'],
  provaId: string,
): Promise<{ ok: true; data: QuestaoComAlternativas[] } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase
      .from('prova_questao')
      .select('ordem, questao:questao_id!inner(*, alternativas:alternativa(*), temas:questao_tema(tema(*)))')
      .eq('prova_id', provaId)
      .eq('questao.status', 'ativa')
      .order('ordem');

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

async function fetchQuestoesPersonalizado(
  supabase: InstanceType<typeof SupabaseService>['client'],
  provaId: string,
): Promise<{ ok: true; data: QuestaoComAlternativas[] } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase
      .from('tentativa')
      .select(
        'id, respostas:tentativa_resposta(id, ordem_na_tentativa, questao:questao_id(*, alternativas:alternativa(*), temas:questao_tema(tema(*))))',
      )
      .eq('prova_id', provaId)
      .order('criado_em', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;

    const respostas = ((data?.respostas ?? []) as unknown as RawTentativaResposta[])
      .filter((r): r is RawTentativaResposta & { questao: RawQuestao } => r.questao !== null)
      .sort(
        (a, b) =>
          (a.ordem_na_tentativa ?? 0) - (b.ordem_na_tentativa ?? 0) || a.id.localeCompare(b.id),
      );

    const questoes = respostas.map((r) => ({
      ...r.questao,
      temas: r.questao.temas.map((qt) => qt.tema),
    })) as QuestaoComAlternativas[];

    return { ok: true, data: questoes };
  } catch {
    return { ok: false, error: 'Não foi possível carregar as questões.' };
  }
}
