import { PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ResolveFn } from '@angular/router';
import { HistoricoService } from '../services/historico.service';
import { CacheService } from '../services/cache.service';
import type { HistoricoKpis, DesempenhoTema, TentativaHistoricoItem } from '../models/historico';

export interface HistoricoResolvedData {
  kpisResult: { ok: true; data: HistoricoKpis } | { ok: false; error: string };
  temasResult: { ok: true; data: DesempenhoTema[] } | { ok: false; error: string };
  tentativasResult: { ok: true; data: TentativaHistoricoItem[] } | { ok: false; error: string };
}

const HISTORICO_STATE_KEY = makeStateKey<HistoricoResolvedData>('historico-data');
const HISTORICO_CACHE_KEY = 'historico_data';

export const historicoResolver: ResolveFn<HistoricoResolvedData> = async () => {
  const transferState = inject(TransferState);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const historicoService = inject(HistoricoService);
  const cache = inject(CacheService);

  if (isBrowser && transferState.hasKey(HISTORICO_STATE_KEY)) {
    const data = transferState.get(HISTORICO_STATE_KEY, null) as HistoricoResolvedData;
    transferState.remove(HISTORICO_STATE_KEY);
    cache.set(HISTORICO_CACHE_KEY, data);
    return data;
  }

  // Stale-while-revalidate: return cached data if fresh
  const cached = isBrowser ? cache.get<HistoricoResolvedData>(HISTORICO_CACHE_KEY) : null;
  if (cached && !cache.isStale(HISTORICO_CACHE_KEY)) {
    return cached;
  }

  const [kpisResult, temasResult, tentativasResult] = await Promise.all([
    historicoService.getKpis(),
    historicoService.getDesempenhoTemas(),
    historicoService.listarTentativas(),
  ]);

  const resolved: HistoricoResolvedData = { kpisResult, temasResult, tentativasResult };

  if (!isBrowser) {
    transferState.set(HISTORICO_STATE_KEY, resolved);
  } else {
    cache.set(HISTORICO_CACHE_KEY, resolved);
  }

  return resolved;
};
