import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ChevronLeft, Stethoscope, FlaskConical, Zap } from 'lucide-angular';
import { ProvaService } from '../../../core/services/prova.service';
import type { FormatoProva, Prova, SubtipoProva } from '../../../core/models/prova';
import type { ProvasAfyaResolvedData } from '../../../core/resolvers/provas-afya.resolver';
import { ProvaCardComponent } from '../../../shared/components/prova-card/prova-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';
import { UiMultiselectComponent } from '../../../shared/components/ui/multiselect/ui-multiselect.component';
import type { SelectOption } from '../../../shared/components/ui/select/ui-select.component';

@Component({
  selector: 'app-provas-afya',
  standalone: true,
  imports: [RouterLink, ProvaCardComponent, EmptyStateComponent, UiIconComponent, UiMultiselectComponent],
  templateUrl: './provas-afya.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvasAfyaComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly provaService = inject(ProvaService);
  private readonly router = inject(Router);

  protected readonly chevronLeftIcon = ChevronLeft;
  protected readonly stethoscopeIcon = Stethoscope;
  protected readonly flaskIcon = FlaskConical;
  protected readonly zapIcon = Zap;

  protected readonly todasAsProvas = signal<Prova[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly formatoAtual = signal<FormatoProva>('nacional');

  protected readonly subtiposFiltro = signal<SubtipoProva[]>([]);
  protected readonly periodosFiltro = signal<number[]>([]);

  protected readonly subtipoOpcoes = computed<SelectOption[]>(() =>
    this.formatoAtual() === 'nacional'
      ? [
          { value: 'N1', label: 'N1' },
          { value: 'teste_progresso', label: 'TPI' },
          { value: 'N2', label: 'Integradora' },
        ]
      : [],
  );

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
    const formatoInicial = parseFormato(this.route.snapshot.queryParamMap.get('tipo'));
    this.formatoAtual.set(formatoInicial);

    if (resolved?.provasResult.ok) {
      this.todasAsProvas.set(resolved.provasResult.data);
      this.isLoading.set(false);
    } else if (resolved && !resolved.provasResult.ok) {
      this.erro.set(resolved.provasResult.error);
      this.isLoading.set(false);
    }

    if (formatoInicial !== 'nacional') {
      void this.carregarProvas();
    }

    this.route.queryParamMap.subscribe((params) => {
      const formato = parseFormato(params.get('tipo'));
      if (formato === this.formatoAtual()) return;
      this.formatoAtual.set(formato);
      this.subtiposFiltro.set([]);
      void this.carregarProvas();
    });
  }

  protected async carregarProvas(): Promise<void> {
    this.erro.set(null);
    this.isLoading.set(true);
    const result = await this.provaService.listarProvasPorFormato(this.formatoAtual(), {
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

  protected readonly titulo = computed(() => {
    switch (this.formatoAtual()) {
      case 'processual': return 'Treinos processuais';
      case 'laboratorio': return 'Treinos de laboratório';
      default: return 'Treinos nacionais';
    }
  });

  protected readonly descricao = computed(() => {
    switch (this.formatoAtual()) {
      case 'processual': return 'Simulados autorais inspirados no formato das avaliações processuais. BoraMed é independente e não representa a Afya.';
      case 'laboratorio': return 'Questões autorais com imagens de lâminas e peças no modelo de laboratório. BoraMed é independente e não representa a Afya.';
      default: return 'Simulados autorais inspirados no formato das avaliações nacionais. BoraMed é independente e não representa a Afya.';
    }
  });
}

function parseFormato(value: string | null): FormatoProva {
  if (value === 'processual' || value === 'laboratorio') return value;
  return 'nacional';
}
