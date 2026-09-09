import { test, expect, type Page } from '@playwright/test';
import { setupTierMocks, clientNavigate } from '../e2e/fixtures/tier.fixture';

// Print de validação do selo "Feita" na tabela de treinos nacionais.
//
//   npx playwright test --config=tests/screenshots/playwright.screenshots.config.ts -g feita
//   SHOT_VP=desktop npx playwright test --config=... -g feita
//
// Toda a rede é interceptada: 8 provas fixas, 3 delas com tentativa finalizada.

const VP = process.env['SHOT_VP'] === 'desktop' ? 'desktop' : 'mobile';
const OUT = `tests/screenshots/out/prova-feita/${VP}`;

type ProvaMock = {
  id: string;
  nome: string;
  periodo: number | null;
  subtipo: 'N1' | 'N2' | 'teste_progresso' | 'integradora';
  qtd_questoes: number;
};

const PROVAS: ProvaMock[] = [
  { id: 'prova-1', nome: 'Integradora 5 — 2025.1', periodo: 8, subtipo: 'integradora', qtd_questoes: 40 },
  { id: 'prova-2', nome: 'N2 Clínica Médica — 2024.2', periodo: 8, subtipo: 'N2', qtd_questoes: 30 },
  { id: 'prova-3', nome: 'TPI 2025 — Teste de Progresso', periodo: null, subtipo: 'teste_progresso', qtd_questoes: 60 },
  { id: 'prova-4', nome: 'N1 Saúde Coletiva — 2025.1', periodo: 6, subtipo: 'N1', qtd_questoes: 25 },
  { id: 'prova-5', nome: 'Integradora 4 — 2024.2', periodo: 7, subtipo: 'integradora', qtd_questoes: 40 },
  { id: 'prova-6', nome: 'N1 Cardiologia — 2025.1', periodo: 8, subtipo: 'N1', qtd_questoes: 25 },
  { id: 'prova-7', nome: 'N2 Pediatria — 2024.1', periodo: 9, subtipo: 'N2', qtd_questoes: 30 },
  { id: 'prova-8', nome: 'TPI 2024 — Teste de Progresso', periodo: null, subtipo: 'teste_progresso', qtd_questoes: 60 },
];

const FEITAS = ['prova-1', 'prova-3', 'prova-6'];

function linha(p: ProvaMock) {
  return {
    id: p.id,
    faculdade_id: null,
    nome: p.nome,
    periodo: p.periodo,
    tipo: 'autoral',
    origem: 'autoral',
    formato: 'nacional',
    rede: 'afya',
    subtipo: p.subtipo,
    subtipo_nacional: p.subtipo,
    qtd_questoes: p.qtd_questoes,
    publicada: true,
    arquivada: false,
    criado_em: '2025-01-01T00:00:00Z',
  };
}

async function rotas(page: Page): Promise<void> {
  // `tentativa` precisa vir antes de `prova` só por clareza; a prioridade do
  // Playwright é a ordem inversa de registro e as globs não se sobrepõem.
  await page.route('**/rest/v1/tentativa*', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FEITAS.map((id) => ({ prova_id: id }))),
    });
  });

  await page.route('**/rest/v1/prova*', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      // count: 'exact' do supabase-js lê o total do Content-Range.
      headers: { 'content-range': `0-${PROVAS.length - 1}/${PROVAS.length}` },
      body: JSON.stringify(PROVAS.map(linha)),
    });
  });

  await page.route('**/rest/v1/disciplina*', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

test('print do selo "Feita" nos treinos nacionais', async ({ page }) => {
  await setupTierMocks(page, '/dashboard', { nivel: 'avancado', temAcesso: true, extraRoutes: rotas });
  await page.locator('.sidebar-nav').waitFor({ state: 'attached', timeout: 30_000 });
  await clientNavigate(page, '/dashboard/simulados/rede-afya');

  await expect(page.getByText('Integradora 5 — 2025.1')).toBeVisible({ timeout: 25_000 });
  const selos = page.locator('app-prova-card [role="tooltip"]');
  await expect(selos).toHaveCount(FEITAS.length, { timeout: 15_000 });
  await page.waitForTimeout(500);

  await page.addStyleTag({
    content: '.bottom-nav, .mobile-notif-float, app-suporte-widget { display: none !important; }',
  });

  const lista = page.locator('ul.divide-y').first();

  async function print(nome: string): Promise<void> {
    const box = await lista.boundingBox();
    if (!box) throw new Error('Sem bounding box da lista de provas');
    await page.screenshot({
      path: `${OUT}/${nome}.png`,
      animations: 'disabled',
      fullPage: true,
      clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 },
    });
  }

  await print('tabela-nacionais');

  // Segundo print com o balão aberto: o hover fica no ícone, não na linha.
  await page.locator('app-prova-card .group\\/feita').first().hover();
  await page.waitForTimeout(400);
  await print('tabela-nacionais-hover');
});
