import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  inject,
  signal,
  computed,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Shuffle, Filter, LoaderCircle } from 'lucide-angular';
import { TentativaService } from '../../../core/services/tentativa.service';
import { TemaService } from '../../../core/services/tema.service';
import { ImpressaoSimuladoService } from '../../../core/services/impressao-simulado.service';
import { NavigationProgressService } from '../../../core/services/navigation-progress.service';
import { TIER_UPGRADE_REQUIRED } from '../../../core/utils/tier-error.util';
import type { TemaComContagem } from '../../../core/models/tema';
import type { ModoProva } from '../../../core/models/tentativa';
import { UiButtonComponent } from '../../../shared/components/ui/button/ui-button.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { UiMultiselectComponent } from '../../../shared/components/ui/multiselect/ui-multiselect.component';
import type { SelectOption } from '../../../shared/components/ui/select/ui-select.component';
import { ModoSelectorComponent } from '../../../shared/components/modo-selector/modo-selector.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';

type FormatoSimulado = 'todos' | 'processual' | 'laboratorio';
type FormatoQuestao = 'fechadas' | 'discursivas' | 'misto';

interface OpcaoFormatoQuestao {
  value: FormatoQuestao;
  label: string;
  descricao: string;
}

const FORMATOS_QUESTAO: OpcaoFormatoQuestao[] = [
  {
    value: 'fechadas',
    label: 'Objetivas',
    descricao: 'Múltipla escolha e verdadeiro/falso',
  },
  {
    value: 'discursivas',
    label: 'Discursivas',
    descricao: 'Respostas escritas, corrigidas por IA com feedback',
  },
  {
    value: 'misto',
    label: 'Misto',
    descricao: 'Combina questões objetivas e discursivas',
  },
];

interface OpcaoFormato {
  value: FormatoSimulado;
  label: string;
  descricao: string;
  tipoQuestao: 'processual' | 'laboratorio' | null;
}

const FORMATOS: OpcaoFormato[] = [
  {
    value: 'todos',
    label: 'Todos',
    descricao: 'Mistura questões processuais e de laboratório',
    tipoQuestao: null,
  },
  {
    value: 'processual',
    label: 'Processual',
    descricao: 'Questões aplicadas em contexto clínico e raciocínio diagnóstico',
    tipoQuestao: 'processual',
  },
  {
    value: 'laboratorio',
    label: 'Laboratório',
    descricao: 'Questões com imagens de lâminas e peças anatômicas',
    tipoQuestao: 'laboratorio',
  },
];

