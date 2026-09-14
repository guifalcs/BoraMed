import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { SITE_NAME, TITLE_SUFFIX } from './seo.config';

/**
 * Título aplicado quando a rota não declara `title` e também não delega o
 * controle ao `SeoService`. Espelha o `<title>` do index.html.
 */
export const DEFAULT_TITLE = `${SITE_NAME} | Simulados de medicina no modelo da Afya`;

/**
 * Estratégia de título do BoraMed.
 *
 * O problema que ela resolve: o Angular só troca o `<title>` quando a rota
 * ativada declara `title`. Sem isso, o título da primeira tela visitada (quase
 * sempre "Entrar | BoraMed", já que a sessão começa no /login) ficava grudado
 * na aba em todas as telas seguintes. Aqui o título é sempre reescrito na
 * navegação: usa o `title` da rota, ou cai no título institucional.
 *
 * Exceção: páginas públicas com SEO próprio marcam `data: { seoTitle: true }`
 * e são ignoradas — quem manda no `<title>` delas é o `SeoService`, chamado no
 * construtor do componente, que também ajusta description, canonical e OG.
 */
@Injectable({ providedIn: 'root' })
export class BoraMedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const routeTitle = this.buildTitle(snapshot);

    if (routeTitle !== undefined) {
      this.title.setTitle(
        routeTitle.includes(SITE_NAME) ? routeTitle : `${routeTitle}${TITLE_SUFFIX}`,
      );
      return;
    }

    if (deepestRoute(snapshot.root).data['seoTitle'] === true) {
      return;
    }

    this.title.setTitle(DEFAULT_TITLE);
  }
}

/** Folha da árvore de rotas ativada (outlet primário). */
function deepestRoute(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  let current = route;
  while (current.firstChild) {
    current = current.firstChild;
  }
  return current;
}
