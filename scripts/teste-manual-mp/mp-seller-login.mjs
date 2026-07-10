// Login HEADED no Mercado Pago como o vendedor de teste (o humano resolve o
// reCAPTCHA; o script preenche o resto) e salva a sessão em session.json ao
// lado deste arquivo. Uso:
//   MP_TEST_SELLER_PASS='<senha>' node scripts/teste-manual-mp/mp-seller-login.mjs
import { chromium } from '../../frontend/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const OUT = dirname(fileURLToPath(import.meta.url));
const USER = process.env.MP_TEST_SELLER ?? 'TESTUSER7012000526337652922';
const PASS = process.env.MP_TEST_SELLER_PASS ?? '';
if (!PASS) throw new Error('defina MP_TEST_SELLER_PASS');

const browser = await chromium.launch({
  headless: false,
  args: ['--disable-blink-features=AutomationControlled'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'pt-BR' });
const page = await ctx.newPage();

await page.goto(
  'https://www.mercadolibre.com/jms/mlb/lgz/login?platform_id=MP&go=' +
    encodeURIComponent('https://www.mercadopago.com.br/home'),
  { waitUntil: 'domcontentloaded', timeout: 60000 },
);

const userInput = page.locator('input[name="user_id"], input#user_id, input[type="text"]').first();
await userInput.waitFor({ timeout: 30000 }).catch(() => {});
await userInput.fill(USER).catch(() => {});
console.log(`>>> Na janela: usuário ${USER} (digite se vazio), resolva o reCAPTCHA e clique CONTINUAR <<<`);

// Watcher: clica na opção "Senha" (web component com shadow DOM) e preenche a
// senha em qualquer frame, assim que aparecerem.
let done = false;
(async () => {
  while (!done) {
    for (const frame of page.frames()) {
      const opcao = frame.locator('button.andes-ui-list__item-actionable').first();
      if (await opcao.isVisible().catch(() => false)) await opcao.click().catch(() => {});
      const pass = frame.locator('input[type="password"]').first();
      if (await pass.isVisible().catch(() => false)) {
        const val = await pass.inputValue().catch(() => '');
        if (!val) {
          await pass.fill(PASS).catch(() => {});
          await frame.locator('button[type="submit"]').first().click().catch(() => {});
          console.log('senha preenchida pelo watcher');
        }
      }
    }
    await page.waitForTimeout(2000).catch(() => {});
  }
})();

await page.waitForURL((u) => !/login|challenges|lgz/.test(u.href), { timeout: 600000 });
done = true;
await page.waitForTimeout(4000);
console.log('URL final:', page.url());
await ctx.storageState({ path: `${OUT}/session.json` });
console.log('SESSAO SALVA em', `${OUT}/session.json`);
await browser.close();
