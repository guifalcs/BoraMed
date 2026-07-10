// Loga no painel de dev do Mercado Pago como o VENDEDOR DE TESTE e salva a
// sessão em mp-seller-state.json (no diretório atual ou OUT_DIR). Use quando o
// túnel do webhook mudar de URL (reconfigurar em Webhooks) ou para consultar
// credenciais/notificações da app "BoraMed Teste" (908829636068202).
//
//   MP_TEST_SELLER_PASS=<senha> node scripts/teste-manual-mp/vendedor-login.mjs [rota]
//
// [rota] é o caminho do painel a abrir após o login (default: webhooks).
// Senha do vendedor: painel MP → Suas integrações → app produtiva → Contas de teste.
import { chromium } from '/home/guilherme/Documentos/BoraMed/frontend/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR ?? '.';
const APP_ID = '908829636068202';
const USER = 'TESTUSER7012000526337652922';
const PASS = process.env.MP_TEST_SELLER_PASS;
const ROTA = process.argv[2] ?? 'webhooks';
if (!PASS) throw new Error('defina MP_TEST_SELLER_PASS (senha do vendedor de teste)');

const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({
  viewport: { width: 1366, height: 1000 },
  locale: 'pt-BR',
  userAgent:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

await page.goto('https://www.mercadopago.com.br/developers/panel/app', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(4000);

// Etapa 1: usuário (se a sessão não existir)
const userInput = page.locator('input[name="user_id"], #user_id, input[type="email"]').first();
if (await userInput.count()) {
  await userInput.fill(USER);
  await page.getByRole('button', { name: /continuar|continue/i }).first().click();
  await page.waitForTimeout(4000);
}

// Etapa 1.5: chooser de método de verificação → "Senha"
if (/login\/challenges/.test(page.url())) {
  const senhaBtn = page.locator('#password_validation button').first();
  if (await senhaBtn.count()) {
    await senhaBtn.click({ timeout: 10000 });
    await page.waitForSelector('input[type="password"]', { timeout: 15000 }).catch(() => {});
  }
}

// Etapa 2: senha (Enter submete — o botão muda de rótulo entre versões)
const passInput = page.locator('input[type="password"]').first();
if (await passInput.count()) {
  await passInput.fill(PASS);
  await passInput.press('Enter');
  await page.waitForTimeout(8000);
}

await page.goto(`https://www.mercadopago.com.br/developers/panel/app/${APP_ID}/${ROTA}`, {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(6000);
console.log('URL:', page.url());
const txt = await page.locator('body').innerText();
console.log(txt.replace(/\n{2,}/g, '\n').slice(0, 2000));
await page.screenshot({ path: `${OUT}/vendedor-${ROTA.replace(/\W/g, '-')}.png`, fullPage: true });
await ctx.storageState({ path: `${OUT}/mp-seller-state.json` });
console.log(`\nsessão salva em ${OUT}/mp-seller-state.json; screenshot em ${OUT}/vendedor-*.png`);
await browser.close();
