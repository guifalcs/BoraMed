/**
 * Preview visual do marca-texto contra o stack local (seed + Supabase).
 * Uso: node tests/screenshots/grifo-preview.mjs
 * Não faz parte da suíte — é ferramenta de conferência manual.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const SAIDA = 'tests/screenshots/out';

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ locale: 'pt-BR', viewport: { width: 1280, height: 900 } });
const page = await contexto.newPage();

mkdirSync(SAIDA, { recursive: true });

await page.goto(`${BASE}/login`);
await page.getByLabel(/e-?mail/i).fill('teste@boramed.com');
await page.getByLabel(/senha/i).first().fill('Teste123!');
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForURL(/dashboard/, { timeout: 30_000 });

await page.goto(`${BASE}/dashboard/simulados`);
await page.waitForTimeout(2000);

// O seed local sobe uma pesquisa no ar: o modal cobre a tela na primeira entrada.
const dispensarPesquisa = page.getByRole('button', { name: 'Agora não' });
if (await dispensarPesquisa.count()) await dispensarPesquisa.first().click();

await page.getByText('Treinos nacionais').first().click();
await page.waitForTimeout(2000);
await page.getByText('Treino Nacional — Cardiologia').first().click();
await page.waitForTimeout(1500);
// Tentativa já em andamento de uma rodada anterior vira "Retomar".
await page.getByRole('button', { name: /iniciar|retomar|continuar/i }).first().click();
await page.waitForURL(/tentativa/, { timeout: 30_000 });
await page.waitForTimeout(2500);

// Pega o marca-texto e grifa dois trechos do caso clínico, em cores diferentes.
await page.getByRole('button', { name: 'Pegar o marca-texto' }).click();

async function grifar(trecho) {
  await page.evaluate((alvo) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = (node.nodeValue ?? '').indexOf(alvo);
      if (idx === -1) continue;
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + alvo.length);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
  }, trecho);
  await page.waitForTimeout(600);
}

await grifar('dor torácica retroesternal em aperto');
await page.getByRole('button', { name: 'Grifar em verde' }).click();
await grifar('supradesnivelamento do segmento ST');
await page.getByRole('button', { name: 'Grifar em rosa' }).click();
await grifar('conduta inicial mais adequada');

await page.screenshot({ path: `${SAIDA}/grifo-desktop.png` });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${SAIDA}/grifo-mobile.png` });

console.log('screenshots em', SAIDA);
await navegador.close();
