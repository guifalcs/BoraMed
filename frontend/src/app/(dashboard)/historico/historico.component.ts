import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Award,
  Star,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  Target,
  ChevronLeft,
  ChevronRight,
} from 'lucide-angular';
import type {
  HistoricoKpis,
  DesempenhoTema,
  TentativaHistoricoItem,
} from '../../core/models/historico';
import type { LucideIconData } from 'lucide-angular';
import type { PontoEvolucao } from '../../shared/components/evolucao-nota-chart/evolucao-nota-chart.component';
import { EvolucaoNotaChartComponent } from '../../shared/components/evolucao-nota-chart/evolucao-nota-chart.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import {
  PageHeaderComponent,
  type Breadcrumb,
} from '../../shared/components/page-header/page-header.component';
import { UiIconComponent } from '../../shared/components/ui/icon/ui-icon.component';
import { HistoricoService } from '../../core/services/historico.service';
import { CacheService, CACHE_KEYS } from '../../core/services/cache.service';
import { NavigationProgressService } from '../../core/services/navigation-progress.service';

type SectionResult<T> = { ok: true; data: T } | { ok: false; error: string };

interface HistoricoData {
  kpisResult: SectionResult<HistoricoKpis>;
  temasResult: SectionResult<DesempenhoTema[]>;
  tentativasResult: SectionResult<TentativaHistoricoItem[]>;
}

const HISTORICO_CACHE_KEY = CACHE_KEYS.historico;

type FiltroPeriodo = 'todos' | 'semana' | 'mes' | 'semestre';
type FiltroTipo = 'todos' | 'nacional' | 'processual' | 'laboratorio';
type FiltroFavorito = 'todos' | 'favoritas';
type Ordenacao = 'recentes' | 'antigas' | 'maior-nota' | 'menor-nota' | 'nome' | 'modo';
type KpiTone = 'neutral' | 'success' | 'warning' | 'danger';

interface KpiData {
  label: string;
  valor: string;
  sublabel: string | null;
  icone: LucideIconData;
  tone: KpiTone;
}

