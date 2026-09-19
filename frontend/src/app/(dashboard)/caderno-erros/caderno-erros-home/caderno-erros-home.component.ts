import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  AlertTriangle,
  BookOpen,
  BookX,
  CheckCircle2,
  LoaderCircle,
  Shuffle,
  TrendingDown,
} from 'lucide-angular';
import type { LucideIconData } from 'lucide-angular';
import type {
  CadernoErrosResumo,
  FiltrosCadernoErros,
  QuestaoErroItem,
  StatusCadernoErros,
  TipoQuestaoCadernoErros,
} from '../../../core/models/caderno-erros';
import type { KpiVariante } from '../../../shared/components/kpi-card/kpi-card.component';
import type { TemaComContagem } from '../../../core/models/tema';
import { CadernoErrosService } from '../../../core/services/caderno-erros.service';
import { TemaService } from '../../../core/services/tema.service';
import { NotificationService } from '../../../core/services/notification.service';
import { NavigationProgressService } from '../../../core/services/navigation-progress.service';
import { KpiCardComponent } from '../../../shared/components/kpi-card/kpi-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { UiMultiselectComponent } from '../../../shared/components/ui/multiselect/ui-multiselect.component';
import type { SelectOption } from '../../../shared/components/ui/select/ui-select.component';

interface KpiData {
  label: string;
  valor: string;
  sublabel: string | null;
  icone: LucideIconData;
  variante: KpiVariante;
}

interface TipoQuestaoOpcao {
  valor: TipoQuestaoCadernoErros;
  label: string;
}

const TIPOS_QUESTAO: TipoQuestaoOpcao[] = [
  { valor: 'nacional', label: 'Nacional' },
  { valor: 'processual', label: 'Processual' },
  { valor: 'laboratorio', label: 'Laboratório' },
];

const OPCOES_QTD = [5, 10, 15, 20, 30];

