import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TentativaService } from '../../../core/services/tentativa.service';
import type { ResultadoTentativa } from '../../../core/models/tentativa';
import { ResultadoSummaryComponent } from '../../../shared/components/resultado-summary/resultado-summary.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-tentativa-resultado',
  standalone: true,
  imports: [ResultadoSummaryComponent, EmptyStateComponent],
  templateUrl: './tentativa-resultado.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TentativaResultadoComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tentativaService = inject(TentativaService);

  protected readonly resultado = signal<ResultadoTentativa | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly erro = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const tentativaId = this.route.snapshot.paramMap.get('tentativaId') ?? '';
    const provaId = this.route.snapshot.paramMap.get('provaId') ?? '';

    const result = await this.tentativaService.finalizar(tentativaId);

    if (result.ok) {
      this.resultado.set(result.data);
    } else {
      this.erro.set(result.error);
    }

    this.isLoading.set(false);
  }

  protected onVoltar(): void {
    const provaId = this.route.snapshot.paramMap.get('provaId') ?? '';
    void this.router.navigate(['/dashboard/provas', provaId]);
  }

  protected onRefazer(): void {
    const provaId = this.route.snapshot.paramMap.get('provaId') ?? '';
    void this.router.navigate(['/dashboard/provas', provaId]);
  }
}
