// F5-manual — Cenários 2 e 6 do TESTE-PAGAMENTO-LOCAL.md no /checkout/semestral:
// recusas FUND/SECU/CALL (mensagens específicas, permanece no checkout) e
// APRO em 6x (aprovado → /checkout/status). MP TEST real, sem mocks.
import { chromium } from '../../frontend/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR ?? '.';
// Mastercard de teste MLB por padrão. Com credenciais do vendedor de teste o
// BIN 503143 não resolve — use Visa: CARD='4235 6477 2802 5682' (ou 4509 9535
// 6623 3704).
const CARD = process.env.CARD ?? '5031 4332 1540 6351';
// Com vendedor de teste, o e-mail da conta BoraMed precisa ser o do COMPRADOR
// de teste do MP (payer e collector devem ser ambos test users).
const EMAIL = process.env.EMAIL ?? 'teste@boramed.com';
const CPF = '12345678909';
const EXP = '11/30';
const CVV = '123';

const CASES = process.argv[2]
  ? [{ holder: process.argv[2], installments: process.argv[3] ? Number(process.argv[3]) : null }]
  : [
      { holder: 'FUND', installments: null },
      { holder: 'SECU', installments: null },
      { holder: 'CALL', installments: null },
      { holder: 'APRO', installments: 6 },
    ];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|favicon/.test(m.text()))
    console.log('  [console.error]', m.text().slice(0, 300));
});

// Login (retry: SSR pode ainda não ter hidratado no primeiro clique)
await page.goto('http://localhost:4200/login', { waitUntil: 'networkidle' });
let logado = false;
for (let i = 0; i < 4 && !logado; i++) {
  await page.getByLabel(/e-?mail/i).fill(EMAIL);
  await page.locator('input[type="password"]').fill('Teste123!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  logado = await page
    .waitForURL((u) => !/\/login/.test(u.pathname ?? String(u)), { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
}
if (!logado) throw new Error('login falhou após retries');
console.log('LOGIN OK');

async function fillSecureField(frameName, selectorCandidates, value) {
  const frame = page.frames().find((f) => f.name() === frameName);
  if (!frame) throw new Error(`frame ${frameName} não encontrado`);
  for (const sel of selectorCandidates) {
    const el = frame.locator(sel);
    if (await el.count()) {
      await el.first().click();
      await el.first().fill(value);
      return;
    }
  }
  const avail = await frame.locator('input').evaluateAll((els) => els.map((e) => e.id));
  throw new Error(`nenhum seletor em ${frameName}; inputs: ${avail}`);
}

async function runCase({ holder, installments }) {
  console.log(`\n=== CASO ${holder}${installments ? ` (${installments}x)` : ''} ===`);
  await page.goto(`http://localhost:4200/checkout/${process.env.PLANO ?? 'semestral'}`);
  await page.waitForSelector('#payment-brick-container iframe', { timeout: 30000 });
  await page.getByText('Cartão de crédito', { exact: false }).first().click();
  await page.waitForSelector('#payment-brick-container input[name="HOLDER_NAME"]', { timeout: 15000 });
  await page.waitForTimeout(1500);

  await fillSecureField('cardNumber', ['#cardNumber'], CARD);
  await page.waitForTimeout(1500); // bandeira reconhecida → select de parcelas popula
  await fillSecureField('expirationDate', ['#expirationDate', '#expirationMonth'], EXP);
  await fillSecureField('securityCode', ['#securityCode'], CVV);
  await page.locator('#payment-brick-container input[name="HOLDER_NAME"]').fill(holder);
  await page.locator('#payment-brick-container input[name="DOCUMENT"]').fill(CPF);

  {
    const n = installments ?? 1; // o Brick exige escolher parcelas mesmo em 1x
    // o select de parcelas é o que tem opções "1x…", "2x…" (o outro é CPF/CNPJ)
    const sel = page
      .locator('#payment-brick-container select')
      .filter({ has: page.locator('option', { hasText: /^\s*\d+x/ }) })
      .first();
    const temParcelas = await sel.waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
    if (!temParcelas && !installments) {
      console.log('(sem select de parcelas — mensal 1x)');
    } else {
    if (!temParcelas) throw new Error('select de parcelas não apareceu');
    // opção cujo texto começa com "<n>x"
    const optValue = await sel.locator('option').evaluateAll(
      (opts, k) => opts.find((o) => o.textContent.trim().startsWith(`${k}x`))?.value,
      n
    );
    if (!optValue) {
      const all = await sel.locator('option').allTextContents();
      throw new Error(`opção ${n}x não achada; opções: ${all.join(' / ')}`);
    }
    await sel.selectOption(optValue);
    }
  }

  await page.screenshot({ path: `${OUT}/caso-${holder}-preenchido.png`, fullPage: true });
  await page.getByRole('button', { name: /^Pagar/ }).click();

  const outcome = await Promise.race([
    page.waitForURL(/checkout\/status\//, { timeout: 60000 }).then(() => 'status-page'),
    page.waitForSelector('[data-testid="checkout-recusa"]', { timeout: 60000 }).then(() => 'recusa'),
  ]);

  if (outcome === 'recusa') {
    const txt = await page.locator('[data-testid="checkout-recusa"]').innerText();
    console.log('RECUSA →', txt.replace(/\n+/g, ' — '));
  } else {
    await page.waitForTimeout(4000); // polling/render da tela de status
    const txt = await page.locator('main, body').first().innerText();
    console.log('STATUS PAGE →', page.url());
    console.log(txt.replace(/\n+/g, ' | ').slice(0, 500));
  }
  await page.screenshot({ path: `${OUT}/caso-${holder}-resultado.png`, fullPage: true });
  return outcome;
}

for (const c of CASES) {
  try {
    await runCase(c);
  } catch (e) {
    console.log(`ERRO no caso ${c.holder}:`, String(e).slice(0, 400));
    await page.screenshot({ path: `${OUT}/caso-${c.holder}-erro.png`, fullPage: true });
  }
}

await browser.close();
console.log('\nFIM');
