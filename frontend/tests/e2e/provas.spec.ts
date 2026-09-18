import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * E2E da listagem de treinos nacionais — projeto `mocked`: toda a rede é
 * interceptada, sem depender do stack local.
 *
 * O mock de `/rest/v1/prova` **respeita os filtros da URL** (a tela usa
 * `.or(...)`, que vira `or=(subtipo.in.(...))` e `or=(periodo.in.(...),
 * periodo.is.null)`): é o que faz os testes de filtro valerem alguma coisa —
 * sem isso eles passariam mesmo se a tela não filtrasse nada.
 */

test.use({ storageState: { cookies: [], origins: [] } });

// ─── Dados de teste ──────────────────────────────────────────────────────────

const provaMocks = [
  {
    id: 'prova-1',
    faculdade_id: 'fac-1',
    nome: 'Treino N1 2024 — 1º Período',
    periodo: 1,
    tipo: 'autoral',
    origem: 'autoral',
    formato: 'nacional',
    rede: 'afya',
    subtipo: 'N1',
    subtipo_nacional: 'N1',
    qtd_questoes: 30,
    publicada: true,
    arquivada: false,
    criado_em: '2024-01-01T00:00:00Z',
  },
  {
    id: 'prova-2',
    faculdade_id: 'fac-1',
    nome: 'Treino N2 2024 — 4º Período',
    periodo: 4,
    tipo: 'autoral',
    origem: 'autoral',
    formato: 'nacional',
    rede: 'afya',
    subtipo: 'N2',
    subtipo_nacional: 'N2',
    qtd_questoes: 40,
    publicada: true,
    arquivada: false,
    criado_em: '2024-07-01T00:00:00Z',
  },
  {
    id: 'prova-3',
    faculdade_id: 'fac-1',
    nome: 'Teste de Progresso 2023 — 6º Período',
    periodo: 6,
    tipo: 'autoral',
    origem: 'autoral',
    formato: 'nacional',
    rede: 'afya',
    subtipo: 'TPI',
    subtipo_nacional: 'teste_progresso',
    qtd_questoes: 50,
    publicada: true,
    arquivada: false,
    criado_em: '2023-01-01T00:00:00Z',
  },
  {
    id: 'prova-4',
    faculdade_id: 'fac-1',
    nome: 'Treino N1 2023 — 1º Período',
    periodo: 1,
    tipo: 'autoral',
    origem: 'autoral',
    formato: 'nacional',
    rede: 'afya',
    subtipo: 'N1',
    subtipo_nacional: 'N1',
    qtd_questoes: 30,
    publicada: true,
    arquivada: false,
    criado_em: '2023-01-01T00:00:00Z',
  },
];

const fakeUser = {
  id: 'user-test-1',
  email: 'teste@boramed.com',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Usuário de Teste' },
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
};

const FAKE_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-test-1',
      email: 'teste@boramed.com',
      role: 'authenticated',
      exp: 9999999999,
    }),
  ) +
  '.fake-signature';

const SUPABASE_COOKIE_NAME = 'sb-127-auth-token';

const fakeSession = {
  access_token: FAKE_ACCESS_TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4070908800,
  refresh_token: 'fake-refresh-token',
  user: fakeUser,
};

const fakeProfile = {
  id: 'user-test-1',
  nome_completo: 'Usuário de Teste',
  email: 'teste@boramed.com',
  papel: 'aluno',
  avatar_url: null,
  tipo_usuario: null,
  // Preenchidos: `precisaDadosObrigatorios` dispara com `periodo` ou
  // `faculdade_unidade` em `null`, e aí o modal "Complete seus dados" cobre a
  // tela e intercepta todo clique do teste.
  periodo: 5,
  faculdade_unidade: 'ipatinga_mg',
  faculdade_rede: 'afya',
  competir_publico: false,
  criado_em: '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
};

const URL_TREINOS = '/dashboard/simulados/rede-afya';

