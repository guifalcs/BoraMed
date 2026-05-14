import { PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ResolveFn } from '@angular/router';
import { HistoricoService } from '../services/historico.service';
import type { HistoricoKpis, TentativaHistoricoItem } from '../models/historico';

export interface InicioResolvedData {
  kpisResult: { ok: true; data: HistoricoKpis } | { ok: false; error: string };
  tentativasResult: { ok: true; data: TentativaHistoricoItem[] } | { ok: false; error: string };
  streakResult: { ok: true; data: number } | { ok: false; error: string };
}

const INICIO_STATE_KEY = makeStateKey<InicioResolvedData>('inicio-data');

export const inicioResolver: ResolveFn<InicioResolvedData> = async () => {
  const transferState = inject(TransferState);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const historicoService = inject(HistoricoService);

  if (isBrowser && transferState.hasKey(INICIO_STATE_KEY)) {
    const data = transferState.get(INICIO_STATE_KEY, null) as InicioResolvedData;
    transferState.remove(INICIO_STATE_KEY);
    return data;
  }

  const [kpisResult, tentativasResult, streakResult] = await Promise.all([
    historicoService.getKpis(),
    historicoService.listarTentativas(10),
    historicoService.getStreak(),
  ]);

  const resolved: InicioResolvedData = { kpisResult, tentativasResult, streakResult };

  if (!isBrowser) {
    transferState.set(INICIO_STATE_KEY, resolved);
  }

  return resolved;
};
