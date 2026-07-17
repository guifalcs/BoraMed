import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from './supabase.service';
import { TIER_UPGRADE_REQUIRED, isTierUpgradeError } from '../utils/tier-error.util';
import type { ProvaResult } from './prova.service';
import type { QuestaoComAlternativas } from '../models/questao';
import type { SimuladoImpressao } from '../models/impressao';

const STORAGE_KEY = 'simuladoImpressaoEfemero';

@Injectable({ providedIn: 'root' })
export class ImpressaoSimuladoService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _simuladoEfemero = signal<SimuladoImpressao | null>(null);
  readonly simuladoEfemero = this._simuladoEfemero.asReadonly();

  constructor() {
    if (this.isBrowser) {
      this._simuladoEfemero.set(ImpressaoSimuladoService.readEfemeroFromStorage());
    }
  }

  private static readEfemeroFromStorage(): SimuladoImpressao | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SimuladoImpressao) : null;
    } catch {
      return null;
    }
  }

  async buscarParaImpressao(
    provaId: string,
    comGabarito: boolean,
  ): Promise<ProvaResult<SimuladoImpressao>> {
    try {
      const { data, error } = await this.supabase.rpc('get_simulado_impressao', {
        p_prova_id: provaId,
        p_com_gabarito: comGabarito,
      });
      if (error) throw error;

      const payload = data as {
        prova?: { nome?: string; qtd_questoes?: number; periodo?: number | null; formato?: string | null };
        questoes?: unknown;
        gabarito_liberado?: boolean;
      } | null;

      const questoes = (payload?.questoes ?? []) as QuestaoComAlternativas[];
      const simulado: SimuladoImpressao = {
        nome: payload?.prova?.nome ?? 'Simulado',
        qtdQuestoes: payload?.prova?.qtd_questoes ?? questoes.length,
        periodo: payload?.prova?.periodo ?? null,
        formato: payload?.prova?.formato ?? null,
        questoes,
        gabaritoLiberado: payload?.gabarito_liberado ?? false,
      };

      return { ok: true, data: simulado };
    } catch (e: unknown) {
      if (isTierUpgradeError(e)) return { ok: false, error: TIER_UPGRADE_REQUIRED };
      return { ok: false, error: 'Não foi possível carregar o simulado para impressão.' };
    }
  }

  async gerarParaImpressao(
    temaIds: string[] | null,
    qtd: number,
    tipoQuestao: 'nacional' | 'processual' | 'laboratorio' | null,
    formato: string | null,
  ): Promise<ProvaResult<SimuladoImpressao>> {
    try {
      const { data, error } = await this.supabase.rpc('gerar_simulado_impressao', {
        p_tema_ids: temaIds && temaIds.length > 0 ? temaIds : null,
        p_qtd: qtd,
        p_tipo_questao: tipoQuestao,
        p_formato: formato,
      });
      if (error) {
        if (isTierUpgradeError(error)) return { ok: false, error: TIER_UPGRADE_REQUIRED };
        return { ok: false, error: error.message || 'Não foi possível gerar o simulado.' };
      }

      const payload = data as { nome?: string; questoes?: unknown } | null;
      const questoes = (payload?.questoes ?? []) as QuestaoComAlternativas[];
      const simulado: SimuladoImpressao = {
        nome: payload?.nome ?? 'Simulado personalizado',
        qtdQuestoes: questoes.length,
        periodo: null,
        formato,
        questoes,
        gabaritoLiberado: false,
      };

      this.setEfemero(simulado);
      return { ok: true, data: simulado };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível gerar o simulado.';
      return { ok: false, error: msg };
    }
  }

  private setEfemero(simulado: SimuladoImpressao): void {
    this._simuladoEfemero.set(simulado);
    if (this.isBrowser) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(simulado));
      } catch {}
    }
  }
}
