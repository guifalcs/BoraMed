import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ChevronLeft, Stethoscope, FlaskConical, Zap } from 'lucide-angular';
import { ProvaService } from '../../../core/services/prova.service';
import type { Prova, SubtipoProva } from '../../../core/models/prova';
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
export class ProvasAfyaComponent implements OnInit {
  private readonly provaService = inject(ProvaService);
  private readonly router = inject(Router);

  protected readonly chevronLeftIcon = ChevronLeft;
  protected readonly stethoscopeIcon = Stethoscope;
  protected readonly flaskIcon = FlaskConical;
  protected readonly zapIcon = Zap;

  protected readonly todasAsProvas = signal<Prova[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly subtiposFiltro = signal<SubtipoProva[]>([]);
  protected readonly periodosFiltro = signal<number[]>([]);
  protected readonly anosFiltro = signal<number[]>([]);

  protected readonly subtipoOpcoes: SelectOption[] = [
    { value: 'N1', label: 'N1' },
    { value: 'teste_progresso', label: 'TPI' },
    { value: 'N2', label: 'Integradora' },
  ];

  protected readonly periodoOpcoes: SelectOption[] = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: `${i + 1}º período`,
  }));

  protected readonly anoOpcoes = computed<SelectOption[]>(() =>
    [...new Set(this.todasAsProvas().map((p) => p.ano).filter((a): a is number => a != null))]
      .sort((a, b) => b - a)
      .map((ano) => ({ value: ano, label: String(ano) })),
  );

  protected readonly provasFiltradas = computed(() => {
    let lista = this.todasAsProvas();
    const subtipos = this.subtiposFiltro();
    const periodos = this.periodosFiltro();
    const anos = this.anosFiltro();

    if (subtipos.length > 0) {
      lista = lista.filter((p) => p.subtipo_nacional && subtipos.includes(p.subtipo_nacional));
    }
    if (periodos.length > 0) {
      lista = lista.filter((p) => p.periodo != null && periodos.includes(p.periodo));
    }
    if (anos.length > 0) {
      lista = lista.filter((p) => p.ano != null && anos.includes(p.ano));
    }
    return lista;
  });

  async ngOnInit(): Promise<void> {
    const result = await this.provaService.listarProvasNacionais({
      subtipo: null,
      periodo: null,
      ano: null,
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

  protected onAnoChange(values: (string | number)[]): void {
    this.anosFiltro.set(values.map(Number));
  }

  protected abrirProva(id: string): void {
    void this.router.navigate(['/dashboard/provas', id]);
  }
}
