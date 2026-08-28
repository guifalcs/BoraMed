import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  inject,
  signal,
  computed,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { ProvaService } from '../../../core/services/prova.service';
import { NavigationProgressService } from '../../../core/services/navigation-progress.service';
import type { Prova, SubtipoProva } from '../../../core/models/prova';
import type { Disciplina } from '../../../core/models/disciplina';
import { ProvaCardComponent } from '../../../shared/components/prova-card/prova-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { UiMultiselectComponent } from '../../../shared/components/ui/multiselect/ui-multiselect.component';
import type { SelectOption } from '../../../shared/components/ui/select/ui-select.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';

const POR_PAGINA = 15;

@Component({
  selector: 'app-provas-afya',
  standalone: true,
  imports: [ProvaCardComponent, EmptyStateComponent, UiMultiselectComponent, PageHeaderComponent],
  templateUrl: './provas-afya.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvasAfyaComponent {
  private readonly provaService = inject(ProvaService);
  private readonly router = inject(Router);
  private readonly nav = inject(NavigationProgressService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Simulados', route: '/dashboard/simulados' },
    { label: 'Treinos nacionais' },
  ];

  protected readonly provas = signal<Prova[]>([]);
  protected readonly total = signal(0);
  protected readonly isLoading = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly subtiposFiltro = signal<SubtipoProva[]>([]);
  protected readonly periodosFiltro = signal<number[]>([]);
  protected readonly materiasFiltro = signal<string[]>([]);
  protected readonly buscaFiltro = signal('');

  protected readonly disciplinas = signal<Disciplina[]>([]);
  protected readonly isLoadingDisciplinas = signal(true);

  private buscaDebounce: ReturnType<typeof setTimeout> | null = null;

  protected readonly porPagina = POR_PAGINA;
  protected readonly pagina = signal(0);

  protected readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.porPagina)),
  );

  protected readonly subtipoOpcoes: SelectOption[] = [
    { value: 'N1', label: 'N1' },
    { value: 'N2', label: 'N2' },
    { value: 'teste_progresso', label: 'TPI' },
    { value: 'integradora', label: 'Integradora' },
  ];

  protected readonly periodoOpcoes: SelectOption[] = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: `${i + 1}º período`,
  }));

  /**
   * Matérias agrupadas por período (1º, 2º, ...) para o filtro hierárquico.
   * Sem período selecionado, mostra todas; com período(s) selecionado(s),
   * restringe às matérias desses períodos.
   */
  protected readonly materiaOpcoes = computed<SelectOption[]>(() => {
    const periodos = this.periodosFiltro();
    const disciplinas =
      periodos.length > 0
        ? this.disciplinas().filter((d) => periodos.includes(d.periodo))
        : this.disciplinas();
    return disciplinas.map((d) => ({
      value: d.id,
      // Sigla sem o algarismo romano do período (ex: "SOI I" → "SOI") — o
      // período já aparece como cabeçalho do grupo.
      label: d.sigla.replace(/\s+[IVXLCDM]+$/i, ''),
      group: `${d.periodo}º período`,
    }));
  });

  constructor() {
    // Navega instantaneamente; os dados são buscados aqui, sem bloquear a rota.
    if (this.isBrowser) {
      void this.nav.track(this.carregarProvas());
      void this.carregarDisciplinas();
    }
  }

  private async carregarDisciplinas(): Promise<void> {
    this.isLoadingDisciplinas.set(true);
    try {
      const result = await this.provaService.listarDisciplinas();
      if (result.ok) this.disciplinas.set(result.data);
    } finally {
      this.isLoadingDisciplinas.set(false);
    }
  }

  protected async carregarProvas(): Promise<void> {
    this.erro.set(null);
    this.isLoading.set(true);
    const result = await this.provaService.listarProvasNacionais({
      rede: 'afya',
      subtipos: this.subtiposFiltro(),
      periodos: this.periodosEfetivos(),
      disciplinaIds: this.materiasFiltro(),
      busca: this.buscaFiltro(),
      pagina: this.pagina(),
      porPagina: this.porPagina,
    });
    if (result.ok) {
      this.provas.set(result.data.provas);
      this.total.set(result.data.total);
    } else {
      this.erro.set(result.error);
    }
    this.isLoading.set(false);
  }

  /**
   * Períodos a enviar na busca. Uma matéria pertence a um único período, então
   * filtrar por matéria implica filtrar pelo período dela. Amarrar o período à
   * matéria impede que uma prova com `disciplina_id` de período divergente do
   * seu `periodo` (dado inconsistente) vaze no filtro — ex: filtrar "4º período"
   * e aparecer prova do 1º. Quando o período também é escolhido à mão, cai na
   * interseção; sem matéria selecionada, usa apenas o filtro de período.
   */
  private periodosEfetivos(): number[] {
    const materias = this.materiasFiltro();
    if (materias.length === 0) return this.periodosFiltro();

    const periodosDasMaterias = [
      ...new Set(
        this.disciplinas()
          .filter((d) => materias.includes(d.id))
          .map((d) => d.periodo),
      ),
    ];

    const periodosManuais = this.periodosFiltro();
    if (periodosManuais.length === 0) return periodosDasMaterias;
    return periodosManuais.filter((p) => periodosDasMaterias.includes(p));
  }

  private async recarregarPrimeiraPagina(): Promise<void> {
    this.pagina.set(0);
    await this.carregarProvas();
  }

  protected onSubtipoChange(values: (string | number)[]): void {
    this.subtiposFiltro.set(values as SubtipoProva[]);
    void this.recarregarPrimeiraPagina();
  }

  protected onPeriodoChange(values: (string | number)[]): void {
    const periodos = values.map(Number);
    this.periodosFiltro.set(periodos);

    // Matérias já selecionadas que não pertencem mais aos períodos escolhidos
    // saem do filtro — senão ficam "escondidas" no multiselect (fora das
    // opções visíveis) mas continuam valendo na busca.
    if (periodos.length > 0) {
      const materiasValidas = new Set(
        this.disciplinas()
          .filter((d) => periodos.includes(d.periodo))
          .map((d) => d.id),
      );
      const materiasFiltradas = this.materiasFiltro().filter((id) => materiasValidas.has(id));
      if (materiasFiltradas.length !== this.materiasFiltro().length) {
        this.materiasFiltro.set(materiasFiltradas);
      }
    }

    void this.recarregarPrimeiraPagina();
  }

  protected onMateriaChange(values: (string | number)[]): void {
    this.materiasFiltro.set(values as string[]);
    void this.recarregarPrimeiraPagina();
  }

  protected onBuscaInput(event: Event): void {
    const valor = (event.target as HTMLInputElement).value;
    this.buscaFiltro.set(valor);
    if (this.buscaDebounce) clearTimeout(this.buscaDebounce);
    this.buscaDebounce = setTimeout(() => {
      void this.recarregarPrimeiraPagina();
    }, 350);
  }

  protected paginaAnterior(): void {
    if (this.pagina() === 0) return;
    this.pagina.update((p) => p - 1);
    void this.carregarProvas();
  }

  protected proximaPagina(): void {
    if (this.pagina() >= this.totalPaginas() - 1) return;
    this.pagina.update((p) => p + 1);
    void this.carregarProvas();
  }

  protected abrirProva(id: string): void {
    void this.router.navigate(['/dashboard/simulados', id]);
  }

  protected readonly titulo = 'Treinos nacionais';
  protected readonly descricao = 'Simulados autorais inspirados no formato das avaliações nacionais. BoraMed é independente e não representa a Afya.';
}
