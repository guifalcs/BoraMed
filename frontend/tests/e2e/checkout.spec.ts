import { test, expect, type Page } from '@playwright/test';

// E2E do checkout EMBUTIDO (Payment Brick): toda a rede é mockada (projeto
// `mocked` do CI) e o SDK do Mercado Pago é stubado via page.route — o stub
// expõe os callbacks do Brick e renderiza um botão "Pagar (stub)" que dispara
// o onSubmit com o form_data configurado em window.__stubFormData.

// ─── Dados de teste ──────────────────────────────────────────────────────────

const planoMocks = [
  {
    id: 'plano-mensal-1',
    slug: 'mensal',
    nome: 'Mensal',
    descricao: 'Acesso mensal recorrente',
    preco_centavos: 4990,
    moeda: 'BRL',
    frequency: 1,
    frequency_type: 'months',
    recorrente: true,
    ativo: true,
    ordem: 1,
  },
  {
    id: 'plano-semestral-1',
    slug: 'semestral',
    nome: 'Semestral',
    descricao: 'Melhor custo-benefício por 6 meses',
    preco_centavos: 19990,
    moeda: 'BRL',
    frequency: 6,
    frequency_type: 'months',
    recorrente: false,
    ativo: true,
    ordem: 2,
  },
];

const fakeUser = {
  id: 'user-test-checkout',
  email: 'checkout@boramed.com',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Usuário Checkout' },
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
};

const fakeProfile = {
  id: 'user-test-checkout',
  nome_completo: 'Usuário Checkout',
  email: 'checkout@boramed.com',
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
      sub: 'user-test-checkout',
      email: 'checkout@boramed.com',
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

const FAKE_COOKIE_VALUE = `base64-${Buffer.from(JSON.stringify(fakeSession), 'utf8').toString('base64url')}`;

// ─── Stub do SDK do Mercado Pago ─────────────────────────────────────────────

/**
 * Shim do sdk.mercadopago.com/js/v2: implementa MercadoPago().bricks().create
 * para os bricks `payment` e `statusScreen`. O brick `payment` renderiza um
 * botão data-testid="stub-pagar" que chama o onSubmit real do componente com
 * window.__stubFormData; o `statusScreen` renderiza data-testid="stub-status-screen".
 */
const SDK_STUB = `
window.__brickSettings = {};
window.MercadoPago = class {
  constructor(publicKey, opts) { this.publicKey = publicKey; }
  bricks() {
    return {
      create: async (brick, containerId, settings) => {
        window.__brickSettings[brick] = settings;
        const el = document.getElementById(containerId);
        if (brick === 'payment' && el) {
          const btn = document.createElement('button');
          btn.textContent = 'Pagar (stub)';
          btn.setAttribute('data-testid', 'stub-pagar');
          btn.onclick = () => {
            const data = window.__stubFormData || {
              selectedPaymentMethod: 'credit_card',
              formData: {
                token: 'tok-stub',
                payment_method_id: 'master',
                installments: 1,
                payer: { email: 'checkout@boramed.com' },
              },
            };
            Promise.resolve(settings.callbacks.onSubmit(data)).catch(() => {});
          };
          el.appendChild(btn);
        }
        if (brick === 'statusScreen' && el) {
          const div = document.createElement('div');
          div.setAttribute('data-testid', 'stub-status-screen');
          div.textContent = 'Challenge 3DS (stub)';
          el.appendChild(div);
        }
        if (settings.callbacks && settings.callbacks.onReady) settings.callbacks.onReady();
        return { unmount: () => {} };
      },
    };
  }
};
`;

// ─── Setup ───────────────────────────────────────────────────────────────────

interface SetupOpts {
  temAcesso?: boolean;
  sdkFalha?: boolean;
  intencao?: () => Record<string, unknown> | null;
  extraRoutes?: (page: Page) => Promise<void>;
}

async function setupCheckout(page: Page, targetUrl: string, opts: SetupOpts = {}): Promise<void> {
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

  // Fallback genérico do PostgREST (registrado primeiro = menor prioridade).
  await page.route('**/rest/v1/**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

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
  await page.route('**/rest/v1/profiles**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeProfile) });
  });
  await page.route('**/rest/v1/rpc/tem_assinatura_ativa**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(opts.temAcesso ?? false),
    });
  });
  await page.route('**/rest/v1/plano**', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(planoMocks) });
  });
  await page.route('**/rest/v1/pagamento_intencao**', (route) => {
    const intencao = opts.intencao?.() ?? null;
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(intencao),
    });
  });
  await page.route('**/realtime/v1/**', (route) => void route.abort());

  // SDK do Mercado Pago: stub ou falha de carregamento.
  await page.route('https://sdk.mercadopago.com/js/v2', (route) => {
    if (opts.sdkFalha) {
      void route.abort();
    } else {
      void route.fulfill({ status: 200, contentType: 'application/javascript', body: SDK_STUB });
    }
  });

  if (opts.extraRoutes) await opts.extraRoutes(page);

  await page.goto(targetUrl);
}

