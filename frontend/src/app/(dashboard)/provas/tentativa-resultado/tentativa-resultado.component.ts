import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TentativaService } from '../../../core/services/tentativa.service';
import { ProvaService } from '../../../core/services/prova.service';
import { CorrecaoIaService } from '../../../core/services/correcao-ia.service';
import type { ResultadoTentativa } from '../../../core/models/tentativa';
import { ResultadoSummaryComponent } from '../../../shared/components/resultado-summary/resultado-summary.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

const POLL_INTERVAL_MS = 3_000;
const TIMEOUT_CORRECOES_MS = 90_000;

@Component({
  selector: 'app-tentativa-resultado',
  standalone: true,
  imports: [ResultadoSummaryComponent, EmptyStateComponent, RouterLink],
  templateUrl: './tentativa-resultado.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TentativaResultadoComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly tentativaService = inject(TentativaService);
  private readonly provaService = inject(ProvaService);
  private readonly correcaoIa = inject(CorrecaoIaService);

  protected readonly resultado = signal<ResultadoTentativa | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly isPersonalizado = signal(false);
  protected readonly backRota = signal('/dashboard/simulados');
  protected readonly backLabel = signal('Todos os simulados');
  protected readonly notaAnterior = signal<number | null>(null);

  // ---- Correções de IA (estado bloqueante) ----
  protected readonly corrigindo = signal(false);
  protected readonly correcoesTotal = signal(0);
  protected readonly correcoesResolvidas = signal(0);
  /** Timeout esgotado: nota fechada sem as correções restantes (sem_ia). */
  protected readonly correcoesForcadas = signal(false);

  protected readonly progressoCorrecoes = computed(() => {
    const total = this.correcoesTotal();
    if (total === 0) return '';
    return `${this.correcoesResolvidas()}/${total}`;
  });

  private destruido = false;
  private tentativaId = '';

  async ngOnInit(): Promise<void> {
    this.tentativaId = this.route.snapshot.paramMap.get('tentativaId') ?? '';
    const provaId = this.route.snapshot.paramMap.get('provaId') ?? '';

    const navState = history.state as { fromHistorico?: boolean } | null;
    if (navState?.fromHistorico) {
      this.backRota.set('/dashboard/historico');
      this.backLabel.set('Histórico');
    }

    // Usa o resultado já armazenado pelo exec (fluxo normal — evita dupla chamada à RPC)
    const cached = this.tentativaService.lastResultado();
    if (cached?.tentativa.id === this.tentativaId) {
      this.resultado.set(cached);
    } else {
      // Fallback: navegação direta por URL (F5, link compartilhado)
      const result = await this.tentativaService.finalizar(this.tentativaId);
      if (result.ok) {
        this.resultado.set(result.data);
        this.tentativaService.setLastResultado(result.data);
      } else {
        this.erro.set(result.error);
        this.isLoading.set(false);
        return;
      }
    }

    // Correções de IA pendentes bloqueiam a nota — resolve antes de exibir.
    const pendentes = this.resultado()?.correcoes_pendentes ?? 0;
    const notaAberta = this.resultado()?.tentativa.nota == null;
    if (pendentes > 0 || notaAberta) {
      await this.aguardarCorrecoes();
      if (this.destruido) return;
    }

    // Detecta se é simulado personalizado ('removida' = prova deletada pelo admin)
    if (provaId && provaId !== 'removida') {
      const provaResult = await this.provaService.buscarProva(provaId);
      if (provaResult.ok) {
        this.isPersonalizado.set(provaResult.data.origem === 'personalizado');
      }
    }

    // Busca nota da tentativa anterior (não bloqueia loading)
    const res = this.resultado();
    if (res?.tentativa.prova_id) {
      const anterior = await this.tentativaService.buscarNotaAnterior(
        res.tentativa.prova_id,
        res.tentativa.id,
      );
      this.notaAnterior.set(anterior);
    }

    this.isLoading.set(false);
  }

  ngOnDestroy(): void {
    this.destruido = true;
  }

  /**
   * Loop bloqueante: re-dispara a correção de pendentes/erros, faz poll do
   * status a cada ~3s e consolida a nota quando tudo resolve. Após 90s,
   * força as restantes para sem_ia (excluídas do denominador).
   */
  private async aguardarCorrecoes(): Promise<void> {
    this.corrigindo.set(true);
    const inicio = Date.now();
    const jaDisparadas = new Set<string>();

    while (!this.destruido) {
      const status = await this.tentativaService.getStatusCorrecoes(this.tentativaId);

      if (status.ok) {
        this.correcoesTotal.set(status.data.total);
        this.correcoesResolvidas.set(
          status.data.corrigidas + status.data.sem_ia,
        );

        const paradas = status.data.itens.filter(
          (i) => i.status === 'pendente' || i.status === 'erro',
        );

        if (status.data.pendentes === 0 && status.data.erros === 0) {
          // Tudo resolvido — consolida e substitui o resultado pelo definitivo.
          const consolidado = await this.tentativaService.consolidarCorrecoes(this.tentativaId);
          if (consolidado.ok && consolidado.data.consolidada) {
            this.resultado.set(consolidado.data);
            this.tentativaService.setLastResultado(consolidado.data);
            // XP só é concedido com a nota fechada (RPC idempotente)
            await this.tentativaService.registrarXpTentativa(this.tentativaId);
            break;
          }
        }

        // Re-dispara correções paradas (pendente nunca processada ou erro),
        // uma vez cada — a edge function faz claim idempotente.
        for (const item of paradas) {
          if (!jaDisparadas.has(item.tentativa_resposta_id)) {
            jaDisparadas.add(item.tentativa_resposta_id);
            void this.correcaoIa.corrigir(item.tentativa_resposta_id);
          }
        }
      }

      if (Date.now() - inicio > TIMEOUT_CORRECOES_MS) {
        // Timeout: fecha a nota sem as correções restantes.
        const forcado = await this.tentativaService.consolidarCorrecoes(this.tentativaId, true);
        if (forcado.ok && forcado.data.consolidada) {
          this.resultado.set(forcado.data);
          this.tentativaService.setLastResultado(forcado.data);
          this.correcoesForcadas.set(true);
          await this.tentativaService.registrarXpTentativa(this.tentativaId);
        }
        break;
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    this.corrigindo.set(false);
  }
}
