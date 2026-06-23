import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { SeoService } from '../../core/seo/seo.service';
import { SITE_URL } from '../../core/seo/seo.config';
import { Guia, getGuiaBySlug } from './guias.data';

@Component({
  selector: 'app-guia-detail',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (guia(); as g) {
      <main class="min-h-screen bg-white">
        <header class="border-b border-gray-100 bg-white sticky top-0 z-10">
          <div class="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
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

        <article class="max-w-3xl mx-auto px-6 py-12">
          <nav aria-label="Trilha de navegação" class="mb-6 text-sm text-gray-400">
            <a routerLink="/" class="hover:text-gray-700">Início</a>
            <span class="mx-2">/</span>
            <a routerLink="/guias" class="hover:text-gray-700">Guias</a>
            <span class="mx-2">/</span>
            <span class="text-gray-600">{{ g.h1 }}</span>
          </nav>

          <h1 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{{ g.h1 }}</h1>
          <p class="text-lg text-gray-600 leading-relaxed mb-2">{{ g.resumo }}</p>
          <p class="text-sm text-gray-400 mb-10">{{ g.tempoLeituraMin }} min de leitura</p>

          <div class="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">
            @for (secao of g.secoes; track secao.heading) {
              <section>
                <h2 class="text-xl font-semibold text-gray-900 mb-3">{{ secao.heading }}</h2>
                @for (paragrafo of secao.paragraphs; track paragrafo) {
                  <p>{{ paragrafo }}</p>
                }
              </section>
            }
          </div>

          @if (g.faq.length > 0) {
            <section class="mt-12">
              <h2 class="text-2xl font-bold text-gray-900 mb-6">Perguntas frequentes</h2>
              <div class="space-y-6">
                @for (item of g.faq; track item.question) {
                  <div>
                    <h3 class="font-semibold text-gray-900 mb-1">{{ item.question }}</h3>
                    <p class="text-gray-600 leading-relaxed">{{ item.answer }}</p>
                  </div>
                }
              </div>
            </section>
          }

          <section class="mt-14 rounded-2xl bg-indigo-50 p-8 text-center">
            <h2 class="text-xl font-bold text-gray-900 mb-2">Treine no modelo das provas</h2>
            <p class="text-gray-600 mb-5 max-w-xl mx-auto">
              Crie sua conta no BoraMed e comece a fazer simulados de medicina com questões
              autorais e revisão de desempenho.
            </p>
            <a
              routerLink="/cadastro"
              class="inline-flex items-center rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Criar conta grátis
            </a>
          </section>

          <div class="mt-12 border-t border-gray-100 pt-8">
            <a routerLink="/guias" class="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
              ← Ver todos os guias de estudo
            </a>
          </div>
        </article>
      </main>
    }
  `,
})
export class GuiaDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);

  protected readonly guia = signal<Guia | undefined>(undefined);

  constructor() {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    const guia = getGuiaBySlug(slug);

    if (!guia) {
      void this.router.navigate(['/guias']);
      return;
    }

    this.guia.set(guia);
    this.configureSeo(guia);
  }

  private configureSeo(guia: Guia): void {
    const path = `/guias/${guia.slug}`;
    const url = `${SITE_URL}${path}`;

    this.seo.update({
      title: guia.metaTitle,
      description: guia.metaDescription,
      path,
      type: 'article',
    });

    this.seo.setBreadcrumbs([
      { name: 'Início', path: '/' },
      { name: 'Guias', path: '/guias' },
      { name: guia.h1, path },
    ]);

    this.seo.setJsonLd('article', {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: guia.h1,
      description: guia.metaDescription,
      inLanguage: 'pt-BR',
      datePublished: guia.atualizadoEm,
      dateModified: guia.atualizadoEm,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      author: { '@type': 'Organization', name: 'BoraMed', url: `${SITE_URL}/` },
      publisher: {
        '@type': 'Organization',
        name: 'BoraMed',
        logo: { '@type': 'ImageObject', url: `${SITE_URL}/brand/logo.webp` },
      },
    });

    if (guia.faq.length > 0) {
      this.seo.setJsonLd('faq', {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: guia.faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      });
    }
  }
}
