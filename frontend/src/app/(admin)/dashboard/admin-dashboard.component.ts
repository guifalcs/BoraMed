import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import type { ChartData, ChartOptions } from 'chart.js';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-angular';
import type { LucideIconData } from 'lucide-angular';
import {
  AdminService,
  AdminDistribuicaoUnidade,
  AdminFinanceiro,
  AdminStats,
  AdminUsoPlataforma,
  AdminUsoUsuariosDia,
} from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { FACULDADE_UNIDADE_LABELS } from '../../core/models/faculdade-unidade';

interface AdminKpi {
  label: string;
  value: number;
  sub: string;
  icon: LucideIconData;
  tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan';
}

interface AdminInsight {
  label: string;
  value: string;
  detail: string;
  progress: number;
  tone: 'emerald' | 'amber' | 'rose' | 'cyan';
}

interface AdminPriority {
  title: string;
  description: string;
  icon: LucideIconData;
  tone: 'emerald' | 'amber' | 'rose' | 'cyan';
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [BaseChartDirective, NgClass, UiIconComponent],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css',
  providers: [provideCharts(withDefaultRegisterables())],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly toast = inject(NotificationService);
  private readonly numberFormatter = new Intl.NumberFormat('pt-BR');
  private readonly decimalFormatter = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
  });

  protected readonly stats = signal<AdminStats | null>(null);
  protected readonly fin = signal<AdminFinanceiro | null>(null);
  protected readonly uso = signal<AdminUsoPlataforma | null>(null);
  protected readonly distribuicaoUnidades = signal<AdminDistribuicaoUnidade[] | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly diaSelecionado = signal<string | null>(null);
  protected readonly usuariosDia = signal<AdminUsoUsuariosDia | null>(null);
  protected readonly usuariosDiaLoading = signal(false);
  protected readonly activityIcon = Activity;
  protected readonly checkIcon = CheckCircle2;

  protected readonly financeiroKpis = computed(() => {
    const f = this.fin();
    if (!f) return [] as { label: string; value: string; sub: string; icon: LucideIconData; tone: AdminKpi['tone'] }[];
    return [
      { label: 'Receita no mês', value: this.brl(f.receita_mes_centavos), sub: `${this.formatNumber(f.pagamentos_aprovados)} aprovados`, icon: DollarSign, tone: 'emerald' as const },
      { label: 'MRR', value: this.brl(f.mrr_centavos), sub: 'recorrente mensal', icon: Wallet, tone: 'blue' as const },
      { label: 'Previsão 30 dias', value: this.brl(f.previsao_30d_centavos), sub: 'renovações previstas', icon: CalendarClock, tone: 'violet' as const },
      { label: 'Assinaturas ativas', value: this.formatNumber(f.assinaturas_ativas), sub: `+${this.formatNumber(f.novas_no_mes)} no mês`, icon: CreditCard, tone: 'cyan' as const },
    ];
  });

  protected readonly kpis = computed<AdminKpi[]>(() => {
    const s = this.stats();
    if (!s) return [];

    return [
      {
        label: 'Usuários',
        value: s.total_usuarios,
        sub: `+${this.formatNumber(s.usuarios_hoje)} hoje`,
        icon: Users,
        tone: 'blue',
      },
      {
        label: 'Questões',
        value: s.total_questoes,
        sub: `${this.formatNumber(s.questoes_ativas)} ativas`,
        icon: FileText,
        tone: 'emerald',
      },
      {
        label: 'Rascunhos',
        value: s.questoes_rascunho,
        sub: 'aguardando revisão',
        icon: ClipboardList,
        tone: 'amber',
      },
      {
        label: 'Provas',
        value: s.total_provas,
        sub: `${this.formatNumber(s.total_temas)} temas`,
        icon: BookOpen,
        tone: 'violet',
      },
      {
        label: 'Tentativas',
        value: s.total_tentativas,
        sub: `+${this.formatNumber(s.tentativas_hoje)} hoje`,
        icon: Activity,
        tone: 'cyan',
      },
    ];
  });

  protected readonly questionStatusData = computed<ChartData<'doughnut'>>(() => {
    const s = this.stats();
    const total = s?.total_questoes ?? 0;
    const ativas = s?.questoes_ativas ?? 0;
    const rascunho = s?.questoes_rascunho ?? 0;
    const outras = Math.max(total - ativas - rascunho, 0);

    if (total === 0) {
      return {
        labels: ['Sem questões'],
        datasets: [
          {
            data: [1],
            backgroundColor: ['#475569'],
            borderColor: '#ffffff',
            borderWidth: 2,
          },
        ],
      };
    }

    return {
      labels: ['Ativas', 'Rascunhos', 'Outras'],
      datasets: [
        {
          data: [ativas, rascunho, outras],
          backgroundColor: ['#10b981', '#f59e0b', '#64748b'],
          borderColor: '#ffffff',
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    };
  });

  protected readonly platformVolumeData = computed<ChartData<'bar'>>(() => {
    const s = this.stats();

    return {
      labels: ['Usuários', 'Questões', 'Provas', 'Temas', 'Tentativas'],
      datasets: [
        {
          label: 'Total',
          data: [
            s?.total_usuarios ?? 0,
            s?.total_questoes ?? 0,
            s?.total_provas ?? 0,
            s?.total_temas ?? 0,
            s?.total_tentativas ?? 0,
          ],
          backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6', '#06b6d4', '#f97316'],
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 42,
        },
      ],
    };
  });

  protected readonly todayActivityData = computed<ChartData<'bar'>>(() => {
    const s = this.stats();

    return {
      labels: ['Usuários', 'Tentativas'],
      datasets: [
        {
          label: 'Hoje',
          data: [s?.usuarios_hoje ?? 0, s?.tentativas_hoje ?? 0],
          backgroundColor: ['#38bdf8', '#fb7185'],
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 34,
        },
      ],
    };
  });

  private readonly maxCidadesNoGrafico = 8;

  /** Quantos usuários não têm cidade/unidade cadastrada (fora da base do gráfico). */
  protected readonly semCidadeTotal = computed(() => {
    const linhas = this.distribuicaoUnidades() ?? [];
    return linhas.find((l) => l.faculdade_unidade === null)?.total ?? 0;
  });

  /**
   * Top N cidades por total, com o restante agregado em "Outras". A base do
   * percentual é só quem tem cidade cadastrada — quem não informou não é uma
   * sede e entraria como um bloco dominante, mascarando a distribuição real.
   */
  protected readonly distribuicaoUnidadeItens = computed(() => {
    const linhas = (this.distribuicaoUnidades() ?? []).filter((l) => l.faculdade_unidade !== null);
    const total = linhas.reduce((acc, l) => acc + l.total, 0);
    if (total === 0) return [] as { label: string; total: number; percent: number }[];

    const rotulo = (u: AdminDistribuicaoUnidade['faculdade_unidade']) =>
      u ? (FACULDADE_UNIDADE_LABELS[u] ?? u) : '';

    const ordenadas = [...linhas].sort((a, b) => b.total - a.total);
    const principais = ordenadas.slice(0, this.maxCidadesNoGrafico);
    const restante = ordenadas.slice(this.maxCidadesNoGrafico);

    const itens = principais.map((l) => ({
      label: rotulo(l.faculdade_unidade),
      total: l.total,
      percent: Math.round((l.total / total) * 1000) / 10,
    }));

    const totalRestante = restante.reduce((acc, l) => acc + l.total, 0);
    if (totalRestante > 0) {
      itens.push({
        label: 'Outras',
        total: totalRestante,
        percent: Math.round((totalRestante / total) * 1000) / 10,
      });
    }

    return itens;
  });

  protected readonly distribuicaoUnidadeData = computed<ChartData<'bar'>>(() => {
    const itens = this.distribuicaoUnidadeItens();
    return {
      labels: itens.map((i) => i.label),
      datasets: [
        {
          label: 'Usuários',
          data: itens.map((i) => i.percent),
          backgroundColor: '#3b82f6',
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 20,
        },
      ],
    };
  });

  protected readonly distribuicaoUnidadeOptions: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#020617',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx) => `${this.decimalFormatter.format(Number(ctx.parsed.x))}%`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 100,
        ticks: { color: '#64748b', font: { size: 11 }, callback: (v) => `${v}%` },
        grid: { color: 'rgba(148, 163, 184, 0.22)' },
        border: { display: false },
      },
      y: {
        ticks: { color: '#64748b', font: { size: 11 } },
        grid: { display: false },
        border: { display: false },
      },
    },
  };

  protected readonly usoDiarioData = computed<ChartData<'bar'>>(() => {
    const pontos = this.uso()?.por_dia ?? [];
    const data = {
      labels: pontos.map((p) => this.formatDiaCurto(p.dia)),
      datasets: [
        {
          type: 'bar',
          label: 'Interações',
          data: pontos.map((p) => p.interacoes),
          backgroundColor: '#6366f1',
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 26,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line',
          label: 'Usuários ativos',
          data: pontos.map((p) => p.usuarios_ativos),
          borderColor: '#f97316',
          backgroundColor: '#f97316',
          pointBackgroundColor: '#f97316',
          pointRadius: 3,
          tension: 0.35,
          borderWidth: 2,
          yAxisID: 'y1',
          order: 1,
        },
      ],
    };
    // Gráfico combinado (barra + linha): o tipo estrito de 'bar' não abrange
    // datasets 'line', então convertemos o objeto montado.
    return data as unknown as ChartData<'bar'>;
  });

  protected readonly usoHorarioData = computed<ChartData<'bar'>>(() => {
    const pontos = this.uso()?.por_hora ?? [];
    const data = {
      labels: pontos.map((p) => `${p.hora}h`),
      datasets: [
        {
          type: 'bar',
          label: 'Interações',
          data: pontos.map((p) => p.interacoes),
          backgroundColor: '#06b6d4',
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 18,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line',
          label: 'Usuários ativos',
          data: pontos.map((p) => p.usuarios_ativos),
          borderColor: '#f97316',
          backgroundColor: '#f97316',
          pointBackgroundColor: '#f97316',
          pointRadius: 2,
          tension: 0.35,
          borderWidth: 2,
          yAxisID: 'y1',
          order: 1,
        },
      ],
    };
    return data as unknown as ChartData<'bar'>;
  });

  protected readonly picoHorario = computed(() => {
    const pontos = this.uso()?.por_hora ?? [];
    const pico = pontos.reduce<{ hora: number; interacoes: number } | null>(
      (max, p) => (!max || p.interacoes > max.interacoes ? { hora: p.hora, interacoes: p.interacoes } : max),
      null,
    );
    return pico && pico.interacoes > 0 ? pico : null;
  });

  protected readonly picoDia = computed(() => {
    const pontos = this.uso()?.por_dia ?? [];
    const pico = pontos.reduce<{ dia: string; interacoes: number } | null>(
      (max, p) => (!max || p.interacoes > max.interacoes ? { dia: p.dia, interacoes: p.interacoes } : max),
      null,
    );
    return pico && pico.interacoes > 0 ? pico : null;
  });

  protected readonly usoComboOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: { color: '#94a3b8', boxWidth: 12, boxHeight: 12, font: { size: 11 }, usePointStyle: true },
      },
      tooltip: {
        backgroundColor: '#020617',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${this.formatNumber(Number(ctx.parsed.y))}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 0, autoSkipPadding: 8 },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        position: 'left',
        title: { display: true, text: 'Interações', color: '#64748b', font: { size: 10 } },
        ticks: { precision: 0, color: '#64748b', font: { size: 10 }, callback: (v) => this.formatNumber(Number(v)) },
        grid: { color: 'rgba(148, 163, 184, 0.18)' },
        border: { display: false },
      },
      y1: {
        beginAtZero: true,
        position: 'right',
        title: { display: true, text: 'Usuários', color: '#64748b', font: { size: 10 } },
        ticks: { precision: 0, color: '#64748b', font: { size: 10 }, callback: (v) => this.formatNumber(Number(v)) },
        grid: { display: false },
        border: { display: false },
      },
    },
  };

  protected readonly insights = computed<AdminInsight[]>(() => {
    const s = this.stats();
    if (!s) return [];

    const questoesAtivas = this.percent(s.questoes_ativas, s.total_questoes);
    const rascunhos = this.percent(s.questoes_rascunho, s.total_questoes);
    const tentativasPorUsuario = this.ratio(s.total_tentativas, s.total_usuarios);
    const questoesPorProva = this.ratio(s.total_questoes, s.total_provas);

    return [
      {
        label: 'Banco publicado',
        value: `${questoesAtivas}%`,
        detail: `${this.formatNumber(s.questoes_ativas)} de ${this.formatNumber(s.total_questoes)} questões ativas`,
        progress: questoesAtivas,
        tone: 'emerald',
      },
      {
        label: 'Fila editorial',
        value: `${rascunhos}%`,
        detail: `${this.formatNumber(s.questoes_rascunho)} rascunhos pendentes`,
        progress: rascunhos,
        tone: rascunhos > 25 ? 'rose' : 'amber',
      },
      {
        label: 'Tentativas por usuário',
        value: this.formatDecimal(tentativasPorUsuario),
        detail: `${this.formatNumber(s.total_tentativas)} tentativas no histórico`,
        progress: Math.min(Math.round(tentativasPorUsuario * 20), 100),
        tone: 'cyan',
      },
      {
        label: 'Questões por prova',
        value: this.formatDecimal(questoesPorProva),
        detail: `${this.formatNumber(s.total_provas)} provas cadastradas`,
        progress: Math.min(Math.round(questoesPorProva * 4), 100),
        tone: 'amber',
      },
    ];
  });

  protected readonly priorities = computed<AdminPriority[]>(() => {
    const s = this.stats();
    if (!s) return [];

    const priorities: AdminPriority[] = [];
    const rascunhoPercent = this.percent(s.questoes_rascunho, s.total_questoes);

    if (s.questoes_rascunho > 0) {
      priorities.push({
        title: 'Revisar rascunhos',
        description: `${this.formatNumber(s.questoes_rascunho)} questões ainda não estão publicadas.`,
        icon: AlertTriangle,
        tone: rascunhoPercent > 25 ? 'rose' : 'amber',
      });
    }

    if (s.tentativas_hoje > 0) {
      priorities.push({
        title: 'Uso ativo hoje',
        description: `${this.formatNumber(s.tentativas_hoje)} tentativas registradas no dia.`,
        icon: TrendingUp,
        tone: 'cyan',
      });
    }

    if (s.questoes_ativas > 0) {
      priorities.push({
        title: 'Banco disponível',
        description: `${this.formatNumber(s.questoes_ativas)} questões ativas para simulados.`,
        icon: CheckCircle2,
        tone: 'emerald',
      });
    }

    return priorities.slice(0, 3);
  });

  protected readonly doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#020617',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx) => `${ctx.label}: ${this.formatNumber(ctx.parsed)}`,
        },
      },
    },
  };

  protected readonly barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#020617',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${this.formatNumber(Number(ctx.parsed.y))}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#64748b', font: { size: 11 } },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
          color: '#64748b',
          font: { size: 11 },
          callback: (value) => this.formatNumber(Number(value)),
        },
        grid: { color: 'rgba(148, 163, 184, 0.22)' },
        border: { display: false },
      },
    },
  };

  /**
   * Drill-down do gráfico de pico de uso: clique numa barra/dia carrega
   * quem interagiu naquele dia.
   */
  protected async onUsoDiaClick(event: { active?: object[] }): Promise<void> {
    const ativo = (event.active ?? [])[0] as { index?: number } | undefined;
    if (!ativo || typeof ativo.index !== 'number') return;
    const ponto = (this.uso()?.por_dia ?? [])[ativo.index];
    if (!ponto) return;
    await this.selecionarDia(ponto.dia);
  }

  protected async selecionarDia(dia: string): Promise<void> {
    if (this.diaSelecionado() === dia) {
      this.fecharUsuariosDia();
      return;
    }
    this.diaSelecionado.set(dia);
    this.usuariosDia.set(null);
    this.usuariosDiaLoading.set(true);
    const res = await this.adminService.getUsoUsuariosDia(dia);
    this.usuariosDiaLoading.set(false);
    if (!res.ok) {
      this.toast.error('Erro ao carregar os usuários do dia.');
      this.diaSelecionado.set(null);
      return;
    }
    // Ignora resposta de um dia que já não é o selecionado (cliques rápidos).
    if (this.diaSelecionado() === dia) this.usuariosDia.set(res.data);
  }

  protected fecharUsuariosDia(): void {
    this.diaSelecionado.set(null);
    this.usuariosDia.set(null);
    this.usuariosDiaLoading.set(false);
  }

  /** 'YYYY-MM-DD' -> '17/08/2026' sem depender de fuso. */
  protected formatDiaLongo(dia: string): string {
    const [ano, mes, dataDia] = dia.split('-');
    return `${dataDia}/${mes}/${ano}`;
  }

  protected formatHora(iso: string): string {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  }

  async ngOnInit(): Promise<void> {
    const [result, fin, uso, distribuicao] = await Promise.all([
      this.adminService.getStats(),
      this.adminService.getFinanceiro(),
      this.adminService.getUsoPlataforma(),
      this.adminService.getDistribuicaoUnidades(),
    ]);
    if (result.ok) {
      this.stats.set(result.data);
    } else {
      this.toast.error('Erro ao carregar estatísticas.');
    }
    if (fin.ok) this.fin.set(fin.data);
    if (uso.ok) this.uso.set(uso.data);
    if (distribuicao.ok) this.distribuicaoUnidades.set(distribuicao.data);
    this.isLoading.set(false);
  }

  protected formatNumber(value: number): string {
    return this.numberFormatter.format(value);
  }

  /** 'YYYY-MM-DD' -> 'dd/MM' sem depender de fuso (parse manual). */
  protected formatDiaCurto(dia: string): string {
    const [, mes, dataDia] = dia.split('-');
    return `${dataDia}/${mes}`;
  }

  protected brl(centavos: number): string {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private percent(part: number, total: number): number {
    if (total <= 0) return 0;
    return Math.round((part / total) * 100);
  }

  private ratio(part: number, total: number): number {
    if (total <= 0) return 0;
    return part / total;
  }

  private formatDecimal(value: number): string {
    return this.decimalFormatter.format(value);
  }
}
