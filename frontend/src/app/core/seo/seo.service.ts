import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

import {
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_URL,
  TITLE_SUFFIX,
} from './seo.config';

export interface SeoData {
  /** Título da aba/SERP. Mantenha < 60 caracteres. */
  readonly title: string;
  /** Meta description. Mantenha entre 120 e 158 caracteres. */
  readonly description: string;
  /** Caminho relativo da página (ex.: '/guias'). Usado em canonical e og:url. */
  readonly path: string;
  /** Imagem social absoluta. Default: og-image padrão. */
  readonly image?: string;
  /** Tipo Open Graph. Default: 'website'. */
  readonly type?: 'website' | 'article';
  /** Quando true, aplica noindex (páginas privadas/transacionais). */
  readonly noIndex?: boolean;
  /**
   * Se true, o título já contém a marca e não recebe o sufixo " | BoraMed".
   * Default: false.
   */
  readonly titleHasBrand?: boolean;
}

/**
 * Serviço central de SEO.
 *
 * SSR-safe: manipula `Title`, `Meta` e o `<head>` via DOCUMENT, funcionando
 * tanto no servidor (Angular SSR) quanto no browser. Deve ser chamado no
 * construtor do componente de rota para que o HTML renderizado no servidor já
 * saia com as tags corretas — o que é o que os crawlers leem.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  /** Aplica title, description, robots, canonical, Open Graph e Twitter. */
  update(data: SeoData): void {
    const fullTitle = data.titleHasBrand ? data.title : `${data.title}${TITLE_SUFFIX}`;
    const image = data.image ?? DEFAULT_OG_IMAGE;
    const url = this.absoluteUrl(data.path);
    const type = data.type ?? 'website';
    const robots = data.noIndex ? 'noindex, nofollow' : 'index, follow';

    this.title.setTitle(fullTitle);
    this.meta.updateTag({ name: 'description', content: data.description });
    this.meta.updateTag({ name: 'robots', content: robots });

    this.meta.updateTag({ property: 'og:type', content: type });
    this.meta.updateTag({ property: 'og:locale', content: 'pt_BR' });
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: data.description });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt', content: fullTitle });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: fullTitle });
    this.meta.updateTag({ name: 'twitter:description', content: data.description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    this.setCanonical(url);
  }

  /** Define/atualiza o `<link rel="canonical">`. */
  setCanonical(url: string): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  /**
   * Injeta um bloco JSON-LD identificado por `key`. Chamar de novo com a mesma
   * key substitui o bloco anterior (evita duplicar ao navegar entre rotas).
   */
  setJsonLd(key: string, data: Record<string, unknown>): void {
    this.removeJsonLd(key);
    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo-jsonld', key);
    script.textContent = JSON.stringify(data);
    this.document.head.appendChild(script);
  }

  /** Remove um bloco JSON-LD pela key. */
  removeJsonLd(key: string): void {
    this.document
      .querySelectorAll(`script[data-seo-jsonld="${key}"]`)
      .forEach((node) => node.remove());
  }

  /**
   * Schema WebSite + SearchAction (sitelinks search box). Identifica o site
   * como entidade e habilita a caixa de busca nos resultados do Google.
   */
  setWebSiteSchema(): void {
    this.setJsonLd('website', {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      inLanguage: 'pt-BR',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/guias?busca={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    });
  }

  /** Schema Organization da marca. */
  setOrganizationSchema(): void {
    this.setJsonLd('organization', {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/brand/logo.webp`,
      description: 'Plataforma independente de simulados médicos com questões autorais.',
      email: 'contato@boramed.com.br',
      inLanguage: 'pt-BR',
    });
  }

  /**
   * Schema BreadcrumbList. `items` em ordem (raiz → atual). Cada item recebe
   * um caminho relativo que é convertido em URL absoluta.
   */
  setBreadcrumbs(items: readonly { readonly name: string; readonly path: string }[]): void {
    this.setJsonLd('breadcrumb', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: this.absoluteUrl(item.path),
      })),
    });
  }

  /** Converte um caminho relativo em URL absoluta canônica. */
  absoluteUrl(path: string): string {
    if (path.startsWith('http')) {
      return path;
    }
    const normalized = path === '/' ? '/' : `/${path.replace(/^\/+|\/+$/g, '')}`;
    return `${SITE_URL}${normalized}`;
  }
}
