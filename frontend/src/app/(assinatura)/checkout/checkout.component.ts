import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ArrowLeft, Clock, QrCode, ShieldCheck, Tag, TriangleAlert, type LucideIconData } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { CheckoutService } from '../../core/services/checkout.service';
import { MercadoPagoSdkService, SDK_ERRO_CARREGAMENTO } from '../../core/services/mercado-pago-sdk.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { mapStatusDetail, recusaPorLimite } from '../../core/models/mp-status-detail.map';
import type {
  BrickController,
  BrickFormData,
  BrickSubmitData,
  PagamentoIntencao,
  ProcessarPagamentoResponse,
} from '../../core/models/checkout.types';
import type { Plano } from '../../core/models/subscription.types';

const BRICK_CONTAINER_ID = 'payment-brick-container';

/** Dados voláteis (QR do Pix, link do boleto, challenge 3DS) passados à tela
 * de status via sessionStorage — a intenção no banco não guarda o QR. */
export const CHECKOUT_RESULT_KEY_PREFIX = 'boramed_checkout_result_';

/** `?metodo=pix`: a tela de status pede para gerar o Pix direto (1 clique após a recusa). */
export const QUERY_PAGAR_COM_PIX = 'pix';

/** Métodos que não são cartão (Pix e boleto) — o resto é bandeira de cartão. */
export function ehMetodoCartao(metodo: string | null | undefined): boolean {
  if (!metodo) return false;
  return metodo !== 'pix' && metodo !== 'pec' && !metodo.startsWith('bol');
}

/** Aviso de recusa no checkout + saídas oferecidas ao aluno. */
interface RecusaAviso {
  titulo: string;
  mensagem: string;
  /** Recusa de CARTÃO: oferece "Pagar com Pix" (1 clique, aprovação na hora). */
  ofertaPix: boolean;
  /** Falta de limite num plano de vários meses: oferece os planos mensais. */
  ofertaMensal: boolean;
}

/** Pagamento ainda em andamento (cartão em análise / Pix não pago). */
interface PendenteAviso {
  titulo: string;
  mensagem: string;
  intencaoId: string;
  /** Cartão em análise: pode ser aprovado ainda — nada de oferecer Pix (cobrança dupla). */
  cartao: boolean;
}

