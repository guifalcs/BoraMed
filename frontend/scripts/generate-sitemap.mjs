/**
 * Gera o sitemap.xml a partir das rotas públicas + guias de conteúdo.
 *
 * Roda automaticamente antes do build (npm `prebuild`). Os slugs dos guias são
 * extraídos de src/app/(marketing)/guias/guias.data.ts, então cada novo guia
 * entra no sitemap sem manutenção manual.
 */
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const SITE_URL = 'https://boramedoficial.com.br';
const ROOT = join(import.meta.dirname, '..');
const GUIAS_DATA = join(ROOT, 'src', 'app', '(marketing)', 'guias', 'guias.data.ts');
const OUTPUT = join(ROOT, 'public', 'sitemap.xml');

const today = new Date().toISOString().slice(0, 10);

/** Rotas públicas estáticas. */
const staticRoutes = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/guias', changefreq: 'weekly', priority: '0.9' },
  { path: '/cadastro', changefreq: 'monthly', priority: '0.8' },
  { path: '/login', changefreq: 'monthly', priority: '0.5' },
  { path: '/termos-de-uso', changefreq: 'yearly', priority: '0.3' },
  { path: '/politica-de-privacidade', changefreq: 'yearly', priority: '0.3' },
];

async function getGuias() {
  const source = await readFile(GUIAS_DATA, 'utf-8');
  const slugs = [...source.matchAll(/slug:\s*'([^']+)'/g)].map((m) => m[1]);
  const dates = [...source.matchAll(/atualizadoEm:\s*'([^']+)'/g)].map((m) => m[1]);
  return slugs.map((slug, i) => ({
    path: `/guias/${slug}`,
    changefreq: 'monthly',
    priority: '0.7',
    lastmod: dates[i] ?? today,
  }));
}

function urlEntry({ path, changefreq, priority, lastmod }) {
  return [
    '  <url>',
    `    <loc>${SITE_URL}${path}</loc>`,
    `    <lastmod>${lastmod ?? today}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n');
}

async function main() {
  const guias = await getGuias();
  const all = [...staticRoutes, ...guias];
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...all.map(urlEntry),
    '</urlset>',
    '',
  ].join('\n');

  await writeFile(OUTPUT, xml, 'utf-8');
  console.log(`sitemap.xml gerado com ${all.length} URLs.`);
}

main().catch((err) => {
  console.error('Falha ao gerar sitemap:', err);
  process.exit(1);
});
