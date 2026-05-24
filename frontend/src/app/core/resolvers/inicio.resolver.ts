import { PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ResolveFn } from '@angular/router';
import { GamificacaoService } from '../services/gamificacao.service';
import { HistoricoService } from '../services/historico.service';
import { RankingService } from '../services/ranking.service';
import { DesafioService } from '../services/desafio.service';
import { CacheService } from '../services/cache.service';
import type { DesafioDiario, GamificacaoStats, MinhaPosicaoRanking, StreakEstudoV2 } from '../models/gamificacao';
import type { HistoricoKpis, TentativaHistoricoItem } from '../models/historico';

export interface InicioResolvedData {
  kpisResult: { ok: true; data: HistoricoKpis } | { ok: false; error: string };
  tentativasResult: { ok: true; data: TentativaHistoricoItem[] } | { ok: false; error: string };
  streakResult: { ok: true; data: StreakEstudoV2 } | { ok: false; error: string };
  gamificacaoResult: { ok: true; data: GamificacaoStats } | { ok: false; error: string };
  rankingPosicaoResult: { ok: true; data: MinhaPosicaoRanking } | { ok: false; error: string };
  desafioResult: { ok: true; data: DesafioDiario } | { ok: false; error: string };
}

const INICIO_STATE_KEY = makeStateKey<InicioResolvedData>('inicio-data');

const INICIO_CACHE_KEY = 'inicio_data';

export const inicioResolver: ResolveFn<InicioResolvedData> = async () => {
  const transferState = inject(TransferState);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const historicoService = inject(HistoricoService);
  const gamificacaoService = inject(GamificacaoService);
  const rankingService = inject(RankingService);
  const desafioService = inject(DesafioService);
  const cache = inject(CacheService);

  if (isBrowser && transferState.hasKey(INICIO_STATE_KEY)) {
    const data = transferState.get(INICIO_STATE_KEY, null) as InicioResolvedData;
    transferState.remove(INICIO_STATE_KEY);
    cache.set(INICIO_CACHE_KEY, data);
    return data;
  }

  // Stale-while-revalidate: return cached data immediately if fresh enough
  const cached = isBrowser ? cache.get<InicioResolvedData>(INICIO_CACHE_KEY) : null;
  if (cached && !cache.isStale(INICIO_CACHE_KEY)) {
    return cached;
  }

  const [kpisResult, tentativasResult, streakResult, gamificacaoResult, rankingPosicaoResult, desafioResult] = await Promise.all([
    historicoService.getKpis(),
    historicoService.listarTentativas(10),
    historicoService.getStreakV2(),
    gamificacaoService.getMeuXp(),
    rankingService.carregarMinhaPosicao(),
    desafioService.carregarDesafio(),
  ]);

  const resolved: InicioResolvedData = {
    kpisResult,
    tentativasResult,
    streakResult,
    gamificacaoResult,
    rankingPosicaoResult,
    desafioResult,
  };

  if (!isBrowser) {
    transferState.set(INICIO_STATE_KEY, resolved);
  } else {
    cache.set(INICIO_CACHE_KEY, resolved);
  }

  return resolved;
};
