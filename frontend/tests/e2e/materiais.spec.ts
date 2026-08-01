import { test, expect } from '@playwright/test';

// ─── Dados de teste ──────────────────────────────────────────────────────────

const categoria = {
  id: 'cat-resumos-apg',
  slug: 'resumos-apg',
  titulo: 'Resumos de APGs',
  descricao: 'Resumos das atividades de problematização.',
  icone: 'file-text',
  gradiente: 'from-blue-500 to-purple-600',
  ordem: 0,
  ativo: true,
  criado_em: '2024-01-01T00:00:00Z',
};

// 12 arquivos para exercitar o scroll da lista.
const arquivos = Array.from({ length: 12 }, (_, i) => ({
  id: `arq-${i + 1}`,
  categoria_id: categoria.id,
  topico_id: null,
  titulo: i === 0 ? 'Cardiologia — Insuficiência Cardíaca' : `Resumo APG ${String(i + 1).padStart(2, '0')}`,
  descricao: null,
  storage_path: `resumos-apg/arq-${i + 1}.pdf`,
  mime_type: 'application/pdf',
  tamanho_bytes: 1024 * (i + 1) * 200,
  ordem: i,
  ativo: true,
  criado_em: '2024-01-01T00:00:00Z',
}));

// ─── Auth (padrão canônico: cookie @supabase/ssr) ────────────────────────────

const fakeUser = {
  id: 'user-test-materiais',
  email: 'materiais@boramed.com',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Usuário Materiais' },
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
};

const fakeProfile = {
  id: 'user-test-materiais',
  nome_completo: 'Usuário Materiais',
  email: 'materiais@boramed.com',
  papel: 'aluno',
  avatar_url: null,
  tipo_usuario: null,
  periodo: null,
  faculdade_rede: null,
  competir_publico: false,
  criado_em: '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
};

test.use({ storageState: { cookies: [], origins: [] } });

const FAKE_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(
    JSON.stringify({
      sub: 'user-test-materiais',
      email: 'materiais@boramed.com',
      role: 'authenticated',
      exp: 9999999999,
    }),
  ) +
  '.fake-signature';

const SUPABASE_COOKIE_NAME = 'sb-127-auth-token';
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

const FAKE_COOKIE_VALUE = `base64-${toBase64URL(JSON.stringify(fakeSession))}`;

type PlaywrightPage = Parameters<typeof test>[1] extends { page: infer P } ? P : never;

async function setupMocksAndGoto(page: PlaywrightPage, targetUrl: string): Promise<void> {
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

  // Auth
  await page.route('**/auth/v1/user', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeUser) });
  });
  await page.route('**/auth/v1/token**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...fakeSession }),
    });
  });
  await page.route('**/auth/v1/**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // Perfil + paywall + tier avançado (guards)
  await page.route('**/rest/v1/profiles**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeProfile) });
  });
  await page.route('**/rest/v1/rpc/tem_assinatura_ativa**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(true) });
  });
  await page.route('**/rest/v1/rpc/assinatura_tier**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('avancado') });
  });
  // RPC de gating desde o free tier — é quem o tierAvancadoGuard consulta.
  await page.route('**/rest/v1/rpc/get_status_acesso**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        nivel: 'avancado',
        tentativas_limite: 3,
        tentativas_restantes: null,
        tentativas_usadas: null,
      }),
    });
  });

  // Categoria por slug (.single) e lista de categorias (home)
  await page.route('**/rest/v1/material_categoria**', (route) => {
    const accept = route.request().headers()['accept'] ?? '';
    // .single() usa header Accept: application/vnd.pgrst.object+json
    if (accept.includes('vnd.pgrst.object')) {
      void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(categoria) });
      return;
    }
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([categoria]) });
  });

  // Arquivos da categoria
  await page.route('**/rest/v1/material_arquivo**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(arquivos) });
  });

  // Signed URL do storage
  await page.route('**/storage/v1/object/sign/**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ signedURL: '/fake-signed.pdf' }),
    });
  });

  await page.route('**/realtime/v1/**', (route) => {
    void route.abort();
  });

  await page.goto(targetUrl);
}

/**
 * Entra pela home e navega por cliques (client-side). Um `page.goto()` direto
 * numa rota protegida aninhada sofre round-trip SSR (getUser server-side não é
 * interceptável), então entramos por /dashboard e clicamos até a categoria.
 */
async function gotoCategoria(page: PlaywrightPage): Promise<void> {
  await setupMocksAndGoto(page, '/dashboard');
  await page.getByRole('link', { name: 'Materiais' }).first().click();
  await page.getByText('Resumos de APGs').first().click();
}

// ─── Testes ──────────────────────────────────────────────────────────────────

test.describe('Resumos APG — lista de arquivos', () => {
  test('lista os arquivos e mostra o contador', async ({ page }) => {
    await gotoCategoria(page);

    await expect(page.getByRole('heading', { name: /Arquivos \(12\)/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('option', { name: /Insuficiência Cardíaca/ })).toBeVisible();
  });

  test('lista de arquivos tem scroll próprio (overflow-y auto)', async ({ page }) => {
    await gotoCategoria(page);
    await expect(page.getByRole('listbox', { name: 'Arquivos disponíveis' })).toBeVisible({ timeout: 10_000 });

    const overflow = await page
      .getByRole('listbox', { name: 'Arquivos disponíveis' })
      .evaluate((el) => getComputedStyle(el).overflowY);
    expect(['auto', 'scroll']).toContain(overflow);
  });

  test('botão de voltar retorna à lista de materiais', async ({ page }) => {
    await gotoCategoria(page);
    await page.getByRole('button', { name: /Voltar aos materiais/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/materiais$/);
  });

  test('filtro por nome reduz a lista e mostra vazio quando nada casa', async ({ page }) => {
    await gotoCategoria(page);
    const busca = page.getByRole('searchbox', { name: /Buscar arquivo por nome/ });
    await expect(busca).toBeVisible({ timeout: 10_000 });

    await busca.fill('cardiologia');
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: /Arquivos \(1\)/ })).toBeVisible();

    await busca.fill('inexistente-xyz');
    await expect(page.getByText('Nenhum arquivo encontrado.')).toBeVisible();
  });
});
