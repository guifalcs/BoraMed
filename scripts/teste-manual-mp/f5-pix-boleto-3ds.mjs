// Cenários 8 (Pix/boleto) e 9 (3DS) no /checkout/semestral.
// Uso: node f5-pix-boleto-3ds.mjs pix|boleto|3ds
import { chromium } from '../../frontend/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR ?? '.';
const MODO = process.argv[2];
if (!['pix', 'boleto', '3ds'].includes(MODO)) throw new Error('modo: pix|boleto|3ds');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1800 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|favicon/.test(m.text()))
    console.log('  [console.error]', m.text().slice(0, 250));
});

await page.goto('http://localhost:4200/login', { waitUntil: 'networkidle' });
let logado = false;
for (let i = 0; i < 4 && !logado; i++) {
  await page.getByLabel(/e-?mail/i).fill('teste@boramed.com');
  await page.locator('input[type="password"]').fill('Teste123!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  logado = await page
    .waitForURL((u) => !/\/login/.test(u.pathname ?? String(u)), { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
}
if (!logado) throw new Error('login falhou');
console.log('LOGIN OK');

page.on('request', (r) => {
  if (r.url().includes('mp-processar-pagamento'))
    console.log('REQ BODY →', (r.postData() ?? '').slice(0, 1200));
});

await page.goto('http://localhost:4200/checkout/semestral');
await page.waitForSelector('#payment-brick-container iframe', { timeout: 30000 });
await page.waitForTimeout(2000);

async function fillSecure(frameName, sel, value) {
  const frame = page.frames().find((f) => f.name() === frameName);
  const el = frame.locator(sel).first();
  await el.click();
  await el.fill(value);
}

if (MODO === 'pix' || MODO === 'boleto') {
  await page.getByText(MODO === 'pix' ? 'Pix' : 'Boleto', { exact: false }).first().click();
  await page.waitForTimeout(2500);
  // dump de campos exigidos pelo método
  const inputs = await page
    .locator('#payment-brick-container input:visible, #payment-brick-container select:visible')
    .evaluateAll((els) =>
      els.map((e) => ({ tag: e.tagName, name: e.getAttribute('name'), ph: e.getAttribute('placeholder'), type: e.type }))
    );
  console.log('CAMPOS:', JSON.stringify(inputs));
  // preenche o que existir (boleto pede nome/sobrenome/CPF/endereço)
  const fillIf = async (name, value) => {
    const el = page.locator(`#payment-brick-container input[name="${name}"]`);
    if (await el.count()) await el.first().fill(value);
  };
  await fillIf('BUYER_FIRST_NAME', 'Ana');
  await fillIf('BUYER_LAST_NAME', 'Teste');
  await fillIf('DOCUMENT', '12345678909');
  await fillIf('ADDRESS_CODE', '01310-100');
  await page.waitForTimeout(3000); // CEP → campos de endereço aparecem
  // preenche na ordem: Estado, Cidade, Bairro, Rua, Número (Complemento fica vazio)
  const valores = ['SP', 'São Paulo', 'Bela Vista', 'Av Paulista', '1000'];
  const vazios = page.locator('#payment-brick-container input:visible');
  const total = await vazios.count();
  let vi = 0;
  for (let i = 0; i < total && vi < valores.length; i++) {
    const el = vazios.nth(i);
    const meta = await el.evaluate((e) => ({ type: e.type, value: e.value }));
    if (meta.type === 'radio' || meta.value) continue;
    await el.fill(valores[vi++]);
  }
  console.log(`endereço: ${vi} campos preenchidos`);
} else {
  // 3DS: cartão que força challenge
  await page.getByText('Cartão de crédito', { exact: false }).first().click();
  await page.waitForSelector('#payment-brick-container input[name="HOLDER_NAME"]', { timeout: 15000 });
  await page.waitForTimeout(1500);
  await fillSecure('cardNumber', '#cardNumber', '5483 9281 6457 4623');
  await page.waitForTimeout(1500);
  await fillSecure('expirationDate', '#expirationDate', '11/30');
  await fillSecure('securityCode', '#securityCode', '123');
  await page.locator('#payment-brick-container input[name="HOLDER_NAME"]').fill('TETE TESTE');
  await page.locator('#payment-brick-container input[name="DOCUMENT"]').fill('12345678909');
  const sel = page
    .locator('#payment-brick-container select')
    .filter({ has: page.locator('option', { hasText: /^\s*\d+x/ }) })
    .first();
  if (await sel.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) {
    const v = await sel.locator('option').evaluateAll((o) => o.find((x) => x.textContent.trim().startsWith('1x'))?.value);
    await sel.selectOption(v);
  }
}

await page.screenshot({ path: `${OUT}/${MODO}-preenchido.png`, fullPage: true });
await page.getByRole('button', { name: /^Pagar/ }).click();

const outcome = await Promise.race([
  page.waitForURL(/checkout\/status\//, { timeout: 90000 }).then(() => 'status-page'),
  page.waitForSelector('[data-testid="checkout-recusa"]', { timeout: 90000 }).then(() => 'recusa'),
]);

if (outcome === 'recusa') {
  console.log('RECUSA →', (await page.locator('[data-testid="checkout-recusa"]').innerText()).replace(/\n+/g, ' — '));
} else {
  await page.waitForTimeout(6000);
  console.log('STATUS PAGE →', page.url());
  const txt = await page.locator('body').innerText();
  console.log(txt.replace(/\n+/g, ' | ').slice(0, 700));
}
await page.screenshot({ path: `${OUT}/${MODO}-resultado.png`, fullPage: true });
await browser.close();
console.log('FIM');
