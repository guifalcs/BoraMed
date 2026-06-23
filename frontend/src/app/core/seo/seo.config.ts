/**
 * Configuração central de SEO do BoraMed.
 *
 * Mantém num único lugar a URL canônica do site, imagens sociais padrão e os
 * termos de busca estratégicos, para que todas as páginas públicas fiquem
 * consistentes e fáceis de auditar.
 */

/** Origem canônica usada em URLs absolutas, canonical, OG e sitemap. */
export const SITE_URL = 'https://bora-med.vercel.app';

/** Nome curto da marca, usado em títulos e structured data. */
export const SITE_NAME = 'BoraMed';

/** Imagem social padrão (Open Graph / Twitter). */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

/** Sufixo de título aplicado quando a página não traz o nome da marca. */
export const TITLE_SUFFIX = ` | ${SITE_NAME}`;

/**
 * Termos de busca priorizados (compliant — sem usar marca de terceiros).
 *
 * IMPORTANTE: por regra de negócio, o BoraMed é independente e NÃO referencia
 * marcas de instituições de ensino em metadados ou conteúdo. A captação de quem
 * busca por provas específicas é feita por relevância de tema, não por marca.
 */
export const PRIMARY_KEYWORDS: readonly string[] = [
  'simulado de medicina',
  'questões de medicina',
  'avaliação nacional de medicina',
  'simulado avaliação nacional',
  'banco de questões de medicina',
  'como estudar para prova de medicina',
  'questões comentadas de medicina',
  'simulado online de medicina',
];
