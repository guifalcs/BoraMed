import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { RespostaCorrecao } from '../models/correcao';

export type CorrecaoResult =
  | { ok: true; data: RespostaCorrecao }
  | { ok: false; error: string; status?: number };

/**
 * Invoca a edge function `corrigir-resposta-aberta` (uma resposta por chamada;
 * o fan-out por questão é feito por quem chama). A correção também pode ser
 * observada via get_status_correcoes — este serviço é o gatilho.
 */
@Injectable({ providedIn: 'root' })
export class CorrecaoIaService {
  private readonly supabase = inject(SupabaseService).client;

  async corrigir(tentativaRespostaId: string): Promise<CorrecaoResult> {
    try {
      const { data, error } = await this.supabase.functions.invoke('corrigir-resposta-aberta', {
        body: { tentativa_resposta_id: tentativaRespostaId },
      });

      if (error) {
        // FunctionsHttpError carrega a Response original com o status/corpo
        const ctx = (error as { context?: Response }).context;
        const status = ctx?.status;
        if (status === 429) {
          return { ok: false, status, error: 'Limite diário de correções atingido.' };
        }
        return { ok: false, status, error: 'Não foi possível corrigir a resposta.' };
      }

      const correcao = (data as { correcao?: RespostaCorrecao } | null)?.correcao;
      if (!correcao) {
        return { ok: false, error: 'Resposta inesperada do serviço de correção.' };
      }
      return { ok: true, data: correcao };
    } catch {
      return { ok: false, error: 'Não foi possível corrigir a resposta.' };
    }
  }
}