@Component({
  selector: 'app-caderno-erros-home',
  standalone: true,
  imports: [
    RouterLink,
    KpiCardComponent,
    EmptyStateComponent,
    PageHeaderComponent,
    UiIconComponent,
    UiMultiselectComponent,
  ],
  templateUrl: './caderno-erros-home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CadernoErrosHomeComponent {
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cadernoErrosService = inject(CadernoErrosService);
  private readonly temaService = inject(TemaService);
  private readonly toast = inject(NotificationService);
  private readonly nav = inject(NavigationProgressService);

  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Caderno de Erros' },
  ];

  protected readonly bookXIcon = BookX;
  protected readonly shuffleIcon = Shuffle;
  protected readonly loaderIcon = LoaderCircle;

  protected readonly tiposQuestao = TIPOS_QUESTAO;
  protected readonly opcoesQtd = OPCOES_QTD;

  protected readonly isLoadingResumo = signal(true);
  protected readonly resumoError = signal<string | null>(null);
  protected readonly resumo = signal<CadernoErrosResumo | null>(null);

  protected readonly isLoadingItens = signal(true);
  protected readonly itensError = signal<string | null>(null);
  protected readonly itens = signal<QuestaoErroItem[]>([]);

  protected readonly temas = signal<TemaComContagem[]>([]);

  protected readonly tipoQuestaoSelecionado = signal<Set<TipoQuestaoCadernoErros>>(new Set());
  protected readonly temasSelecionados = signal<Set<string>>(new Set());
  protected readonly mostrarDominadas = signal(false);

  protected readonly quantidadeSimulado = signal(10);
  protected readonly gerando = signal(false);
  protected readonly erroGerar = signal<string | null>(null);

  protected readonly temaOpcoes = computed<SelectOption[]>(() =>
    this.temas().map((t) => ({ value: t.id, label: t.nome })),
  );

  protected readonly temasSelecionadosValues = computed<(string | number)[]>(() =>
    Array.from(this.temasSelecionados()),
  );

  protected readonly statusFiltro = computed<StatusCadernoErros>(() =>
    this.mostrarDominadas() ? 'dominada' : 'pendente',
  );

  protected readonly filtrosAtivos = computed<FiltrosCadernoErros>(() => ({
    tipoQuestao: this.tipoQuestaoSelecionado().size > 0
      ? Array.from(this.tipoQuestaoSelecionado())
      : undefined,
    temaIds: this.temasSelecionados().size > 0 ? Array.from(this.temasSelecionados()) : undefined,
    status: this.statusFiltro(),
  }));

  protected readonly temFiltroAtivo = computed(
    () => this.tipoQuestaoSelecionado().size > 0 || this.temasSelecionados().size > 0 || this.mostrarDominadas(),
  );

  protected readonly idsPendentes = computed(() =>
    this.itens().filter((i) => i.status === 'pendente').map((i) => i.questaoId),
  );

  protected readonly tipoComMaisErros = computed<string | null>(() => {
    const porTipo = this.resumo()?.porTipoQuestao;
    if (!porTipo) return null;
    const entradas = Object.entries(porTipo).filter(([, qtd]) => qtd > 0);
    if (entradas.length === 0) return null;
    const [tipo] = entradas.sort(([, a], [, b]) => b - a)[0];
    return this.tiposQuestao.find((t) => t.valor === tipo)?.label ?? tipo;
  });

  protected readonly kpis = computed<KpiData[]>(() => {
    const r = this.resumo();
    if (!r) return [];
    return [
      {
        label: 'Questões Pendentes',
        valor: String(r.totalPendentes),
        sublabel: r.totalPendentes > 0 ? 'aguardando revisão' : 'nenhuma pendência',
        icone: AlertTriangle,
        variante: r.totalPendentes > 0 ? 'danger' : 'success',
      },
      {
        label: 'Dominadas (7 dias)',
        valor: String(r.dominadasUltimos7Dias),
        sublabel: 'questões revisadas com sucesso',
        icone: CheckCircle2,
        variante: r.dominadasUltimos7Dias > 0 ? 'success' : 'default',
      },
      {
        label: 'Tema Mais Fraco',
        valor: r.temaMaisFraco ?? '—',
        sublabel: r.temaMaisFraco ? 'foco de revisão sugerido' : 'dados insuficientes',
        icone: TrendingDown,
        variante: r.temaMaisFraco ? 'danger' : 'default',
      },
      {
        label: 'Tipo com Mais Erros',
        valor: this.tipoComMaisErros() ?? '—',
        sublabel: null,
        icone: BookOpen,
        variante: 'default',
      },
    ];
  });

  constructor() {
    // Navega instantaneamente; os dados são carregados aqui (sem bloquear a rota).
    if (this.isBrowser) {
      void this.carregarResumo();
      void this.carregarTemas();
      effect(() => {
        const filtros = this.filtrosAtivos();
        void this.carregarItens(filtros);
      });
    }
  }

  private async carregarResumo(): Promise<void> {
    this.isLoadingResumo.set(true);
    this.resumoError.set(null);
    try {
      const data = await this.cadernoErrosService.getResumo();
      this.resumo.set(data);
    } catch {
      this.resumoError.set('Não foi possível carregar seus indicadores.');
    } finally {
      this.isLoadingResumo.set(false);
    }
  }

  private async carregarTemas(): Promise<void> {
    const result = await this.temaService.listarTemasComContagem();
    if (result.ok) this.temas.set(result.data);
  }

  private async carregarItens(filtros: FiltrosCadernoErros): Promise<void> {
    this.isLoadingItens.set(true);
    this.itensError.set(null);
    try {
      const data = await this.nav.track(this.cadernoErrosService.getCadernoErros(filtros));
      this.itens.set(data);
    } catch {
      this.itensError.set('Não foi possível carregar seu caderno de erros.');
    } finally {
      this.isLoadingItens.set(false);
    }
  }

  protected toggleTipoQuestao(tipo: TipoQuestaoCadernoErros): void {
    this.tipoQuestaoSelecionado.update((set) => {
      const next = new Set(set);
      if (next.has(tipo)) next.delete(tipo);
      else next.add(tipo);
      return next;
    });
  }

  protected onTemasChange(values: (string | number)[]): void {
    this.temasSelecionados.set(new Set(values.map(String)));
  }

  protected toggleMostrarDominadas(): void {
    this.mostrarDominadas.update((v) => !v);
  }

  protected limparFiltros(): void {
    this.tipoQuestaoSelecionado.set(new Set());
    this.temasSelecionados.set(new Set());
    this.mostrarDominadas.set(false);
  }

  protected setQuantidadeSimulado(qtd: number): void {
    this.quantidadeSimulado.set(qtd);
  }

  /** Otimista: some da lista atual (a lista sempre reflete só um dos dois status por vez). */
  protected async onMarcarDominada(item: QuestaoErroItem): Promise<void> {
    const novoValorDominada = item.status === 'pendente';
    this.itens.update((list) => list.filter((i) => i.questaoId !== item.questaoId));
    try {
      await this.cadernoErrosService.marcarDominada(item.questaoId, novoValorDominada);
      void this.carregarResumo();
    } catch {
      this.itens.update((list) => [...list, item]);
      this.toast.error('Não foi possível atualizar a questão. Tente novamente.');
    }
  }

  protected async onGerarSimulado(): Promise<void> {
    this.erroGerar.set(null);
    this.gerando.set(true);
    try {
      const { provaId, tentativaId } = await this.cadernoErrosService.gerarSimuladoComErros({
        ...this.filtrosAtivos(),
        status: 'pendente',
        qtd: this.quantidadeSimulado(),
      });
      void this.router.navigate(['/dashboard/simulados', provaId, 'tentativa', tentativaId]);
    } catch {
      this.erroGerar.set('Não foi possível gerar o simulado com esses erros.');
    } finally {
      this.gerando.set(false);
    }
  }

  protected onTentarNovamente(): void {
    void this.carregarResumo();
    void this.carregarItens(this.filtrosAtivos());
  }

  protected estadoRedoBadge(item: QuestaoErroItem): { label: string; classe: string } | null {
    if (item.ultimaRedoCorreta === null) return null;
    return item.ultimaRedoCorreta
      ? { label: 'Acertou no último refazer', classe: 'bg-emerald-50 text-emerald-700' }
      : { label: 'Errou de novo', classe: 'bg-red-50 text-red-700' };
  }

  protected tipoLabel(tipo: TipoQuestaoCadernoErros): string {
    return this.tiposQuestao.find((t) => t.valor === tipo)?.label ?? tipo;
  }

  protected temasResumo(temas: string[]): string {
    if (temas.length === 0) return '';
    if (temas.length <= 2) return temas.join(', ');
    return `${temas.slice(0, 2).join(', ')} e mais ${temas.length - 2}`;
  }

  protected formatDataRelativa(isoDate: string): string {
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
}
