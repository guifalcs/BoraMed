import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Award,
} from 'lucide-angular';
import type { HistoricoKpis, DesempenhoTema, TentativaHistoricoItem } from '../../core/models/historico';
import type { KpiVariante } from '../../shared/components/kpi-card/kpi-card.component';
import type { LucideIconData } from 'lucide-angular';
import type { HistoricoResolvedData } from '../../core/resolvers/historico.resolver';
import type { PontoEvolucao } from '../../shared/components/evolucao-nota-chart/evolucao-nota-chart.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { DesempenhoTemaChartComponent } from '../../shared/components/desempenho-tema-chart/desempenho-tema-chart.component';
import { EvolucaoNotaChartComponent } from '../../shared/components/evolucao-nota-chart/evolucao-nota-chart.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { DataTableComponent, type DataTableColumn } from '../../shared/components/data-table/data-table.component';
import { DataTableColumnDirective } from '../../shared/components/data-table/data-table-column.directive';

type FiltroPeriodo = 'todos' | 'semana' | 'mes' | 'semestre';
type FiltroTipo = 'todos' | 'nacional' | 'processual';

interface KpiData {
  label: string;
  valor: string;
  sublabel: string | null;
  icone: LucideIconData;
  variante: KpiVariante;
}

@Component({
  selector: 'app-historico',
  standalone: true,
  imports: [KpiCardComponent, DesempenhoTemaChartComponent, EvolucaoNotaChartComponent, EmptyStateComponent, DataTableComponent, DataTableColumnDirective],
  templateUrl: './historico.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoricoComponent {
  private readonly router = inject(Router);

  protected readonly isLoadingKpis = signal(true);
  protected readonly isLoadingTemas = signal(true);
  protected readonly isLoadingTentativas = signal(true);

  protected readonly kpis = signal<KpiData[]>([]);
  protected readonly temas = signal<DesempenhoTema[]>([]);
  protected readonly tentativas = signal<TentativaHistoricoItem[]>([]);

  protected readonly filtroPeriodo = signal<FiltroPeriodo>('todos');
  protected readonly filtroTipo = signal<FiltroTipo>('todos');

  protected readonly tentativasFiltradas = computed(() => {
    let items = this.tentativas();
    const tipo = this.filtroTipo();
    if (tipo !== 'todos') {
      items = items.filter((t) => t.tipo_prova === tipo);
    }
    const periodo = this.filtroPeriodo();
    if (periodo !== 'todos') {
      const agora = Date.now();
      const diasMap: Record<string, number> = { semana: 7, mes: 30, semestre: 180 };
      const corte = agora - (diasMap[periodo] ?? 0) * 86_400_000;
      items = items.filter((t) => t.finalizada_em && new Date(t.finalizada_em).getTime() >= corte);
    }
    return items;
  });

  protected readonly pontosEvolucao = computed<PontoEvolucao[]>(() =>
    this.tentativasFiltradas()
      .filter((t): t is TentativaHistoricoItem & { nota: number; finalizada_em: string } => t.nota !== null && t.finalizada_em !== null)
      .map((t) => ({ data: t.finalizada_em, nota: t.nota }))
  );

  protected readonly temFiltroAtivo = computed(() => this.filtroPeriodo() !== 'todos' || this.filtroTipo() !== 'todos');

  protected readonly periodosDisponiveis: { valor: FiltroPeriodo; label: string }[] = [
    { valor: 'todos', label: 'Todos' },
    { valor: 'semana', label: 'Última semana' },
    { valor: 'mes', label: 'Último mês' },
    { valor: 'semestre', label: 'Último semestre' },
  ];

  protected readonly tiposDisponiveis: { valor: FiltroTipo; label: string }[] = [
    { valor: 'todos', label: 'Todos' },
    { valor: 'nacional', label: 'Provas Afya' },
    { valor: 'processual', label: 'Simulados' },
  ];

  protected readonly tentativasColumns: DataTableColumn[] = [
    { key: 'prova_nome', header: 'Prova', sortable: true },
    { key: 'finalizada_em', header: 'Data', sortable: true },
    { key: 'modo', header: 'Modo', sortable: true },
    { key: 'nota', header: 'Nota', sortable: true },
  ];

  constructor() {
    const resolved = inject(ActivatedRoute).snapshot.data['historicoData'] as HistoricoResolvedData | undefined;

    if (resolved?.kpisResult.ok) {
      this.kpis.set(this.buildKpis(resolved.kpisResult.data));
    }
    this.isLoadingKpis.set(false);

    if (resolved?.temasResult.ok) {
      this.temas.set(resolved.temasResult.data);
    }
    this.isLoadingTemas.set(false);

    if (resolved?.tentativasResult.ok) {
      this.tentativas.set(resolved.tentativasResult.data);
    }
    this.isLoadingTentativas.set(false);
  }

  private buildKpis(k: HistoricoKpis): KpiData[] {
    const taxaVariante = (): KpiVariante => {
      if (k.taxa_acerto === null) return 'default';
      if (k.taxa_acerto >= 70) return 'success';
      if (k.taxa_acerto >= 50) return 'warning';
      return 'danger';
    };
    const ultimaVariante = (): KpiVariante => {
      if (k.ultima_nota === null) return 'default';
      if (k.ultima_nota >= 70) return 'success';
      if (k.ultima_nota >= 50) return 'warning';
      return 'danger';
    };

    return [
      {
        label: '% Acerto Geral',
        valor: k.taxa_acerto !== null ? `${k.taxa_acerto}%` : '—',
        sublabel: 'todas as tentativas',
        icone: TrendingUp,
        variante: taxaVariante(),
      },
      {
        label: 'Simulados Concluídos',
        valor: String(k.total_finalizadas),
        sublabel: k.total_finalizadas > 0 ? 'total finalizado' : 'nenhum ainda',
        icone: CheckCircle2,
        variante: k.total_finalizadas > 0 ? 'success' : 'default',
      },
      {
        label: 'Tema Mais Fraco',
        valor: k.taxa_tema_fraco !== null ? `${k.taxa_tema_fraco}%` : '—',
        sublabel: k.tema_mais_fraco ?? 'dados insuficientes',
        icone: AlertTriangle,
        variante: k.tema_mais_fraco ? 'danger' : 'default',
      },
      {
        label: 'Última Nota',
        valor: k.ultima_nota !== null ? `${k.ultima_nota}%` : '—',
        sublabel: k.ultima_nota_data ? this.dataRelativa(k.ultima_nota_data) : null,
        icone: Award,
        variante: ultimaVariante(),
      },
    ];
  }

  private dataRelativa(isoDate: string): string {
    const d = new Date(isoDate);
    const diffDias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (diffDias === 0) return 'hoje';
    if (diffDias === 1) return 'ontem';
    if (diffDias < 7) return `há ${diffDias} dias`;
    const semanas = Math.floor(diffDias / 7);
    if (diffDias < 30) return `há ${semanas} semana${semanas > 1 ? 's' : ''}`;
    const meses = Math.floor(diffDias / 30);
    return `há ${meses} mês${meses > 1 ? 'es' : ''}`;
  }

  protected onComecarSimulado(): void {
    void this.router.navigateByUrl('/dashboard/simulados');
  }

  protected onTentativaClick(tentativa: TentativaHistoricoItem): void {
    void this.router.navigate(
      ['/dashboard/simulados', tentativa.prova_id, 'tentativa', tentativa.id, 'resultado'],
      { state: { fromHistorico: true } }
    );
  }

  protected formatDataRelativa(isoDate: string | null): string {
    if (!isoDate) return '—';
    return this.dataRelativa(isoDate);
  }

  protected getModoLabel(modo: string): string {
    switch (modo) {
      case 'estudo': return 'Estudo';
      case 'simulado': return 'Simulado';
      default: return modo;
    }
  }

  protected getNotaBadgeClass(nota: number | null): string {
    if (nota === null) return 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]';
    if (nota >= 70) return 'bg-emerald-50 text-emerald-700';
    if (nota >= 50) return 'bg-amber-50 text-amber-700';
    return 'bg-red-50 text-red-700';
  }

  protected getNotaLabel(nota: number | null): string {
    return nota === null ? 'Em andamento' : `${nota}%`;
  }
}
