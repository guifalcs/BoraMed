import { test, expect, type Locator, type Page } from '@playwright/test';
import { abrirTela } from './mocks';

// Prints da auditoria de texto no mobile. Um recorte por ponto auditado, para
// que o antes/depois seja comparável sem rolar uma imagem de 4.000px.
//
//   SHOT_DIR=antes  npx playwright test --config=tests/screenshots/playwright.screenshots.config.ts
//   SHOT_DIR=depois npx playwright test --config=tests/screenshots/playwright.screenshots.config.ts

const DIR = process.env['SHOT_DIR'] ?? 'antes';
const OUT = `tests/screenshots/out/${DIR}`;
const PAD = 10;

/** Esconde o chrome fixo, que num print fullPage/clip flutua sobre o conteúdo. */
async function limparChromeFixo(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      .bottom-nav, .mobile-notif-float, app-suporte-widget { display: none !important; }
    `,
  });
}

/** Print da união das bounding boxes dos locators (com respiro). */
async function recortar(page: Page, nome: string, locators: Locator[]): Promise<void> {
  const boxes = [];
  for (const l of locators) {
    const b = await l.first().boundingBox();
    if (b) boxes.push(b);
  }
  if (boxes.length === 0) throw new Error(`Sem bounding box para ${nome}`);

  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));

  await page.screenshot({
    path: `${OUT}/${nome}.png`,
    animations: 'disabled',
    // fullPage + clip: sem fullPage o clip é recortado contra o viewport e
    // qualquer elemento abaixo da dobra estoura ("clipped area is empty").
    fullPage: true,
    clip: {
      x: Math.max(0, x - PAD),
      y: Math.max(0, y - PAD),
      width: Math.min(390, right - x + PAD * 2),
      height: bottom - y + PAD * 2,
    },
  });
}

/** Ancestral mais próximo de um texto exato — evita poluir o app com data-attrs. */
function cartao(page: Page, texto: string, tag = 'article'): Locator {
  return page.locator(`xpath=//*[normalize-space(text())='${texto}']/ancestor::${tag}[1]`);
}

async function preparar(page: Page, url: string, ancora: string): Promise<void> {
  await abrirTela(page, url);
  await expect(page.locator(ancora).first()).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(1000);
  await limparChromeFixo(page);
}

// ─── 1. page-header: subtítulo em 7 telas ────────────────────────────────────
test('p1 — page-header (subtítulo)', async ({ page }) => {
  await preparar(page, '/dashboard/simulados', 'text=Treinos nacionais');
  await recortar(page, 'p1-page-header-simulados', [page.locator('.page-header')]);

  await preparar(page, '/dashboard/historico', 'text=Tentativas Anteriores');
  await recortar(page, 'p1-page-header-historico', [page.locator('.page-header')]);
});

// ─── 2. Início: 3ª linha dos 4 KPIs ──────────────────────────────────────────
test('p2 — KPIs do início', async ({ page }) => {
  await preparar(page, '/dashboard', 'text=Acerto geral');
  await recortar(page, 'p2-kpis-inicio', [
    cartao(page, 'Acerto geral'),
    cartao(page, 'Ranking geral', 'a'),
  ]);
});

// ─── 3. Início: faixa "continuar", desafio e card da comunidade ──────────────
test('p3 — cards do início', async ({ page }) => {
  await preparar(page, '/dashboard', 'text=Acerto geral');
  await recortar(page, 'p3a-faixa-continuar', [
    page.locator('text=Você tem um simulado para continuar').locator('xpath=ancestor::a[1]'),
  ]);
  await recortar(page, 'p3b-desafio-do-dia', [
    page.locator('text=Desafio do dia').locator('xpath=ancestor::a[1]'),
  ]);
  await recortar(page, 'p3c-card-comunidade', [
    page.locator('text=Grupo no WhatsApp').locator('xpath=ancestor::a[1]'),
  ]);
  await recortar(page, 'p3d-evolucao-notas', [
    page.locator('text=Evolução das notas').locator('xpath=ancestor::section[1]'),
  ]);
});

// ─── 4. Montar simulado: descrições dos formatos ─────────────────────────────
test('p4 — formatos do montar simulado', async ({ page }) => {
  await preparar(page, '/dashboard/simulados/montar', 'text=Formato da prova');
  await recortar(page, 'p4a-formatos', [
    page.locator('text=Formato da prova').locator('xpath=ancestor::section[1]'),
    page.locator('text=Formato das questões').locator('xpath=ancestor::section[1]'),
  ]);
  // Âncora no cabeçalho + busca (existem nos dois estados); o que muda entre
  // antes/depois é a linha "Deixe vazio para sortear..." no meio.
  await recortar(page, 'p4b-temas-dica', [
    page.locator('h2:has-text("Filtrar por temas")'),
    page.locator('input[type="search"]').first(),
  ]);
});

// ─── 5. Hub de simulados: os dois cards grandes ──────────────────────────────
test('p5 — cards do hub de simulados', async ({ page }) => {
  await preparar(page, '/dashboard/simulados', 'text=Treinos nacionais');
  await recortar(page, 'p5-cards-simulados', [
    page.locator('section[aria-label="Tipos de simulado"]'),
  ]);
});

// ─── 6. Resultado: delta de nota e "próximos passos" ─────────────────────────
test('p6 — resultado da tentativa', async ({ page }) => {
  await preparar(page, '/dashboard/simulados/prova-1/tentativa/tent-1/resultado', 'text=Sua nota');
  // ancestor::div[1] a partir do <p> é a grade que embrulha os três cards.
  await recortar(page, 'p6a-proximos-passos', [
    page.locator('text=Revisar erros').locator('xpath=ancestor::div[1]'),
  ]);
});

// ─── 7. Competitivo: 3 parágrafos de seção ───────────────────────────────────
test('p7 — parágrafos do competitivo', async ({ page }) => {
  await preparar(page, '/dashboard/competitivo', 'text=Desafio de hoje');
  await recortar(page, 'p7a-header', [
    page.locator('text=Progresso competitivo do BoraMed').locator('xpath=ancestor::div[1]'),
  ]);
  await recortar(page, 'p7b-desafio-hoje', [
    page.locator('text=Uma questão por dia').locator('xpath=ancestor::div[2]'),
  ]);
  await recortar(page, 'p7c-ranking', [
    page.locator('text=Classificação por XP de estudo').locator('xpath=ancestor::div[1]'),
  ]);
});

// ─── 8. Perfil: bloco competitivo ────────────────────────────────────────────
test('p8 — perfil competitivo', async ({ page }) => {
  await preparar(page, '/dashboard/perfil', 'text=Dados Pessoais');
  await recortar(page, 'p8a-nivel-e-privacidade', [
    page.locator('.perfil-nivel-card'),
    page.locator('.perfil-privacidade-card'),
  ]);
  await recortar(page, 'p8b-cards-competitivo', [
    page.locator('.perfil-competitivo-grid'),
  ]);
  await recortar(page, 'p8c-email-helper', [
    page.locator('.dados-email-field'),
  ]);
});

// ─── 9. Histórico: sublabel dos KPIs ─────────────────────────────────────────
test('p9 — KPIs do histórico', async ({ page }) => {
  await preparar(page, '/dashboard/historico', 'text=Tentativas Anteriores');
  await recortar(page, 'p9-kpis-historico', [
    page.locator('app-kpi-card').first(),
    page.locator('app-kpi-card').nth(3),
  ]);
});
