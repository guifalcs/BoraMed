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
import { UiSelectComponent, SelectOption } from '../../../shared/components/ui/select/ui-select.component';

type SubtipoFiltro = 'todas' | SubtipoProva;

@Component({
  selector: 'app-provas-afya',
  standalone: true,
  imports: [RouterLink, ProvaCardComponent, EmptyStateComponent, UiIconComponent, UiSelectComponent],
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

  protected readonly subtipoAtivo = signal<SubtipoFiltro>('todas');
  protected readonly periodoFiltro = signal<number | null>(null);
  protected readonly anoFiltro = signal<number | null>(null);

  protected readonly subtipoPills: { value: SubtipoFiltro; label: string }[] = [
    { value: 'todas', label: 'Todas' },
    { value: 'N1', label: 'N1' },
    { value: 'teste_progresso', label: 'Teste de Progresso' },
    { value: 'N2', label: 'N2 — Integradora' },
  ];

  protected readonly periodoOpcoes: SelectOption[] = [
    { value: '', label: 'Todos os períodos' },
    ...Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}º período` })),
  ];

  protected readonly anoOpcoes: SelectOption[] = [
    { value: '', label: 'Todos os anos' },
    ...Array.from({ length: 6 }, (_, i) => ({ value: 2024 - i, label: String(2024 - i) })),
  ];

  protected readonly provasFiltradas = computed(() => {
    let lista = this.todasAsProvas();
    const subtipo = this.subtipoAtivo();
    const periodo = this.periodoFiltro();
    const ano = this.anoFiltro();

    if (subtipo !== 'todas') {
      lista = lista.filter((p) => p.subtipo_nacional === subtipo);
    }
    if (periodo) {
      lista = lista.filter((p) => p.periodo === periodo);
    }
    if (ano) {
      lista = lista.filter((p) => p.ano === ano);
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

  protected setSubtipo(s: SubtipoFiltro): void {
    this.subtipoAtivo.set(s);
  }

  protected onPeriodoChange(v: string | number | null): void {
    this.periodoFiltro.set(v ? Number(v) : null);
  }

  protected onAnoChange(v: string | number | null): void {
    this.anoFiltro.set(v ? Number(v) : null);
  }

  protected abrirProva(id: string): void {
    void this.router.navigate(['/dashboard/provas', id]);
  }
}
