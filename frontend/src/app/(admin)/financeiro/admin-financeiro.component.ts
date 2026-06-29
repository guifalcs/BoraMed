import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminService, AdminFinanceiro, AdminPagamento } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';

const STATUS_PT: Record<string, string> = {
  approved: 'Aprovado',
  pending: 'Pendente',
  authorized: 'Autorizado',
  in_process: 'Processando',
  rejected: 'Recusado',
  refunded: 'Reembolsado',
  cancelled: 'Cancelado',
  charged_back: 'Estornado',
};

interface FinKpi {
  label: string;
  value: string;
  sub: string;
}

@Component({
  selector: 'app-admin-financeiro',
  standalone: true,
  imports: [CommonModule],
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
            <table class="w-full min-w-[640px] text-sm">
              <thead class="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th class="px-4 py-3 font-medium">Data</th>
                  <th class="px-4 py-3 font-medium">Usuário</th>
                  <th class="px-4 py-3 font-medium">Plano</th>
                  <th class="px-4 py-3 font-medium">Bruto</th>
                  <th class="px-4 py-3 font-medium">Líquido</th>
                  <th class="px-4 py-3 font-medium">Método</th>
                  <th class="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (p of pagamentos(); track p.id) {
                  <tr>
                    <td class="px-4 py-3 text-gray-600">{{ data(p.processado_em ?? p.criado_em) }}</td>
                    <td class="px-4 py-3 text-gray-900">{{ p.user_email ?? '—' }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ p.plano_nome ?? '—' }}</td>
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
  readonly isLoading = signal(true);

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
    const [fin, pags] = await Promise.all([
      this.admin.getFinanceiro(),
      this.admin.listarPagamentos(100),
    ]);
    if (fin.ok) this.fin.set(fin.data);
    else this.toast.error('Erro ao carregar dados financeiros.');
    if (pags.ok) this.pagamentos.set(pags.data);
    this.isLoading.set(false);
  }

  statusPt(status: string): string {
    return STATUS_PT[status] ?? status;
  }

  data(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR');
  }

  valor(centavos: number | null, moeda: string): string {
    if (centavos == null) return '—';
    return this.brl(centavos, moeda);
  }

  private brl(centavos: number, moeda = 'BRL'): string {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: moeda || 'BRL' });
  }
}
