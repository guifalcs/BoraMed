import { test, expect } from '@playwright/test';
import { PesquisaModalPage } from './pages/pesquisa-modal.page';

// ─── Dados de teste ──────────────────────────────────────────────────────────

const PESQUISA = {
  id: 'pesquisa-1',
  titulo: 'Como está sendo sua experiência no BoraMed?',
  descricao: 'São 5 perguntas rápidas.',
  perguntas: [
    {
      id: 'q-nps',
      tipo: 'nps',
      enunciado: 'De 0 a 10, o quanto você recomendaria o BoraMed?',
      ajuda: null,
      obrigatoria: true,
      escala_min: 0,
      escala_max: 10,
      escala_min_label: null,
      escala_max_label: null,
      opcoes: [],
    },
    {
      id: 'q-unica',
      tipo: 'escolha_unica',
      enunciado: 'Qual módulo você mais usa?',
      ajuda: null,
      obrigatoria: false,
      escala_min: 1,
      escala_max: 5,
      escala_min_label: null,
      escala_max_label: null,
      opcoes: [
        { id: 'o-treinos', label: 'Treinos nacionais' },
        { id: 'o-flashcards', label: 'Flashcards' },
      ],
    },
    {
      id: 'q-multipla',
      tipo: 'multipla_escolha',
      enunciado: 'O que você quer ver primeiro?',
      ajuda: 'Pode marcar mais de uma.',
      obrigatoria: false,
      escala_min: 1,
      escala_max: 5,
      escala_min_label: null,
      escala_max_label: null,
      opcoes: [
        { id: 'o-lab', label: 'Mais questões de laboratório' },
        { id: 'o-app', label: 'Aplicativo para celular' },
      ],
    },
    {
      id: 'q-escala',
      tipo: 'escala',
      enunciado: 'O quanto as explicações te ajudam?',
      ajuda: null,
      obrigatoria: false,
      escala_min: 1,
      escala_max: 5,
      escala_min_label: 'Pouco',
      escala_max_label: 'Muito',
      opcoes: [],
    },
    {
      id: 'q-texto',
      tipo: 'texto_longo',
      enunciado: 'O que mais faz falta hoje?',
      ajuda: null,
      obrigatoria: false,
      escala_min: 1,
      escala_max: 5,
      escala_min_label: null,
      escala_max_label: null,
      opcoes: [],
    },
  ],
};

const AVISO = {
  id: 'aviso-1',
  titulo: 'Aviso de manutenção',
  mensagem: 'Vamos ficar fora do ar por 10 minutos.',
  imagem_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
  ativo: true,
  criado_em: '2026-01-01T00:00:00Z',
  segmento: 'todos',
};

const fakeUser = {
  id: 'user-test-pesquisas',
  email: 'pesquisas@boramed.com',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Usuária Pesquisas' },
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
};

const fakeProfile = {
  id: fakeUser.id,
  nome_completo: 'Usuária Pesquisas',
  email: fakeUser.email,
  papel: 'aluno',
  avatar_url: null,
  tipo_usuario: null,
  periodo: 5,
  faculdade_rede: null,
  faculdade_unidade: 'ipatinga_mg',
  competir_publico: false,
  criado_em: '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
};

// ─── Sessão falsa (padrão canônico: ver memória `e2e-auth-via-cookie-ssr`) ───

test.use({ storageState: { cookies: [], origins: [] } });

const FAKE_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(JSON.stringify({ sub: fakeUser.id, email: fakeUser.email, role: 'authenticated', exp: 9999999999 })) +
  '.fake-signature';

const FAR_FUTURE_EXPIRES_AT = 4070908800;

const fakeSession = {
  access_token: FAKE_ACCESS_TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: FAR_FUTURE_EXPIRES_AT,
  refresh_token: 'fake-refresh-token',
  user: fakeUser,
};

function toBase64URL(str: string): string {
  return Buffer.from(str, 'utf8').toString('base64url');
}

type PlaywrightPage = Parameters<typeof test>[1] extends { page: infer P } ? P : never;

interface Chamadas {
  responder: { p_pesquisa_id: string; p_itens: unknown[] }[];
  dispensar: { p_pesquisa_id: string }[];
  /** Quantas vezes a fila de pesquisas foi buscada. */
  buscou: number;
}

/**
 * Injeta a sessão fake, mocka o mínimo que o dashboard consulta e entra em
 * /dashboard. Devolve o registro das chamadas às RPCs de pesquisa.
 */