/** Define o form_data que o stub entregará ao onSubmit do Brick. */
async function setStubFormData(page: Page, formData: Record<string, unknown>): Promise<void> {
  await page.evaluate((fd) => {
    (window as unknown as Record<string, unknown>)['__stubFormData'] = fd;
  }, formData);
}

const intencaoBase = {
  id: 'int-e2e-1',
  user_id: 'user-test-checkout',
  plano_id: 'plano-semestral-1',
  tipo: 'acesso_unico',
  mp_payment_id: '999',
  valor_centavos: 19990,
  metodo: 'master',
  parcelas: 6,
  status: 'pendente',
  status_detail: null,
  expira_em: null,
  criado_em: '2026-07-03T12:00:00.000Z',
};

// ─── Testes ──────────────────────────────────────────────────────────────────

test.describe('Checkout embutido (/checkout/:plano)', () => {
  test('monta o Payment Brick com o resumo e preço do plano', async ({ page }) => {
    await setupCheckout(page, '/checkout/semestral');

    await expect(page.getByRole('heading', { name: 'Plano Semestral' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('R$ 199,90')).toBeVisible();
    await expect(page.getByTestId('stub-pagar')).toBeVisible({ timeout: 10_000 });
  });

  test('usuário com acesso ativo é redirecionado ao dashboard sem checkout', async ({ page }) => {
    await setupCheckout(page, '/checkout/semestral', { temAcesso: true });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('plano inexistente volta para /planos', async ({ page }) => {
    await setupCheckout(page, '/checkout/nao-existe');
    await expect(page).toHaveURL(/\/planos/, { timeout: 10_000 });
  });

  test('SDK do MP não carrega → mensagem de fallback com "Tentar novamente"', async ({ page }) => {
    await setupCheckout(page, '/checkout/semestral', { sdkFalha: true });

    await expect(
      page.getByText(/Não foi possível carregar o pagamento seguro/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Tentar novamente/i })).toBeVisible();
  });

  test('pagamento aprovado → tela de sucesso → dashboard', async ({ page }) => {
    await setupCheckout(page, '/checkout/semestral', {
      temAcesso: false,
      intencao: () => ({ ...intencaoBase, status: 'aprovada', status_detail: 'accredited' }),
      extraRoutes: async (p) => {
        await p.route('**/functions/v1/mp-processar-pagamento**', (route) => {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              intencao_id: 'int-e2e-1',
              payment_id: '999',
              status: 'approved',
              status_detail: 'accredited',
            }),
          });
        });
        // O pós-aprovação confirma o acesso via RPC → true
        await p.route('**/rest/v1/rpc/tem_assinatura_ativa**', (route, request) => {
          void request;
          void route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
        });
      },
    });

    // O guard inicial do checkout usa o mesmo RPC; como o extraRoute devolve
    // true, precisamos entrar direto: sobrescreve após a montagem não é
    // possível — então este cenário monta com RPC false e troca para true
    // somente após o clique (ver stub abaixo).
    await expect(page.getByTestId('stub-pagar')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('stub-pagar').click();

    await expect(page).toHaveURL(/\/checkout\/status\/int-e2e-1/, { timeout: 10_000 });
    await expect(page.getByTestId('status-aprovado')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /Pagamento aprovado/i })).toBeVisible();

    await expect(page.getByTestId('ir-dashboard')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('ir-dashboard').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test('cartão recusado (insufficient_amount) → banner específico e retry no próprio checkout', async ({ page }) => {
    await setupCheckout(page, '/checkout/semestral', {
      extraRoutes: async (p) => {
        await p.route('**/functions/v1/mp-processar-pagamento**', (route) => {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              intencao_id: 'int-e2e-1',
              payment_id: '999',
              status: 'rejected',
              status_detail: 'cc_rejected_insufficient_amount',
            }),
          });
        });
      },
    });

    await expect(page.getByTestId('stub-pagar')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('stub-pagar').click();

    const banner = page.getByTestId('checkout-recusa');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText('Saldo ou limite insuficiente');
    await expect(banner).toContainText(/Pix/);
    // Permanece no checkout, com o Brick disponível para nova tentativa.
    await expect(page).toHaveURL(/\/checkout\/semestral/);
    await expect(page.getByTestId('stub-pagar')).toBeVisible();
  });

  test('falha de rede na edge → mensagem genérica sem sair do checkout', async ({ page }) => {
    await setupCheckout(page, '/checkout/semestral', {
      extraRoutes: async (p) => {
        await p.route('**/functions/v1/mp-processar-pagamento**', (route) => void route.abort());
      },
    });

    await expect(page.getByTestId('stub-pagar')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('stub-pagar').click();

    const banner = page.getByTestId('checkout-recusa');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText(/Não foi possível processar/i);
    await expect(page).toHaveURL(/\/checkout\/semestral/);
  });

  test('Pix: QR + copia-e-cola + countdown; polling libera ao aprovar', async ({ page }) => {
    const expiraEm = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    let consultas = 0;
    await setupCheckout(page, '/checkout/semestral', {
      // 1ª leitura: pendente; a partir da 3ª: aprovada (simula o webhook).
      intencao: () => {
        consultas += 1;
        return {
          ...intencaoBase,
          metodo: 'pix',
          parcelas: null,
          status: consultas >= 3 ? 'aprovada' : 'pendente',
          expira_em: expiraEm,
        };
      },
      extraRoutes: async (p) => {
        await p.route('**/functions/v1/mp-processar-pagamento**', (route) => {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              intencao_id: 'int-e2e-1',
              payment_id: '999',
              status: 'pending',
              status_detail: 'pending_waiting_transfer',
              pix: {
                qr_code: 'PIX-COPIA-E-COLA-STUB',
                qr_code_base64: Buffer.from('fake-png').toString('base64'),
                ticket_url: 'https://mp.com/pix/1',
                expira_em: expiraEm,
              },
            }),
          });
        });
      },
    });

    await expect(page.getByTestId('stub-pagar')).toBeVisible({ timeout: 10_000 });
    await setStubFormData(page, {
      selectedPaymentMethod: 'bank_transfer',
      formData: { payment_method_id: 'pix', payer: { email: 'checkout@boramed.com' } },
    });
    await page.getByTestId('stub-pagar').click();

    await expect(page).toHaveURL(/\/checkout\/status\/int-e2e-1/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /Pague com Pix/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('pix-qr')).toBeVisible();
    await expect(page.getByTestId('pix-countdown')).toContainText(/2\d:\d{2}/);
    await expect(page.getByTestId('pix-copiar')).toBeVisible();

    // Polling (3s) detecta a aprovação vinda "do webhook".
    await expect(page.getByTestId('status-aprovado')).toBeVisible({ timeout: 20_000 });
  });

  test('boleto: link para abrir + "Já paguei, verificar"', async ({ page }) => {
    const expiraEm = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await setupCheckout(page, '/checkout/semestral', {
      intencao: () => ({
        ...intencaoBase,
        metodo: 'bolbradesco',
        parcelas: null,
        status: 'pendente',
        status_detail: 'pending_waiting_payment',
        expira_em: expiraEm,
      }),
      extraRoutes: async (p) => {
        await p.route('**/functions/v1/mp-processar-pagamento**', (route) => {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              intencao_id: 'int-e2e-1',
              payment_id: '999',
              status: 'pending',
              status_detail: 'pending_waiting_payment',
              boleto: { url: 'https://mp.com/boleto/e2e', expira_em: expiraEm },
            }),
          });
        });
        await p.route('**/functions/v1/mp-consultar-pagamento**', (route) => {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'pending', status_detail: 'pending_waiting_payment' }),
          });
        });
      },
    });

    await expect(page.getByTestId('stub-pagar')).toBeVisible({ timeout: 10_000 });
    await setStubFormData(page, {
      selectedPaymentMethod: 'ticket',
      formData: {
        payment_method_id: 'bolbradesco',
        payer: {
          email: 'checkout@boramed.com',
          identification: { type: 'CPF', number: '12345678909' },
        },
      },
    });
    await page.getByTestId('stub-pagar').click();

    await expect(page.getByTestId('status-boleto')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('boleto-link')).toHaveAttribute('href', 'https://mp.com/boleto/e2e');
    await expect(page.getByText(/acesso será liberado automaticamente/i)).toBeVisible();

    await page.getByTestId('ja-paguei').click();
    await expect(page.getByText(/Ainda não identificamos o pagamento/i)).toBeVisible({ timeout: 10_000 });
  });

  test('3DS: challenge do banco montado no Status Screen Brick', async ({ page }) => {
    await setupCheckout(page, '/checkout/semestral', {
      intencao: () => ({
        ...intencaoBase,
        status: 'pendente',
        status_detail: 'pending_challenge',
      }),
      extraRoutes: async (p) => {
        await p.route('**/functions/v1/mp-processar-pagamento**', (route) => {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              intencao_id: 'int-e2e-1',
              payment_id: '999',
              status: 'pending',
              status_detail: 'pending_challenge',
              three_ds: { external_resource_url: 'https://acs.banco.com/challenge', creq: 'creq-stub' },
            }),
          });
        });
      },
    });

    await expect(page.getByTestId('stub-pagar')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('stub-pagar').click();

    await expect(page.getByRole('heading', { name: /Confirmação do seu banco/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('stub-status-screen')).toBeVisible({ timeout: 10_000 });
  });

  test('pagamento em análise (pending_contingency) → estado pendente informativo', async ({ page }) => {
    await setupCheckout(page, '/checkout/semestral', {
      intencao: () => ({
        ...intencaoBase,
        status: 'pendente',
        status_detail: 'pending_contingency',
      }),
      extraRoutes: async (p) => {
        await p.route('**/functions/v1/mp-processar-pagamento**', (route) => {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              intencao_id: 'int-e2e-1',
              payment_id: '999',
              status: 'in_process',
              status_detail: 'pending_contingency',
            }),
          });
        });
      },
    });

    await expect(page.getByTestId('stub-pagar')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('stub-pagar').click();

    await expect(page.getByTestId('status-pendente')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/em análise/i).first()).toBeVisible();
  });

  test('mensal: submit envia card_token e assinatura autorizada → status aprovado', async ({ page }) => {
    let bodyEnviado: Record<string, unknown> | null = null;
    await setupCheckout(page, '/checkout/mensal', {
      intencao: () => ({
        ...intencaoBase,
        tipo: 'assinatura',
        plano_id: 'plano-mensal-1',
        metodo: 'credit_card',
        parcelas: 1,
        status: 'aprovada',
      }),
      extraRoutes: async (p) => {
        await p.route('**/functions/v1/mp-processar-assinatura**', (route) => {
          bodyEnviado = route.request().postDataJSON() as Record<string, unknown>;
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ intencao_id: 'int-e2e-1', status: 'authorized', status_detail: null }),
          });
        });
        await p.route('**/rest/v1/rpc/tem_assinatura_ativa**', (route) => {
          void route.fulfill({ status: 200, contentType: 'application/json', body: 'false' });
        });
      },
    });

    await expect(page.getByRole('heading', { name: 'Plano Mensal' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('stub-pagar')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('stub-pagar').click();

    await expect(page).toHaveURL(/\/checkout\/status\/int-e2e-1/, { timeout: 10_000 });
    await expect(page.getByTestId('status-aprovado')).toBeVisible({ timeout: 10_000 });

    expect(bodyEnviado).not.toBeNull();
    const enviado = bodyEnviado as unknown as Record<string, unknown>;
    expect(enviado['plano_slug']).toBe('mensal');
    expect(enviado['card_token_id']).toBe('tok-stub');
    expect(typeof enviado['attempt_id']).toBe('string');
    // Nenhum valor/preço sai do cliente.
    expect(enviado['amount']).toBeUndefined();
    expect(enviado['preco_centavos']).toBeUndefined();
  });
});
