import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ShieldCheck, type LucideIconData } from 'lucide-angular';
import { SubscriptionService } from '../../core/services/subscription.service';
import { UiConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/ui-confirm-dialog.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { TrocarCartaoModalComponent } from './trocar-cartao-modal.component';
import { LimiteTentativasBannerComponent } from '../../shared/components/limite-tentativas-banner/limite-tentativas-banner.component';
import type { Assinatura, Pagamento } from '../../core/models/subscription.types';

const STATUS_LABEL: Record<Assinatura['status'], string> = {
  pending: 'Pendente',
  authorized: 'Ativa',
  paused: 'Pausada',
  cancelled: 'Cancelada',
};

const STATUS_PAGAMENTO_LABEL: Record<string, string> = {
  approved: 'Aprovado',
  pending: 'Pendente',
  authorized: 'Autorizado',
  in_process: 'Processando',
  rejected: 'Recusado',
  refunded: 'Reembolsado',
  cancelled: 'Cancelado',
  charged_back: 'Estornado',
};

const METODO_PAGAMENTO_LABEL: Record<string, string> = {
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  master: 'Cartão de crédito',
  visa: 'Cartão de crédito',
  amex: 'Cartão de crédito',
  elo: 'Cartão de crédito',
  hipercard: 'Cartão de crédito',
  pix: 'Pix',
  bolbradesco: 'Boleto',
  account_money: 'Saldo Mercado Pago',
};

@Component({
  selector: 'app-minha-assinatura',
  standalone: true,
  imports: [CommonModule, UiConfirmDialogComponent, UiIconComponent, TrocarCartaoModalComponent, LimiteTentativasBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-2xl px-4 py-8">
      <h1 class="text-2xl font-bold text-gray-900">Minha assinatura</h1>

      @if (loading()) {
        <p class="mt-6 text-gray-500">Carregando…</p>
      } @else if (!assinatura()) {
        <div class="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-500">Plano</span>
            <span class="text-sm font-medium text-gray-900">Gratuito</span>
          </div>

          @if (tentativasRestantes() !== null) {
            <div class="mt-4">
              <app-limite-tentativas-banner
                [restantes]="tentativasRestantes()!"
                [comCta]="false"
              />
            </div>
          }

          <p class="mt-4 text-sm text-gray-600">
            No plano gratuito você faz treinos nacionais com limite. Materiais, flashcards e
            simulados por tema ficam nos planos pagos.
          </p>

          <button
            type="button"
            (click)="verPlanos()"
            class="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
          >
            Ver planos
          </button>
        </div>
      } @else {
        <div class="mt-6 rounded-xl border border-gray-200 bg-white p-6">
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-500">Plano</span>
            <span class="text-sm font-medium text-gray-900">{{ planoNome() }}</span>
          </div>
          @if (valorPeriodicidade()) {
            <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
              <span class="text-sm text-gray-500">Valor</span>
              <span class="text-sm text-gray-900">{{ valorPeriodicidade() }}</span>
            </div>
          }
          <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
            <span class="text-sm text-gray-500">Status</span>
            <span
              class="rounded-full px-3 py-1 text-xs font-semibold"
              [ngClass]="acessoAtivo() ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'"
            >
              {{ statusTexto() }}
            </span>
          </div>
          @if (assinatura()!.proxima_cobranca) {
            <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
              <span class="text-sm text-gray-500">{{ rotuloData() }}</span>
              <span class="text-sm text-gray-900">
                @if (mostrarValorProxima()) {{{ proximaCobrancaValor() }} · }{{ data(assinatura()!.proxima_cobranca) }}
              </span>
            </div>
          }
          @if (assinatura()!.data_inicio) {
            <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
              <span class="text-sm text-gray-500">Assinante desde</span>
              <span class="text-sm text-gray-900">{{ data(assinatura()!.data_inicio) }}</span>
            </div>
          }
          @if (formaPagamento()) {
            <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
              <span class="text-sm text-gray-500">Forma de pagamento</span>
              <span class="text-sm text-gray-900">{{ formaPagamento() }}</span>
            </div>
          }
          @if (assinatura()!.mp_preapproval_id) {
            <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
              <span class="text-sm text-gray-500">Código</span>
              <span class="text-xs text-gray-400">{{ assinatura()!.mp_preapproval_id }}</span>
            </div>
          }

          @if (emCarencia()) {
            <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Assinatura cancelada. Você continua com acesso até
              {{ data(assinatura()!.proxima_cobranca) }} e não haverá nova cobrança.
            </p>
          }
          @if (acessoUnicoAtivo()) {
            <p class="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
              Pagamento único — acesso liberado até {{ data(assinatura()!.proxima_cobranca) }}.
              Não renova automaticamente; você poderá renovar quando expirar.
            </p>
          }
          @if (acessoManualAtivo()) {
            <p class="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
              @if (assinatura()!.cortesia) {
                Acesso liberado pela equipe BoraMed até
                {{ data(assinatura()!.proxima_cobranca) }} — sem nenhuma cobrança.
              } @else {
                Acesso liberado até {{ data(assinatura()!.proxima_cobranca) }} — sem cobrança
                automática. Quando expirar, você poderá assinar um plano por aqui.
              }
            </p>
          }
          @if (gerenciavelNoMp() && assinatura()!.status === 'paused') {
            <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Sua assinatura está pausada e o acesso aos simulados está suspenso. Reative para
              voltar a estudar e retomar a cobrança recorrente.
            </p>
          }

          <div class="mt-6 flex flex-wrap gap-3">
            @if (gerenciavelNoMp() && assinatura()!.status === 'authorized') {
              <button
                type="button"
                (click)="abrirTrocarCartao()"
                [disabled]="processando()"
                class="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                data-testid="trocar-cartao"
              >
                Trocar cartão
              </button>
              <button
                type="button"
                (click)="abrirConfirmacao()"
                [disabled]="processando()"
                class="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                Cancelar assinatura
              </button>
            } @else if (gerenciavelNoMp() && assinatura()!.status === 'paused') {
              <button
                type="button"
                (click)="reativar()"
                [disabled]="processando()"
                class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {{ processando() ? 'Reativando…' : 'Reativar assinatura' }}
              </button>
            } @else if (!acessoAtivo()) {
              <button
                type="button"
                (click)="verPlanos()"
                class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Assinar novamente
              </button>
            }
          </div>
          @if (gerenciavelNoMp() && assinatura()!.status === 'authorized') {
            <p class="mt-2 text-xs text-gray-500">
              Ao cancelar, você mantém o acesso até a data da próxima cobrança.
            </p>
          }
        </div>

        @if (pagamentos().length > 0) {
          <h2 class="mt-8 text-lg font-semibold text-gray-900">Histórico de pagamentos</h2>
          <div class="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            @for (p of pagamentos(); track p.id) {
              <div class="flex items-center justify-between gap-3 px-4 py-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-gray-900">{{ p.plano_nome ?? 'Assinatura' }}</p>
                  <p class="text-xs text-gray-500">{{ data(p.processado_em ?? p.criado_em) }}</p>
                </div>
                <span class="text-sm font-medium text-gray-900">{{ valor(p) }}</span>
                <span
                  class="rounded-full px-2.5 py-1 text-xs font-semibold"
                  [ngClass]="p.status === 'approved'
                    ? 'bg-green-100 text-green-700'
                    : p.status === 'rejected'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-600'"
                >
                  {{ statusPagamento(p.status) }}
                </span>
              </div>
            }
          </div>
        }
      }

      @if (erro()) {
        <p class="mt-4 text-sm text-red-600">{{ erro() }}</p>
      }

      <div class="relative mt-10 space-y-1.5 pl-6 text-xs leading-relaxed text-gray-400">
        <app-ui-icon [icon]="segurancaIcon" [size]="14" class="absolute left-0 top-0.5 text-gray-400" />
        <p>
          Pague sem sair da plataforma: os dados do cartão são digitados em campos seguros e
          criptografados do <span class="font-medium text-gray-500">Mercado Pago</span> e nunca
          passam pelos servidores do BoraMed.
        </p>
        <p>
          Os planos são <span class="font-medium text-gray-500">pagamentos únicos</span>: seu plano
          libera acesso por {{ periodoAcessoTexto() }} (parcelável em até 6x sem juros). Nenhum
          renova automaticamente — quando expirar, você renova só se quiser.
        </p>
        @if (recorrente()) {
          <p>
            Sua assinatura é do modelo <span class="font-medium text-gray-500">recorrente</span> antigo:
            a cobrança se repete todo mês e você pode cancelar quando quiser — o acesso continua até o
            fim do período já pago.
          </p>
        }
        <p>Dúvidas sobre cobrança? Fale com o suporte pelo app.</p>
      </div>

      @if (mostrarTrocarCartao()) {
        <app-trocar-cartao-modal
          [valorCentavos]="assinatura()!.plano?.preco_centavos ?? 0"
          (fechar)="mostrarTrocarCartao.set(false)"
          (trocado)="aoTrocarCartao()"
        />
      }

      @if (mostrarConfirm()) {
        <app-ui-confirm-dialog
          titulo="Cancelar assinatura?"
          [mensagem]="mensagemCancelamento()"
          labelConfirmar="Sim, cancelar"
          labelCancelar="Voltar"
          variante="danger"
          (confirmar)="confirmarCancelamento()"
          (cancelar)="mostrarConfirm.set(false)"
        />
      }
    </div>
  `,
})
export class MinhaAssinaturaComponent implements OnInit {
  private readonly subscription = inject(SubscriptionService);
  private readonly router = inject(Router);

  readonly assinatura = this.subscription.assinatura;
  readonly tentativasRestantes = this.subscription.tentativasRestantes;
  readonly pagamentos = signal<Pagamento[]>([]);
  readonly loading = signal(true);
  readonly processando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly mostrarConfirm = signal(false);
  readonly mostrarTrocarCartao = signal(false);
  readonly segurancaIcon: LucideIconData = ShieldCheck;

  async ngOnInit(): Promise<void> {
    await this.subscription.carregarAssinatura();
    void this.subscription.statusAcessoServidor();
    this.pagamentos.set(await this.subscription.historicoPagamentos());
    this.loading.set(false);
  }

  statusLabel(status: Assinatura['status']): string {
    return STATUS_LABEL[status];
  }

  statusPagamento(status: string): string {
    return STATUS_PAGAMENTO_LABEL[status] ?? status;
  }

  planoNome(): string {
    const a = this.assinatura();
    if (a?.plano?.nome) return a.plano.nome;
    return a?.cortesia ? 'Cortesia' : '—';
  }

  valorPeriodicidade(): string | null {
    const p = this.assinatura()?.plano;
    if (!p) return null;
    const valor = this.brl(p.preco_centavos, p.moeda);
    if (!this.recorrente()) return valor; // sem cobrança recorrente: só o valor
    const per = this.periodicidade(p.frequency, p.frequency_type);
    return per ? `${valor} ${per}` : valor;
  }

  proximaCobrancaValor(): string | null {
    const p = this.assinatura()?.plano;
    return p ? this.brl(p.preco_centavos, p.moeda) : null;
  }

  formaPagamento(): string | null {
    // Só pagamentos APROVADOS DESTA assinatura: o último pagamento do usuário
    // pode ser de outra assinatura (ex.: compra anterior estornada) e o mensal
    // recém-autorizado ainda não tem pagamento registrado (validação de R$0).
    const a = this.assinatura();
    if (!a) return null;
    const pg = this.pagamentos().find(
      (p) => p.assinatura_id === a.id && p.status === 'approved',
    );
    const m = pg?.metodo_pagamento;
    if (!m) return null;
    return METODO_PAGAMENTO_LABEL[m] ?? m;
  }

  /** Texto genérico do período de acesso liberado pelo plano ("1 mês", "6 meses" etc.). */
  periodoAcessoTexto(): string {
    const p = this.assinatura()?.plano;
    if (!p) return 'o período contratado';
    if (p.frequency_type === 'months') {
      return p.frequency === 1 ? '1 mês' : `${p.frequency} meses`;
    }
    return p.frequency === 1 ? '1 dia' : `${p.frequency} dias`;
  }

  private periodicidade(freq: number, tipo: 'days' | 'months'): string {
    if (tipo === 'months') {
      if (freq === 1) return ''; // "Mensal" já é claro; não repete "por mês"
      if (freq === 6) return 'a cada 6 meses';
      if (freq === 12) return 'por ano';
      return `a cada ${freq} meses`;
    }
    return `a cada ${freq} dias`;
  }

  private brl(centavos: number, moeda = 'BRL'): string {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: moeda || 'BRL' });
  }

  /** Cancelada, mas ainda dentro do período pago (acesso liberado até proxima_cobranca). */
  emCarencia(): boolean {
    const a = this.assinatura();
    if (!a || a.status !== 'cancelled' || !a.proxima_cobranca) return false;
    return new Date(a.proxima_cobranca).getTime() > Date.now();
  }

  /**
   * Assinatura recorrente LEGADA (preapproval vivo no MP). Não usa
   * `plano.recorrente`: o plano mensal virou pagamento único, mas assinantes
   * antigos seguem com cobrança recorrente — o vínculo real é o preapproval.
   */
  recorrente(): boolean {
    return this.gerenciavelNoMp();
  }

  /**
   * Só assinaturas com preapproval no Mercado Pago podem ser geridas
   * (cancelar/pausar/reativar/trocar cartão). Acessos manuais e cortesias
   * (concedidos pelo admin, sem vínculo com o MP) apenas expiram na data.
   */
  gerenciavelNoMp(): boolean {
    return !!this.assinatura()?.mp_preapproval_id;
  }

  /** Acesso manual/cortesia (sem nenhum vínculo com o MP) ainda válido. */
  acessoManualAtivo(): boolean {
    const a = this.assinatura();
    return (
      !this.gerenciavelNoMp() &&
      !a?.mp_payment_id &&
      a?.status === 'authorized' &&
      this.temAcessoAgora()
    );
  }

  private temAcessoAgora(): boolean {
    const a = this.assinatura();
    if (!a) return false;
    const futuro = !a.proxima_cobranca || new Date(a.proxima_cobranca).getTime() > Date.now();
    if (a.status === 'authorized') return futuro;
    return this.emCarencia();
  }

  acessoAtivo(): boolean {
    return this.temAcessoAgora();
  }

  /** Acesso de pagamento único (payment avulso no MP) ainda válido. */
  acessoUnicoAtivo(): boolean {
    const a = this.assinatura();
    return !!a?.mp_payment_id && a.status === 'authorized' && this.temAcessoAgora();
  }

  private acessoUnicoExpirado(): boolean {
    const a = this.assinatura();
    return (
      !this.recorrente() &&
      a?.status === 'authorized' &&
      !!a?.proxima_cobranca &&
      new Date(a.proxima_cobranca).getTime() <= Date.now()
    );
  }

  statusTexto(): string {
    if (this.acessoUnicoExpirado()) return 'Expirada';
    return this.statusLabel(this.assinatura()!.status);
  }

  rotuloData(): string {
    if (this.mostrarValorProxima()) return 'Próxima cobrança';
    return 'Acesso até';
  }

  mostrarValorProxima(): boolean {
    // "Próxima cobrança" só faz sentido com um preapproval real no MP;
    // acessos manuais/cortesia mostram "Acesso até" sem valor.
    return (
      this.gerenciavelNoMp() &&
      this.assinatura()?.status === 'authorized' &&
      !this.emCarencia()
    );
  }

  data(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR');
  }

  valor(p: Pagamento): string {
    if (p.valor_centavos == null) return '—';
    return (p.valor_centavos / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: p.moeda || 'BRL',
    });
  }

  verPlanos(): void {
    this.router.navigate(['/planos']);
  }

  abrirConfirmacao(): void {
    this.erro.set(null);
    this.mostrarConfirm.set(true);
  }

  abrirTrocarCartao(): void {
    this.erro.set(null);
    this.mostrarTrocarCartao.set(true);
  }

  aoTrocarCartao(): void {
    this.mostrarTrocarCartao.set(false);
  }

  mensagemCancelamento(): string {
    const ate = this.data(this.assinatura()?.proxima_cobranca ?? null);
    return (
      `Você continuará com acesso até ${ate} e não haverá nova cobrança. ` +
      `Após essa data, perderá o acesso aos simulados. Você pode assinar de novo quando quiser.`
    );
  }

  async confirmarCancelamento(): Promise<void> {
    this.mostrarConfirm.set(false);
    await this.cancelar();
  }

  async cancelar(): Promise<void> {
    this.erro.set(null);
    this.processando.set(true);
    const res = await this.subscription.cancelar();
    if (!res.ok) this.erro.set(res.error);
    this.processando.set(false);
  }

  async reativar(): Promise<void> {
    this.erro.set(null);
    this.processando.set(true);
    const res = await this.subscription.reativar();
    if (!res.ok) this.erro.set(res.error);
    this.processando.set(false);
  }
}
