import { PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ResolveFn } from '@angular/router';
import { GamificacaoService } from '../services/gamificacao.service';
import { HistoricoService } from '../services/historico.service';
import { RankingService } from '../services/ranking.service';
import type { GamificacaoStats, MinhaPosicaoRanking, StreakEstudoV2 } from '../models/gamificacao';
import type { HistoricoKpis, TentativaHistoricoItem } from '../models/historico';

export interface InicioResolvedData {
  kpisResult: { ok: true; data: HistoricoKpis } | { ok: false; error: string };
  tentativasResult: { ok: true; data: TentativaHistoricoItem[] } | { ok: false; error: string };
  streakResult: { ok: true; data: StreakEstudoV2 } | { ok: false; error: string };
  gamificacaoResult: { ok: true; data: GamificacaoStats } | { ok: false; error: string };
  rankingPosicaoResult: { ok: true; data: MinhaPosicaoRanking } | { ok: false; error: string };
}

const INICIO_STATE_KEY = makeStateKey<InicioResolvedData>('inicio-data');

export const inicioResolver: ResolveFn<InicioResolvedData> = async () => {
  const transferState = inject(TransferState);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const historicoService = inject(HistoricoService);
  const gamificacaoService = inject(GamificacaoService);
  const rankingService = inject(RankingService);

  if (isBrowser && transferState.hasKey(INICIO_STATE_KEY)) {
    const data = transferState.get(INICIO_STATE_KEY, null) as InicioResolvedData;
    transferState.remove(INICIO_STATE_KEY);
    return data;
  }

  const [kpisResult, tentativasResult, streakResult, gamificacaoResult, rankingPosicaoResult] = await Promise.all([
    historicoService.getKpis(),
    historicoService.listarTentativas(10),
    historicoService.getStreakV2(),
    gamificacaoService.getMeuXp(),
    rankingService.carregarMinhaPosicao(),
  ]);

  const resolved: InicioResolvedData = {
    kpisResult,
    tentativasResult,
    streakResult,
    gamificacaoResult,
    rankingPosicaoResult,
  };

  if (!isBrowser) {
    transferState.set(INICIO_STATE_KEY, resolved);
  }

  return resolved;
};
