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

  constructor() {
    // Navega instantaneamente; os dados são buscados aqui, sem bloquear a rota.
    if (this.isBrowser) {
      void this.nav.track(this.carregarProvas());
    }
  }

  protected async carregarProvas(): Promise<void> {
    this.erro.set(null);
    this.isLoading.set(true);
    const result = await this.provaService.listarProvasNacionais({
      rede: 'afya',
      subtipos: this.subtiposFiltro(),
      periodos: this.periodosFiltro(),
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

  private async recarregarPrimeiraPagina(): Promise<void> {
    this.pagina.set(0);
    await this.carregarProvas();
  }

  protected onSubtipoChange(values: (string | number)[]): void {
    this.subtiposFiltro.set(values as SubtipoProva[]);
    void this.recarregarPrimeiraPagina();
  }

  protected onPeriodoChange(values: (string | number)[]): void {
    this.periodosFiltro.set(values.map(Number));
    void this.recarregarPrimeiraPagina();
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
