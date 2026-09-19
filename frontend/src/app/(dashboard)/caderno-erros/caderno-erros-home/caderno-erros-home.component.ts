import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  AlertTriangle,
  BookOpen,
  BookX,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  LoaderCircle,
  RotateCcw,
  Search,
  Shuffle,
  TrendingDown,
  Undo2,
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
// Alto de propósito: o agrupamento por tema (accordion colapsado) é quem
// controla a poluição visual, não a paginação — paginar cortaria um tema no
// meio entre páginas. 100 é o teto aceito pela RPC (get_caderno_erros).
const ITENS_POR_PAGINA = 100;
const BUSCA_DEBOUNCE_MS = 300;

interface GrupoTemaErros {
  /** Chave estável (origem + nome) pra track/expand — nome sozinho pode colidir entre seções. */
  chave: string;
  tema: string;
  itens: QuestaoErroItem[];
  /** Rótulo cinza discreto de seção, mostrado só uma vez, logo antes deste grupo. */
  rotuloSecao: string | null;
}

/** Ordem das 3 seções da lista: exceções (menos específico) primeiro, tema (mais específico) por último. */
const ORDEM_SECAO: Record<'tipo' | 'disciplina' | 'tema', number> = { tipo: 0, disciplina: 1, tema: 2 };
const ROTULO_SECAO: Record<'tipo' | 'disciplina' | 'tema', string> = {
  tipo: 'Sem tema nem disciplina',
  disciplina: 'Por disciplina',
  tema: 'Por tema',
};

