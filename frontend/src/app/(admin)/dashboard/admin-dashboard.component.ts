import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartData, ChartOptions } from 'chart.js';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileText,
  TrendingUp,
  Users,
} from 'lucide-angular';
import type { LucideIconData } from 'lucide-angular';
import { AdminService, AdminStats } from '../../core/services/admin.service';
import { NotificationService } from '../../core/services/notification.service';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';

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
  protected readonly isLoading = signal(true);
  protected readonly activityIcon = Activity;
  protected readonly checkIcon = CheckCircle2;

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

  async ngOnInit(): Promise<void> {
    const result = await this.adminService.getStats();
    if (result.ok) {
      this.stats.set(result.data);
    } else {
      this.toast.error('Erro ao carregar estatísticas.');
    }
    this.isLoading.set(false);
  }

  protected formatNumber(value: number): string {
    return this.numberFormatter.format(value);
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