/**
 * A tela filtra com `.or(...)`, então cada filtro chega como um parâmetro
 * `or=(...)` — e não como `coluna=in.(...)`. Aqui só se extrai a lista de
 * valores do `or` que menciona a coluna procurada.
 */
function valoresDoFiltro(url: URL, coluna: string): string[] | null {
  const clausula = url.searchParams.getAll('or').find((o) => o.includes(`${coluna}.in.`));
  if (!clausula) return null;
  const lista = new RegExp(`${coluna}\\.in\\.\\(([^)]*)\\)`).exec(clausula);
  if (!lista) return null;
  return lista[1]!
    .split(',')
    .map((v) => v.replace(/^"|"$/g, '').trim())
    .filter(Boolean);
}

/**
 * Rotas são casadas em ordem INVERSA de registro (a última vence), por isso os
 * catch-all vêm primeiro e as rotas específicas depois.
 */
async function setupMocks(page: Page, provas: typeof provaMocks = provaMocks): Promise<void> {
  await page.context().addCookies([
    {
      name: SUPABASE_COOKIE_NAME,
      value: `base64-${Buffer.from(JSON.stringify(fakeSession), 'utf8').toString('base64url')}`,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  const json = (route: Route, body: unknown, headers?: Record<string, string>) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers,
      body: JSON.stringify(body),
    });

  await page.route('**/rest/v1/**', (route: Route) => void json(route, []));
  await page.route('**/rest/v1/rpc/**', (route: Route) => void json(route, null));
  await page.route('**/realtime/v1/**', (route: Route) => void route.abort());

  await page.route('**/auth/v1/**', (route: Route) => void json(route, {}));
  await page.route('**/auth/v1/user', (route: Route) => void json(route, fakeUser));
  await page.route('**/auth/v1/token**', (route: Route) => void json(route, fakeSession));

  await page.route(
    '**/rest/v1/user_onboarding_state**',
    (route: Route) =>
      void json(route, [
        {
          user_id: 'user-test-1',
          flow_key: 'dashboard_intro',
          flow_version: 1,
          status: 'completed',
          current_step: 'final',
          started_at: '2024-01-01T00:00:00.000Z',
          completed_at: '2024-01-01T00:05:00.000Z',
          skipped_at: null,
          metadata: {},
        },
      ]),
  );

  await page.route('**/rest/v1/profiles**', (route: Route) => void json(route, fakeProfile));
  await page.route('**/rest/v1/rpc/tem_assinatura_ativa**', (route: Route) => void json(route, true));
  await page.route('**/rest/v1/rpc/assinatura_tier**', (route: Route) => void json(route, 'avancado'));
  await page.route(
    '**/rest/v1/rpc/get_status_acesso**',
    (route: Route) =>
      void json(route, {
        nivel: 'avancado',
        tentativas_limite: 3,
        tentativas_restantes: null,
        tentativas_usadas: null,
      }),
  );

  // A tela pagina com `count: 'exact'`, que no PostgREST vem no Content-Range.
  await page.route('**/rest/v1/prova**', (route: Route) => {
    const url = new URL(route.request().url());
    const subtipos = valoresDoFiltro(url, 'subtipo');
    const periodos = valoresDoFiltro(url, 'periodo');

    // `periodo.is.null` entra junto no `or`: prova sem período (TPI) vale para
    // todos os períodos e nunca é recortada pelo filtro.
    const filtradas = provas.filter(
      (p) =>
        (!subtipos || subtipos.includes(p.subtipo)) &&
        (!periodos || p.periodo === null || periodos.includes(String(p.periodo))),
    );

    void json(route, filtradas, {
      'content-range': `0-${Math.max(filtradas.length - 1, 0)}/${filtradas.length}`,
    });
  });
}

const cards = (page: Page) => page.locator('app-prova-card');

/** Abre o multiselect e marca uma opção pelo texto. */
async function filtrarPor(page: Page, filtro: string, opcao: string): Promise<void> {
  await page.getByRole('button', { name: filtro, exact: true }).click();
  // `exact`: "1º período" e "11º período" casariam no mesmo prefixo.
  await page
    .getByRole('listbox', { name: filtro })
    .getByRole('option', { name: opcao, exact: true })
    .click();
  // O filtro refaz a consulta: espera a lista assentar antes de contar.
  await page.waitForTimeout(400);
}

// ─── Testes ──────────────────────────────────────────────────────────────────

test.describe('Treinos nacionais', () => {
  test.describe('Entrada pela home de simulados', () => {
    test('a home mostra o card de treinos nacionais', async ({ page }) => {
      await setupMocks(page);
      await page.goto('/dashboard/simulados');

      await expect(page.getByRole('heading', { name: 'Treinos nacionais' })).toBeVisible({
        timeout: 10_000,
      });
    });

    test('clicar no card leva para a lista de treinos nacionais', async ({ page }) => {
      await setupMocks(page);
      await page.goto('/dashboard/simulados');

      await page.getByRole('link', { name: /Treinos nacionais/ }).first().click();

      await expect(page).toHaveURL(/\/dashboard\/simulados\/rede-afya/, { timeout: 10_000 });
    });
  });

  test.describe('Lista de treinos nacionais', () => {
    test.beforeEach(async ({ page }) => {
      await setupMocks(page);
      await page.goto(URL_TREINOS);
      await page.waitForSelector('app-prova-card', { timeout: 10_000 });
    });

    test('as provas são listadas após carregar', async ({ page }) => {
      await expect(cards(page)).toHaveCount(provaMocks.length);
    });

    test('exibe o título da página', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Treinos nacionais' })).toBeVisible();
    });

    test('mantém o caminho de volta para simulados', async ({ page }) => {
      await expect(
        page.getByRole('main').getByRole('link', { name: 'Simulados', exact: true }),
      ).toBeVisible();
    });

    test.describe('Filtro por subtipo', () => {
      test('filtrar por N1 mostra apenas as provas N1', async ({ page }) => {
        await filtrarPor(page, 'Subtipo', 'N1');

        const n1 = provaMocks.filter((p) => p.subtipo === 'N1');
        await expect(cards(page)).toHaveCount(n1.length);
        for (const prova of n1) {
          await expect(page.getByText(prova.nome)).toBeVisible();
        }
      });

      test('filtrar por N1 tira da lista as provas N2 e TPI', async ({ page }) => {
        await filtrarPor(page, 'Subtipo', 'N1');

        for (const prova of provaMocks.filter((p) => p.subtipo !== 'N1')) {
          await expect(page.getByText(prova.nome)).toHaveCount(0);
        }
      });
    });

    test.describe('Filtro por período', () => {
      test('filtrar pelo 1º período mostra apenas as provas daquele período', async ({ page }) => {
        await filtrarPor(page, 'Periodo', '1º período');

        const doPrimeiro = provaMocks.filter((p) => p.periodo === 1);
        await expect(cards(page)).toHaveCount(doPrimeiro.length);
      });

      test('filtrar pelo 4º período mostra a prova N2 daquele período', async ({ page }) => {
        await filtrarPor(page, 'Periodo', '4º período');

        await expect(cards(page)).toHaveCount(1);
        await expect(page.getByText('Treino N2 2024 — 4º Período')).toBeVisible();
      });
    });
  });

  test.describe('Estado vazio', () => {
    test('sem prova disponível, mostra o empty state em vez de lista vazia', async ({ page }) => {
      await setupMocks(page, []);
      await page.goto(URL_TREINOS);

      await expect(page.getByText('Nenhum simulado encontrado')).toBeVisible({ timeout: 10_000 });
      await expect(cards(page)).toHaveCount(0);
    });
  });
});
