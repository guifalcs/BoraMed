import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * E2E de eliminar alternativas na execução da prova — projeto `mocked`: toda a
 * rede é interceptada, então não depende do stack local nem do seed. O que
 * interessa aqui é o comportamento visível: riscar, não conseguir marcar o que
 * foi riscado, restaurar, o atalho de teclado e a risca sobreviver ao F5.
 */

test.use({ storageState: { cookies: [], origins: [] } });

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
  periodo: null,
  faculdade_rede: null,
  competir_publico: false,
  criado_em: '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
};

const tentativa = {
  id: 'tent-1',
  user_id: 'user-test-1',
  prova_id: 'prova-lab',
  modo: 'simulado',
  status: 'em_andamento',
  total_questoes: 1,
  total_respondidas: 0,
  acertos: 0,
  nota: null,
  iniciada_em: '2024-01-01T10:00:00Z',
  pausada_em: null,
  tempo_acumulado_segundos: 0,
  finalizada_em: null,
  criado_em: '2024-01-01T10:00:00Z',
};

const textos: Record<string, string> = {
  A: 'Infiltrado neutrofílico com necrose liquefativa',
  B: 'Infiltrado linfocitário perivascular',
  C: 'Granuloma epitelioide com células gigantes',
  D: 'Fibrose intersticial difusa sem infiltrado',
};

const questao = {
  id: 'q-fechada',
  prova_id: 'prova-lab',
  ordem_na_prova: 1,
  codigo_externo: null,
  enunciado_apoio: null,
  enunciado: 'Qual achado predomina na lâmina apresentada?',
  imagem_url: null,
  imagem_legenda: null,
  formato: 'multipla_escolha',
  explicacao: null,
  referencia: null,
  resposta_modelo: null,
  pontos_chave: [],
  criterios_correcao: null,
  recurso_texto: null,
  anulada: false,
  disciplina: 'PAT',
  periodo: 3,
  status: 'ativa',
  criado_em: '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
  alternativas: Object.entries(textos).map(([letra, texto], i) => ({
    id: `alt-${letra.toLowerCase()}`,
    questao_id: 'q-fechada',
    letra,
    texto,
    correta: null,
    ordem: i + 1,
    imagem_url: null,
  })),
  temas: [],
};

/**
 * Rotas são casadas em ordem INVERSA de registro (a última vence), por isso os
 * catch-all vêm primeiro e as rotas específicas depois.
 */
async function setupMocks(page: Page): Promise<string[]> {
  const respostasSalvas: string[] = [];

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

  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/rest/v1/**', (route: Route) => void json(route, []));
  await page.route('**/rest/v1/rpc/**', (route: Route) => void json(route, null));
  await page.route('**/realtime/v1/**', (route: Route) => void route.abort());

  await page.route('**/auth/v1/**', (route: Route) => void json(route, {}));
  await page.route('**/auth/v1/user', (route: Route) => void json(route, fakeUser));
  await page.route('**/auth/v1/token**', (route: Route) => void json(route, fakeSession));

  // Onboarding concluído: o tour guiado fica por cima da UI e intercepta cliques.
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

  await page.route('**/rest/v1/rpc/retomar_tentativa', (route: Route) => {
    void json(route, { tentativa, questoes: [questao] });
  });

  await page.route('**/rest/v1/rpc/salvar_resposta**', (route: Route) => {
    respostasSalvas.push(String(route.request().postDataJSON()?.p_alternativa_id));
    void json(route, null);
  });

  return respostasSalvas;
}

const URL_TENTATIVA = '/dashboard/simulados/prova-lab/tentativa/tent-1';

const alternativa = (page: Page, letra: keyof typeof textos) =>
  page.getByRole('radio', { name: `Alternativa ${letra}: ${textos[letra]}` });

const risca = (page: Page, letra: keyof typeof textos) =>
  page
    .locator('li', { has: page.getByRole('radio', { name: new RegExp(`^Alternativa ${letra}:`) }) })
    .locator('[data-testid="risca"]');

test.describe('Eliminar alternativas na execução', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto(URL_TENTATIVA);
    await expect(page.getByText('Qual achado predomina na lâmina apresentada?')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('risca a alternativa e impede que ela seja marcada', async ({ page }) => {
    await expect(risca(page, 'B')).toHaveCount(0);

    await page.getByRole('button', { name: 'Eliminar alternativa B' }).click();

    await expect(risca(page, 'B')).toBeVisible();
    await expect(alternativa(page, 'B')).toBeDisabled();
    // As outras seguem intactas.
    await expect(risca(page, 'A')).toHaveCount(0);
    await expect(alternativa(page, 'A')).toBeEnabled();
  });

  test('restaurar devolve a alternativa ao jogo', async ({ page }) => {
    await page.getByRole('button', { name: 'Eliminar alternativa B' }).click();
    await expect(risca(page, 'B')).toBeVisible();

    await page.getByRole('button', { name: 'Restaurar alternativa B' }).click();

    await expect(risca(page, 'B')).toHaveCount(0);
    await expect(alternativa(page, 'B')).toBeEnabled();
  });

  test('atalho Shift + letra risca sem responder', async ({ page }) => {
    const respostas = await setupMocks(page);

    await page.keyboard.press('Shift+D');

    await expect(risca(page, 'D')).toBeVisible();
    expect(respostas).toEqual([]);
  });

  test('a alternativa marcada não oferece o botão de riscar', async ({ page }) => {
    await alternativa(page, 'C').click();

    await expect(page.getByRole('button', { name: 'Eliminar alternativa C' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar alternativa A' })).toHaveCount(1);
  });

  test('no toque, segurar a alternativa risca (long press)', async ({ page }) => {
    const alvo = alternativa(page, 'B');
    const toque = { pointerType: 'touch', clientX: 200, clientY: 300 };

    await alvo.dispatchEvent('pointerdown', toque);
    await page.waitForTimeout(700);
    await alvo.dispatchEvent('pointerup', toque);

    await expect(risca(page, 'B')).toBeVisible();
    await expect(alvo).toBeDisabled();
  });

  test('no toque, arrastar (rolagem) não risca', async ({ page }) => {
    const alvo = alternativa(page, 'B');

    await alvo.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 200, clientY: 300 });
    await alvo.dispatchEvent('pointermove', { pointerType: 'touch', clientX: 200, clientY: 360 });
    await page.waitForTimeout(700);
    await alvo.dispatchEvent('pointerup', { pointerType: 'touch', clientX: 200, clientY: 360 });

    await expect(risca(page, 'B')).toHaveCount(0);
  });

  test('a risca sobrevive ao recarregar a página', async ({ page }) => {
    await page.getByRole('button', { name: 'Eliminar alternativa B' }).click();
    await expect(risca(page, 'B')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Qual achado predomina na lâmina apresentada?')).toBeVisible({
      timeout: 10_000,
    });

    await expect(risca(page, 'B')).toBeVisible();
  });
});
