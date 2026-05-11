import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BookOpen, ChevronLeft } from 'lucide-angular';
import { ProvaService } from '../../../core/services/prova.service';
import type { Prova, FiltrosProvas } from '../../../core/models/prova';
import { ProvaCardComponent } from '../../../shared/components/prova-card/prova-card.component';
import { FiltrosProvasComponent } from '../../../shared/components/filtros-provas/filtros-provas.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';

@Component({
  selector: 'app-provas-nacional-lista',
  standalone: true,
  imports: [RouterLink, ProvaCardComponent, FiltrosProvasComponent, EmptyStateComponent, UiIconComponent],
  templateUrl: './provas-nacional-lista.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvasNacionalListaComponent implements OnInit {
  private readonly provaService = inject(ProvaService);
  private readonly router = inject(Router);

  protected readonly bookOpenIcon = BookOpen;
  protected readonly chevronLeftIcon = ChevronLeft;

  protected readonly provas = signal<Prova[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly filtros = signal<FiltrosProvas>({ subtipo: null, periodo: null, ano: null });

  async ngOnInit(): Promise<void> {
    await this.carregarProvas();
  }

  protected async onFiltrosChange(novos: FiltrosProvas): Promise<void> {
    this.filtros.set(novos);
    await this.carregarProvas();
  }

  protected onAbrirProva(id: string): void {
    void this.router.navigate(['/dashboard/provas', id]);
  }

  protected async carregarProvas(): Promise<void> {
    this.isLoading.set(true);
    this.erro.set(null);

    const result = await this.provaService.listarProvasNacionais(this.filtros());

    if (result.ok) {
      this.provas.set(result.data);
    } else {
      this.erro.set(result.error);
    }

    this.isLoading.set(false);
  }
}
