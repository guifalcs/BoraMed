import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  AdminService,
  AdminFinanceiro,
  AdminPagamento,
  AdminMetricasIa,
  AdminIaJanela,
  AdminResultadoFinanceiro,
} from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { formatarCentavos, pagamentoStatusLabel } from '../../shared/utils/admin-labels.util';
import { AdminPaginationComponent } from '../../shared/components/admin-pagination/admin-pagination.component';

const PAGE_SIZE = 20;

type JanelaIaKey = 'hoje' | 'd7' | 'd30' | 'total';
const JANELAS_IA: { key: JanelaIaKey; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'd7', label: '7 dias' },
  { key: 'd30', label: '30 dias' },
  { key: 'total', label: 'Total' },
];

interface FinKpi {
  label: string;
  value: string;
  sub: string;
}

@Component({
  selector: 'app-admin-financeiro',
  standalone: true,
  imports: [CommonModule, RouterLink, AdminPaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-6xl px-4 py-6">
      <header class="mb-6">
        <h1 class="text-2xl font-bold text-gray-900">Financeiro</h1>
        <p class="text-sm text-gray-500">Receita, assinaturas e previsões.</p>
      </header>

      @if (isLoading()) {
        <p class="py-16 text-center text-gray-500">Carregando…</p>
      } @else if (fin()) {
        <!-- KPIs -->
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          @for (k of kpis(); track k.label) {
            <div class="rounded-xl border border-gray-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-gray-500">{{ k.label }}</p>
              <p class="mt-2 text-2xl font-bold text-gray-900">{{ k.value }}</p>
              <p class="mt-1 text-xs text-gray-500">{{ k.sub }}</p>
            </div>
          }
        </div>

        <!-- Resultado: receita líquida × despesas lançadas -->
        <div class="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-gray-900">Resultado</h2>
            <p class="text-xs text-gray-500">Receita líquida menos as despesas lançadas em Despesas.</p>
          </div>
          <a
            routerLink="/admin/financeiro/despesas"
            class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >Lançar despesa</a
          >
        </div>
        @if (resultado(); as r) {
          <div class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-xl border border-gray-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Despesas no mês</p>
              <p class="mt-2 text-2xl font-bold text-red-600">{{ valor(r.despesas_mes_centavos, 'BRL') }}</p>
              <p class="mt-1 text-xs text-gray-500">{{ valor(r.fixo_mensal_centavos, 'BRL') }} em custo fixo</p>
            </div>
            <div class="rounded-xl border border-gray-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Lucro no mês</p>
              <p
                class="mt-2 text-2xl font-bold"
                [ngClass]="r.lucro_mes_centavos >= 0 ? 'text-green-600' : 'text-red-600'"
              >{{ valor(r.lucro_mes_centavos, 'BRL') }}</p>
              <p class="mt-1 text-xs text-gray-500">líquido menos despesas</p>
            </div>
            <div class="rounded-xl border border-gray-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Despesas totais</p>
              <p class="mt-2 text-2xl font-bold text-gray-900">{{ valor(r.despesas_total_centavos, 'BRL') }}</p>
              <p class="mt-1 text-xs text-gray-500">{{ r.lancamentos }} lançamentos</p>
            </div>
            <div class="rounded-xl border border-gray-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Lucro acumulado</p>
              <p
                class="mt-2 text-2xl font-bold"
                [ngClass]="r.lucro_total_centavos >= 0 ? 'text-green-600' : 'text-red-600'"
              >{{ valor(r.lucro_total_centavos, 'BRL') }}</p>
              <p class="mt-1 text-xs text-gray-500">desde o início</p>
            </div>
          </div>
        }

        <!-- Por plano -->
        @if (fin()!.por_plano.length > 0) {
          <h2 class="mt-8 text-lg font-semibold text-gray-900">Assinaturas ativas por plano</h2>
          <div class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            @for (p of fin()!.por_plano; track p.slug) {
              <div class="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4">
                <span class="font-medium text-gray-900">{{ p.nome }}</span>
                <span class="text-xl font-bold text-blue-600">{{ p.ativas }}</span>
              </div>
            }
          </div>
        }

        <!-- Pagamentos -->
        <h2 class="mt-8 text-lg font-semibold text-gray-900">Pagamentos recentes</h2>
        @if (pagamentos().length === 0) {
          <p class="mt-3 rounded-xl border border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-500">
            Nenhum pagamento registrado ainda.
          </p>
        } @else {
          <div class="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table class="w-full min-w-[760px] text-sm">
              <thead class="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th class="px-4 py-3 font-medium">Data</th>
                  <th class="px-4 py-3 font-medium">Usuário</th>
                  <th class="px-4 py-3 font-medium">Plano</th>
                  <th class="px-4 py-3 font-medium">Cupom</th>
                  <th class="px-4 py-3 font-medium">Bruto</th>
                  <th class="px-4 py-3 font-medium">Líquido</th>
                  <th class="px-4 py-3 font-medium">Método</th>
                  <th class="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (p of pagamentosPagina(); track p.id) {
                  <tr>
                    <td class="px-4 py-3 text-gray-600">{{ data(p.processado_em ?? p.criado_em) }}</td>
                    <td class="px-4 py-3 text-gray-900">{{ p.user_email ?? '—' }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ p.plano_nome ?? '—' }}</td>
                    <td class="px-4 py-3">
                      @if (p.cupom_codigo) {
                        <span
                          class="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700"
                          [title]="p.desconto_centavos > 0
                            ? 'Desconto de ' + valor(p.desconto_centavos, p.moeda)
                            : 'Cupom aplicado'"
                        >{{ p.cupom_codigo }}</span>
                        @if (p.desconto_centavos > 0) {
                          <span class="ml-2 text-xs text-gray-500">−{{ valor(p.desconto_centavos, p.moeda) }}</span>
                        }
                      } @else {
                        <span class="text-gray-400">—</span>
                      }
                    </td>
                    <td class="px-4 py-3 font-medium text-gray-900">{{ valor(p.valor_centavos, p.moeda) }}</td>
                    <td class="px-4 py-3 text-gray-700">{{ valor(p.liquido_centavos, p.moeda) }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ p.metodo_pagamento ?? '—' }}</td>
                    <td class="px-4 py-3">
                      <span
                        class="rounded-full px-2.5 py-1 text-xs font-semibold"
                        [ngClass]="p.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : p.status === 'rejected'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-600'"
                      >
                        {{ statusPt(p.status) }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-admin-pagination
            [page]="paginaPagamentos()"
            [totalItems]="pagamentos().length"
            [pageSize]="PAGE_SIZE"
            (pageChange)="mudarPaginaPagamentos($event)"
          />
        }

        <!-- Gasto com IA (Aurora) -->
        <div class="mt-10 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
              style="background: var(--gradient-brand)"
              aria-hidden="true"
            >✦</span>
            <div>
              <h2 class="text-lg font-semibold text-gray-900">Gasto com IA (Aurora)</h2>
              <p class="text-xs text-gray-500">Correção de questões discursivas · custo em US$ (OpenRouter)</p>
            </div>
          </div>
          @if (ia()) {
            <div class="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
              @for (j of janelasIa; track j.key) {
                <button
                  type="button"
                  class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                  [ngClass]="janelaSel() === j.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'"
                  (click)="janelaSel.set(j.key)"
                >{{ j.label }}</button>
              }
            </div>
          }
        </div>

        @if (ia()) {
          <div class="mt-3 grid gap-4 sm:grid-cols-3">
            <div class="rounded-xl border border-gray-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Custo</p>
              <p class="mt-2 text-2xl font-bold text-gray-900">{{ usd(janelaIa().custo_usd) }}</p>
              <p class="mt-1 text-xs text-gray-500">na janela selecionada</p>
            </div>
            <div class="rounded-xl border border-gray-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Correções</p>
              <p class="mt-2 text-2xl font-bold text-gray-900">{{ num(janelaIa().correcoes) }}</p>
              <p class="mt-1 text-xs text-gray-500">respostas corrigidas</p>
            </div>
            <div class="rounded-xl border border-gray-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Tokens</p>
              <p class="mt-2 text-2xl font-bold text-gray-900">{{ num(janelaIa().tokens_total) }}</p>
              <p class="mt-1 text-xs text-gray-500">
                {{ num(janelaIa().tokens_prompt) }} entrada · {{ num(janelaIa().tokens_resposta) }} saída
              </p>
            </div>
          </div>

          <!-- Série diária (volume por dia, últimos 30d) -->
          <div class="mt-4 rounded-xl border border-gray-200 bg-white p-5">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-sm font-semibold text-gray-900">Uso diário (últimos 30 dias)</h3>
              <span class="text-xs text-gray-500">barra = tokens · passe o mouse para detalhes</span>
            </div>
            @if (maxTokensSerie() === 0) {
              <p class="py-6 text-center text-sm text-gray-500">Nenhuma correção no período.</p>
            } @else {
              <div class="flex h-24 items-end gap-0.5">
                @for (d of ia()!.serie_diaria; track d.dia) {
                  <div
                    class="flex-1 rounded-t bg-blue-500/80 transition-colors hover:bg-blue-600"
                    [style.height.%]="barra(d.tokens_total)"
                    [style.minHeight.px]="d.correcoes > 0 ? 2 : 0"
                    [title]="d.dia + ' — ' + num(d.correcoes) + ' correções · ' + num(d.tokens_total) + ' tokens · ' + usd(d.custo_usd)"
                  ></div>
                }
              </div>
            }
          </div>

          <!-- Por modelo + falhas -->
          <div class="mt-4 grid gap-4 lg:grid-cols-2">
            <div class="rounded-xl border border-gray-200 bg-white p-5">
              <h3 class="mb-3 text-sm font-semibold text-gray-900">Por modelo (total)</h3>
              @if (ia()!.por_modelo.length === 0) {
                <p class="text-sm text-gray-500">Sem dados ainda.</p>
              } @else {
                <ul class="flex flex-col gap-2">
                  @for (m of ia()!.por_modelo; track m.modelo) {
                    <li class="flex items-center justify-between gap-3 text-sm">
                      <span class="truncate font-medium text-gray-900">{{ m.modelo }}</span>
                      <span class="shrink-0 text-gray-500">
                        {{ num(m.correcoes) }} corr · {{ num(m.tokens_total) }} tok · <span class="font-semibold text-gray-900">{{ usd(m.custo_usd) }}</span>
                      </span>
                    </li>
                  }
                </ul>
              }
            </div>
            <div class="rounded-xl border border-gray-200 bg-white p-5">
              <h3 class="mb-3 text-sm font-semibold text-gray-900">Falhas de correção (total)</h3>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <p class="text-2xl font-bold text-amber-600">{{ num(ia()!.falhas.erro) }}</p>
                  <p class="text-xs text-gray-500">com erro (esgotou retries)</p>
                </div>
                <div>
                  <p class="text-2xl font-bold text-gray-400">{{ num(ia()!.falhas.sem_ia) }}</p>
                  <p class="text-xs text-gray-500">sem IA (fora da nota)</p>
                </div>
              </div>
            </div>
          </div>
        }
      } @else {
        <p class="py-16 text-center text-red-600">Não foi possível carregar os dados financeiros.</p>
      }
    </div>
  `,
})
export class AdminFinanceiroComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(NotificationService);

  readonly fin = signal<AdminFinanceiro | null>(null);
  readonly pagamentos = signal<AdminPagamento[]>([]);
  readonly paginaPagamentos = signal(0);
  readonly pagamentosPagina = computed(() => {
    const inicio = this.paginaPagamentos() * PAGE_SIZE;
    return this.pagamentos().slice(inicio, inicio + PAGE_SIZE);
  });
  readonly PAGE_SIZE = PAGE_SIZE;
  readonly ia = signal<AdminMetricasIa | null>(null);
  readonly resultado = signal<AdminResultadoFinanceiro | null>(null);
  readonly janelaSel = signal<JanelaIaKey>('d30');
  readonly isLoading = signal(true);

  readonly janelasIa = JANELAS_IA;

  readonly janelaIa = computed<AdminIaJanela>(() => {
    const m = this.ia();
    const vazia: AdminIaJanela = {
      correcoes: 0,
      tokens_prompt: 0,
      tokens_resposta: 0,
      tokens_total: 0,
      custo_usd: 0,
    };
    return m ? m.janelas[this.janelaSel()] : vazia;
  });

  readonly maxTokensSerie = computed(() => {
    const s = this.ia()?.serie_diaria ?? [];
    return s.reduce((max, d) => Math.max(max, d.tokens_total), 0);
  });

  readonly kpis = computed<FinKpi[]>(() => {
    const f = this.fin();
    if (!f) return [];
    return [
      { label: 'Receita no mês (bruto)', value: this.brl(f.receita_mes_centavos), sub: `${f.pagamentos_aprovados} pagamentos aprovados` },
      { label: 'Líquido no mês', value: this.brl(f.receita_liquida_mes_centavos), sub: 'após taxas do Mercado Pago' },
      { label: 'MRR', value: this.brl(f.mrr_centavos), sub: 'receita recorrente mensal' },
      { label: 'Previsão 30 dias', value: this.brl(f.previsao_30d_centavos), sub: 'renovações previstas' },
      { label: 'Receita total (bruto)', value: this.brl(f.receita_total_centavos), sub: 'desde o início' },
      { label: 'Líquido total', value: this.brl(f.receita_liquida_total_centavos), sub: 'já descontadas as taxas' },
      { label: 'Assinaturas ativas', value: String(f.assinaturas_ativas), sub: `${f.novas_no_mes} novas no mês (pagantes)` },
      { label: 'Acessos cortesia', value: String(f.cortesias_ativas), sub: 'grátis — fora do financeiro' },
      { label: 'Cancelamentos no mês', value: String(f.cancelamentos_no_mes), sub: `${f.assinaturas_canceladas} canceladas no total` },
      { label: 'Pagamentos recusados', value: String(f.pagamentos_recusados), sub: 'no histórico' },
    ];
  });

  async ngOnInit(): Promise<void> {
    const [fin, pags, ia, resultado] = await Promise.all([
      this.admin.getFinanceiro(),
      this.admin.listarPagamentos(100),
      this.admin.getMetricasIa(),
      this.admin.getResultadoFinanceiro(),
    ]);
    if (fin.ok) this.fin.set(fin.data);
    else this.toast.error('Erro ao carregar dados financeiros.');
    if (pags.ok) {
      this.pagamentos.set(pags.data);
      this.paginaPagamentos.set(0);
    }
    if (ia.ok) this.ia.set(ia.data);
    if (resultado.ok) this.resultado.set(resultado.data);
    this.isLoading.set(false);
  }

  mudarPaginaPagamentos(pagina: number): void {
    const totalPaginas = Math.max(1, Math.ceil(this.pagamentos().length / PAGE_SIZE));
    this.paginaPagamentos.set(Math.max(0, Math.min(pagina, totalPaginas - 1)));
  }

  /** Altura relativa da barra (0–100) proporcional ao pico de tokens da série. */
  barra(tokens: number): number {
    const max = this.maxTokensSerie();
    return max > 0 ? Math.round((tokens / max) * 100) : 0;
  }

  num(v: number): string {
    return (v ?? 0).toLocaleString('pt-BR');
  }

  /** Custo em US$; usa mais casas para valores muito pequenos (frações de centavo). */
  usd(v: number): string {
    const n = v ?? 0;
    const casas = n > 0 && n < 0.01 ? 6 : 2;
    return n.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    });
  }

  statusPt(status: string): string {
    return pagamentoStatusLabel(status);
  }

  data(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR');
  }

  valor(centavos: number | null, moeda: string): string {
    return formatarCentavos(centavos, moeda);
  }

  private brl(centavos: number, moeda = 'BRL'): string {
    return formatarCentavos(centavos, moeda);
  }
}
