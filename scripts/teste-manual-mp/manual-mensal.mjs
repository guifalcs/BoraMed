// Reproduz a experiência de um assinante MENSAL MANUAL (sem preapproval no MP)
// na tela Minha Assinatura: o que aparece e o que acontece ao clicar Cancelar.
import { chromium } from '../../frontend/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR ?? '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
page.on('response', async (r) => {
  if (r.url().includes('mp-gerenciar-assinatura'))
    console.log('EDGE →', r.status(), (await r.text().catch(() => '')).slice(0, 200));
});

await page.goto('http://localhost:4200/login', { waitUntil: 'networkidle' });
let ok = false;
for (let i = 0; i < 4 && !ok; i++) {
  await page.getByLabel(/e-?mail/i).fill('teste@boramed.com');
  await page.locator('input[type="password"]').fill('Teste123!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  ok = await page.waitForURL((u) => !/\/login/.test(String(u)), { timeout: 15000 }).then(() => true).catch(() => false);
}
if (!ok) throw new Error('login falhou');

await page.goto('http://localhost:4200/dashboard/assinatura');
await page.waitForTimeout(4000);
console.log('TELA:', (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 900));
await page.screenshot({ path: `${OUT}/manual-mensal-tela.png`, fullPage: true });

// Fecha o modal de onboarding se estiver aberto
const pular = page.getByText('Pular por enquanto', { exact: false }).first();
if (await pular.count()) {
  await pular.click();
  await page.waitForTimeout(1000);
}

// Clica em Cancelar assinatura, se existir
const cancelar = page.getByRole('button', { name: /cancelar assinatura/i }).first();
if (await cancelar.count()) {
  await cancelar.click();
  await page.waitForTimeout(1500);
  // modal de confirmação
  const confirmar = page.getByRole('button', { name: /sim, cancelar/i }).first();
  if (await confirmar.count()) {
    await confirmar.click();
    await page.waitForTimeout(5000);
  }
  console.log('APÓS CANCELAR:', (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 600));
  await page.screenshot({ path: `${OUT}/manual-mensal-apos-cancelar.png`, fullPage: true });
} else {
  console.log('sem botão Cancelar visível');
}
await browser.close();
console.log('FIM');
