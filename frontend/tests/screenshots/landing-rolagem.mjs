// Grava a landing rolando do topo ao fim, com movimento completo, em desktop e
// celular, e salva quadros-chave do ato preso ("Como funciona").
//
// Existe porque o movimento da landing é dirigido por rolagem e não aparece em
// print estático, e porque máquina com as animações do sistema desligadas
// reporta "reduzir movimento": o headless daqui força `no-preference`.
//
//   ng serve                                     # em outro terminal
//   node tests/screenshots/landing-rolagem.mjs   # de dentro de frontend/
//   SHOT_BASE_URL=http://localhost:4210 node tests/screenshots/landing-rolagem.mjs
//
// Saída (ignorada pelo Git): tests/screenshots/out/landing/
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const baseURL = process.env['SHOT_BASE_URL'] ?? 'http://localhost:4200';
const saida = fileURLToPath(new URL('./out/landing/', import.meta.url));
await mkdir(saida, { recursive: true });

const viewports = [
  { nome: 'desktop', width: 1440, height: 900, mobile: false },
  { nome: 'celular', width: 390, height: 844, mobile: true },
];

/** Pontos do ato preso (0 a 1) que valem um quadro: prova, correção, voo, diagnóstico, evolução. */
const QUADROS_DO_PICO = [0.12, 0.3, 0.47, 0.6, 0.73, 0.97];

const browser = await chromium.launch();

for (const viewport of viewports) {
  const pasta = `${saida}${viewport.nome}/`;
  await rm(pasta, { recursive: true, force: true });
  await mkdir(pasta, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    reducedMotion: 'no-preference',
    recordVideo: { dir: pasta, size: { width: viewport.width, height: viewport.height } },
  });
  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForSelector('html.sc-ready');
  // Entrada da hero: grifo, alternativa marcada, diagnóstico e barras.
  await page.waitForTimeout(3000);

  // Rolagem contínua, um passo por quadro, para o vídeo mostrar o que a mão faz.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const fim = document.documentElement.scrollHeight - window.innerHeight;
        const passo = () => {
          window.scrollBy(0, 11);
          if (window.scrollY >= fim - 1) resolve(undefined);
          else requestAnimationFrame(passo);
        };
        requestAnimationFrame(passo);
      }),
  );
  await page.waitForTimeout(1500);

  // Quadros-chave do pico, fora do vídeo de rolagem contínua.
  for (const [indice, progresso] of QUADROS_DO_PICO.entries()) {
    await page.evaluate((p) => {
      const ato = document.querySelector('#como-funciona');
      if (!ato) return;
      const topo = ato.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: topo + (ato.offsetHeight - window.innerHeight) * p, behavior: 'instant' });
    }, progresso);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${pasta}pico-${indice + 1}.png` });
  }

  await context.close();
  const video = (await readdir(pasta)).find((arquivo) => arquivo.endsWith('.webm'));
  if (video) await rename(`${pasta}${video}`, `${saida}landing-${viewport.nome}.webm`);
  console.log(`${viewport.nome}: ${saida}landing-${viewport.nome}.webm`);
}

await browser.close();