@Component({
  selector: 'app-montar-simulado',
  standalone: true,
  imports: [
    UiButtonComponent,
    UiIconComponent,
    UiMultiselectComponent,
    ModoSelectorComponent,
    PageHeaderComponent,
  ],
  templateUrl: './montar-simulado.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MontarSimuladoComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tentativaService = inject(TentativaService);
  private readonly temaService = inject(TemaService);
  private readonly impressaoService = inject(ImpressaoSimuladoService);
  private readonly nav = inject(NavigationProgressService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Simulados', route: '/dashboard/simulados' },
    { label: 'Montar simulado' },
  ];

  protected readonly shuffleIcon = Shuffle;
  protected readonly filterIcon = Filter;
  protected readonly loaderIcon = LoaderCircle;

  protected readonly formatos = FORMATOS;
  protected readonly formatosQuestao = FORMATOS_QUESTAO;

  protected readonly formatoSelecionado = signal<FormatoSimulado>('todos');
  protected readonly formatoQuestaoSelecionado = signal<FormatoQuestao>('fechadas');
  protected readonly temas = signal<TemaComContagem[]>([]);
  protected readonly isLoadingTemas = signal(true);
  protected readonly isRecarregandoFormato = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly temasSelecionados = signal<Set<string>>(new Set());
  protected readonly buscaTema = signal('');
  protected readonly periodosSelecionados = signal<Set<number>>(new Set());
  protected readonly quantidade = signal(10);
  protected readonly modoSelecionado = signal<ModoProva>('simulado');
  protected readonly origemRecomendacao = signal<string | null>(null);
  protected readonly gerando = signal(false);
  protected readonly imprimindo = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly opcoesQtd = [5, 10, 15, 20, 30];

  protected readonly formatoAtual = computed(() =>
    FORMATOS.find((f) => f.value === this.formatoSelecionado())!,
  );

  protected readonly loadingTemasLabel = computed(() =>
    this.isRecarregandoFormato()
      ? `Carregando temas para ${this.formatoAtual().label.toLowerCase()}...`
      : 'Carregando temas...',
  );

  protected readonly questoesDisponiveis = computed(() => {
    const selecionados = this.temasSelecionados();
    const allTemas = this.temas();
    if (selecionados.size === 0) {
      return allTemas.reduce((sum, t) => sum + t.qtd_questoes, 0);
    }
    return allTemas
      .filter((t) => selecionados.has(t.id))
      .reduce((sum, t) => sum + t.qtd_questoes, 0);
  });

  protected readonly temasComQuestoes = computed(() =>
    this.temas().filter((t) => t.qtd_questoes > 0),
  );

  protected readonly temasFiltradosComQuestoes = computed(() =>
    this.temasFiltrados().filter((t) => t.qtd_questoes > 0),
  );

  protected readonly periodosDisponiveis = computed(() => {
    const periodos = new Set<number>();
    for (const t of this.temas()) {
      if (t.periodo != null) periodos.add(t.periodo);
    }
    return Array.from(periodos).sort((a, b) => a - b);
  });

  protected readonly periodoOpcoes = computed<SelectOption[]>(() =>
    this.periodosDisponiveis().map((p) => ({ value: p, label: `${p}º período` })),
  );

  protected readonly periodosSelecionadosValues = computed<(string | number)[]>(() =>
    Array.from(this.periodosSelecionados()),
  );

  protected readonly temasFiltrados = computed(() => {
    const busca = normalizarTexto(this.buscaTema());
    const periodos = this.periodosSelecionados();
    return this.temas().filter((t) => {
      if (busca && !normalizarTexto(t.nome).includes(busca)) return false;
      if (periodos.size > 0 && (t.periodo == null || !periodos.has(t.periodo))) return false;
      return true;
    });
  });

  protected readonly temasAgrupados = computed(() => {
    const grupos = new Map<number | null, TemaComContagem[]>();
    for (const tema of this.temasFiltrados()) {
      const chave = tema.periodo;
      const grupo = grupos.get(chave);
      if (grupo) grupo.push(tema);
      else grupos.set(chave, [tema]);
    }
    return Array.from(grupos.entries())
      .sort(([a], [b]) => {
        if (a == null) return 1;
        if (b == null) return -1;
        return a - b;
      })
      .map(([periodo, temas]) => ({
        periodo,
        label: periodo != null ? `${periodo}º período` : 'Sem período definido',
        temas,
      }));
  });

  protected readonly resumoTemas = computed(() => {
    const selecionados = this.temasSelecionados();
    if (selecionados.size === 0) return 'Todos os temas';
    const nomes = this.temas()
      .filter((t) => selecionados.has(t.id))
      .map((t) => t.nome);
    if (nomes.length <= 3) return nomes.join(', ');
    return `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}`;
  });

  protected readonly aviso = computed<string | null>(() => {
    const disponivel = this.questoesDisponiveis();
    const qtd = this.quantidade();
    if (disponivel === 0 && this.temasSelecionados().size > 0) {
      return 'Os temas selecionados não possuem questões cadastradas para este formato. Escolha outros temas.';
    }
    if (disponivel > 0 && disponivel < qtd) {
      const questaoLabel = disponivel === 1 ? 'questão disponível' : 'questões disponíveis';
      const geradoLabel = disponivel === 1 ? '1 questão' : `${disponivel} questões`;
      return `Apenas ${disponivel} ${questaoLabel} para os temas selecionados. O simulado será gerado com ${geradoLabel}.`;
    }
    return null;
  });

  protected readonly desabilitado = computed(() => {
    if (this.gerando()) return true;
    if (this.isLoadingTemas()) return true;
    const disponivel = this.questoesDisponiveis();
    if (this.temasSelecionados().size > 0 && disponivel === 0) return true;
    return false;
  });

  protected readonly botaoLabel = computed(() => {
    if (this.gerando()) return 'Gerando...';
    if (this.desabilitado() && !this.gerando()) return 'Selecione temas com questões';
    return 'Gerar simulado';
  });

  constructor() {
    // Navega instantaneamente; os temas são buscados aqui, sem bloquear a rota.
    if (this.isBrowser) {
      void this.nav.track(this.carregarTemasIniciais());
    }
  }

  private async carregarTemasIniciais(): Promise<void> {
    this.isLoadingTemas.set(true);
    this.loadError.set(null);
    try {
      const result = await this.temaService.listarTemasComContagem(
        this.formatoAtual().tipoQuestao,
        this.formatoQuestaoSelecionado(),
      );
      if (result.ok) {
        this.temas.set(result.data);
        this.aplicarPreSelecao();
      } else {
        this.loadError.set(result.error);
      }
    } finally {
      this.isLoadingTemas.set(false);
    }
  }

  private aplicarPreSelecao(): void {
    const params = this.route.snapshot.queryParamMap;
    const temaId = params.get('temaId');
    const temaNome = params.get('tema');
    const qtdParam = Number(params.get('qtd'));
    const modoParam = params.get('modo');
    const formatoParam = params.get('formato') as FormatoSimulado | null;

    if (Number.isFinite(qtdParam) && this.opcoesQtd.includes(qtdParam)) {
      this.quantidade.set(qtdParam);
    }
    if (modoParam === 'estudo' || modoParam === 'simulado') {
      this.modoSelecionado.set(modoParam);
    }
    if (formatoParam && FORMATOS.some((f) => f.value === formatoParam)) {
      this.formatoSelecionado.set(formatoParam);
    }

    const tema = this.temasComQuestoes().find((t) => {
      if (temaId) return t.id === temaId;
      if (!temaNome) return false;
      return normalizarTexto(t.nome) === normalizarTexto(temaNome);
    });

    if (tema) {
      this.temasSelecionados.set(new Set([tema.id]));
      this.origemRecomendacao.set(tema.nome);
    }
  }

  protected async selecionarFormato(formato: FormatoSimulado): Promise<void> {
    if (formato === this.formatoSelecionado()) return;
    if (this.isLoadingTemas()) return;
    this.formatoSelecionado.set(formato);
    this.temasSelecionados.set(new Set());
    this.buscaTema.set('');
    this.erro.set(null);
    await this.recarregarTemas();
  }

  protected async selecionarFormatoQuestao(formato: FormatoQuestao): Promise<void> {
    if (formato === this.formatoQuestaoSelecionado()) return;
    if (this.isLoadingTemas()) return;
    // A contagem por tema depende do formato (discursivas/fechadas/misto);
    // recarrega para não oferecer temas sem questões daquele formato.
    this.formatoQuestaoSelecionado.set(formato);
    this.temasSelecionados.set(new Set());
    this.erro.set(null);
    await this.recarregarTemas();
  }

  private async recarregarTemas(): Promise<void> {
    this.isLoadingTemas.set(true);
    this.isRecarregandoFormato.set(true);
    this.loadError.set(null);
    try {
      const tipoQuestao = this.formatoAtual().tipoQuestao;
      const result = await this.temaService.listarTemasComContagem(
        tipoQuestao,
        this.formatoQuestaoSelecionado(),
      );
      if (result.ok) {
        this.temas.set(result.data);
      } else {
        this.temas.set([]);
        this.loadError.set(result.error);
      }
    } finally {
      this.isLoadingTemas.set(false);
      this.isRecarregandoFormato.set(false);
    }
  }

  protected toggleTema(temaId: string): void {
    this.erro.set(null);
    this.temasSelecionados.update((set) => {
      const next = new Set(set);
      if (next.has(temaId)) next.delete(temaId);
      else next.add(temaId);
      return next;
    });
  }

  protected limparTemas(): void {
    this.erro.set(null);
    this.temasSelecionados.set(new Set());
  }

  protected onPeriodosChange(values: (string | number)[]): void {
    this.periodosSelecionados.set(new Set(values.map(Number)));
  }

  protected selecionarTodosComQuestoes(): void {
    this.erro.set(null);
    const ids = this.temasFiltradosComQuestoes().map((t) => t.id);
    this.temasSelecionados.set(new Set(ids));
  }

  protected setQuantidade(qtd: number): void {
    this.erro.set(null);
    this.quantidade.set(qtd);
  }

  protected onModoChange(modo: ModoProva): void {
    this.modoSelecionado.set(modo);
  }

  protected async imprimirApenas(): Promise<void> {
    if (this.desabilitado()) return;
    this.imprimindo.set(true);
    this.erro.set(null);

    const temaIds = Array.from(this.temasSelecionados());
    const result = await this.impressaoService.gerarParaImpressao(
      temaIds.length > 0 ? temaIds : null,
      this.quantidade(),
      this.formatoAtual().tipoQuestao,
      this.formatoSelecionado() === 'todos' ? null : this.formatoSelecionado(),
    );

    this.imprimindo.set(false);

    if (result.ok) {
      void this.router.navigate(['/imprimir/simulado/montado']);
    } else if (result.error === TIER_UPGRADE_REQUIRED) {
      void this.router.navigate(['/planos']);
    } else {
      this.erro.set(result.error);
    }
  }

  protected async gerar(): Promise<void> {
    if (this.desabilitado()) return;
    this.gerando.set(true);
    this.erro.set(null);

    const temaIds = Array.from(this.temasSelecionados());
    const result = await this.tentativaService.gerarSimuladoPersonalizado(
      temaIds.length > 0 ? temaIds : null,
      this.quantidade(),
      this.modoSelecionado(),
      this.formatoSelecionado(),
      this.formatoQuestaoSelecionado(),
    );

    this.gerando.set(false);

    if (result.ok) {
      const { prova_id, tentativa } = result.data;
      const nomeProva = this.formatoSelecionado() === 'todos'
        ? 'Simulado personalizado'
        : `Simulado ${this.formatoAtual().label}`;
      this.tentativaService.setProvaNome(nomeProva);
      void this.router.navigate(['/dashboard/simulados', prova_id, 'tentativa', tentativa.id]);
    } else if (result.error === TIER_UPGRADE_REQUIRED) {
      void this.router.navigate(['/planos']);
    } else {
      this.erro.set(result.error);
    }
  }
}

function normalizarTexto(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}
