import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SeoService } from '../../core/seo/seo.service';
import { SITE_URL } from '../../core/seo/seo.config';
import { GUIAS } from './guias.data';

@Component({
  selector: 'app-guias-list',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="min-h-screen bg-white">
      <header class="border-b border-gray-100 bg-white sticky top-0 z-10">
        <div class="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <a routerLink="/" aria-label="BoraMed - início">
            <img src="/brand/logo.webp" alt="BoraMed" class="h-7 w-auto" />
          </a>
          <a
            routerLink="/cadastro"
            class="text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            Criar conta grátis →
          </a>
        </div>
      </header>

      <div class="max-w-4xl mx-auto px-6 py-12">
        <nav aria-label="Trilha de navegação" class="mb-6 text-sm text-gray-400">
          <a routerLink="/" class="hover:text-gray-700">Início</a>
          <span class="mx-2">/</span>
          <span class="text-gray-600">Guias de estudo</span>
        </nav>

        <div class="mb-10 max-w-2xl">
          <h1 class="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Guias de estudo para medicina
          </h1>
          <p class="text-lg text-gray-600 leading-relaxed">
            Conteúdo autoral e gratuito sobre como estudar para provas de medicina, fazer
            simulados no modelo das avaliações nacionais e render mais com questões comentadas.
          </p>
        </div>

        <div class="grid gap-5 sm:grid-cols-2">
          @for (guia of guias; track guia.slug) {
            <a
              [routerLink]="['/guias', guia.slug]"
              class="block rounded-2xl border border-gray-200 p-6 transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <h2 class="text-lg font-semibold text-gray-900 mb-2">{{ guia.h1 }}</h2>
              <p class="text-sm text-gray-600 leading-relaxed mb-4">{{ guia.resumo }}</p>
              <span class="text-xs font-medium text-gray-400">
                {{ guia.tempoLeituraMin }} min de leitura
              </span>
            </a>
          }
        </div>

        <section class="mt-14 rounded-2xl bg-indigo-50 p-8 text-center">
          <h2 class="text-xl font-bold text-gray-900 mb-2">
            Pronto para treinar de verdade?
          </h2>
          <p class="text-gray-600 mb-5 max-w-xl mx-auto">
            Monte simulados de medicina por tema ou treine no modelo das avaliações nacionais,
            com revisão de desempenho que mostra onde focar.
          </p>
          <a
            routerLink="/cadastro"
            class="inline-flex items-center rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Começar agora
          </a>
        </section>
      </div>
    </main>
  `,
})
export class GuiasListComponent {
  private readonly seo = inject(SeoService);
  protected readonly guias = GUIAS;

  constructor() {
    this.seo.update({
      title: 'Guias de estudo para medicina',
      description:
        'Guias autorais e gratuitos sobre como estudar para provas de medicina, simulados no modelo das avaliações nacionais e questões comentadas por especialidade.',
      path: '/guias',
    });
    this.seo.setBreadcrumbs([
      { name: 'Início', path: '/' },
      { name: 'Guias de estudo', path: '/guias' },
    ]);
    this.seo.setJsonLd('itemlist', {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Guias de estudo para medicina',
      itemListElement: GUIAS.map((guia, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}/guias/${guia.slug}`,
        name: guia.h1,
      })),
    });
  }
}
