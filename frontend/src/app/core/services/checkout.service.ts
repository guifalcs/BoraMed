import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type {
  BrickFormData,
  ConsultarPagamentoResponse,
  PagamentoIntencao,
  ProcessarAssinaturaResult,
  ProcessarPagamentoResult,
  ValidarCupomResult,
} from '../models/checkout.types';
import { ERRO_PROCESSAMENTO, traduzirErroEdge } from '../models/checkout-erros';

// Orquestração do checkout embutido: invoca as edges mp-processar-* com um
// attempt_id novo por tentativa (idempotência server-side) e um lock local
// contra dupla submissão. O PREÇO nunca sai daqui — a edge lê do banco.

export { ERRO_MUITAS_TENTATIVAS, ERRO_PROCESSAMENTO } from '../models/checkout-erros';

/**
 * Cupom aplicado no checkout, guardado na sessão da aba: sobrevive à ida e
 * volta checkout → tela de status → "Tentar novamente"/"Pagar com Pix". Sem
 * isto, quem tinha cupom e teve o cartão recusado voltava ao checkout pagando
 * o preço cheio (ou desistia por não lembrar o código).
 */
const CUPOM_STORAGE_KEY = 'boramed_checkout_cupom';

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

  /**
   * Status HTTP + mensagem (campo `error`) de uma falha de edge function, já
   * traduzida para o aluno (erro técnico nunca chega cru à tela).
   */
  private async erroEdge(
    error: unknown,
    fallback: string,
    fallbackRequisicao?: string,
  ): Promise<{ mensagem: string; status?: number }> {
    const ctx = (error as { context?: Response } | null)?.context;
    const status = typeof ctx?.status === 'number' ? ctx.status : undefined;
    let msg: string | null = null;
    try {
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body && typeof body.error === 'string' && body.error.trim()) msg = body.error;
      }
    } catch {
      /* corpo não-JSON ou já consumido — decide só pelo status */
    }
    return { mensagem: traduzirErroEdge(status, msg, fallback, fallbackRequisicao), status };
  }

  /** Só a mensagem traduzida (fluxos fora do pagamento, ex.: troca de cartão). */
  private async mensagemErro(error: unknown, fallback: string): Promise<string> {
    return (await this.erroEdge(error, fallback, fallback)).mensagem;
  }

  /** Cupom guardado na sessão da aba (null se não houver/storage bloqueado). */
  cupomGuardado(): string | null {
    try {
      const v = sessionStorage.getItem(CUPOM_STORAGE_KEY);
      return v && v.trim() ? v.trim().toUpperCase() : null;
    } catch {
      return null;
    }
  }

  guardarCupom(codigo: string): void {
    try {
      sessionStorage.setItem(CUPOM_STORAGE_KEY, codigo);
    } catch {
      /* storage indisponível: só perde a conveniência */
    }
  }

  limparCupom(): void {
    try {
      sessionStorage.removeItem(CUPOM_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  /**
   * Processa o pagamento único (semestral) com o form_data do Payment Brick.
   * Cada chamada gera um attempt_id novo — retentativas após recusa devem
   * chamar de novo (o Brick gera token novo).
   */
  async processarPagamento(
    planoSlug: string,
    formData: BrickFormData,
    cupomCodigo?: string,
  ): Promise<ProcessarPagamentoResult> {
    if (this.processando) return { ok: false, error: 'Pagamento em processamento. Aguarde…' };
    this.processando = true;
    try {
      const { data, error } = await this.supabase.functions.invoke('mp-processar-pagamento', {
        body: {
          attempt_id: crypto.randomUUID(),
          plano_slug: planoSlug,
          form_data: formData,
          ...(cupomCodigo ? { cupom_codigo: cupomCodigo } : {}),
          ...(this.deviceId() ? { device_id: this.deviceId() } : {}),
        },
      });
      if (error) {
        const { mensagem, status } = await this.erroEdge(error, ERRO_PROCESSAMENTO);
        return { ok: false, error: mensagem, status };
      }
      return { ok: true, ...(data as Omit<ProcessarPagamentoResult & { ok: true }, 'ok'>) };
    } catch {
      return { ok: false, error: ERRO_PROCESSAMENTO };
    } finally {
      this.processando = false;
    }
  }

  /**
   * Valida um cupom para exibir o preço com desconto (a aplicação definitiva é
   * reconferida na edge no pagamento). Retorna null em falha de rede.
   */
  async validarCupom(codigo: string, planoSlug: string): Promise<ValidarCupomResult | null> {
    const { data, error } = await this.supabase.rpc('validar_cupom', {
      p_codigo: codigo,
      p_plano_slug: planoSlug,
    });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return (row as ValidarCupomResult) ?? null;
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
          ...(this.deviceId() ? { device_id: this.deviceId() } : {}),
          ...(identification ? { payer: { identification } } : {}),
        },
      });
      if (error) {
        const { mensagem, status } = await this.erroEdge(error, ERRO_PROCESSAMENTO);
        return { ok: false, error: mensagem, status };
      }
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

  /**
   * Intenção MAIS RECENTE do usuário (últimos 7 dias), para os avisos do
   * checkout:
   *  - `recusada`: cobre a recusa ASSÍNCRONA (cartão em análise antifraude que
   *    vira cc_rejected_high_risk ~1 min depois, ou a 1ª cobrança da
   *    assinatura legada recusada na reconciliação). Quem fechou a tela antes
   *    do desfecho só descobre o motivo por aqui.
   *  - `pendente`: pagamento ainda em andamento (cartão em análise / Pix não
   *    pago) — evita cobrança dupla por uma 2ª tentativa no escuro.
   * Uma tentativa posterior torna o aviso da anterior obsoleto.
   */
  async ultimaIntencaoRecente(): Promise<PagamentoIntencao | null> {
    const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from('pagamento_intencao')
      .select('*')
      .gte('criado_em', desde)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as PagamentoIntencao;
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
