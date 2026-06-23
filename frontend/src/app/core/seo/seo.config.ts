/**
 * Configuração central de SEO do BoraMed.
 *
 * Mantém num único lugar a URL canônica do site, imagens sociais padrão e os
 * termos de busca estratégicos, para que todas as páginas públicas fiquem
 * consistentes e fáceis de auditar.
 */

/** Origem canônica usada em URLs absolutas, canonical, OG e sitemap. */
export const SITE_URL = 'https://boramedoficial.com.br';

/** Nome curto da marca, usado em títulos e structured data. */
export const SITE_NAME = 'BoraMed';

/** Imagem social padrão (Open Graph / Twitter). */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

/** Sufixo de título aplicado quando a página não traz o nome da marca. */
export const TITLE_SUFFIX = ` | ${SITE_NAME}`;

/**
 * Termos de busca priorizados.
 *
 * IMPORTANTE: o BoraMed é independente e NÃO possui vínculo, parceria ou acervo
 * de questões da Afya. Usamos referência comparativa ("no modelo das provas da
 * Afya") — uso nominativo de marca, sempre acompanhado de disclaimer de
 * independência. Nunca afirmar parceria nem reproduzir questões reais da Afya.
 */
export const PRIMARY_KEYWORDS: readonly string[] = [
  'simulado de medicina',
  'questões de medicina',
  'avaliação nacional de medicina',
  'simulado avaliação nacional',
  'simulado modelo Afya',
  'questões no modelo Afya',
  'simulado no estilo da Afya',
  'banco de questões de medicina',
  'como estudar para prova de medicina',
  'questões comentadas de medicina',
  'simulado online de medicina',
];
