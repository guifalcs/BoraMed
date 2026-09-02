import { test, expect, type Locator, type Page } from '@playwright/test';
import { abrirTela } from './mocks';

// Prints das duas propostas que ficaram abertas depois da auditoria de texto:
//   Q1 — cards do hub de Simulados quebrando em 390px (layout, não texto)
//   Q2 — parágrafo de apresentação do Competitivo (só sobra no desktop)
//
//   SHOT_VP=desktop SHOT_DIR=antes  npx playwright test --config=... -g propostas
//   (sem SHOT_VP = mobile 390x844)

const VP = process.env['SHOT_VP'] === 'desktop' ? 'desktop' : 'mobile';
const DIR = process.env['SHOT_DIR'] ?? 'antes';
const OUT = `tests/screenshots/out/propostas/${VP}/${DIR}`;
const PAD = 10;
const LARGURA = VP === 'desktop' ? 1280 : 390;

async function limparChromeFixo(page: Page): Promise<void> {
  await page.addStyleTag({
    content: '.bottom-nav, .mobile-notif-float, app-suporte-widget { display: none !important; }',
  });
}

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
    fullPage: true,
    clip: {
      x: Math.max(0, x - PAD),
      y: Math.max(0, y - PAD),
      width: Math.min(LARGURA - Math.max(0, x - PAD), right - x + PAD * 2),
      height: bottom - y + PAD * 2,
    },
  });
}

async function preparar(
  page: Page,
  url: string,
  ancora: string,
  nivel: 'gratuito' | 'avancado' = 'avancado',
): Promise<void> {
  await abrirTela(page, url, nivel);
  await expect(page.locator(ancora).first()).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(1000);
  await limparChromeFixo(page);
}

// ─── Q1: cards do hub de Simulados ───────────────────────────────────────────
// Em 390px sobram ~154px para a coluna do meio (ícone 56 + seta 44 + p-7 + 2
// gaps comem o resto), então o título quebra e os chips empilham.
test('q1 — cards do hub de Simulados', async ({ page }) => {
  await preparar(page, '/dashboard/simulados', 'text=Treinos nacionais');
  await recortar(page, 'q1-hub-cards', [
    page.locator('section[aria-label="Tipos de simulado"]'),
  ]);
});

// ─── Q2: cabeçalho do Competitivo ────────────────────────────────────────────
// No mobile já está oculto pela auditoria; o que resta decidir é o desktop.
test('q2 — cabeçalho do Competitivo', async ({ page }) => {
  await preparar(page, '/dashboard/competitivo', 'text=Desafio de hoje');
  await recortar(page, 'q2-competitivo-header', [
    page.locator('h1:has-text("Competitivo")').locator('xpath=ancestor::div[2]'),
  ]);
});

// ─── Q3: caso de risco do Q1 — card bloqueado (plano gratuito) ───────────────
// O card de Montar simulado troca a seta por um botão "Fazer upgrade". Ao
// empilhar, esse CTA precisa continuar visível e bem posicionado.
test('q3 — hub com Montar simulado bloqueado', async ({ page }) => {
  await preparar(page, '/dashboard/simulados', 'text=Treinos nacionais', 'gratuito');
  await recortar(page, 'q3-hub-bloqueado', [
    page.locator('section[aria-label="Tipos de simulado"]'),
  ]);
});
