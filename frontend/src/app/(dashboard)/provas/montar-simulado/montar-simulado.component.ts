import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Shuffle, Filter, LoaderCircle } from 'lucide-angular';
import { TentativaService } from '../../../core/services/tentativa.service';
import { TemaService } from '../../../core/services/tema.service';
import type { MontarSimuladoResolvedData } from '../../../core/resolvers/montar-simulado.resolver';
import type { TemaComContagem } from '../../../core/models/tema';
import type { ModoProva } from '../../../core/models/tentativa';
import { UiButtonComponent } from '../../../shared/components/ui/button/ui-button.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { ModoSelectorComponent } from '../../../shared/components/modo-selector/modo-selector.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';

type FormatoSimulado = 'todos' | 'processual' | 'laboratorio';

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
    descricao: 'Sorteio sem filtrar por tipo de prova',
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
  imports: [UiButtonComponent, UiIconComponent, ModoSelectorComponent, PageHeaderComponent],
  templateUrl: './montar-simulado.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MontarSimuladoComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tentativaService = inject(TentativaService);
  private readonly temaService = inject(TemaService);

  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Simulados', route: '/dashboard/simulados' },
    { label: 'Montar simulado' },
  ];

  protected readonly shuffleIcon = Shuffle;
  protected readonly filterIcon = Filter;
  protected readonly loaderIcon = LoaderCircle;

  protected readonly formatos = FORMATOS;

  protected readonly formatoSelecionado = signal<FormatoSimulado>('todos');
  protected readonly temas = signal<TemaComContagem[]>([]);
  protected readonly isLoadingTemas = signal(true);
  protected readonly isRecarregandoFormato = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly temasSelecionados = signal<Set<string>>(new Set());
  protected readonly buscaTema = signal('');
  protected readonly quantidade = signal(10);
  protected readonly modoSelecionado = signal<ModoProva>('simulado');
  protected readonly origemRecomendacao = signal<string | null>(null);
  protected readonly gerando = signal(false);
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

  protected readonly temasFiltrados = computed(() => {
    const busca = normalizarTexto(this.buscaTema());
    if (!busca) return this.temas();
    return this.temas().filter((t) => normalizarTexto(t.nome).includes(busca));
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
    const resolved = this.route.snapshot.data['montarSimuladoData'] as MontarSimuladoResolvedData | undefined;
    if (resolved?.temasResult.ok) {
      this.temas.set(resolved.temasResult.data);
      this.aplicarPreSelecao();
    } else if (resolved && !resolved.temasResult.ok) {
      this.loadError.set(resolved.temasResult.error);
    }
    this.isLoadingTemas.set(false);
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

  private async recarregarTemas(): Promise<void> {
    this.isLoadingTemas.set(true);
    this.isRecarregandoFormato.set(true);
    this.loadError.set(null);
    try {
      const tipoQuestao = this.formatoAtual().tipoQuestao;
      const result = await this.temaService.listarTemasComContagem(tipoQuestao);
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

  protected selecionarTodosComQuestoes(): void {
    this.erro.set(null);
    const ids = this.temasComQuestoes().map((t) => t.id);
    this.temasSelecionados.set(new Set(ids));
  }

  protected setQuantidade(qtd: number): void {
    this.erro.set(null);
    this.quantidade.set(qtd);
  }

  protected onModoChange(modo: ModoProva): void {
    this.modoSelecionado.set(modo);
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
    );

    this.gerando.set(false);

    if (result.ok) {
      const { prova_id, tentativa } = result.data;
      const nomeProva = this.formatoSelecionado() === 'todos'
        ? 'Simulado personalizado'
        : `Simulado ${this.formatoAtual().label}`;
      this.tentativaService.setProvaNome(nomeProva);
      void this.router.navigate(['/dashboard/simulados', prova_id, 'tentativa', tentativa.id]);
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
