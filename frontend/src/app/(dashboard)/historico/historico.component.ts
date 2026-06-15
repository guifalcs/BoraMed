import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Award,
  Star,
} from 'lucide-angular';
import type { HistoricoKpis, DesempenhoTema, TentativaHistoricoItem } from '../../core/models/historico';
import type { KpiVariante } from '../../shared/components/kpi-card/kpi-card.component';
import type { LucideIconData } from 'lucide-angular';
import type { PontoEvolucao } from '../../shared/components/evolucao-nota-chart/evolucao-nota-chart.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { DesempenhoTemaChartComponent } from '../../shared/components/desempenho-tema-chart/desempenho-tema-chart.component';
import { EvolucaoNotaChartComponent } from '../../shared/components/evolucao-nota-chart/evolucao-nota-chart.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { DataTableComponent, type DataTableColumn } from '../../shared/components/data-table/data-table.component';
import { DataTableColumnDirective } from '../../shared/components/data-table/data-table-column.directive';
import { PageHeaderComponent, type Breadcrumb } from '../../shared/components/page-header/page-header.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { HistoricoService } from '../../core/services/historico.service';
import { CacheService } from '../../core/services/cache.service';
import { NavigationProgressService } from '../../core/services/navigation-progress.service';

type SectionResult<T> = { ok: true; data: T } | { ok: false; error: string };

interface HistoricoData {
  kpisResult: SectionResult<HistoricoKpis>;
  temasResult: SectionResult<DesempenhoTema[]>;
  tentativasResult: SectionResult<TentativaHistoricoItem[]>;
}

const HISTORICO_CACHE_KEY = 'historico_data';

