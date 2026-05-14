import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TentativaService } from '../../../core/services/tentativa.service';
import { ProvaService } from '../../../core/services/prova.service';
import type { ResultadoTentativa } from '../../../core/models/tentativa';
import { ResultadoSummaryComponent } from '../../../shared/components/resultado-summary/resultado-summary.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-tentativa-resultado',
  standalone: true,
  imports: [ResultadoSummaryComponent, EmptyStateComponent, RouterLink],
  templateUrl: './tentativa-resultado.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TentativaResultadoComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tentativaService = inject(TentativaService);
  private readonly provaService = inject(ProvaService);

  protected readonly resultado = signal<ResultadoTentativa | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly isPersonalizado = signal(false);
  protected readonly backRota = signal('/dashboard/simulados');
  protected readonly backLabel = signal('Todos os simulados');
  protected readonly notaAnterior = signal<number | null>(null);

  async ngOnInit(): Promise<void> {
    const tentativaId = this.route.snapshot.paramMap.get('tentativaId') ?? '';
    const provaId = this.route.snapshot.paramMap.get('provaId') ?? '';

    const navState = history.state as { fromHistorico?: boolean } | null;
    if (navState?.fromHistorico) {
      this.backRota.set('/dashboard/historico');
      this.backLabel.set('Histórico');
    }

    // Usa o resultado já armazenado pelo exec (fluxo normal — evita dupla chamada à RPC)
    const cached = this.tentativaService.lastResultado();
    if (cached?.tentativa.id === tentativaId) {
      this.resultado.set(cached);
    } else {
      // Fallback: navegação direta por URL (F5, link compartilhado)
      const result = await this.tentativaService.finalizar(tentativaId);
      if (result.ok) {
        this.resultado.set(result.data);
        this.tentativaService.setLastResultado(result.data);
      } else {
        this.erro.set(result.error);
        this.isLoading.set(false);
        return;
      }
    }

    // Detecta se é simulado personalizado
    if (provaId) {
      const provaResult = await this.provaService.buscarProva(provaId);
      if (provaResult.ok) {
        this.isPersonalizado.set(provaResult.data.tipo === 'processual' && provaResult.data.edicao < 0);
      }
    }

    // Busca nota da tentativa anterior (não bloqueia loading)
    const res = this.resultado();
    if (res) {
      const anterior = await this.tentativaService.buscarNotaAnterior(
        res.tentativa.prova_id,
        res.tentativa.id,
      );
      this.notaAnterior.set(anterior);
    }

    this.isLoading.set(false);
  }

}