async function entrarNoDashboard(
  page: PlaywrightPage,
  options: { pesquisas?: unknown[]; avisos?: unknown[] } = {},
): Promise<Chamadas> {
  const chamadas: Chamadas = { responder: [], dispensar: [], buscou: 0 };

  await page.context().addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${toBase64URL(JSON.stringify(fakeSession))}`,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  // Catch-all primeiro: no Playwright a última rota registrada vence, então as
  // específicas abaixo têm precedência sobre estes genéricos.
  await page.route('**/rest/v1/rpc/**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/rest/v1/**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/realtime/v1/**', (route) => route.abort());

  await page.route('**/auth/v1/user', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeUser) });
  });

  await page.route('**/auth/v1/token**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession) });
  });

  await page.route('**/auth/v1/**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/rest/v1/profiles**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeProfile) });
  });

  // Tour concluído: a pesquisa só aparece depois do onboarding, e sem este
  // mock o estado default seria `not_started` (tour aberto na frente).
  await page.route('**/rest/v1/user_onboarding_state**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user_id: fakeUser.id,
        flow_key: 'dashboard_intro',
        flow_version: 1,
        status: 'completed',
        current_step: null,
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:05:00Z',
        skipped_at: null,
        metadata: {},
        criado_em: '2024-01-01T00:00:00Z',
        atualizado_em: '2024-01-01T00:05:00Z',
      }),
    });
  });

  await page.route('**/rest/v1/rpc/tem_assinatura_ativa**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
  });

  await page.route('**/rest/v1/rpc/get_status_acesso**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ nivel: 'avancado', tentativas_limite: 3, tentativas_restantes: null, tentativas_usadas: null }),
    });
  });

  await page.route('**/rest/v1/rpc/buscar_avisos_pendentes**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(options.avisos ?? []),
    });
  });

  await page.route('**/rest/v1/rpc/buscar_pesquisas_pendentes**', (route) => {
    chamadas.buscou += 1;
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(options.pesquisas ?? [PESQUISA]),
    });
  });

  await page.route('**/rest/v1/rpc/responder_pesquisa**', (route) => {
    chamadas.responder.push(route.request().postDataJSON());
    void route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/rest/v1/rpc/dispensar_pesquisa**', (route) => {
    chamadas.dispensar.push(route.request().postDataJSON());
    void route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/dashboard');
  return chamadas;
}

// ─── Testes ──────────────────────────────────────────────────────────────────

test.describe('Pesquisas in-app', () => {
  test('o modal abre na entrada do dashboard com todos os tipos de campo', async ({ page }) => {
    await entrarNoDashboard(page);
    const modal = new PesquisaModalPage(page);

    await expect(modal.modal).toBeVisible({ timeout: 10_000 });
    await expect(modal.titulo).toHaveText(PESQUISA.titulo);

    // NPS: 11 botões (0 a 10).
    await expect(modal.pergunta(PESQUISA.perguntas[0].enunciado).getByRole('button')).toHaveCount(11);
    await expect(modal.alternativa(PESQUISA.perguntas[1].enunciado, 'Treinos nacionais')).toBeVisible();
    await expect(modal.alternativa(PESQUISA.perguntas[2].enunciado, 'Aplicativo para celular')).toBeVisible();
    await expect(modal.pergunta(PESQUISA.perguntas[3].enunciado).getByRole('button')).toHaveCount(5);
    await expect(modal.campoTexto(PESQUISA.perguntas[4].enunciado)).toBeVisible();
  });

  test('enviar sem responder a obrigatória mostra erro e não chama a RPC', async ({ page }) => {
    const chamadas = await entrarNoDashboard(page);
    const modal = new PesquisaModalPage(page);

    await expect(modal.modal).toBeVisible({ timeout: 10_000 });
    await modal.botaoEnviar.click();

    await expect(modal.erro).toBeVisible();
    expect(chamadas.responder).toHaveLength(0);
    await expect(modal.modal).toBeVisible();
  });

  test('responder envia só as perguntas preenchidas e mostra o agradecimento', async ({ page }) => {
    const chamadas = await entrarNoDashboard(page);
    const modal = new PesquisaModalPage(page);

    await expect(modal.modal).toBeVisible({ timeout: 10_000 });

    await modal.nota(PESQUISA.perguntas[0].enunciado, 9).click();
    await modal.alternativa(PESQUISA.perguntas[1].enunciado, 'Flashcards').click();
    await modal.alternativa(PESQUISA.perguntas[2].enunciado, 'Aplicativo para celular').click();
    await modal.campoTexto(PESQUISA.perguntas[4].enunciado).fill('Mais questões de pediatria.');

    await modal.botaoEnviar.click();
    await expect(modal.agradecimento).toBeVisible();

    expect(chamadas.responder).toHaveLength(1);
    const payload = chamadas.responder[0];
    expect(payload.p_pesquisa_id).toBe(PESQUISA.id);
    // A escala ficou em branco: pergunta pulada não vira item.
    expect(payload.p_itens).toEqual([
      { pergunta_id: 'q-nps', texto: null, numero: 9, opcao_ids: [] },
      { pergunta_id: 'q-unica', texto: null, numero: null, opcao_ids: ['o-flashcards'] },
      { pergunta_id: 'q-multipla', texto: null, numero: null, opcao_ids: ['o-app'] },
      { pergunta_id: 'q-texto', texto: 'Mais questões de pediatria.', numero: null, opcao_ids: [] },
    ]);
  });

  test('"Agora não" dispensa a pesquisa e fecha o modal', async ({ page }) => {
    const chamadas = await entrarNoDashboard(page);
    const modal = new PesquisaModalPage(page);

    await expect(modal.modal).toBeVisible({ timeout: 10_000 });
    await modal.botaoAgoraNao.click();

    await expect(modal.modal).not.toBeVisible();
    expect(chamadas.dispensar).toEqual([{ p_pesquisa_id: PESQUISA.id }]);
  });

  test('aviso pendente tem prioridade: a pesquisa nem é buscada e não pula ao fechar o aviso', async ({ page }) => {
    const chamadas = await entrarNoDashboard(page, { avisos: [AVISO] });
    const modal = new PesquisaModalPage(page);

    const avisoModal = page.locator('app-aviso-modal .modal');
    await expect(avisoModal).toBeVisible({ timeout: 10_000 });
    await expect(modal.modal).not.toBeVisible();

    // Fechar o aviso não pode fazer a pesquisa aparecer no lugar: ela ficou
    // para a próxima entrada, então a fila sequer foi carregada.
    await page.locator('app-aviso-modal').getByRole('button', { name: 'Fechar aviso' }).click();
    await expect(avisoModal).not.toBeVisible();
    await page.waitForTimeout(1_000);

    await expect(modal.modal).not.toBeVisible();
    expect(chamadas.buscou).toBe(0);
  });
});