@Component({
  selector: 'app-caderno-erros-home',
  standalone: true,
  imports: [
    RouterLink,
    NgTemplateOutlet,
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
  protected readonly searchIcon = Search;
  protected readonly chevronLeftIcon = ChevronLeft;
  protected readonly chevronRightIcon = ChevronRight;
  protected readonly chevronDownIcon = ChevronDown;
  protected readonly refazerIcon = RotateCcw;
  protected readonly revisaoIcon = Eye;
  protected readonly domineiIcon = Check;
  protected readonly reabrirIcon = Undo2;

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
  protected readonly buscaInput = signal('');
  private readonly busca = signal('');
  private buscaDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly pagina = signal(1);
  protected readonly totalPaginas = signal(1);
  protected readonly totalCount = signal(0);

  protected readonly quantidadeSimulado = signal(10);
  protected readonly gerando = signal(false);
  protected readonly erroGerar = signal<string | null>(null);

  /** Colapsado por padrão — evita a lista virando uma parede de cards com muito volume. */
  protected readonly gruposExpandidos = signal<Set<string>>(new Set());

  protected readonly temaOpcoes = computed<SelectOption[]>(() =>
    this.temas().map((t) => ({ value: t.id, label: t.nome })),
  );

  protected readonly temasSelecionadosValues = computed<(string | number)[]>(() =>
    Array.from(this.temasSelecionados()),
  );

  protected readonly tipoOpcoes = computed<SelectOption[]>(() =>
    this.tiposQuestao.map((t) => ({ value: t.valor, label: t.label })),
  );

  protected readonly tipoSelecionadoValues = computed<(string | number)[]>(() =>
    Array.from(this.tipoQuestaoSelecionado()),
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
    busca: this.busca() || undefined,
  }));

  protected readonly temFiltroAtivo = computed(
    () =>
      this.tipoQuestaoSelecionado().size > 0 ||
      this.temasSelecionados().size > 0 ||
      this.mostrarDominadas() ||
      this.busca().length > 0,
  );

  protected readonly idsPendentes = computed(() =>
    this.itens().filter((i) => i.status === 'pendente').map((i) => i.questaoId),
  );

  /** Buscando, mostra lista plana (o aluno já sabe o que quer, não faz sentido esconder atrás de um grupo fechado). */
  protected readonly agruparPorTema = computed(() => this.buscaInput().trim().length === 0);

  protected readonly grupos = computed<GrupoTemaErros[]>(() => {
    // Chave composta (origem + nome) — só o nome colidiria se um tema de
    // verdade se chamar "Nacional"/"Processual"/"Laboratorio" ou igual a
    // alguma sigla de disciplina, misturando com os grupos de fallback.
    const porTema = new Map<string, { chave: string; tema: string; itens: QuestaoErroItem[]; origem: 'tema' | 'disciplina' | 'tipo' }>();
    for (const item of this.itens()) {
      const chave = `${item.temaOrigem}::${item.temaPrincipal}`;
      const grupo = porTema.get(chave);
      if (grupo) grupo.itens.push(item);
      else porTema.set(chave, { chave, tema: item.temaPrincipal, itens: [item], origem: item.temaOrigem });
    }
    const ordenados = Array.from(porTema.values()).sort(
      (a, b) =>
        ORDEM_SECAO[a.origem] - ORDEM_SECAO[b.origem] ||
        b.itens.length - a.itens.length ||
        a.tema.localeCompare(b.tema),
    );

    // Rótulo de seção (tipo / disciplina / tema) só na virada de cada uma das 3 seções.
    return ordenados.map((grupo, i) => {
      const anterior = ordenados[i - 1];
      const rotuloSecao = i === 0 || anterior.origem !== grupo.origem ? ROTULO_SECAO[grupo.origem] : null;
      return { chave: grupo.chave, tema: grupo.tema, itens: grupo.itens, rotuloSecao };
    });
  });

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

      // Qualquer mudança de filtro (incluindo busca) volta pra página 1 —
      // senão o usuário pode ficar preso numa página que não existe mais
      // pro novo filtro. `pagina` não é lido aqui de propósito, senão essa
      // escrita geraria um ciclo com o efeito de carregar itens abaixo.
      effect(() => {
        this.filtrosAtivos();
        this.pagina.set(1);
      });

      effect(() => {
        const filtros = this.filtrosAtivos();
        const pagina = this.pagina();
        void this.carregarItens(filtros, pagina);
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

  private async carregarItens(filtros: FiltrosCadernoErros, pagina: number): Promise<void> {
    this.isLoadingItens.set(true);
    this.itensError.set(null);
    try {
      const resultado = await this.nav.track(
        this.cadernoErrosService.getCadernoErros(filtros, pagina, ITENS_POR_PAGINA),
      );
      this.itens.set(resultado.itens);
      this.totalCount.set(resultado.totalCount);
      this.totalPaginas.set(resultado.totalPaginas);
    } catch {
      this.itensError.set('Não foi possível carregar seu caderno de erros.');
    } finally {
      this.isLoadingItens.set(false);
    }
  }

  protected onBuscaInput(event: Event): void {
    const valor = (event.target as HTMLInputElement).value;
    this.buscaInput.set(valor);
    if (this.buscaDebounceTimer) clearTimeout(this.buscaDebounceTimer);
    this.buscaDebounceTimer = setTimeout(() => this.busca.set(valor.trim()), BUSCA_DEBOUNCE_MS);
  }

  protected toggleGrupo(tema: string): void {
    this.gruposExpandidos.update((set) => {
      const next = new Set(set);
      if (next.has(tema)) next.delete(tema);
      else next.add(tema);
      return next;
    });
  }

  protected irParaPagina(pagina: number): void {
    if (pagina < 1 || pagina > this.totalPaginas()) return;
    this.pagina.set(pagina);
  }

  protected onTipoQuestaoChange(values: (string | number)[]): void {
    this.tipoQuestaoSelecionado.set(new Set(values.map(String) as TipoQuestaoCadernoErros[]));
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
    this.buscaInput.set('');
    if (this.buscaDebounceTimer) clearTimeout(this.buscaDebounceTimer);
    this.busca.set('');
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
    void this.carregarItens(this.filtrosAtivos(), this.pagina());
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
