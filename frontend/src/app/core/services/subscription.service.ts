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

  // Cache do paywall: o subscription.guard roda em canActivate + canActivateChild
  // e a cada navegação entre rotas-filhas do dashboard; sem cache, cada troca de
  // rota re-dispara a RPC. Só o resultado POSITIVO é cacheado — acesso ativo é
  // estável dentro do TTL, enquanto "sem acesso" pode virar a qualquer momento
  // (pagamento aprovando) e cacheá-lo quebraria o polling pós-checkout e
  // prenderia no paywall um usuário recém-pago.
  private static readonly ACESSO_TTL_MS = 5 * 60_000;
  private acessoAtivo: { userId: string; expiraEm: number } | null = null;
  private acessoPromise: Promise<boolean> | null = null;

  // Cache do tier: mesmo padrão do cache de acesso acima — só o resultado é
  // cacheado quando conhecido (positivo ou negativo aqui, pois tier não tem a
  // mesma volatilidade do paywall pós-checkout), chaveado por usuário e com o
  // mesmo TTL. Invalidado junto com o acesso (mesmos eventos disparam ambos).
  private tierAtivo: { userId: string; tier: 'essencial' | 'avancado' | null; expiraEm: number } | null = null;
  private tierPromise: Promise<'essencial' | 'avancado' | null> | null = null;

  readonly assinatura = this._assinatura.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  /** Acesso liberado quando há assinatura autorizada (admins não passam por aqui). */
  readonly temAcesso = computed(() => this._assinatura()?.status === 'authorized');

  /**
   * Tier da assinatura carregada — uso de UI (ex.: sidebar), não de gating.
   * Cortesia/admin com plano nulo é tratado como 'avancado' (mesma regra do
   * servidor). Decisões de acesso devem sempre usar `tierAtivoServidor()`.
   */
  readonly tier = computed<'essencial' | 'avancado' | null>(() => {
    const a = this._assinatura();
    if (!a || a.status !== 'authorized') return null;
    return a.plano?.tier ?? 'avancado';
  });

  clear(): void {
    this._assinatura.set(null);
    this.invalidarAcesso();
  }

  /** Descarta o cache do paywall (mudança de status: cancelar/pausar/vincular). */
  invalidarAcesso(): void {
    this.acessoAtivo = null;
    // Também descarta a requisição em voo: ela partiu antes da mudança de
    // status e novos chamadores não devem herdar seu resultado obsoleto.
    this.acessoPromise = null;
    this.tierAtivo = null;
    this.tierPromise = null;
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
      // Busca todas e escolhe a ATIVA (não apenas a mais recente): com múltiplas
      // tentativas/reassinaturas, a mais recente por criado_em pode estar
      // cancelled/pending enquanto o acesso vem de outra linha authorized — o que
      // fazia a tela exibir "Cancelada" mesmo com acesso liberado.
      const { data, error } = await this.supabase
        .from('assinatura')
        .select('*, plano:plano_id(nome,slug,preco_centavos,moeda,frequency,frequency_type,recorrente,tier)')
        .eq('user_id', userId)
        .order('criado_em', { ascending: false });
      if (error) throw error;
      this._assinatura.set(this.escolherAssinatura((data ?? []) as Assinatura[]));
    } catch {
      this._assinatura.set(null);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Escolhe a assinatura a exibir: prioriza a que dá ACESSO ativo (authorized com
   * proxima_cobranca futura/nula, ou cancelled ainda em carência), espelhando
   * `tem_assinatura_ativa`. Sem nenhuma ativa, cai na mais recente.
   */
  private escolherAssinatura(rows: Assinatura[]): Assinatura | null {
    if (rows.length === 0) return null;
    const now = Date.now();
    const ativa = rows.find((a) => {
      const prox = a.proxima_cobranca ? new Date(a.proxima_cobranca).getTime() : null;
      if (a.status === 'authorized') return prox === null || prox > now;
      if (a.status === 'cancelled') return prox !== null && prox > now;
      return false;
    });
    return ativa ?? rows[0];
  }

  /**
   * Verifica acesso no servidor (RPC), sem depender do estado local.
   * Resultado positivo fica em cache curto (chaveado por usuário); negativo e
   * erro nunca entram no cache — a próxima chamada consulta o servidor de novo.
   */
  async temAssinaturaAtivaServidor(): Promise<boolean> {
    const userId = this.auth.user()?.id;
    const cache = this.acessoAtivo;
    if (userId && cache?.userId === userId && Date.now() < cache.expiraEm) return true;

    // Dedup: guard, warm-up do authGuard e prefetch pós-login podem disparar
    // quase juntos; compartilham a mesma requisição em voo.
    if (this.acessoPromise) return this.acessoPromise;

    const promise = this.verificarAcessoServidor(userId).finally(() => {
      // Só limpa se ainda for a promise corrente (invalidarAcesso pode ter
      // trocado a referência no meio do caminho).
      if (this.acessoPromise === promise) this.acessoPromise = null;
    });
    this.acessoPromise = promise;
    return promise;
  }

  private async verificarAcessoServidor(userId: string | undefined): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('tem_assinatura_ativa');
    const ativa = !error && data === true;
    if (ativa && userId) {
      this.acessoAtivo = { userId, expiraEm: Date.now() + SubscriptionService.ACESSO_TTL_MS };
    }
    return ativa;
  }

  /**
   * Tier autoritativo no servidor (RPC `assinatura_tier`), para decisões de
   * GATING (guards). Busca sob demanda — nunca no boot do app — para não
   * introduzir round-trips seriais na inicialização. Mesmo padrão de
   * cache/dedup/TTL de `temAssinaturaAtivaServidor` (ver `invalidarAcesso`).
   */
  async tierAtivoServidor(): Promise<'essencial' | 'avancado' | null> {
    const userId = this.auth.user()?.id;
    const cache = this.tierAtivo;
    if (userId && cache?.userId === userId && Date.now() < cache.expiraEm) return cache.tier;

    if (this.tierPromise) return this.tierPromise;

    const promise = this.consultarTierServidor(userId).finally(() => {
      if (this.tierPromise === promise) this.tierPromise = null;
    });
    this.tierPromise = promise;
    return promise;
  }

  private async consultarTierServidor(userId: string | undefined): Promise<'essencial' | 'avancado' | null> {
    const { data, error } = await this.supabase.rpc('assinatura_tier');
    const tier = !error && (data === 'essencial' || data === 'avancado') ? data : null;
    if (!error && userId) {
      this.tierAtivo = { userId, tier, expiraEm: Date.now() + SubscriptionService.ACESSO_TTL_MS };
    }
    return tier;
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

  /**
   * Cria a assinatura no Mercado Pago e devolve o init_point para redirect.
   *
   * @deprecated Usado apenas pelo fluxo legado de checkout por redirect
   * (Checkout Pro / init_point). Compras novas usam o checkout embutido via
   * `CheckoutService` (core/services/checkout.service.ts). Mantido durante a
   * janela de observação para não afetar assinantes mensais legados que ainda
   * dependem dos preapprovals antigos.
   */
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
    this.invalidarAcesso();
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
    this.invalidarAcesso();
    await this.fetchAssinatura(this.auth.user()?.id ?? '');
    return { ok: true };
  }
}
