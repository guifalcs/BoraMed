import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CircleCheck,
  Clock,
  ExternalLink,
  QrCode,
  TriangleAlert,
  type LucideIconData,
} from 'lucide-angular';
import { CheckoutService } from '../../core/services/checkout.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import {
  mapStatusDetail,
  recusaPorLimite,
  type StatusDetailInfo,
} from '../../core/models/mp-status-detail.map';
import { PixPanelComponent } from './pix-panel.component';
import { TresDsChallengeComponent } from './tres-ds-challenge.component';
import { CHECKOUT_RESULT_KEY_PREFIX, QUERY_PAGAR_COM_PIX, ehMetodoCartao } from './checkout.component';
import type {
  PagamentoIntencao,
  ProcessarPagamentoResponse,
} from '../../core/models/checkout.types';
import type { Plano } from '../../core/models/subscription.types';

// Tela de status do pagamento (/checkout/status/:intencaoId). Estados:
//   aprovado  → confirma acesso (polling curto) e leva ao dashboard
//   pix       → QR + copia-e-cola + countdown + polling 3s
//   boleto    → link + "Já paguei, verificar"
//   3ds       → Status Screen Brick com o challenge do banco + polling
//   pendente  → em análise (pending_contingency / review_manual)
//   recusado  → mensagem específica + Pagar com Pix (1 clique) / outro cartão
//   expirado  → gerar novo pagamento (copy por método: Pix, boleto, cartão)
//   erro      → não deu para carregar a intenção (rede) — nunca some calado
// Reload reconstrói o estado: intenção via PostgREST (RLS own) + dados
// voláteis (QR/boleto/3DS) do sessionStorage gravado pelo checkout.
//
// Cartão "em análise" (in_process): em produção o antifraude responde em
// ~1 min, quase sempre com cc_rejected_high_risk. Quem fecha a tela nesse
// meio-tempo nunca vê o motivo — por isso a copy pede para esperar com a
// página aberta e o polling reconsulta assim que a aba volta ao foco (o
// navegador congela timers de aba em segundo plano, ex.: aluno foi ao app
// do banco conferir o limite).

type TelaEstado =
  | 'carregando'
  | 'aprovado'
  | 'pix'
  | 'boleto'
  | 'tres_ds'
  | 'pendente'
  | 'recusado'
  | 'expirado'
  | 'erro';

const POLL_MS = 3000;
/**
 * Reconsulta ATIVA no MP (mp-consultar-pagamento) enquanto o pagamento está
 * pendente. O polling de 3s só lê o banco, que depende do webhook: se a
 * notificação atrasar ou se perder, o aluno que pagou o Pix ficaria olhando o
 * QR até a reconciliação horária. Com isto, a confirmação chega em até ~20s
 * mesmo sem webhook (o canal IPN legado, por exemplo, nunca é processado: o
 * MP o envia com x-signature que não confere e o webhook responde 401).
 */
const CONSULTA_MP_MS = 20_000;
/** A partir daqui a análise está "demorando mais que o normal" (~1 min em produção). */
const ANALISE_DEMORADA_MS = 2 * 60 * 1000;
/** Tentativas de carregar a intenção antes de mostrar erro (rede instável no celular). */
const TENTATIVAS_CARREGAR = 3;

