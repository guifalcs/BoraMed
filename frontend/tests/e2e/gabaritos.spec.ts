import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LoginPage } from './pages/login.page';

/**
 * Gabaritos extraoficiais, contra o stack local com o seed (`supabase start` +
 * `db reset`): 4 gabaritos publicados + 1 rascunho; admin `teste@boramed.com`.
 *
 * Começa sem sessão, como o aluno que chega pelo link do grupo: a lista é
 * pública, mas ver as respostas exige conta. A vitrine convida ao cadastro e o
 * login devolve direto para o gabarito.
 * Rodar: `npx playwright test gabaritos --project=chromium`.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const SLUG = 'n2-3-periodo-2026-2';
/** Prova com 3 cadernos no seed (Azul, Verde, Amarelo): cada um com a sua folha. */
const SLUG_CADERNOS = 'n1-3-periodo-2026-2';

// Mesma URL/anon key que o app de e2e usa (stack local).
const ENV = readFileSync(join(__dirname, '../../src/environments/environment.e2e.ts'), 'utf8');
const SUPABASE_URL = /supabaseUrl:\s*'([^']+)'/.exec(ENV)?.[1] ?? 'http://127.0.0.1:54321';
const ANON_KEY = /supabaseAnonKey:\s*'([^']+)'/.exec(ENV)?.[1] ?? '';
const DESTINO = `/dashboard/gabaritos/${SLUG}`;

async function entrar(page: Page): Promise<void> {
  // /login é prerenderizada: espera a hidratação antes de submeter.
  await page.waitForLoadState('networkidle');
  await new LoginPage(page).login('teste@boramed.com', 'Teste123!');
}