/** Janela em que um cartão "em análise" ainda pode virar aprovado (antifraude ~1 min). */
const JANELA_CARTAO_EM_ANALISE_MS = 15 * 60 * 1000;

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, RouterLink, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gray-50 px-4 py-8">
      <div class="mx-auto max-w-lg">
        <a
          routerLink="/planos"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <app-ui-icon [icon]="voltarIcon" [size]="16" />
          Voltar aos planos
        </a>

        @if (carregando()) {
          <div class="mt-6 space-y-4">
            <div class="h-24 animate-pulse rounded-2xl bg-gray-200"></div>
            <div class="h-96 animate-pulse rounded-2xl bg-gray-200"></div>
          </div>
        } @else if (erroFatal()) {
          <div class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p class="text-sm text-red-700">{{ erroFatal() }}</p>
            <button
              type="button"
              (click)="recarregar()"
              class="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Tentar novamente
            </button>
          </div>
        } @else if (plano()) {
          <!-- Resumo do plano (preço do banco; o valor cobrado é validado no servidor) -->
          <div class="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
            <div class="flex items-center justify-between">
              <div>
                <h1 class="text-lg font-bold text-gray-900">Plano {{ plano()!.nome }}</h1>
                <p class="mt-0.5 text-sm text-gray-500">{{ descricaoPlano() }}</p>
              </div>
              <div class="text-right">
                @if (cupomAplicado()) {
                  <p class="text-sm text-gray-400 line-through">{{ precoOriginalFormatado() }}</p>
                }
                <p class="text-2xl font-extrabold text-gray-900">{{ precoFormatado() }}</p>
                <p class="text-xs text-gray-500">{{ notaPreco() }}</p>
              </div>
            </div>
          </div>

          <!-- Cupom de desconto (só pagamento único; a edge reconfere no pagamento) -->
          @if (!plano()!.recorrente) {
            <div class="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
              @if (cupomAplicado(); as cod) {
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <app-ui-icon [icon]="cupomIcon" [size]="18" class="shrink-0 text-emerald-600" />
                    <div>
                      <p class="text-sm font-semibold text-gray-900">Cupom {{ cod }} aplicado</p>
                      <p class="text-xs text-emerald-700">Você economiza {{ descontoFormatado() }}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    (click)="removerCupom()"
                    class="shrink-0 text-sm font-medium text-gray-500 hover:text-gray-700"
                  >
                    Remover
                  </button>
                </div>
              } @else {
                <label for="cupom-input" class="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <app-ui-icon [icon]="cupomIcon" [size]="16" class="text-gray-400" />
                  Tem um cupom de desconto?
                </label>
                <div class="mt-2 flex gap-2">
                  <input
                    id="cupom-input"
                    #cupomRef
                    type="text"
                    autocapitalize="characters"
                    placeholder="Digite o código"
                    data-testid="cupom-input"
                    (keyup.enter)="aplicarCupom(cupomRef.value)"
                    class="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm uppercase placeholder:normal-case focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    (click)="aplicarCupom(cupomRef.value)"
                    [disabled]="validandoCupom()"
                    data-testid="cupom-aplicar"
                    class="shrink-0 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
                  >
                    {{ validandoCupom() ? 'Validando…' : 'Aplicar' }}
                  </button>
                </div>
                @if (cupomErro(); as err) {
                  <p class="mt-2 text-xs text-red-600" data-testid="cupom-erro">{{ err }}</p>
                }
              }
            </div>
          }

          <!-- Pagamento anterior ainda em andamento: evita cobrança dupla -->
          @if (pendente(); as pend) {
            <div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="checkout-pendente">
              <div class="flex gap-2.5">
                <app-ui-icon [icon]="relogioIcon" [size]="18" class="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <p class="text-sm font-semibold text-amber-900">{{ pend.titulo }}</p>
                  <p class="mt-0.5 text-sm text-amber-800">{{ pend.mensagem }}</p>
                  <a
                    [routerLink]="['/checkout/status', pend.intencaoId]"
                    class="mt-2 inline-block text-sm font-semibold text-amber-900 underline underline-offset-2"
                    data-testid="checkout-pendente-link"
                  >
                    Acompanhar este pagamento
                  </a>
                </div>
              </div>
            </div>
          }

          @if (gerandoPix() && !recusa()) {
            <div
              class="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800"
              role="status"
              data-testid="gerando-pix"
            >
              <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>
              Gerando seu Pix…
            </div>
          }

          <!-- Recusa: mensagem específica por status_detail + saídas (Pix / plano mensal) -->
          @if (recusa(); as rec) {
            <div
              #recusaBanner
              tabindex="-1"
              class="mt-4 scroll-mt-4 rounded-xl border border-red-200 bg-red-50 p-4 outline-none"
              role="alert"
              data-testid="checkout-recusa"
            >
              <div class="flex gap-2.5">
                <app-ui-icon [icon]="alertaIcon" [size]="18" class="mt-0.5 shrink-0 text-red-500" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-red-800">{{ rec.titulo }}</p>
                  <p class="mt-0.5 text-sm text-red-700">{{ rec.mensagem }}</p>
                  @if (rec.ofertaPix || (rec.ofertaMensal && !!planoMensalAlternativo())) {
                    <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      @if (rec.ofertaPix) {
                        <button
                          type="button"
                          (click)="pagarComPix()"
                          [disabled]="gerandoPix()"
                          class="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          data-testid="pagar-com-pix"
                        >
                          <app-ui-icon [icon]="pixIcon" [size]="16" />
                          {{ gerandoPix() ? 'Gerando Pix…' : 'Pagar com Pix (aprovação na hora)' }}
                        </button>
                      }
                      @if (rec.ofertaMensal && planoMensalAlternativo()) {
                        <a
                          routerLink="/planos"
                          [queryParams]="{ ciclo: 'mensal' }"
                          class="inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-100"
                          data-testid="ver-planos-mensais"
                        >
                          Ver planos mensais (a partir de {{ precoMensalMinimo() }})
                        </a>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>
          }

          <!-- Container do Payment Brick (campos de cartão em iframes PCI do MP) -->
          <div class="mt-4 rounded-2xl border border-gray-200 bg-white p-2 sm:p-4">
            @if (montandoBrick()) {
              <div class="space-y-3 p-4" data-testid="brick-skeleton">
                <div class="h-10 animate-pulse rounded-lg bg-gray-100"></div>
                <div class="h-10 animate-pulse rounded-lg bg-gray-100"></div>
                <div class="h-10 animate-pulse rounded-lg bg-gray-100"></div>
              </div>
            }
            <div [id]="brickContainerId"></div>
          </div>

          <p class="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-gray-400">
            <app-ui-icon [icon]="escudoIcon" [size]="14" class="mt-0.5 shrink-0" />
            <span>
              Pagamento processado pelo Mercado Pago. Os dados do cartão são digitados em campos
              seguros e criptografados do próprio Mercado Pago e nunca passam pelos servidores do
              BoraMed.
            </span>
          </p>
        }
      </div>
    </div>
  `,
})
export class CheckoutComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly subscription = inject(SubscriptionService);
  private readonly checkout = inject(CheckoutService);
  private readonly sdk = inject(MercadoPagoSdkService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly voltarIcon: LucideIconData = ArrowLeft;
  readonly escudoIcon: LucideIconData = ShieldCheck;
  readonly alertaIcon: LucideIconData = TriangleAlert;
  readonly cupomIcon: LucideIconData = Tag;
  readonly pixIcon: LucideIconData = QrCode;
  readonly relogioIcon: LucideIconData = Clock;
  readonly brickContainerId = BRICK_CONTAINER_ID;

  readonly carregando = signal(true);
  readonly montandoBrick = signal(false);
  readonly erroFatal = signal<string | null>(null);
  readonly plano = signal<Plano | null>(null);
  readonly recusa = signal<RecusaAviso | null>(null);
  readonly pendente = signal<PendenteAviso | null>(null);
  readonly gerandoPix = signal(false);
  /** Todos os planos ativos (para sugerir o mensal quando falta limite). */
  private readonly planos = signal<Plano[]>([]);

  private readonly injector = inject(Injector);
  private readonly recusaBanner = viewChild<ElementRef<HTMLElement>>('recusaBanner');

  // Cupom aplicado (código normalizado) e o desconto/preço final vindos da RPC.
  readonly cupomAplicado = signal<string | null>(null);
  readonly cupomErro = signal<string | null>(null);
  readonly validandoCupom = signal(false);
  private readonly descontoCentavos = signal(0);
  private readonly valorFinalCentavos = signal<number | null>(null);

  private brick: BrickController | null = null;

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) return; // SSR renderiza o skeleton; o brick monta no browser

    // Quem já tem acesso não deve recomprar (a edge também barra com 409).
    if (await this.subscription.temAssinaturaAtivaServidor()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    const slug = this.route.snapshot.paramMap.get('plano') ?? '';
    const planos = await this.subscription.listarPlanos();
    this.planos.set(planos);
    const plano = planos.find((p) => p.slug === slug) ?? null;
    if (!plano) {
      this.router.navigate(['/planos']);
      return;
    }
    this.plano.set(plano);
    this.carregando.set(false);
    // Recusa assíncrona (cartão em análise recusado ~1 min depois, ou a 1ª
    // cobrança da assinatura legada) e pagamento ainda em andamento: sem este
    // aviso, quem saiu da tela antes do desfecho nunca vê o motivo. Não
    // bloqueia a montagem do Brick — o banner aparece quando resolver.
    void this.mostrarUltimaIntencao();
    // Cupom aplicado antes nesta aba (ex.: voltando da tela de status após
    // uma recusa): reaplica ANTES de montar o Brick, para o valor já sair
    // com desconto. Inválido para este plano → descarta em silêncio.
    if (!plano.recorrente) await this.restaurarCupomComPrazo();
    await this.montarBrick(plano);

    // "Pagar com Pix" vindo da tela de status (recusa do cartão): gera o Pix
    // direto, sem o aluno ter de achar a aba Pix dentro do Brick. O parâmetro
    // sai da URL antes, para um reload não gerar outro Pix.
    if (this.route.snapshot.queryParamMap.get('metodo') === QUERY_PAGAR_COM_PIX && !plano.recorrente) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      await this.pagarComPix();
    }
  }

  /** Avisos a partir da intenção mais recente (recusa ou pagamento em andamento). */
  private async mostrarUltimaIntencao(): Promise<void> {
    const ultima = await this.checkout.ultimaIntencaoRecente();
    if (!ultima) return;
    if (ultima.status === 'recusada') {
      if (this.recusa()) return; // uma recusa desta sessão já está na tela
      const info = mapStatusDetail(ultima.status_detail);
      this.recusa.set({
        titulo: 'Seu último pagamento foi recusado',
        mensagem: ultima.tipo === 'assinatura'
          ? `${info.titulo}. Tente novamente, de preferência com outro cartão.`
          : `${info.titulo}. ${info.mensagem}`,
        ofertaPix: this.podeOfertarPix(ultima.metodo),
        ofertaMensal: this.podeOfertarMensal(ultima.status_detail),
      });
      return;
    }
    if (ultima.status === 'pendente') this.pendente.set(this.avisoPendente(ultima));
  }

  /**
   * Pagamento da última tentativa ainda sem desfecho. Cartão em análise pode
   * ser APROVADO depois: pagar de novo agora arrisca cobrança dupla.
   */
  private avisoPendente(intencao: PagamentoIntencao): PendenteAviso | null {
    const agora = Date.now();
    if (ehMetodoCartao(intencao.metodo)) {
      if (agora - new Date(intencao.criado_em).getTime() > JANELA_CARTAO_EM_ANALISE_MS) return null;
      return {
        titulo: 'Seu pagamento com cartão ainda está em análise',
        mensagem:
          'O resultado costuma sair em cerca de 1 minuto. Aguarde antes de pagar de novo, para não ser cobrado duas vezes.',
        intencaoId: intencao.id,
        cartao: true,
      };
    }
    if (intencao.metodo === 'pix' && intencao.expira_em && new Date(intencao.expira_em).getTime() > agora) {
      return {
        titulo: 'Você gerou um Pix há pouco',
        mensagem: 'Se já pagou, acompanhe por aqui: o acesso é liberado assim que o pagamento é confirmado.',
        intencaoId: intencao.id,
        cartao: false,
      };
    }
    return null;
  }

  /** Pix só faz sentido como saída de uma recusa de CARTÃO num plano de pagamento único. */
  private podeOfertarPix(metodoFalhou: string | null | undefined): boolean {
    const p = this.plano();
    return !!p && !p.recorrente && (metodoFalhou == null || ehMetodoCartao(metodoFalhou));
  }

  private podeOfertarMensal(statusDetail: string | null | undefined): boolean {
    const p = this.plano();
    return !!p && p.frequency > 1 && recusaPorLimite(statusDetail);
  }

  /** Plano mensal mais barato (sugerido quando falta limite no semestral). */
  planoMensalAlternativo(): Plano | null {
    const mensais = this.planos()
      .filter((p) => p.frequency === 1 && p.frequency_type === 'months' && !p.recorrente)
      .sort((a, b) => a.preco_centavos - b.preco_centavos);
    return mensais[0] ?? null;
  }

  precoMensalMinimo(): string {
    const m = this.planoMensalAlternativo();
    return m ? this.brl(m.preco_centavos, m.moeda || 'BRL') : '';
  }

  /** Exibe a recusa e a traz para a tela (no celular o banner fica acima do Brick, fora da vista). */
  private mostrarRecusa(aviso: RecusaAviso): void {
    this.recusa.set(aviso);
    afterNextRender(
      () => {
        const el = this.recusaBanner()?.nativeElement;
        if (!el) return;
        el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        el.focus?.({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  /**
   * Gera o Pix direto (sem passar pelo Brick): mesmo endpoint e mesma
   * validação de preço/cupom no servidor que o Pix escolhido dentro do Brick
   * — o Pix só exige o e-mail do pagador (o da conta, se omitido).
   */
  async pagarComPix(): Promise<void> {
    const p = this.plano();
    if (!p || p.recorrente || this.gerandoPix()) return;
    this.gerandoPix.set(true);
    this.pendente.set(null);
    try {
      const email = this.auth.user()?.email ?? undefined;
      await this.submeterPagamento(p, {
        payment_method_id: 'pix',
        ...(email ? { payer: { email } } : {}),
      });
    } catch {
      /* a recusa/erro já está no banner */
    } finally {
      this.gerandoPix.set(false);
    }
  }

  ngOnDestroy(): void {
    this.brick?.unmount();
    this.brick = null;
  }

  recarregar(): void {
    window.location.reload();
  }

  descricaoPlano(): string {
    const p = this.plano();
    if (!p) return '';
    if (p.recorrente) return 'Assinatura mensal — cancele quando quiser';
    const periodo = p.frequency === 1 ? '1 mês' : `${p.frequency} meses`;
    return `Acesso por ${periodo}, sem renovação automática`;
  }

  notaPreco(): string {
    const p = this.plano();
    if (!p) return '';
    if (p.recorrente) return 'por mês';
    const max = this.maxParcelas(p);
    return max > 1 ? `em até ${max}x sem juros` : 'pagamento único';
  }

  /** Parcelamento espelha o período de acesso (6 meses → 6x; 1 mês → à vista). */
  private maxParcelas(p: Plano): number {
    if (p.recorrente || p.frequency_type !== 'months') return 1;
    return Math.min(6, Math.max(1, p.frequency));
  }

  /** Valor exibido/cobrado: com desconto se houver cupom aplicado. */
  private valorExibidoCentavos(): number {
    const p = this.plano();
    if (!p) return 0;
    const final = this.valorFinalCentavos();
    return this.cupomAplicado() && final != null ? final : p.preco_centavos;
  }

  private brl(centavos: number, moeda = 'BRL'): string {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: moeda });
  }

  precoFormatado(): string {
    const p = this.plano();
    if (!p) return '';
    return this.brl(this.valorExibidoCentavos(), p.moeda || 'BRL');
  }

  precoOriginalFormatado(): string {
    const p = this.plano();
    if (!p) return '';
    return this.brl(p.preco_centavos, p.moeda || 'BRL');
  }

  descontoFormatado(): string {
    const p = this.plano();
    return this.brl(this.descontoCentavos(), p?.moeda || 'BRL');
  }

  /** Valida e aplica um cupom para exibição; a edge reconfere no pagamento. */
  async aplicarCupom(codigoRaw: string): Promise<void> {
    const p = this.plano();
    const codigo = (codigoRaw ?? '').trim().toUpperCase();
    if (!p || !codigo || this.validandoCupom()) return;
    this.validandoCupom.set(true);
    this.cupomErro.set(null);
    const res = await this.checkout.validarCupom(codigo, p.slug);
    this.validandoCupom.set(false);
    if (!res || !res.valido) {
      this.cupomErro.set(this.mensagemCupom(res?.motivo));
      return;
    }
    this.cupomAplicado.set(codigo);
    this.descontoCentavos.set(res.desconto_centavos ?? 0);
    this.valorFinalCentavos.set(res.valor_final_centavos ?? p.preco_centavos);
    this.checkout.guardarCupom(codigo);
    // Remonta o Brick com o novo valor (parcelas e total do Brick refletem o desconto).
    await this.remontarBrick();
  }

  removerCupom(): void {
    this.cupomAplicado.set(null);
    this.cupomErro.set(null);
    this.descontoCentavos.set(0);
    this.valorFinalCentavos.set(null);
    this.checkout.limparCupom();
    void this.remontarBrick();
  }

  /**
   * Reaplica o cupom guardado na aba, sem remontar o Brick (chamado antes da
   * 1ª montagem). Falha/inválido não mostra erro: o aluno não digitou nada
   * agora — só segue com o preço cheio e o campo de cupom livre.
   */
  private async restaurarCupom(cancelado: () => boolean): Promise<void> {
    const p = this.plano();
    const codigo = this.checkout.cupomGuardado();
    if (!p || !codigo) return;
    const res = await this.checkout.validarCupom(codigo, p.slug);
    // Resposta depois do prazo: o Brick já montou com o preço cheio — aplicar
    // agora deixaria resumo e Brick com valores diferentes.
    if (cancelado() || !res || !res.valido) return;
    this.cupomAplicado.set(codigo);
    this.descontoCentavos.set(res.desconto_centavos ?? 0);
    this.valorFinalCentavos.set(res.valor_final_centavos ?? p.preco_centavos);
  }

  /** A restauração do cupom nunca segura a montagem do Brick por mais de 4s (rede lenta). */
  private async restaurarCupomComPrazo(): Promise<void> {
    let expirou = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      this.restaurarCupom(() => expirou),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          expirou = true;
          resolve();
        }, 4000);
      }),
    ]);
    clearTimeout(timer);
  }

  private mensagemCupom(motivo?: string): string {
    switch (motivo) {
      case 'expirado':
        return 'Este cupom expirou.';
      case 'ja_usado':
        return 'Você já utilizou este cupom.';
      case 'nao_aplicavel':
        return 'Este cupom não é válido para este plano.';
      case 'esgotado':
        return 'Este cupom atingiu o limite de usos.';
      default:
        return 'Cupom inválido.';
    }
  }

  private async remontarBrick(): Promise<void> {
    const p = this.plano();
    if (!p) return;
    this.brick?.unmount();
    this.brick = null;
    await this.montarBrick(p);
  }

  private async montarBrick(plano: Plano): Promise<void> {
    this.montandoBrick.set(true);
    // Recorrente (legado): só cartão em 1x. Pagamento único: cartão + Pix +
    // boleto, parcelado conforme o período do plano (mensal 1x, semestral 6x).
    const paymentMethods = plano.recorrente
      ? { creditCard: 'all', maxInstallments: 1 }
      : {
          creditCard: 'all',
          bankTransfer: 'all',
          ticket: 'all',
          maxInstallments: this.maxParcelas(plano),
        };
    try {
      this.brick = await this.sdk.createPaymentBrick(this.brickContainerId, {
        initialization: {
          amount: this.valorExibidoCentavos() / 100,
          payer: { email: this.auth.user()?.email ?? undefined },
        },
        customization: {
          paymentMethods,
          visual: {
            style: {
              customVariables: {
                baseColor: '#2451D8',
                borderRadiusMedium: '12px',
                borderRadiusLarge: '16px',
                formBackgroundColor: '#ffffff',
              },
            },
          },
        },
        callbacks: {
          onReady: () => this.montandoBrick.set(false),
          onSubmit: (data: BrickSubmitData) => this.submeter(plano, data),
          onError: (err: { message?: string }) => {
            // Erros de montagem/validação internos do Brick; os de pagamento
            // chegam pelo onSubmit. Não interrompe a página inteira.
            console.error('Payment Brick error:', err?.message);
          },
        },
      });
    } catch {
      this.montandoBrick.set(false);
      this.erroFatal.set(SDK_ERRO_CARREGAMENTO);
    }
  }

  /**
   * Chamado pelo Brick no clique em "Pagar". Rejeitar a promise reabilita o
   * botão do Brick para nova tentativa (com token novo + attempt_id novo).
   */
  private async submeter(plano: Plano, data: BrickSubmitData): Promise<void> {
    this.recusa.set(null);
    // O aviso de pagamento em andamento NÃO sai aqui: se o cartão anterior
    // ainda está em análise, ele segue visível (e bloqueia a oferta de Pix).
    if (plano.recorrente) {
      await this.submeterAssinatura(plano, data.formData);
    } else {
      await this.submeterPagamento(plano, data.formData);
    }
  }

  private async submeterPagamento(plano: Plano, formData: BrickFormData): Promise<void> {
    const ehCartao = !!formData.token;
    const res = await this.checkout.processarPagamento(
      plano.slug,
      formData,
      this.cupomAplicado() ?? undefined,
    );
    if (!res.ok) {
      this.mostrarRecusa({
        titulo: res.status === 429 && ehCartao ? 'Muitas tentativas com cartão' : 'Não foi possível processar',
        mensagem: res.error,
        // Teto de tentativas do CARTÃO (anti card testing): o Pix tem teto
        // próprio e continua disponível.
        ofertaPix: res.status === 429 && ehCartao && !plano.recorrente && !this.pendente()?.cartao,
        ofertaMensal: false,
      });
      throw new Error(res.error);
    }
    if (res.status === 'rejected') {
      const info = mapStatusDetail(res.status_detail);
      this.mostrarRecusa({
        titulo: info.titulo,
        mensagem: info.mensagem,
        // Com um cartão anterior ainda em análise, Pix agora arrisca cobrança dupla.
        ofertaPix: ehCartao && !plano.recorrente && !this.pendente()?.cartao,
        ofertaMensal: ehCartao && plano.frequency > 1 && recusaPorLimite(res.status_detail),
      });
      throw new Error(res.status_detail ?? 'rejected');
    }
    // approved / pending (pix, boleto, 3DS, em análise) → tela de status.
    this.guardarResultado(res);
    this.router.navigate(['/checkout/status', res.intencao_id]);
  }

  private async submeterAssinatura(plano: Plano, formData: BrickFormData): Promise<void> {
    if (!formData.token) {
      this.mostrarRecusa({
        titulo: 'Dados do cartão incompletos',
        mensagem: 'Preencha os dados do cartão para assinar.',
        ofertaPix: false,
        ofertaMensal: false,
      });
      throw new Error('token ausente');
    }
    const res = await this.checkout.processarAssinatura(
      plano.slug,
      formData.token,
      formData.payer?.identification,
    );
    if (!res.ok) {
      this.mostrarRecusa({ titulo: 'Não foi possível processar', mensagem: res.error, ofertaPix: false, ofertaMensal: false });
      throw new Error(res.error);
    }
    if (res.status === 'rejected') {
      const info = mapStatusDetail(res.status_detail);
      this.mostrarRecusa({ titulo: info.titulo, mensagem: info.mensagem, ofertaPix: false, ofertaMensal: false });
      throw new Error(res.status_detail ?? 'rejected');
    }
    this.router.navigate(['/checkout/status', res.intencao_id]);
  }

  /** Persiste QR do Pix / boleto / 3DS para a tela de status (e reloads). */
  private guardarResultado(res: ProcessarPagamentoResponse): void {
    try {
      sessionStorage.setItem(
        `${CHECKOUT_RESULT_KEY_PREFIX}${res.intencao_id}`,
        JSON.stringify(res),
      );
    } catch {
      /* storage indisponível: a tela de status cai no fluxo de reconsulta */
    }
  }
}