@Component({
  selector: 'app-historico',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    EvolucaoNotaChartComponent,
    EmptyStateComponent,
    PageHeaderComponent,
    UiIconComponent,
  ],
  templateUrl: './historico.component.html',
  styleUrl: './historico.component.css',
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
  protected readonly icons = {
    ArrowUpRight,
    ArrowRight,
    Plus,
    Search,
    Target,
    ChevronLeft,
    ChevronRight,
  };
  protected readonly busca = signal('');
  protected readonly mostrarTodosTemas = signal(false);
  protected readonly ordenacao = signal<Ordenacao>('recentes');
  protected readonly pagina = signal(1);
  protected readonly favoritosPendentes = signal<ReadonlySet<string>>(new Set());
  protected readonly favoritoError = signal<string | null>(null);
  protected readonly totalFinalizadas = signal(0);
  protected readonly pageSize = 10;
  protected readonly isLoading = computed(() => this.isLoadingKpis() || this.isLoadingTentativas());

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
    const busca = this.busca().trim().toLocaleLowerCase('pt-BR');
    if (busca)
      items = items.filter((t) =>
        `${t.prova_nome} ${this.getModoLabel(t.modo)}`.toLocaleLowerCase('pt-BR').includes(busca),
      );
    return items;
  });

  protected readonly tentativasOrdenadas = computed(() =>
    [...this.tentativasFiltradas()].sort((a, b) => {
      switch (this.ordenacao()) {
        case 'antigas':
          return (a.finalizada_em ?? '').localeCompare(b.finalizada_em ?? '');
        case 'maior-nota':
          return (b.nota ?? -1) - (a.nota ?? -1);
        case 'menor-nota':
          return (a.nota ?? Infinity) - (b.nota ?? Infinity);
        case 'nome':
          return a.prova_nome.localeCompare(b.prova_nome, 'pt-BR');
        case 'modo':
          return a.modo.localeCompare(b.modo, 'pt-BR');
        default:
          return (b.finalizada_em ?? '').localeCompare(a.finalizada_em ?? '');
      }
    }),
  );
  protected readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.tentativasOrdenadas().length / this.pageSize)),
  );
  protected readonly paginaAtual = computed(() => Math.min(this.pagina(), this.totalPaginas()));
  protected readonly inicioPagina = computed(() => (this.paginaAtual() - 1) * this.pageSize);
  protected readonly fimPagina = computed(() =>
    Math.min(this.inicioPagina() + this.pageSize, this.tentativasOrdenadas().length),
  );
  protected readonly tentativasPaginadas = computed(() =>
    this.tentativasOrdenadas().slice(this.inicioPagina(), this.fimPagina()),
  );
  protected readonly resumoEvolucao = computed(() => {
    const notas = [...this.pontosEvolucao()].sort((a, b) => a.data.localeCompare(b.data));
    if (notas.length < 2) return null;
    const diferenca = Math.round((notas[notas.length - 1].nota - notas[0].nota) * 10) / 10;
    return {
      diferenca,
      texto:
        diferenca === 0
          ? 'Mesma nota do início do recorte'
          : `${diferenca > 0 ? '+' : ''}${diferenca.toLocaleString('pt-BR')} p.p. entre a primeira e a última nota`,
    };
  });
  protected readonly temasOrdenados = computed(() =>
    [...this.temas()]
      .filter((t) => t.total > 0)
      .sort((a, b) => a.taxa - b.taxa || b.total - a.total),
  );

  protected readonly temasVisiveis = computed(() =>
    this.mostrarTodosTemas() ? this.temasOrdenados() : this.temasOrdenados().slice(0, 5),
  );

  protected readonly pontosEvolucao = computed<PontoEvolucao[]>(() =>
    this.tentativasFiltradas()
      .filter(
        (t): t is TentativaHistoricoItem & { nota: number; finalizada_em: string } =>
          t.nota !== null && t.finalizada_em !== null,
      )
      .map((t) => ({ data: t.finalizada_em, nota: t.nota })),
  );

  protected readonly temaPrioritario = computed<DesempenhoTema | null>(() => {
    const temas = this.temas().filter((t) => t.total > 0);
    if (temas.length === 0) return null;
    return [...temas].sort((a, b) => a.taxa - b.taxa || b.total - a.total)[0];
  });

  protected readonly temFiltroAtivo = computed(
    () =>
      this.filtroPeriodo() !== 'todos' ||
      this.filtroTipo() !== 'todos' ||
      this.filtroFavorito() !== 'todos' ||
      this.busca().trim().length > 0,
  );
  protected readonly temHistorico = computed(() => this.tentativas().length > 0);
  protected readonly temEvolucao = computed(() => this.pontosEvolucao().length > 0);
  protected readonly temTemas = computed(() => this.temas().some((tema) => tema.total > 0));

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
      this.totalFinalizadas.set(resolved.kpisResult.data.total_finalizadas);
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
    return [
      {
        label: 'Acerto geral',
        valor: k.taxa_acerto !== null ? `${k.taxa_acerto.toLocaleString('pt-BR')}%` : '—',
        sublabel: `${k.total_questoes_respondidas.toLocaleString('pt-BR')} ${k.total_questoes_respondidas === 1 ? 'questão respondida' : 'questões respondidas'}`,
        icone: TrendingUp,
        tone: this.getKpiTone(k.taxa_acerto),
      },
      {
        label: 'Simulados concluídos',
        valor: k.total_finalizadas.toLocaleString('pt-BR'),
        sublabel: k.total_finalizadas > 0 ? 'ao longo dos seus estudos' : 'nenhum ainda',
        icone: CheckCircle2,
        tone: k.total_finalizadas > 0 ? 'success' : 'neutral',
      },
      {
        label: 'Prioridade de revisão',
        valor: k.taxa_tema_fraco !== null ? `${k.taxa_tema_fraco.toLocaleString('pt-BR')}%` : '—',
        sublabel: k.tema_mais_fraco ?? 'dados insuficientes',
        icone: AlertTriangle,
        tone: k.tema_mais_fraco ? 'danger' : 'neutral',
      },
      {
        label: 'Última nota',
        valor: k.ultima_nota !== null ? `${k.ultima_nota.toLocaleString('pt-BR')}%` : '—',
        sublabel: k.ultima_nota_data ? this.dataRelativa(k.ultima_nota_data) : null,
        icone: Award,
        tone: this.getKpiTone(k.ultima_nota),
      },
    ];
  }

  private getKpiTone(nota: number | null): KpiTone {
    if (nota === null) return 'neutral';
    if (nota >= 70) return 'success';
    return nota >= 50 ? 'warning' : 'danger';
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
    return `há ${meses} ${meses > 1 ? 'meses' : 'mês'}`;
  }

  protected onComecarSimulado(): void {
    void this.router.navigateByUrl('/dashboard/simulados');
  }

  protected onLimparFiltros(): void {
    this.filtroPeriodo.set('todos');
    this.filtroTipo.set('todos');
    this.filtroFavorito.set('todos');
    this.busca.set('');
    this.pagina.set(1);
  }

  protected async onToggleFavorito(tentativa: TentativaHistoricoItem): Promise<void> {
    if (this.favoritosPendentes().has(tentativa.id)) return;
    const novoValor = !tentativa.favorito;
    this.favoritoError.set(null);
    this.favoritosPendentes.update((ids) => new Set([...ids, tentativa.id]));
    this.tentativas.update((list) =>
      list.map((t) => (t.id === tentativa.id ? { ...t, favorito: novoValor } : t)),
    );
    try {
      await this.historicoService.toggleFavorito(tentativa.id, novoValor);
      this.cache.remove(HISTORICO_CACHE_KEY);
    } catch {
      this.tentativas.update((list) =>
        list.map((t) => (t.id === tentativa.id ? { ...t, favorito: tentativa.favorito } : t)),
      );
      this.favoritoError.set('Não foi possível salvar o favorito. Tente novamente.');
    } finally {
      this.favoritosPendentes.update((ids) => {
        const next = new Set(ids);
        next.delete(tentativa.id);
        return next;
      });
    }
  }

  protected onPeriodoChange(value: string): void {
    if (this.periodosDisponiveis.some((p) => p.valor === value))
      this.filtroPeriodo.set(value as FiltroPeriodo);
    this.pagina.set(1);
  }

  protected onTipoChange(value: string): void {
    if (this.tiposDisponiveis.some((t) => t.valor === value))
      this.filtroTipo.set(value as FiltroTipo);
    this.pagina.set(1);
  }

  protected onOrdenacaoChange(value: string): void {
    const valores: Ordenacao[] = [
      'recentes',
      'antigas',
      'maior-nota',
      'menor-nota',
      'nome',
      'modo',
    ];
    if (valores.includes(value as Ordenacao)) this.ordenacao.set(value as Ordenacao);
    this.pagina.set(1);
  }

  protected getTipoLabel(tipo: string): string {
    switch (tipo) {
      case 'nacional':
        return 'Nacional';
      case 'processual':
        return 'Processual';
      case 'laboratorio':
        return 'Laboratório';
      case 'multiestacoes':
        return 'Multiestações';
      default:
        return 'Simulado';
    }
  }

  protected onTentarNovamente(): void {
    if (this.isBrowser) {
      this.cache.remove(HISTORICO_CACHE_KEY);
      this.kpisError.set(null);
      this.temasError.set(null);
      this.tentativasError.set(null);
      this.isLoadingKpis.set(true);
      this.isLoadingTentativas.set(true);
      void this.carregar();
    }
  }

  protected getModoLabel(modo: string): string {
    switch (modo) {
      case 'estudo':
        return 'Estudo';
      case 'simulado':
        return 'Simulado';
      default:
        return modo;
    }
  }

  protected getNotaBadgeClass(nota: number | null): string {
    if (nota === null) return 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]';
    if (nota >= 70) return 'bg-emerald-50 text-emerald-700';
    if (nota >= 50) return 'bg-amber-50 text-amber-700';
    return 'bg-red-50 text-red-700';
  }

  protected formatNumero(valor: number): string {
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  }

  protected getNotaLabel(nota: number | null): string {
    return nota === null ? 'Sem nota' : `${nota.toLocaleString('pt-BR')}%`;
  }
}