@Component({
  selector: 'app-pagamento-status',
  standalone: true,
  imports: [CommonModule, RouterLink, UiIconComponent, PixPanelComponent, TresDsChallengeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gray-50 px-4 py-10">
      <div class="mx-auto max-w-lg">
        <div class="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
          @switch (estado()) {
            @case ('carregando') {
              <div class="space-y-4" data-testid="status-skeleton">
                <div class="h-8 animate-pulse rounded-lg bg-gray-100"></div>
                <div class="h-40 animate-pulse rounded-lg bg-gray-100"></div>
              </div>
            }
            @case ('aprovado') {
              <div class="text-center" data-testid="status-aprovado">
                <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <app-ui-icon [icon]="checkIcon" [size]="32" class="text-green-600" />
                </div>
                <h1 class="mt-4 text-xl font-bold text-gray-900">Pagamento aprovado!</h1>
                @if (liberandoAcesso()) {
                  <p class="mt-2 text-sm text-gray-600">Liberando seu acesso…</p>
                } @else {
                  <p class="mt-2 text-sm text-gray-600">Seu acesso está liberado. Bons estudos!</p>
                  <button
                    type="button"
                    (click)="irParaDashboard()"
                    class="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
                    data-testid="ir-dashboard"
                  >
                    Começar a estudar
                  </button>
                }
              </div>
            }
            @case ('pix') {
              <h1 class="text-center text-xl font-bold text-gray-900">Pague com Pix</h1>
              <div class="mt-4">
                @if (resultado()?.pix) {
                  <app-pix-panel [pix]="resultado()!.pix!" (expirou)="aoExpirarPix()" />
                } @else {
                  <!-- Reload sem os dados voláteis do QR: oferece regenerar -->
                  <p class="text-center text-sm text-gray-600">
                    Não encontramos o QR Code desta tentativa (a página foi recarregada).
                    Se você ainda não pagou, gere um novo código Pix.
                  </p>
                  <button
                    type="button"
                    (click)="novaTentativa()"
                    class="mt-4 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
                  >
                    Gerar novo Pix
                  </button>
                }
              </div>
            }
            @case ('boleto') {
              <div class="text-center" data-testid="status-boleto">
                <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
                  <app-ui-icon [icon]="relogioIcon" [size]="32" class="text-amber-600" />
                </div>
                <h1 class="mt-4 text-xl font-bold text-gray-900">Boleto gerado</h1>
                <p class="mt-2 text-sm text-gray-600">
                  O boleto compensa em até 2 dias úteis após o pagamento.
                  <span class="font-medium text-gray-900">Seu acesso será liberado automaticamente</span>
                  assim que o banco confirmar — avisaremos por aqui.
                </p>
                @if (resultado()?.boleto?.url) {
                  <a
                    [href]="resultado()!.boleto!.url"
                    target="_blank"
                    rel="noopener"
                    class="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
                    data-testid="boleto-link"
                  >
                    <app-ui-icon [icon]="externoIcon" [size]="16" />
                    Abrir boleto
                  </a>
                }
                <button
                  type="button"
                  (click)="verificarPagamento()"
                  [disabled]="verificando()"
                  class="mt-3 w-full rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  data-testid="ja-paguei"
                >
                  {{ verificando() ? 'Verificando…' : 'Já paguei, verificar' }}
                </button>
                @if (verificacaoSemMudanca()) {
                  <p class="mt-2 text-xs text-gray-500">
                    Ainda não identificamos o pagamento. O banco pode levar até 2 dias úteis para compensar o boleto.
                  </p>
                }
              </div>
            }
            @case ('tres_ds') {
              <h1 class="text-center text-xl font-bold text-gray-900">Confirmação do seu banco</h1>
              <p class="mt-2 text-center text-sm text-gray-600">
                Conclua a verificação abaixo para finalizar o pagamento.
              </p>
              <div class="mt-4">
                @if (resultado()?.three_ds && resultado()?.payment_id) {
                  <app-tres-ds-challenge
                    [paymentId]="resultado()!.payment_id!"
                    [threeDs]="resultado()!.three_ds!"
                  />
                } @else {
                  <p class="text-center text-sm text-gray-600">
                    Não foi possível retomar a verificação (a página foi recarregada).
                    Confira no app do seu banco se a compra foi confirmada ou tente novamente.
                  </p>
                  <button
                    type="button"
                    (click)="verificarPagamento()"
                    [disabled]="verificando()"
                    class="mt-4 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {{ verificando() ? 'Verificando…' : 'Verificar pagamento' }}
                  </button>
                }
              </div>
            }
            @case ('pendente') {
              <div class="text-center" data-testid="status-pendente">
                <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
                  <app-ui-icon [icon]="relogioIcon" [size]="32" class="text-amber-600" />
                </div>
                <h1 class="mt-4 text-xl font-bold text-gray-900">{{ infoPendente().titulo }}</h1>
                <p class="mt-2 text-sm text-gray-600">{{ infoPendente().mensagem }}</p>
                <p class="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
                  <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500"></span>
                  Acompanhando o resultado: esta página atualiza sozinha.
                </p>
                @if (analiseDemorada()) {
                  <p class="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600" data-testid="analise-demorada">
                    Está demorando mais que o normal. Você pode fechar esta página: se for aprovado, o
                    acesso é liberado sozinho; se for recusado, o motivo aparece quando você voltar ao
                    checkout. Não pague de novo enquanto isso, para não ser cobrado duas vezes.
                  </p>
                }
              </div>
            }
            @case ('recusado') {
              <div class="text-center" data-testid="status-recusado">
                <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                  <app-ui-icon [icon]="alertaIcon" [size]="32" class="text-red-600" />
                </div>
                <h1 class="mt-4 text-xl font-bold text-gray-900">{{ infoRecusa().titulo }}</h1>
                <p class="mt-2 text-sm text-gray-600">{{ infoRecusa().mensagem }}</p>
                @if (ofertaPix()) {
                  <button
                    type="button"
                    (click)="pagarComPix()"
                    class="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
                    data-testid="status-pagar-com-pix"
                  >
                    <app-ui-icon [icon]="pixIcon" [size]="18" />
                    Pagar com Pix agora
                  </button>
                  <button
                    type="button"
                    (click)="novaTentativa()"
                    class="mt-3 w-full rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    data-testid="tentar-novamente"
                  >
                    {{ infoRecusa().acao === 'revisar_dados' ? 'Corrigir os dados do cartão' : 'Tentar com outro cartão' }}
                  </button>
                } @else {
                  <button
                    type="button"
                    (click)="novaTentativa()"
                    class="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
                    data-testid="tentar-novamente"
                  >
                    Tentar novamente
                  </button>
                }
                @if (ofertaMensal()) {
                  <a
                    routerLink="/planos"
                    [queryParams]="{ ciclo: 'mensal' }"
                    class="mt-3 inline-block text-sm font-semibold text-blue-700 underline underline-offset-2"
                    data-testid="ver-planos-mensais"
                  >
                    Ver planos mensais (valor menor)
                  </a>
                }
              </div>
            }
            @case ('expirado') {
              <div class="text-center" data-testid="status-expirado">
                <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <app-ui-icon [icon]="relogioIcon" [size]="32" class="text-gray-500" />
                </div>
                <h1 class="mt-4 text-xl font-bold text-gray-900">{{ infoExpirado().titulo }}</h1>
                <p class="mt-2 text-sm text-gray-600">{{ infoExpirado().mensagem }}</p>
                @if (ofertaPix()) {
                  <button
                    type="button"
                    (click)="pagarComPix()"
                    class="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
                    data-testid="status-pagar-com-pix"
                  >
                    <app-ui-icon [icon]="pixIcon" [size]="18" />
                    Pagar com Pix agora
                  </button>
                }
                <button
                  type="button"
                  (click)="novaTentativa()"
                  [class]="ofertaPix()
                    ? 'mt-3 w-full rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50'
                    : 'mt-6 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700'"
                  data-testid="gerar-novo"
                >
                  {{ infoExpirado().cta }}
                </button>
              </div>
            }
            @case ('erro') {
              <div class="text-center" data-testid="status-erro">
                <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <app-ui-icon [icon]="alertaIcon" [size]="32" class="text-gray-500" />
                </div>
                <h1 class="mt-4 text-xl font-bold text-gray-900">Não conseguimos carregar o pagamento</h1>
                <p class="mt-2 text-sm text-gray-600">
                  Verifique sua conexão e tente de novo. Se você já pagou, o acesso é liberado
                  automaticamente assim que o pagamento é confirmado.
                </p>
                <button
                  type="button"
                  (click)="recarregar()"
                  class="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
                  data-testid="status-recarregar"
                >
                  Tentar de novo
                </button>
              </div>
            }
          }
        </div>

        @if (estado() !== 'aprovado') {
          <p class="mt-4 text-center text-xs text-gray-400">
            Problemas com o pagamento?
            <a routerLink="/planos" class="font-medium text-gray-500 hover:text-gray-700">Voltar aos planos</a>
          </p>
        }
      </div>
    </div>
  `,
})
export class PagamentoStatusComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly checkout = inject(CheckoutService);
  private readonly subscription = inject(SubscriptionService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly checkIcon: LucideIconData = CircleCheck;
  readonly relogioIcon: LucideIconData = Clock;
  readonly alertaIcon: LucideIconData = TriangleAlert;
  readonly externoIcon: LucideIconData = ExternalLink;
  readonly pixIcon: LucideIconData = QrCode;

  readonly estado = signal<TelaEstado>('carregando');
  readonly intencao = signal<PagamentoIntencao | null>(null);
  readonly resultado = signal<ProcessarPagamentoResponse | null>(null);
  readonly liberandoAcesso = signal(false);
  readonly verificando = signal(false);
  readonly verificacaoSemMudanca = signal(false);

  /** Relógio do polling (atualizado a cada consulta) — detecta análise demorada. */
  private readonly agora = signal(Date.now());
  private readonly plano = signal<Plano | null>(null);

  private intencaoId = '';
  private planoSlug: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private consultando = false;
  private ultimaConsultaMp = Date.now();
  private readonly aoVoltarParaAba = (): void => {
    // Timers de aba em segundo plano são congelados/espaçados pelo navegador:
    // ao voltar (ex.: do app do banco, depois de pagar o Pix), reconsulta na
    // hora — inclusive no MP — em vez de esperar o próximo ciclo.
    if (document.visibilityState === 'visible' && this.pollTimer) {
      this.ultimaConsultaMp = 0;
      void this.consultarUmaVez();
    }
  };

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) return;
    this.intencaoId = this.route.snapshot.paramMap.get('intencaoId') ?? '';
    if (!this.intencaoId) {
      this.router.navigate(['/planos']);
      return;
    }
    document.addEventListener('visibilitychange', this.aoVoltarParaAba);
    this.lerResultadoVolatil();
    const intencao = await this.carregarIntencao();
    if (!intencao) {
      // Rede instável: avisa e oferece recarregar em vez de mandar para
      // /planos calado (quem acabou de gerar um Pix perderia a tela).
      this.estado.set('erro');
      return;
    }
    await this.resolverPlano(intencao);
    this.aplicarIntencao(intencao);
  }

  ngOnDestroy(): void {
    this.pararPolling();
    if (this.isBrowser) document.removeEventListener('visibilitychange', this.aoVoltarParaAba);
  }

  infoRecusa(): StatusDetailInfo {
    return mapStatusDetail(this.intencao()?.status_detail);
  }

  infoPendente(): StatusDetailInfo {
    return mapStatusDetail(this.intencao()?.status_detail ?? 'pending_contingency');
  }

  /** Cartão em análise há mais de ~2 min: libera o aluno para fechar a página. */
  analiseDemorada(): boolean {
    const i = this.intencao();
    if (!i) return false;
    return this.agora() - new Date(i.criado_em).getTime() > ANALISE_DEMORADA_MS;
  }

  /** Recusa/expiração de CARTÃO num plano de pagamento único: oferece o Pix (estorno não). */
  ofertaPix(): boolean {
    const p = this.plano();
    const i = this.intencao();
    return (
      !!this.planoSlug && !!p && !p.recorrente && i?.status !== 'cancelada' && ehMetodoCartao(i?.metodo)
    );
  }

  /** Falta de limite num plano de vários meses: aponta os planos mensais. */
  ofertaMensal(): boolean {
    const p = this.plano();
    return !!p && p.frequency > 1 && recusaPorLimite(this.intencao()?.status_detail);
  }

  infoExpirado(): { titulo: string; mensagem: string; cta: string } {
    const i = this.intencao();
    if (i?.status === 'cancelada') {
      return {
        titulo: 'Pagamento estornado',
        mensagem: 'Este pagamento foi devolvido e não libera acesso. Se quiser, você pode assinar de novo.',
        cta: 'Ver planos',
      };
    }
    if (ehMetodoCartao(i?.metodo)) {
      return {
        titulo: 'A confirmação do banco expirou',
        mensagem:
          'A verificação do pagamento não foi concluída a tempo e nenhum valor foi cobrado. Tente de novo ou pague com Pix.',
        cta: 'Tentar novamente',
      };
    }
    if (i?.metodo?.startsWith('bol')) {
      return {
        titulo: 'O boleto venceu',
        mensagem: 'Nenhum valor foi cobrado. Gere um novo pagamento para continuar.',
        cta: 'Gerar novo pagamento',
      };
    }
    return {
      titulo: 'O código expirou',
      mensagem: 'Nenhum valor foi cobrado. Gere um novo código para concluir o pagamento.',
      cta: 'Gerar novo pagamento',
    };
  }

  /** Volta ao checkout gerando o Pix direto (sem procurar a aba Pix no Brick). */
  pagarComPix(): void {
    if (!this.planoSlug) return;
    this.limparResultadoVolatil();
    this.router.navigate(['/checkout', this.planoSlug], { queryParams: { metodo: QUERY_PAGAR_COM_PIX } });
  }

  recarregar(): void {
    window.location.reload();
  }

  aoExpirarPix(): void {
    // O MP cancela o payment após a validade; refletimos já na UI.
    this.estado.set('expirado');
    this.pararPolling();
  }

  novaTentativa(): void {
    this.limparResultadoVolatil();
    // Estornado não "tenta de novo" aquele pagamento: volta à vitrine.
    const destino = this.planoSlug && this.intencao()?.status !== 'cancelada'
      ? ['/checkout', this.planoSlug]
      : ['/planos'];
    this.router.navigate(destino);
  }

  async verificarPagamento(): Promise<void> {
    this.verificando.set(true);
    this.verificacaoSemMudanca.set(false);
    const res = await this.checkout.consultarPagamento(this.intencaoId);
    this.verificando.set(false);
    if (res?.status === 'approved') {
      this.aoAprovar();
    } else {
      this.verificacaoSemMudanca.set(true);
      const intencao = await this.checkout.obterIntencao(this.intencaoId);
      if (intencao) this.aplicarIntencao(intencao);
    }
  }

  irParaDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  // ---- estado interno ----

  private aplicarIntencao(intencao: PagamentoIntencao): void {
    this.intencao.set(intencao);
    switch (intencao.status) {
      case 'aprovada':
        this.aoAprovar();
        return;
      case 'recusada':
        this.estado.set('recusado');
        this.pararPolling();
        return;
      case 'expirada':
      case 'cancelada':
        this.estado.set('expirado');
        this.pararPolling();
        return;
      default: {
        // criada / processando / pendente
        if (intencao.status_detail === 'pending_challenge') {
          this.estado.set('tres_ds');
        } else if (intencao.metodo === 'pix') {
          this.estado.set('pix');
        } else if (this.ehBoleto(intencao.metodo)) {
          this.estado.set('boleto');
        } else {
          this.estado.set('pendente');
        }
        this.iniciarPolling();
      }
    }
  }

  private ehBoleto(metodo: string | null): boolean {
    return !!metodo && metodo !== 'pix' && !this.resultado()?.pix && (metodo.startsWith('bol') || !!this.resultado()?.boleto);
  }

  private aoAprovar(): void {
    this.pararPolling();
    this.limparResultadoVolatil();
    // O cupom guardado para retentativas já foi usado nesta compra.
    this.checkout.limparCupom();
    this.estado.set('aprovado');
    void this.confirmarAcesso();
  }

  /** Polling curto do RPC até o acesso refletir (webhook/sync já gravou). */
  private async confirmarAcesso(): Promise<void> {
    this.liberandoAcesso.set(true);
    for (let i = 0; i < 10; i++) {
      if (await this.checkout.temAcessoServidor()) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    // Atualiza o estado local da assinatura para os guards/telas.
    // Invalida também os caches de acesso/tier (TTL 5min) — sem isso o
    // tierAvancadoGuard pode negar acesso logo após um upgrade aprovado.
    this.subscription.invalidarAcesso();
    await this.subscription.carregarAssinatura();
    this.liberandoAcesso.set(false);
  }

  private iniciarPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => void this.consultarUmaVez(), POLL_MS);
  }

  private async consultarUmaVez(): Promise<void> {
    if (this.consultando) return; // ciclo anterior ainda em voo (rede lenta)
    this.consultando = true;
    try {
      const agora = Date.now();
      this.agora.set(agora);
      // Rede de segurança contra webhook atrasado/perdido: o servidor
      // reconsulta o payment no MP e roda o mesmo sync idempotente do webhook;
      // a leitura do banco logo abaixo já reflete o desfecho.
      if (this.intencao()?.mp_payment_id && agora - this.ultimaConsultaMp >= CONSULTA_MP_MS) {
        this.ultimaConsultaMp = agora;
        await this.checkout.consultarPagamento(this.intencaoId);
      }
      if (!this.pollTimer) return; // a tela já saiu do estado pendente
      const intencao = await this.checkout.obterIntencao(this.intencaoId);
      if (!intencao || !this.pollTimer) return;
      const anterior = this.intencao();
      if (intencao.status !== anterior?.status || intencao.status_detail !== anterior?.status_detail) {
        this.aplicarIntencao(intencao);
      }
    } finally {
      this.consultando = false;
    }
  }

  /** Lê a intenção com algumas tentativas (rede móvel instável logo após pagar). */
  private async carregarIntencao(): Promise<PagamentoIntencao | null> {
    for (let i = 0; i < TENTATIVAS_CARREGAR; i++) {
      const intencao = await this.checkout.obterIntencao(this.intencaoId);
      if (intencao) return intencao;
      if (i < TENTATIVAS_CARREGAR - 1) await new Promise((r) => setTimeout(r, 1000));
    }
    return null;
  }

  private pararPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private lerResultadoVolatil(): void {
    try {
      const raw = sessionStorage.getItem(`${CHECKOUT_RESULT_KEY_PREFIX}${this.intencaoId}`);
      if (raw) this.resultado.set(JSON.parse(raw) as ProcessarPagamentoResponse);
    } catch {
      /* sem dados voláteis: os estados têm fallback de reconsulta */
    }
  }

  private limparResultadoVolatil(): void {
    try {
      sessionStorage.removeItem(`${CHECKOUT_RESULT_KEY_PREFIX}${this.intencaoId}`);
    } catch {
      /* ignore */
    }
  }

  private async resolverPlano(intencao: PagamentoIntencao): Promise<void> {
    if (!intencao.plano_id) return;
    const planos = await this.subscription.listarPlanos();
    const plano = planos.find((p) => p.id === intencao.plano_id) ?? null;
    this.plano.set(plano);
    this.planoSlug = plano?.slug ?? null;
  }
}
