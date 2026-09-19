import { ChangeDetectionStrategy, Component, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ArrowRight, Undo2 } from 'lucide-angular';
import type { QuestaoComAlternativas } from '../../../core/models/questao';
import type { ModoProva } from '../../../core/models/tentativa';
import { CadernoErrosService } from '../../../core/services/caderno-erros.service';
import { QuestaoCardComponent } from '../../../shared/components/questao-card/questao-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent, type Breadcrumb } from '../../../shared/components/page-header/page-header.component';
import { UiIconComponent } from '../../../shared/components/ui/icon/ui-icon.component';

@Component({
  selector: 'app-refazer-questao',
  standalone: true,
  imports: [QuestaoCardComponent, EmptyStateComponent, PageHeaderComponent, UiIconComponent],
  templateUrl: './refazer-questao.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RefazerQuestaoComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cadernoErrosService = inject(CadernoErrosService);

  /** Fila de questões pendentes vinda do Caderno de Erros (navegação [state]); vazia quando acessado direto. */
  private filaIds: string[] = [];

  protected readonly breadcrumbs: Breadcrumb[] = [
    { label: 'Início', route: '/dashboard' },
    { label: 'Caderno de Erros', route: '/dashboard/caderno-de-erros' },
    { label: 'Refazer questão' },
  ];

  protected readonly proximaIcon = ArrowRight;
  protected readonly voltarIcon = Undo2;
  protected readonly modoEstudo: ModoProva = 'estudo';

  private readonly _paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  protected readonly questaoId = () => this._paramMap().get('questaoId') ?? '';

  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly questao = signal<QuestaoComAlternativas | null>(null);

  protected readonly respostaSelecionada = signal<string | null>(null);
  protected readonly alternativaCorretaId = signal<string | null>(null);

  protected readonly respondida = signal(false);
  protected readonly enviando = signal(false);
  protected readonly erroResposta = signal<string | null>(null);

  constructor() {
    if (this.isBrowser) {
      effect(() => {
        const id = this.questaoId();
        if (!id) return;
        this.filaIds = (history.state as { filaIds?: string[] } | null)?.filaIds ?? [];
        void this.carregarQuestao(id);
      });
    }
  }

  private async carregarQuestao(questaoId: string): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.resetEstadoResposta();
    try {
      const data = await this.cadernoErrosService.getQuestaoParaRefazer(questaoId);
      this.questao.set(data);
    } catch {
      this.loadError.set('Não foi possível carregar esta questão.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private resetEstadoResposta(): void {
    this.respostaSelecionada.set(null);
    this.alternativaCorretaId.set(null);
    this.respondida.set(false);
    this.erroResposta.set(null);
  }

  protected async onResponder(alternativaId: string): Promise<void> {
    if (this.respostaSelecionada() !== null || this.enviando()) return;
    this.respostaSelecionada.set(alternativaId);
    this.enviando.set(true);
    this.erroResposta.set(null);
    try {
      const resposta = await this.cadernoErrosService.responderAvulsa(this.questaoId(), alternativaId);
      const corretaId = resposta.alternativaCorretaId ?? (resposta.correta ? alternativaId : null);
      this.alternativaCorretaId.set(corretaId);
      // `get_questao_para_refazer` mascara `correta` em todas as alternativas
      // (sem gabarito antes de responder) — o card só pinta a certa se o dado
      // já vier marcado, então aplica aqui o gabarito revelado pela resposta.
      if (corretaId) {
        this.questao.update((q) =>
          q === null
            ? q
            : { ...q, alternativas: q.alternativas.map((a) => ({ ...a, correta: a.id === corretaId })) },
        );
      }
      this.respondida.set(true);
    } catch {
      this.erroResposta.set('Não foi possível registrar sua resposta. Tente novamente.');
      this.respostaSelecionada.set(null);
    } finally {
      this.enviando.set(false);
    }
  }

  protected temProxima(): boolean {
    const atual = this.filaIds.indexOf(this.questaoId());
    return atual !== -1 && atual < this.filaIds.length - 1;
  }

  protected onProximaErrada(): void {
    const atual = this.filaIds.indexOf(this.questaoId());
    const proximoId = atual !== -1 ? this.filaIds[atual + 1] : undefined;
    if (!proximoId) {
      void this.router.navigate(['/dashboard/caderno-de-erros']);
      return;
    }
    void this.router.navigate(['/dashboard/caderno-de-erros/refazer', proximoId], {
      state: { filaIds: this.filaIds },
    });
  }

  protected onVoltar(): void {
    void this.router.navigate(['/dashboard/caderno-de-erros']);
  }

  protected onTentarNovamente(): void {
    void this.carregarQuestao(this.questaoId());
  }
}
