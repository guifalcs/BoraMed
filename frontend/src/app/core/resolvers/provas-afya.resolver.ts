import { PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ResolveFn } from '@angular/router';
import { ProvaService } from '../services/prova.service';
import type { Prova } from '../models/prova';

export interface ProvasAfyaResolvedData {
  provasResult: { ok: true; data: Prova[] } | { ok: false; error: string };
}

const PROVAS_AFYA_STATE_KEY = makeStateKey<ProvasAfyaResolvedData>('provas-afya-data');

export const provasAfyaResolver: ResolveFn<ProvasAfyaResolvedData> = async () => {
  const transferState = inject(TransferState);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const provaService = inject(ProvaService);

  if (isBrowser && transferState.hasKey(PROVAS_AFYA_STATE_KEY)) {
    const data = transferState.get(PROVAS_AFYA_STATE_KEY, null) as ProvasAfyaResolvedData;
    transferState.remove(PROVAS_AFYA_STATE_KEY);
    return data;
  }

  const provasResult = await provaService.listarProvasNacionais({ subtipo: null, periodo: null });

  const resolved: ProvasAfyaResolvedData = { provasResult };

  if (!isBrowser) {
    transferState.set(PROVAS_AFYA_STATE_KEY, resolved);
  }

  return resolved;
};
