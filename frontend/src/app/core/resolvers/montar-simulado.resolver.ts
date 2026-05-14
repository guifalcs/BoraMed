import { PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ResolveFn } from '@angular/router';
import { TemaService } from '../services/tema.service';
import type { TemaComContagem } from '../models/tema';

export interface MontarSimuladoResolvedData {
  temasResult: { ok: true; data: TemaComContagem[] } | { ok: false; error: string };
}

const MONTAR_SIMULADO_STATE_KEY = makeStateKey<MontarSimuladoResolvedData>('montar-simulado-data');

export const montarSimuladoResolver: ResolveFn<MontarSimuladoResolvedData> = async () => {
  const transferState = inject(TransferState);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const temaService = inject(TemaService);

  if (isBrowser && transferState.hasKey(MONTAR_SIMULADO_STATE_KEY)) {
    const data = transferState.get(MONTAR_SIMULADO_STATE_KEY, null) as MontarSimuladoResolvedData;
    transferState.remove(MONTAR_SIMULADO_STATE_KEY);
    return data;
  }

  const temasResult = await temaService.listarTemasComContagem();
  const resolved: MontarSimuladoResolvedData = { temasResult };

  if (!isBrowser) {
    transferState.set(MONTAR_SIMULADO_STATE_KEY, resolved);
  }

  return resolved;
};
