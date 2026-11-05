import type { CanDeactivateFn } from '@angular/router';

/** Tela com edição local que pode ser perdida ao navegar para fora. */
export interface SaidaProtegida {
  /** true = pode sair (sem alterações, ou o usuário confirmou). */
  podeSair(): boolean;
}

/**
 * Pergunta antes de sair de uma tela com alterações não salvas por navegação
 * interna (link, menu lateral). O `beforeunload` do componente cobre só
 * F5/fechar aba.
 */
export const sairSemSalvarGuard: CanDeactivateFn<SaidaProtegida> = (componente) =>
  componente?.podeSair?.() ?? true;
