import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type {
  BrickFormData,
  ConsultarPagamentoResponse,
  PagamentoIntencao,
  ProcessarAssinaturaResult,
  ProcessarPagamentoResult,
} from '../models/checkout.types';

// Orquestração do checkout embutido: invoca as edges mp-processar-* com um
// attempt_id novo por tentativa (idempotência server-side) e um lock local
// contra dupla submissão. O PREÇO nunca sai daqui — a edge lê do banco.

export const ERRO_PROCESSAMENTO =
  'Não foi possível processar o pagamento agora. Verifique sua conexão e tente novamente.';
export const ERRO_MUITAS_TENTATIVAS =
  'Muitas tentativas de pagamento. Aguarde alguns minutos e tente novamente.';

@Injectable({ providedIn: 'root' })
export class CheckoutService {
  private readonly supabase = inject(SupabaseService).client;
  private processando = false;

  /**
   * Device ID gerado pelo SDK JS do MP (variável global MP_DEVICE_SESSION_ID).
   * Enviado à edge, que o repassa no header X-meli-session-id — o fingerprint
   * do dispositivo melhora a taxa de aprovação do antifraude do MP.
   */
  private deviceId(): string | undefined {
    const id = (window as { MP_DEVICE_SESSION_ID?: unknown }).MP_DEVICE_SESSION_ID;
    return typeof id === 'string' && id.length > 0 ? id : undefined;
  }

  /** Extrai a mensagem de erro (campo `error`) devolvida por uma edge function. */
  private async mensagemErro(error: unknown, fallback: string): Promise<string> {
    try {
      const ctx = (error as { context?: Response } | null)?.context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body && typeof body.error === 'string' && body.error.trim()) return body.error;
      }
    } catch {
      /* corpo não-JSON ou já consumido — usa o fallback */
    }
    return fallback;
  }

  /**
   * Processa o pagamento único (semestral) com o form_data do Payment Brick.
   * Cada chamada gera um attempt_id novo — retentativas após recusa devem
   * chamar de novo (o Brick gera token novo).
   */
  async processarPagamento(
    planoSlug: string,
    formData: BrickFormData,
  ): Promise<ProcessarPagamentoResult> {
    if (this.processando) return { ok: false, error: 'Pagamento em processamento. Aguarde…' };
    this.processando = true;
    try {
      const { data, error } = await this.supabase.functions.invoke('mp-processar-pagamento', {
        body: {
          attempt_id: crypto.randomUUID(),
          plano_slug: planoSlug,
          form_data: formData,
          ...(this.deviceId() ? { device_id: this.deviceId() } : {}),
        },
      });
      if (error) return { ok: false, error: await this.mensagemErro(error, ERRO_PROCESSAMENTO) };
      return { ok: true, ...(data as Omit<ProcessarPagamentoResult & { ok: true }, 'ok'>) };
    } catch {
      return { ok: false, error: ERRO_PROCESSAMENTO };
    } finally {
      this.processando = false;
    }
  }

  /** Cria a assinatura mensal com o card token gerado pelo Brick. */
  async processarAssinatura(
    planoSlug: string,
    cardTokenId: string,
    identification?: { type?: string; number?: string },
  ): Promise<ProcessarAssinaturaResult> {
    if (this.processando) return { ok: false, error: 'Pagamento em processamento. Aguarde…' };
    this.processando = true;
    try {
      const { data, error } = await this.supabase.functions.invoke('mp-processar-assinatura', {
        body: {
          attempt_id: crypto.randomUUID(),
          plano_slug: planoSlug,
          card_token_id: cardTokenId,
          ...(identification ? { payer: { identification } } : {}),
        },
      });
      if (error) return { ok: false, error: await this.mensagemErro(error, ERRO_PROCESSAMENTO) };
      return { ok: true, ...(data as Omit<ProcessarAssinaturaResult & { ok: true }, 'ok'>) };
    } catch {
      return { ok: false, error: ERRO_PROCESSAMENTO };
    } finally {
      this.processando = false;
    }
  }

  /** Reconciliação ativa ("Já paguei", webhook atrasado, pós-3DS). */
  async consultarPagamento(intencaoId: string): Promise<ConsultarPagamentoResponse | null> {
    const { data, error } = await this.supabase.functions.invoke('mp-consultar-pagamento', {
      body: { intencao_id: intencaoId },
    });
    if (error) return null;
    return data as ConsultarPagamentoResponse;
  }

  /** Lê a intenção via PostgREST (RLS: própria) — polling e reload da página. */
  async obterIntencao(intencaoId: string): Promise<PagamentoIntencao | null> {
    const { data, error } = await this.supabase
      .from('pagamento_intencao')
      .select('*')
      .eq('id', intencaoId)
      .maybeSingle();
    if (error) return null;
    return data as PagamentoIntencao | null;
  }

  /** Verifica no servidor se o acesso já foi liberado (pós-aprovação). */
  async temAcessoServidor(): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('tem_assinatura_ativa');
    return !error && data === true;
  }

  /** Troca o cartão da assinatura mensal (Brick só-cartão → card token novo). */
  async trocarCartao(cardTokenId: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.functions.invoke('mp-gerenciar-assinatura', {
      body: { acao: 'trocar_cartao', card_token_id: cardTokenId },
    });
    if (error) {
      return { ok: false, error: await this.mensagemErro(error, 'Não foi possível trocar o cartão.') };
    }
    const updated = (data as { card_updated?: boolean })?.card_updated === true;
    return updated
      ? { ok: true }
      : { ok: false, error: 'O novo cartão foi recusado. Confira os dados ou tente outro cartão.' };
  }
}