test.describe('Gabaritos extraoficiais', () => {
  test('lista pública só com publicados e filtro por período', async ({ page }) => {
    await page.goto('/gabaritos');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('O gabarito sai aqui primeiro');
    await expect(page.locator('.gb-card', { hasText: 'N2 · 3º período' })).toBeVisible();
    await expect(page.locator('.gb-card', { hasText: 'N2 · 6º período' })).toHaveCount(0);
    await expect(page.getByText('sem vínculo com a Afya')).toBeVisible();

    // A lista vem do SSR: espera a hidratação antes de clicar no filtro.
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: '1º período' }).click();
    await expect(page).toHaveURL(/periodo=1/);
    await expect(page.locator('.gb-card')).toHaveCount(2);
  });

  test('vitrine sem conta: mostra a prova, bloqueia as respostas e não as baixa', async ({ page }) => {
    const pediuRespostas: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/rpc/get_gabarito_prova') && !r.url().includes('vitrine')) pediuRespostas.push(r.url());
    });

    await page.goto(`/gabaritos/${SLUG}`);

    await expect(page).toHaveTitle(/Gabarito N2 · 3º período 2026\.2 \(extraoficial\)/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Saiu o gabarito da N2 · 3º período');
    await expect(page.getByText('Respostas liberadas para alunos com conta')).toBeVisible();
    await expect(page.locator('.gv-card')).toContainText('40 questões');
    // A grade é decorativa (letras de mentira, borradas) e não tem as reais.
    await expect(page.locator('.gv-tiles')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.gb-tile')).toHaveCount(0);
    expect(pediuRespostas).toEqual([]);

    // Mesmo chamando a RPC direto, a anon key não lê as respostas.
    const negado = await page.request.post(`${SUPABASE_URL}/rest/v1/rpc/get_gabarito_prova`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      data: { p_slug: SLUG },
    });
    expect([401, 403]).toContain(negado.status());
  });

  test('criar conta pela vitrine leva ao cadastro com contexto e guarda o destino', async ({ page }) => {
    await page.goto(`/gabaritos/${SLUG}`);
    await page.getByRole('link', { name: 'Criar conta e ver o gabarito' }).first().click();

    await expect(page).toHaveURL(new RegExp(`/cadastro\\?next=${encodeURIComponent(DESTINO).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    await expect(page.getByText('Falta pouco para ver o gabarito.')).toBeVisible();
    const salvo = await page.evaluate(() => localStorage.getItem('bm-destino-pos-login'));
    expect(JSON.parse(salvo ?? '{}').caminho).toBe(DESTINO);
  });

  test('entrar pela vitrine devolve direto para o gabarito completo e confere a nota', async ({ page }) => {
    await page.goto(`/gabaritos/${SLUG}`);
    await page.getByRole('link', { name: /Já tenho conta/ }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByText('Entre para ver o gabarito.')).toBeVisible();
    await entrar(page);

    await expect(page).toHaveURL(new RegExp(`${DESTINO}$`), { timeout: 15_000 });
    await expect(page.locator('.gb-tile')).toHaveCount(40);
    await expect(page.getByRole('button', { name: 'Questão 12: anulada, com comentário' })).toBeVisible();
    await page.getByRole('button', { name: /Questão 5: letra .*, com comentário/ }).click();
    await expect(page.locator('.gb-detalhe')).toContainText('Pegadinha clássica');

    // Conferir minha nota: 10 primeiras certas + anulada (q.12) sobre 39 consideradas.
    const letras = await page.locator('.gb-tile').evaluateAll((tiles) =>
      tiles.map((t) => t.querySelector('strong')?.textContent?.trim() ?? '?'),
    );
    await page.getByRole('tab', { name: /Conferir minha nota/ }).click();
    await page.getByRole('button', { name: 'Colar minhas respostas' }).click();
    await page.locator('#gb-colar-txt').fill(letras.slice(0, 10).join(''));
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await page.getByRole('button', { name: 'Ver minha nota' }).click();
    const r = page.locator('.gb-result');
    await expect(r).toContainText('11 de 39 questões');
    await expect(r).toContainText('28,2');
  });

  test('destino guardado é aberto na primeira entrada no painel', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(
      (d) => localStorage.setItem('bm-destino-pos-login', JSON.stringify({ caminho: d, em: Date.now() })),
      DESTINO,
    );
    await entrar(page);
    await expect(page).toHaveURL(new RegExp(`${DESTINO}$`), { timeout: 15_000 });
    await expect(page.locator('.gb-tile').first()).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('bm-destino-pos-login'))).toBeNull();
  });

  test('slug inexistente mostra estado de não encontrado', async ({ page }) => {
    await page.goto('/gabaritos/nao-existe');
    await expect(page.getByRole('heading', { name: 'Gabarito não encontrado' })).toBeVisible();
  });
  test.describe('Cadernos de prova', () => {
    test('vitrine mostra os nomes dos cadernos e nenhuma letra', async ({ page }) => {
      await page.goto(`/gabaritos/${SLUG_CADERNOS}`);

      await expect(page.locator('.gv-cadernos')).toContainText('3 cadernos');
      for (const nome of ['Azul', 'Verde', 'Amarelo']) await expect(page.locator('.gv-cadernos')).toContainText(nome);
      await expect(page.locator('.gv-card')).toContainText('40 questões');

      // O que a anon key recebe da vitrine: nomes dos cadernos, nenhuma folha.
      const r = await page.request.post(`${SUPABASE_URL}/rest/v1/rpc/get_gabarito_prova_vitrine`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        data: { p_slug: SLUG_CADERNOS },
      });
      expect(r.status()).toBe(200);
      const corpo = await r.text();
      expect(corpo).toContain('Amarelo');
      expect(corpo).not.toMatch(/"(resposta|questoes|comentario)"/);
    });

    test('lista pública mostra os cadernos no card', async ({ page }) => {
      await page.goto('/gabaritos');
      const card = page.locator('.gb-card', { hasText: 'N1 · 3º período' });
      await expect(card.locator('.gb-card__cadernos')).toContainText('3 cadernos');
      await expect(card.locator('.gb-card__cadernos')).toContainText('Verde');
      // Prova de um caderno só não ganha chip de caderno.
      await expect(page.locator('.gb-card', { hasText: 'N2 · 3º período' }).locator('.gb-card__cadernos')).toHaveCount(0);
    });

    test('aluno escolhe o caderno, cada um tem a sua folha e as marcações não se misturam', async ({ page }) => {
      await page.goto(`/gabaritos/${SLUG_CADERNOS}`);
      await page.getByRole('link', { name: /Já tenho conta/ }).click();
      await entrar(page);
      await expect(page).toHaveURL(new RegExp(`/dashboard/gabaritos/${SLUG_CADERNOS}$`), { timeout: 15_000 });

      // Sem escolher, nenhuma resposta aparece: nunca "chuta" um caderno.
      await expect(page.getByRole('heading', { name: 'Qual é o seu caderno?' })).toBeVisible();
      await expect(page.locator('.gb-tile')).toHaveCount(0);

      // A anulada é a mesma questão, em posição diferente em cada caderno.
      await page.locator('.gb-caderno-card', { hasText: 'Verde' }).click();
      await expect(page.locator('.gb-tile')).toHaveCount(40);
      await expect(page.getByRole('button', { name: /^Questão 31: anulada/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Questão 12: anulada/ })).toHaveCount(0);

      // Marca no Verde e confere que o Azul começa limpo.
      await page.getByRole('tab', { name: /Conferir minha nota/ }).click();
      await page.getByRole('button', { name: 'Questão 1, letra A' }).click();
      await expect(page.getByText('1 de 40 marcadas')).toBeVisible();
      await page.getByRole('tab', { name: 'Azul', exact: true }).click();
      await expect(page.getByText('0 de 40 marcadas')).toBeVisible();
      await page.getByRole('tab', { name: /Ver gabarito/ }).click();
      await expect(page.getByRole('button', { name: /^Questão 12: anulada/ })).toBeVisible();

      // O Verde guardou a marcação, e o caderno escolhido é lembrado na volta.
      await page.reload();
      await expect(page.locator('.gb-cadernos__bar button.is-on')).toHaveText('Azul');
      await page.getByRole('tab', { name: 'Verde', exact: true }).click();
      await page.getByRole('tab', { name: /Conferir minha nota/ }).click();
      await expect(page.getByText('1 de 40 marcadas')).toBeVisible();
    });

    test('admin cadastra uma prova com 2 cadernos, recarrega e exclui', async ({ page }) => {
      await page.goto('/login');
      await entrar(page);
      await page.waitForURL(/dashboard|admin/);
      await page.goto('/admin/gabaritos/novo');

      await page.getByRole('button', { name: 'N1', exact: true }).click();
      await page.getByRole('radio', { name: '9º', exact: true }).click();
      await expect(page.locator('.ed-cad-solo')).toBeVisible();
      await page.getByRole('button', { name: 'Adicionar caderno' }).click();

      // Ao passar de 1 para 2 cadernos: "Caderno A" e "Caderno B", renomeáveis.
      await expect(page.getByLabel('Nome do caderno 1')).toHaveValue('Caderno A');
      await expect(page.getByLabel('Nome do caderno 2')).toHaveValue('Caderno B');
      await page.getByLabel('Nome do caderno 1').fill('Azul');
      await page.getByLabel('Nome do caderno 2').fill('Verde');

      // Nome repetido bloqueia o save.
      await page.getByLabel('Nome do caderno 2').fill('azul');
      // As duas linhas ficam sinalizadas: o conflito é dos dois nomes.
      await expect(page.getByText('Já existe um caderno com esse nome.')).toHaveCount(2);
      await page.getByLabel('Nome do caderno 2').fill('Verde');

      const colar = async (nomeAba: string, letras: string) => {
        await page.getByRole('tab', { name: new RegExp(nomeAba) }).click();
        await page.getByRole('button', { name: 'Colar gabarito' }).click();
        await page.locator('#ed-colar-txt').fill(letras);
        await page.getByRole('button', { name: 'Aplicar na folha' }).click();
      };
      await colar('Azul', 'ABCDE');
      await colar('Verde', 'EDCBA');

      await page.getByRole('button', { name: 'Salvar rascunho' }).click();
      await expect(page).toHaveURL(/\/admin\/gabaritos\/n1-9-periodo-/, { timeout: 15_000 });

      // Recarrega: os dois cadernos voltam, cada um com a sua folha.
      await page.reload();
      await expect(page.getByLabel('Nome do caderno 1')).toHaveValue('Azul');
      await expect(page.getByLabel('Nome do caderno 2')).toHaveValue('Verde');
      await page.getByRole('tab', { name: /Verde/ }).click();
      await expect(page.getByRole('button', { name: 'Questão 1, letra E' })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('tab', { name: /Azul/ }).click();
      await expect(page.getByRole('button', { name: 'Questão 1, letra A' })).toHaveAttribute('aria-pressed', 'true');

      // Limpeza: exclui o rascunho criado pelo teste.
      await page.goto('/admin/gabaritos');
      const card = page.locator('.gab-card', { hasText: 'N1 · 9º período' }).first();
      await expect(card.locator('.gab-cads')).toContainText('Azul');
      await card.getByRole('button', { name: 'Excluir gabarito' }).click();
      await page.getByRole('button', { name: 'Excluir', exact: true }).click();
      await expect(page.locator('.gab-card', { hasText: 'N1 · 9º período' })).toHaveCount(0);
    });
  });
});
