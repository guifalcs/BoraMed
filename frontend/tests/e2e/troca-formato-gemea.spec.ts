import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * E2E da troca de formato (questão gêmea) na execução da prova — projeto
 * `mocked`: toda a rede é interceptada, então não depende do stack local nem
 * do seed. O que interessa aqui é a fiação ponta a ponta: o botão só aparece
 * quando existe gêmea, a RPC é chamada com a questão certa e o card passa a
 * renderizar a versão do outro formato no lugar da antiga.
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

/** Contrato de questão como as RPCs de tentativa devolvem (gabarito mascarado). */
function questao(overrides: Record<string, unknown>) {
  return {
    id: 'q-fechada',
    prova_id: 'prova-lab',
    ordem_na_prova: 1,
    codigo_externo: null,
    enunciado_apoio: null,
    enunciado: 'Qual estrutura predomina na lâmina?',
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
    alternativas: [
      { id: 'alt-a', questao_id: 'q-fechada', letra: 'A', texto: 'Infiltrado neutrofílico', correta: null, ordem: 1, imagem_url: null },
      { id: 'alt-b', questao_id: 'q-fechada', letra: 'B', texto: 'Infiltrado linfocitário', correta: null, ordem: 2, imagem_url: null },
    ],
    temas: [],
    ...overrides,
  };
}

const questaoFechada = questao({});
const questaoDiscursiva = questao({
  id: 'q-discursiva',
  formato: 'resposta_aberta_curta',
  enunciado: 'Descreva o infiltrado predominante na lâmina e justifique.',
  alternativas: [],
});

const respostaTrocada = {
  id: 'tr-1',
  tentativa_id: 'tent-1',
  questao_id: 'q-discursiva',
  alternativa_id: null,
  resposta_texto: null,
  correta: null,
  respondida_em: null,
  enviada_em: null,
  anulada_usuario: false,
  ordem_na_tentativa: 1,
  pontos: null,
  tempo_gasto_segundos: null,
};

type Opcoes = { comGemea?: boolean };

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

function toBase64URL(str: string): string {
  return Buffer.from(str, 'utf8').toString('base64url');
}

const FAKE_COOKIE_VALUE = `base64-${toBase64URL(JSON.stringify(fakeSession))}`;

/**
 * Rotas são casadas em ordem INVERSA de registro (a última vence), por isso os
 * catch-all vêm primeiro e as rotas específicas depois.
 */
async function setupMocks(page: Page, { comGemea = true }: Opcoes = {}): Promise<string[]> {
  const rpcsChamadas: string[] = [];

  await page.context().addCookies([
    {
      name: SUPABASE_COOKIE_NAME,
      value: FAKE_COOKIE_VALUE,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  // ── Catch-all (registrados primeiro = menor precedência) ──
  await page.route('**/rest/v1/**', (route: Route) => void json(route, []));
  await page.route('**/rest/v1/rpc/**', (route: Route) => void json(route, null));
  await page.route('**/realtime/v1/**', (route: Route) => void route.abort());

  // ── Auth ──
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

  // ── Perfil e gating (guards) ──
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

  // ── RPCs da tentativa ──
  // Entrada pela URL direta: o componente cai no fallback e retoma do servidor.
  await page.route('**/rest/v1/rpc/retomar_tentativa', (route: Route) => {
    rpcsChamadas.push('retomar_tentativa');
    void json(route, { tentativa, questoes: [questaoFechada] });
  });

  await page.route('**/rest/v1/rpc/get_gemeas_tentativa', (route: Route) => {
    rpcsChamadas.push('get_gemeas_tentativa');
    void json(
      route,
      comGemea
        ? [
            {
              questao_id: 'q-fechada',
              gemea_id: 'q-discursiva',
              formato_atual: 'multipla_escolha',
              formato_gemea: 'resposta_aberta_curta',
            },
          ]
        : [],
    );
  });

  await page.route('**/rest/v1/rpc/trocar_formato_questao_tentativa', (route: Route) => {
    rpcsChamadas.push(`trocar:${route.request().postDataJSON()?.p_questao_id}`);
    void json(route, {
      questao: questaoDiscursiva,
      resposta: respostaTrocada,
      gemea: {
        questao_id: 'q-discursiva',
        gemea_id: 'q-fechada',
        formato_atual: 'resposta_aberta_curta',
        formato_gemea: 'multipla_escolha',
      },
    });
  });

  return rpcsChamadas;
}

const URL_TENTATIVA = '/dashboard/simulados/prova-lab/tentativa/tent-1';

test.describe('Troca de formato (questão gêmea)', () => {
  test('trocar substitui a questão fechada pela discursiva na mesma posição', async ({ page }) => {
    const chamadas = await setupMocks(page);
    await page.goto(URL_TENTATIVA);

    await expect(page.getByText('Qual estrutura predomina na lâmina?')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('radio', { name: 'Alternativa A: Infiltrado neutrofílico' })).toBeVisible();

    await page.getByRole('button', { name: 'Responder por escrito' }).click();

    // O card passa a ser o da gêmea discursiva…
    await expect(
      page.getByText('Descreva o infiltrado predominante na lâmina e justifique.'),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('textbox', { name: 'Resposta discursiva' })).toBeVisible();
    // …e as alternativas da fechada somem.
    await expect(page.getByRole('radio', { name: 'Alternativa A: Infiltrado neutrofílico' })).toHaveCount(0);
    // Numeração da prova preservada.
    await expect(page.getByText('Questão 1', { exact: true })).toBeVisible();

    expect(chamadas).toContain('trocar:q-fechada');

    // Mapa invertido: dá para voltar ao formato fechado.
    await expect(page.getByRole('button', { name: 'Responder por alternativas' })).toBeVisible();
  });

  test('sem gêmea o botão não aparece', async ({ page }) => {
    await setupMocks(page, { comGemea: false });
    await page.goto(URL_TENTATIVA);

    await expect(page.getByText('Qual estrutura predomina na lâmina?')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Responder por escrito' })).toHaveCount(0);
  });

  test('depois de responder a questão o botão some', async ({ page }) => {
    await setupMocks(page);
    await page.goto(URL_TENTATIVA);

    await expect(page.getByRole('button', { name: 'Responder por escrito' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('radio', { name: 'Alternativa A: Infiltrado neutrofílico' }).click();

    await expect(page.getByRole('button', { name: 'Responder por escrito' })).toHaveCount(0);
  });
});
