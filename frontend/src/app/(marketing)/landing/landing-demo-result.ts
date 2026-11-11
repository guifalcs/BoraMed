import { Injectable, computed, signal } from '@angular/core';

export interface DemoQuestaoEstado {
  readonly tema: string;
  /** `null` enquanto a questão não foi respondida. */
  readonly certa: boolean | null;
}

/**
 * O que o visitante respondeu na demo (#demo), compartilhado dentro da
 * landing: a chamada final mostra esse mini-diagnóstico em vez de recomeçar
 * do zero. Vive só na memória da página, como a própria demo.
 */
@Injectable()
export class LandingDemoResult {
  readonly questoes = signal<readonly DemoQuestaoEstado[]>([]);

  readonly respondidas = computed(() => this.questoes().filter((questao) => questao.certa !== null).length);
  readonly acertos = computed(() => this.questoes().filter((questao) => questao.certa).length);
  readonly concluido = computed(() => this.questoes().length > 0 && this.respondidas() === this.questoes().length);
  readonly temasParaRevisar = computed(() =>
    this.questoes()
      .filter((questao) => questao.certa === false)
      .map((questao) => questao.tema),
  );
}