type FiltroPeriodo = 'todos' | 'semana' | 'mes' | 'semestre';
type FiltroTipo = 'todos' | 'nacional' | 'processual' | 'laboratorio';
type FiltroFavorito = 'todos' | 'favoritas';

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
  imports: [RouterLink, KpiCardComponent, DesempenhoTemaChartComponent, EvolucaoNotaChartComponent, EmptyStateComponent, DataTableComponent, DataTableColumnDirective, PageHeaderComponent, UiIconComponent],
  templateUrl: './historico.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoricoComponent {
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly historicoService = inject(HistoricoService);
  private readonly cache = inject(CacheService);
  private readonly nav = inject(NavigationProgressService);

  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Histórico' },
  ];

  protected readonly isLoadingKpis = signal(true);
  protected readonly isLoadingTemas = signal(true);
  protected readonly isLoadingTentativas = signal(true);

  protected readonly kpis = signal<KpiData[]>([]);
  protected readonly temas = signal<DesempenhoTema[]>([]);
  protected readonly tentativas = signal<TentativaHistoricoItem[]>([]);
  protected readonly kpisError = signal<string | null>(null);
  protected readonly temasError = signal<string | null>(null);
  protected readonly tentativasError = signal<string | null>(null);

  protected readonly filtroPeriodo = signal<FiltroPeriodo>('todos');
  protected readonly filtroTipo = signal<FiltroTipo>('todos');
  protected readonly filtroFavorito = signal<FiltroFavorito>('todos');

  protected readonly starIcon = Star;

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
    if (this.filtroFavorito() === 'favoritas') {
      items = items.filter((t) => t.favorito);
    }
    return items;
  });

  protected readonly pontosEvolucao = computed<PontoEvolucao[]>(() =>
    this.tentativasFiltradas()
      .filter((t): t is TentativaHistoricoItem & { nota: number; finalizada_em: string } => t.nota !== null && t.finalizada_em !== null)
      .map((t) => ({ data: t.finalizada_em, nota: t.nota }))
  );

  protected readonly temaPrioritario = computed<DesempenhoTema | null>(() => {
    const temas = this.temas().filter((t) => t.total > 0);
    if (temas.length === 0) return null;
    return [...temas].sort((a, b) => a.taxa - b.taxa || b.total - a.total)[0];
  });

  protected readonly temFiltroAtivo = computed(() => this.filtroPeriodo() !== 'todos' || this.filtroTipo() !== 'todos' || this.filtroFavorito() !== 'todos');
  protected readonly temHistorico = computed(() => this.tentativas().length > 0);
  protected readonly temEvolucao = computed(() => this.pontosEvolucao().length > 0);
  protected readonly temTemas = computed(() => this.temas().some((tema) => tema.total > 0));
  protected readonly mostrarInsights = computed(() => this.temHistorico() || this.temFiltroAtivo());

  protected readonly periodosDisponiveis: { valor: FiltroPeriodo; label: string }[] = [
    { valor: 'todos', label: 'Todos' },
    { valor: 'semana', label: 'Última semana' },
    { valor: 'mes', label: 'Último mês' },
    { valor: 'semestre', label: 'Último semestre' },
  ];

  protected readonly tiposDisponiveis: { valor: FiltroTipo; label: string }[] = [
    { valor: 'todos', label: 'Todos' },
    { valor: 'nacional', label: 'Nacional' },
    { valor: 'processual', label: 'Processual' },
    { valor: 'laboratorio', label: 'Laboratório' },
  ];

  protected readonly tentativasColumns: DataTableColumn[] = [
    { key: 'favorito', header: '', sortable: false },
    { key: 'prova_nome', header: 'Prova', sortable: true },
    { key: 'finalizada_em', header: 'Data', sortable: true },
    { key: 'modo', header: 'Modo', sortable: true },
    { key: 'nota', header: 'Nota', sortable: true },
  ];

  constructor() {
    // Navega instantaneamente; os dados são carregados aqui (sem bloquear a
    // rota). Em SSR os skeletons são renderizados e preenchidos no cliente.
    if (this.isBrowser) {
      void this.carregar();
    }
  }

  /**
   * Stale-while-revalidate: aplica o cache na hora (render instantâneo em
   * revisitas) e revalida em background; sem cache, mantém os skeletons
   * enquanto busca.
   */
  private async carregar(): Promise<void> {
    const cached = this.cache.get<HistoricoData>(HISTORICO_CACHE_KEY);
    if (cached) {
      this.aplicar(cached);
      if (!this.cache.isStale(HISTORICO_CACHE_KEY)) return;
    }

    const data = await this.nav.track(this.buscar());
    this.cache.set(HISTORICO_CACHE_KEY, data);
    this.aplicar(data);
  }

  private async buscar(): Promise<HistoricoData> {
    const [kpisResult, temasResult, tentativasResult] = await Promise.all([
      this.historicoService.getKpis(),
      this.historicoService.getDesempenhoTemas(),
      this.historicoService.listarTentativas(),
    ]);
    return { kpisResult, temasResult, tentativasResult };
  }

  private aplicar(resolved: HistoricoData): void {
    if (resolved.kpisResult.ok) {
      this.kpis.set(this.buildKpis(resolved.kpisResult.data));
    } else {
      this.kpisError.set(resolved.kpisResult.error);
    }
    this.isLoadingKpis.set(false);

    if (resolved.temasResult.ok) {
      this.temas.set(resolved.temasResult.data);
    } else {
      this.temasError.set(resolved.temasResult.error);
    }
    this.isLoadingTemas.set(false);

    if (resolved.tentativasResult.ok) {
      this.tentativas.set(resolved.tentativasResult.data);
    } else {
      this.tentativasError.set(resolved.tentativasResult.error);
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

  protected onLimparFiltros(): void {
    this.filtroPeriodo.set('todos');
    this.filtroTipo.set('todos');
    this.filtroFavorito.set('todos');
  }

  protected onToggleFavorito(tentativa: TentativaHistoricoItem, event: MouseEvent): void {
    event.stopPropagation();
    const novoValor = !tentativa.favorito;
    this.tentativas.update((list) =>
      list.map((t) => (t.id === tentativa.id ? { ...t, favorito: novoValor } : t))
    );
    void this.historicoService.toggleFavorito(tentativa.id, novoValor).catch(() => {
      this.tentativas.update((list) =>
        list.map((t) => (t.id === tentativa.id ? { ...t, favorito: !novoValor } : t))
      );
    });
  }

  protected onTentarNovamente(): void {
    if (this.isBrowser) {
      window.location.reload();
    }
  }

  protected onTentativaClick(tentativa: TentativaHistoricoItem): void {
    void this.router.navigate(
      ['/dashboard/simulados', tentativa.prova_id ?? 'removida', 'tentativa', tentativa.id, 'resultado'],
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
