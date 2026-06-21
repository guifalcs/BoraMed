import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import type { Assinatura, Pagamento, Plano } from '../models/subscription.types';

export type CheckoutResult =
  | { ok: true; initPoint: string }
  | { ok: false; error: string };

export type GerenciarResult = { ok: true } | { ok: false; error: string };

/** Chave de sessionStorage para retomar o vínculo da assinatura após login. */
export const PENDING_PREAPPROVAL_KEY = 'boramed_pending_preapproval';

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  private readonly _assinatura = signal<Assinatura | null>(null);
  private readonly _isLoading = signal(false);
  private loadPromise: Promise<void> | null = null;

  readonly assinatura = this._assinatura.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  /** Acesso liberado quando há assinatura autorizada (admins não passam por aqui). */
  readonly temAcesso = computed(() => this._assinatura()?.status === 'authorized');

  clear(): void {
    this._assinatura.set(null);
  }

  async carregarAssinatura(): Promise<void> {
    const user = this.auth.user();
    if (!user) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.fetchAssinatura(user.id).finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  private async fetchAssinatura(userId: string): Promise<void> {
    this._isLoading.set(true);
    try {
      // Assinatura mais recente do usuário (a ativa, se houver)
      const { data, error } = await this.supabase
        .from('assinatura')
        .select('*, plano:plano_id(nome,slug,preco_centavos,moeda,frequency,frequency_type,recorrente)')
        .eq('user_id', userId)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      this._assinatura.set((data as Assinatura) ?? null);
    } catch {
      this._assinatura.set(null);
    } finally {
      this._isLoading.set(false);
    }
  }

  /** Verifica acesso no servidor (RPC), sem depender do estado local. */
  async temAssinaturaAtivaServidor(): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('tem_assinatura_ativa');
    if (error) return false;
    return data === true;
  }

  async listarPlanos(): Promise<Plano[]> {
    const { data, error } = await this.supabase
      .from('plano')
      .select('*')
      .eq('ativo', true)
      .order('ordem', { ascending: true });
    if (error || !data) return [];
    return data as Plano[];
  }

  async historicoPagamentos(): Promise<Pagamento[]> {
    const user = this.auth.user();
    if (!user) return [];
    const { data, error } = await this.supabase
      .from('pagamento')
      .select('*, assinatura:assinatura_id(plano:plano_id(nome))')
      .eq('user_id', user.id)
      .order('criado_em', { ascending: false });
    if (error || !data) return [];
    return (data as unknown[]).map((row) => {
      const r = row as Pagamento & { assinatura?: { plano?: { nome?: string } } | null };
      return { ...r, plano_nome: r.assinatura?.plano?.nome ?? null } as Pagamento;
    });
  }

  /** Extrai a mensagem de erro retornada pela edge function (campo `error`). */
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

  /** Cria a assinatura no Mercado Pago e devolve o init_point para redirect. */
  async iniciarCheckout(planoSlug: string): Promise<CheckoutResult> {
    const { data, error } = await this.supabase.functions.invoke('mp-criar-assinatura', {
      body: { plano_slug: planoSlug },
    });
    if (error) {
      return { ok: false, error: await this.mensagemErro(error, 'Não foi possível iniciar o checkout. Tente novamente.') };
    }
    const initPoint = (data as { init_point?: string })?.init_point;
    if (!initPoint) return { ok: false, error: 'Checkout indisponível no momento.' };
    return { ok: true, initPoint };
  }

  /** Vincula ao usuário logado a assinatura recém-criada (preapproval_id vindo na back_url). */
  async vincular(preapprovalId: string): Promise<GerenciarResult> {
    const { error } = await this.supabase.functions.invoke('mp-vincular-assinatura', {
      body: { preapproval_id: preapprovalId },
    });
    if (error) return { ok: false, error: await this.mensagemErro(error, 'Não foi possível confirmar a assinatura.') };
    await this.fetchAssinatura(this.auth.user()?.id ?? '');
    return { ok: true };
  }

  async cancelar(): Promise<GerenciarResult> {
    return this.gerenciar('cancelar');
  }

  async pausar(): Promise<GerenciarResult> {
    return this.gerenciar('pausar');
  }

  async reativar(): Promise<GerenciarResult> {
    return this.gerenciar('reativar');
  }

  private async gerenciar(acao: 'cancelar' | 'pausar' | 'reativar'): Promise<GerenciarResult> {
    const { error } = await this.supabase.functions.invoke('mp-gerenciar-assinatura', {
      body: { acao },
    });
    if (error) return { ok: false, error: await this.mensagemErro(error, 'Não foi possível atualizar a assinatura.') };
    await this.fetchAssinatura(this.auth.user()?.id ?? '');
    return { ok: true };
  }
}
