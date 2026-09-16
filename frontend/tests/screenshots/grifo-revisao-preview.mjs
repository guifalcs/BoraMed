/**
 * Preview do grifo na revisão pós-prova contra o stack local: grifa, finaliza
 * e confere que a pintura seguiu para a revisão, com estojo só de borracha.
 * Uso: node tests/screenshots/grifo-revisao-preview.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const SAIDA = 'tests/screenshots/out';
mkdirSync(SAIDA, { recursive: true });

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ locale: 'pt-BR', viewport: { width: 1280, height: 900 } });
const page = await contexto.newPage();

await page.goto(`${BASE}/login`);
await page.getByLabel(/e-?mail/i).fill('teste@boramed.com');
await page.getByLabel(/senha/i).first().fill('Teste123!');
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForURL(/dashboard/, { timeout: 30_000 });

await page.goto(`${BASE}/dashboard/simulados`);
await page.waitForTimeout(2000);
const dispensar = page.getByRole('button', { name: 'Agora não' });
if (await dispensar.count()) await dispensar.first().click();

await page.getByText('Treinos nacionais').first().click();
await page.waitForTimeout(2000);
await page.getByText('Treino Nacional — Cardiologia').first().click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /iniciar|retomar|continuar/i }).first().click();
await page.waitForURL(/tentativa/, { timeout: 30_000 });
await page.waitForTimeout(2500);

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

await page.getByRole('button', { name: 'Pegar o marca-texto' }).click();
await grifar('dor torácica retroesternal em aperto');
await page.getByRole('button', { name: 'Grifar em verde' }).click();
await grifar('supradesnivelamento do segmento ST');

// Responde alguma coisa e finaliza.
await page.getByRole('radio', { name: /^Alternativa B:/ }).first().click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Finalizar prova' }).click();
await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
await page.waitForURL(/resultado/, { timeout: 30_000 });
await page.waitForTimeout(2000);

await page.getByRole('link', { name: /revis/i }).first().click();
await page.waitForURL(/revisao|visualizar/, { timeout: 30_000 });
await page.waitForTimeout(2000);

// O link da tela de resultado abre a revisão filtrada por erros; a questão
// grifada pode estar entre os acertos. A revisão completa é a mesma rota
// sem o filtro.
if (page.url().includes('filtro=erros')) {
  await page.goto(page.url().replace(/\?filtro=erros/, ''));
}
await page.waitForTimeout(3000);

const pintados = await page.evaluate(() => {
  const saida = {};
  for (const [nome, h] of CSS.highlights) {
    if (!nome.startsWith('bm-grifo-')) continue;
    const t = [];
    for (const r of h) t.push(r.toString());
    if (t.length) saida[`#${nome.slice('bm-grifo-'.length)}`] = t;
  }
  return saida;
});
console.log('URL     :', page.url());
console.log('pintados:', JSON.stringify(pintados));
console.log('estojo  :', await page.getByRole('button', { name: 'Apagar grifos' }).count());
console.log('paleta  :', await page.getByRole('button', { name: 'Grifar em verde' }).count());

await page.getByRole('button', { name: 'Apagar grifos' }).click();
await page.waitForTimeout(800);
console.log('cartoes :', await page.locator('[data-questao-id]').count());
console.log('limpar  :', await page.getByRole('button', { name: 'Limpar todos os grifos desta questão' }).count());

await page.screenshot({ path: `${SAIDA}/grifo-revisao.png` });
await navegador.close();
