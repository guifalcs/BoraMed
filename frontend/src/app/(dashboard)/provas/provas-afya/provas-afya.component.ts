import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ProvaService } from '../../../core/services/prova.service';
import type { Prova, SubtipoProva } from '../../../core/models/prova';
import type { ProvasAfyaResolvedData } from '../../../core/resolvers/provas-afya.resolver';
import { ProvaCardComponent } from '../../../shared/components/prova-card/prova-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { UiMultiselectComponent } from '../../../shared/components/ui/multiselect/ui-multiselect.component';
import type { SelectOption } from '../../../shared/components/ui/select/ui-select.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-provas-afya',
  standalone: true,
  imports: [ProvaCardComponent, EmptyStateComponent, UiMultiselectComponent, PageHeaderComponent],
  templateUrl: './provas-afya.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvasAfyaComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly provaService = inject(ProvaService);
  private readonly router = inject(Router);

  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Simulados', route: '/dashboard/simulados' },
    { label: 'Treinos nacionais' },
  ];

  protected readonly todasAsProvas = signal<Prova[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly subtiposFiltro = signal<SubtipoProva[]>([]);
  protected readonly periodosFiltro = signal<number[]>([]);

  protected readonly subtipoOpcoes: SelectOption[] = [
    { value: 'N1', label: 'N1' },
    { value: 'teste_progresso', label: 'TPI' },
    { value: 'N2', label: 'Integradora' },
  ];

  protected readonly periodoOpcoes: SelectOption[] = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: `${i + 1}º período`,
  }));

  protected readonly provasFiltradas = computed(() => {
    let lista = this.todasAsProvas();
    const subtipos = this.subtiposFiltro();
    const periodos = this.periodosFiltro();

    if (subtipos.length > 0) {
      lista = lista.filter((p) => {
        const subtipo = p.subtipo ?? p.subtipo_nacional;
        return subtipo !== null && subtipos.includes(subtipo);
      });
    }
    if (periodos.length > 0) {
      lista = lista.filter((p) => p.periodo != null && periodos.includes(p.periodo));
    }
    return lista;
  });

  constructor() {
    const resolved = this.route.snapshot.data['provasAfyaData'] as ProvasAfyaResolvedData | undefined;

    if (resolved?.provasResult.ok) {
      this.todasAsProvas.set(resolved.provasResult.data);
      this.isLoading.set(false);
    } else if (resolved && !resolved.provasResult.ok) {
      this.erro.set(resolved.provasResult.error);
      this.isLoading.set(false);
    }
  }

  protected async carregarProvas(): Promise<void> {
    this.erro.set(null);
    this.isLoading.set(true);
    const result = await this.provaService.listarProvasNacionais({
      subtipo: null,
      periodo: null,
      rede: 'afya',
    });
    if (result.ok) {
      this.todasAsProvas.set(result.data);
    } else {
      this.erro.set(result.error);
    }
    this.isLoading.set(false);
  }

  protected onSubtipoChange(values: (string | number)[]): void {
    this.subtiposFiltro.set(values as SubtipoProva[]);
  }

  protected onPeriodoChange(values: (string | number)[]): void {
    this.periodosFiltro.set(values.map(Number));
  }

  protected abrirProva(id: string): void {
    void this.router.navigate(['/dashboard/simulados', id]);
  }

  protected readonly titulo = 'Treinos nacionais';
  protected readonly descricao = 'Simulados autorais inspirados no formato das avaliações nacionais. BoraMed é independente e não representa a Afya.';
}
