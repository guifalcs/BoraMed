// Com a sessão salva pelo mp-seller-login.mjs, captura as credenciais APP_USR
// da aplicação do vendedor de teste ("BoraMed Teste" 908829636068202) e grava
// em creds.json ao lado deste arquivo. Uso:
//   node scripts/teste-manual-mp/mp-seller-credentials.mjs
import { chromium } from '../../frontend/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const OUT = dirname(fileURLToPath(import.meta.url));
const APP_ID = process.env.MP_SELLER_APP_ID ?? '908829636068202';

const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  locale: 'pt-BR',
  storageState: `${OUT}/session.json`,
});
const page = await ctx.newPage();

await page.goto(`https://www.mercadopago.com.br/developers/panel/app/${APP_ID}/credentials/production`, {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(6000);
console.log('URL:', page.url());

// Expõe valores escondidos (botões "mostrar"/olho) e captura APP_USR-*.
for (const btn of await page.locator('button').all()) {
  const t = ((await btn.textContent()) || '').toLowerCase();
  if (/mostrar|ver|show/.test(t)) await btn.click().catch(() => {});
}
await page.waitForTimeout(2000);
const creds = await page.evaluate(() => {
  const vals = new Set();
  document.querySelectorAll('input, span, code, p').forEach((el) => {
    const v = (el.value ?? el.textContent ?? '').trim();
    if (/^APP_USR-[\w-]{10,}/.test(v)) vals.add(v);
  });
  return [...vals];
});
// Se algo não veio pelo DOM, o screenshot cobre a leitura manual.
await page.screenshot({ path: `${OUT}/creds-page.png`, fullPage: true });
writeFileSync(`${OUT}/creds.json`, JSON.stringify(creds, null, 2));
console.log(`${creds.length} credencial(is) em ${OUT}/creds.json (+ creds-page.png)`);
console.log('Access Token = formato APP_USR-<appid>-<data>-<hash>-<userid>; Public Key = APP_USR-<uuid>');
await browser.close();
