import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * E2E do marca-texto da prova — projeto `mocked`: toda a rede é interceptada,
 * então não depende do stack local nem do seed. O que interessa é o
 * comportamento visível: grifar seleção, trocar de cor, apagar, sobreviver ao
 * F5 e não atrapalhar quem só quer responder a questão.
 *
 * A pintura usa a CSS Custom Highlight API, que não cria nó nenhum no DOM —
 * por isso as asserções leem `CSS.highlights` em vez de procurar elemento.
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
  // Preenchidos: sem eles o modal de dados obrigatórios cobre a tela inteira
  // e intercepta o clique no estojo de marca-texto.
  periodo: 5,
  faculdade_unidade: 'ipatinga_mg',
  faculdade_rede: 'afya',
  competir_publico: false,
  criado_em: '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
};

const tentativa = {
  id: 'tent-grifo',
  user_id: 'user-test-1',
  prova_id: 'prova-grifo',
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

const APOIO =
  'Homem de 58 anos, tabagista, chega com dor torácica retroesternal em aperto iniciada ha 2 horas.';
const ENUNCIADO = 'Qual e a conduta inicial mais adequada para este paciente?';

const textosAlternativas: Record<string, string> = {
  A: 'Solicitar troponina seriada e aguardar o resultado',
  B: 'Acionar a terapia de reperfusao imediatamente',
  C: 'Administrar nitrato e reavaliar em seis horas',
};

const questao = {
  id: 'q-grifo',
  prova_id: 'prova-grifo',
  ordem_na_prova: 1,
  codigo_externo: null,
  enunciado_apoio: APOIO,
  enunciado: ENUNCIADO,
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
  disciplina: 'CARDIO',
  periodo: 5,
  status: 'ativa',
  criado_em: '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
  alternativas: Object.entries(textosAlternativas).map(([letra, texto], i) => ({
    id: `alt-${letra.toLowerCase()}`,
    questao_id: 'q-grifo',
    letra,
    texto,
    correta: null,
    ordem: i + 1,
    imagem_url: null,
  })),
  temas: [],
};

const URL_TENTATIVA = '/dashboard/simulados/prova-grifo/tentativa/tent-grifo';

/** Rotas casam em ordem inversa de registro: catch-all primeiro. */
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

/**
 * Trechos pintados agora, indexados pela cor (hex). Lê a CSS Custom Highlight
 * API direto e varre o registro inteiro: a cor é livre, então não existe lista
 * fechada de nomes para consultar.
 */
async function grifosNaTela(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(() => {
    const saida: Record<string, string[]> = {};
    for (const [nome, highlight] of CSS.highlights) {
      if (!nome.startsWith('bm-grifo-')) continue;
      const trechos: string[] = [];
      for (const range of highlight) trechos.push((range as Range).toString());
      if (trechos.length) saida[`#${nome.slice('bm-grifo-'.length)}`] = trechos;
    }
    return saida;
  });
}

const AMARELO = '#fde68a';
const VERDE = '#a7f3d0';
const AZUL = '#bfdbfe';

/**
 * Seleciona um trecho exato de um bloco. É o que o navegador monta quando o
 * aluno arrasta o dedo/mouse — a diferença é a precisão, que o teste precisa.
 */
async function selecionarSemEsperar(page: Page, seletor: string, trecho: string): Promise<void> {
  await selecionarTrecho(page, seletor, trecho, 0);
}

async function selecionarTrecho(
  page: Page,
  seletor: string,
  trecho: string,
  espera = 600,
): Promise<void> {
  await page.evaluate(
    ({ seletor, trecho }) => {
      const raiz = document.querySelector(seletor);
      if (!raiz) throw new Error(`bloco não encontrado: ${seletor}`);

      const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const idx = (node.nodeValue ?? '').indexOf(trecho);
        if (idx === -1) continue;
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + trecho.length);
        const selecao = window.getSelection()!;
        selecao.removeAllRanges();
        selecao.addRange(range);
        return;
      }
      throw new Error(`trecho não encontrado: ${trecho}`);
    },
    { seletor, trecho },
  );
  // O backstop de seleção ociosa (toque/alças) espera 400ms antes de grifar.
  await page.waitForTimeout(espera);
}

/** O bloco do enunciado é o div que envolve o <markdown> do enunciado. */
async function seletorDoEnunciado(page: Page): Promise<string> {
  await page.evaluate(() => {
    const alvo = [...document.querySelectorAll('div')].find(
      (el) =>
        el.querySelector(':scope > markdown') !== null &&
        el.className.includes('font-medium'),
    );
    alvo?.setAttribute('data-e2e', 'bloco-enunciado');
  });
  return '[data-e2e="bloco-enunciado"]';
}

async function seletorDoApoio(page: Page): Promise<string> {
  await page.evaluate(() => {
    const alvo = [...document.querySelectorAll('div')].find(
      (el) => el.querySelector(':scope > markdown') !== null && el.className.includes('bg-slate-50'),
    );
    alvo?.setAttribute('data-e2e', 'bloco-apoio');
  });
  return '[data-e2e="bloco-apoio"]';
}

const pegarMarcaTexto = (page: Page) => page.getByRole('button', { name: 'Pegar o marca-texto' });

/**
 * Cor fora dos quatro atalhos, pela grade do espectro. A grade é painel da
 * página (e não o seletor do sistema) justamente para caber na tela.
 */
async function escolherNoEspectro(page: Page, cor: string): Promise<void> {
  await page.getByRole('button', { name: 'Escolher outra cor para grifar' }).click();
  await page.getByRole('button', { name: `Grifar na cor ${cor}` }).click();
}

/** Cores que existem na grade gerada (matiz 288°/216°, faixas clara e forte). */
const ROXO_DO_ESPECTRO = '#d04cf0';
const AZUL_ESCURO_DO_ESPECTRO = '#1266e2';

/** Cursor desenhado sobre o texto grifável: é SVG, e a ponta carrega a cor. */
async function cursorDoTextoGrifavel(
  page: Page,
  seletor: string,
): Promise<{ temDesenho: boolean; ponta: string | null; fallback: string }> {
  return page.evaluate((seletor) => {
    const alvo = document.querySelector(seletor);
    if (!alvo) throw new Error('nenhum bloco grifável na tela');
    const cursor = getComputedStyle(alvo).cursor;
    // O SVG chega percent-encoded dentro do `url()`; decodificar é o jeito
    // estável de ler a cor da ponta sem depender de qual caractere escapou.
    const fills = [...decodeURIComponent(cursor).matchAll(/fill='#([0-9a-f]{6})'/g)].map(
      (m) => m[1]!,
    );
    return {
      temDesenho: cursor.startsWith('url('),
      ponta: fills[fills.length - 1] ?? null,
      fallback: cursor.split(',').pop()!.trim(),
    };
  }, seletor);
}

test.describe('Marca-texto na execução da prova', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto(URL_TENTATIVA);
    await expect(page.getByText(ENUNCIADO)).toBeVisible({ timeout: 10_000 });
  });

  test('com o marca-texto guardado, selecionar texto não grifa nada', async ({ page }) => {
    const enunciado = await seletorDoEnunciado(page);
    await selecionarTrecho(page, enunciado, 'conduta inicial');

    expect(await grifosNaTela(page)).toEqual({});
  });

  test('grifa o trecho selecionado na cor escolhida', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    const enunciado = await seletorDoEnunciado(page);

    await selecionarTrecho(page, enunciado, 'conduta inicial');

    expect(await grifosNaTela(page)).toEqual({ [AMARELO]: ['conduta inicial'] });
  });

  test('cada bloco da questão é grifável e as cores convivem', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    const apoio = await seletorDoApoio(page);
    const enunciado = await seletorDoEnunciado(page);

    await selecionarTrecho(page, apoio, 'dor torácica retroesternal');

    await page.getByRole('button', { name: 'Grifar em verde' }).click();
    await selecionarTrecho(page, enunciado, 'conduta inicial');

    expect(await grifosNaTela(page)).toEqual({
      [AMARELO]: ['dor torácica retroesternal'],
      [VERDE]: ['conduta inicial'],
    });
  });

  test('a borracha apaga só o trecho selecionado', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    const apoio = await seletorDoApoio(page);

    await selecionarTrecho(page, apoio, 'dor torácica retroesternal em aperto');
    expect(await grifosNaTela(page)).toEqual({
      [AMARELO]: ['dor torácica retroesternal em aperto'],
    });

    await page.getByRole('button', { name: 'Apagar grifos do trecho selecionado' }).click();
    await selecionarTrecho(page, apoio, 'retroesternal');

    // A borracha leva junto o espaço em volta: sem isso sobrariam dois
    // riscos soltos pintando o branco entre as palavras.
    expect(await grifosNaTela(page)).toEqual({ [AMARELO]: ['dor torácica', 'em aperto'] });
  });

  test('grifo sobrevive ao F5 no meio da prova', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    const enunciado = await seletorDoEnunciado(page);
    await selecionarTrecho(page, enunciado, 'conduta inicial');

    await page.reload();
    await expect(page.getByText(ENUNCIADO)).toBeVisible({ timeout: 10_000 });

    // A pintura volta sozinha; o modo, não — o marca-texto foi guardado.
    await expect.poll(() => grifosNaTela(page)).toEqual({ [AMARELO]: ['conduta inicial'] });
    await expect(pegarMarcaTexto(page)).toBeVisible();
  });

  test('limpar apaga todos os grifos da questão', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    const apoio = await seletorDoApoio(page);
    const enunciado = await seletorDoEnunciado(page);
    await selecionarTrecho(page, apoio, 'tabagista');
    await selecionarTrecho(page, enunciado, 'conduta inicial');

    await page.getByRole('button', { name: 'Limpar todos os grifos desta questão' }).click();

    await expect.poll(() => grifosNaTela(page)).toEqual({});
  });

  test('grifar dentro da alternativa não a marca como resposta', async ({ page }) => {
    const respostas = await setupMocks(page);
    await pegarMarcaTexto(page).click();

    await page.evaluate(() => {
      const alvo = [...document.querySelectorAll('span')].find((el) =>
        el.textContent?.includes('terapia de reperfusao'),
      );
      alvo?.setAttribute('data-e2e', 'bloco-alt-b');
    });
    await selecionarTrecho(page, '[data-e2e="bloco-alt-b"]', 'terapia de reperfusao');

    expect(await grifosNaTela(page)).toEqual({ [AMARELO]: ['terapia de reperfusao'] });
    expect(respostas).toEqual([]);
    await expect(
      page.getByRole('radio', { name: `Alternativa B: ${textosAlternativas['B']}` }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  test('clique limpo segue respondendo com o marca-texto na mão', async ({ page }) => {
    const respostas = await setupMocks(page);
    await pegarMarcaTexto(page).click();

    await page.getByRole('radio', { name: `Alternativa C: ${textosAlternativas['C']}` }).click();

    await expect.poll(() => respostas).toEqual(['alt-c']);
  });

  test('clique no fundo da tela guarda o marca-texto', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    await expect(page.getByRole('button', { name: 'Guardar o marca-texto' })).toBeVisible();

    // Canto vazio da tela: nem estojo, nem controle, nem texto da questão.
    await page.mouse.click(12, 400);

    await expect(pegarMarcaTexto(page)).toBeVisible();
  });

  test('clicar no texto da questão não guarda o marca-texto', async ({ page }) => {
    await pegarMarcaTexto(page).click();

    // Clique seco no enunciado: não seleciona nada, mas é onde ele trabalha.
    await page.getByText(ENUNCIADO).click();

    await expect(page.getByRole('button', { name: 'Guardar o marca-texto' })).toBeVisible();
  });

  test('responder a questão não guarda o marca-texto', async ({ page }) => {
    const respostas = await setupMocks(page);
    await pegarMarcaTexto(page).click();

    await page.getByRole('radio', { name: `Alternativa A: ${textosAlternativas['A']}` }).click();

    await expect.poll(() => respostas).toEqual(['alt-a']);
    await expect(page.getByRole('button', { name: 'Guardar o marca-texto' })).toBeVisible();
  });

  test('grifar não guarda o marca-texto (a seleção segura a caneta)', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    const enunciado = await seletorDoEnunciado(page);

    await selecionarTrecho(page, enunciado, 'conduta inicial');

    expect(await grifosNaTela(page)).toEqual({ [AMARELO]: ['conduta inicial'] });
    await expect(page.getByRole('button', { name: 'Guardar o marca-texto' })).toBeVisible();
  });

  test('o cursor vira a ferramenta em cima do texto que aceita pintura', async ({ page }) => {
    const enunciado = await seletorDoEnunciado(page);

    // Guardado: cursor normal, nada de caneta sobrando na tela.
    expect((await cursorDoTextoGrifavel(page, enunciado)).temDesenho).toBe(false);

    await pegarMarcaTexto(page).click();

    // `poll`: o estilo chega no ciclo do Angular, não no clique.
    // A ponta desenhada carrega a mesma cor que vai pintar o texto.
    await expect.poll(() => cursorDoTextoGrifavel(page, enunciado)).toEqual({
      temDesenho: true,
      ponta: AMARELO.slice(1),
      fallback: 'text',
    });

    await page.getByRole('button', { name: 'Grifar em azul' }).click();
    await expect
      .poll(async () => (await cursorDoTextoGrifavel(page, enunciado)).ponta)
      .toBe(AZUL.slice(1));

    // Cor escolhida na grade também vai para a ponta da caneta.
    await escolherNoEspectro(page, ROXO_DO_ESPECTRO);
    await expect
      .poll(async () => (await cursorDoTextoGrifavel(page, enunciado)).ponta)
      .toBe(ROXO_DO_ESPECTRO.slice(1));

    // A borracha tem desenho próprio: bloco deitado, sem ponta colorida.
    await page.getByRole('button', { name: 'Apagar grifos do trecho selecionado' }).click();
    await expect
      .poll(async () => (await cursorDoTextoGrifavel(page, enunciado)).ponta)
      .toBe('cbd5e1');
  });

  test('grifa em qualquer cor escolhida no espectro', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    const enunciado = await seletorDoEnunciado(page);

    await escolherNoEspectro(page, ROXO_DO_ESPECTRO);
    await selecionarTrecho(page, enunciado, 'conduta inicial');

    expect(await grifosNaTela(page)).toEqual({ [ROXO_DO_ESPECTRO]: ['conduta inicial'] });
  });

  test('cor escura vira texto branco, para não apagar o enunciado', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    const enunciado = await seletorDoEnunciado(page);

    await escolherNoEspectro(page, AZUL_ESCURO_DO_ESPECTRO);
    await selecionarTrecho(page, enunciado, 'conduta inicial');

    const regra = await page.evaluate(() => {
      const folha = document.querySelector('style[data-bm="grifos"]');
      return folha?.textContent ?? '';
    });
    expect(regra).toContain(
      '::highlight(bm-grifo-1266e2){background-color:#1266e2;color:#ffffff;}',
    );
  });

  test('a cor do espectro fica à mão como atalho depois de usada', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    await escolherNoEspectro(page, ROXO_DO_ESPECTRO);

    // A grade fecha ao escolher, e a cor fica na barra como atalho.
    await expect(page.getByRole('group', { name: 'Cores do marca-texto' })).toHaveCount(0);
    const atalho = page
      .getByRole('toolbar', { name: 'Marca-texto' })
      .getByRole('button', { name: `Grifar na cor ${ROXO_DO_ESPECTRO}` });
    await expect(atalho).toBeVisible();

    // Trocar para outro atalho e voltar não perde a cor escolhida.
    await page.getByRole('button', { name: 'Grifar em verde' }).click();
    await atalho.click();

    const enunciado = await seletorDoEnunciado(page);
    await selecionarTrecho(page, enunciado, 'conduta inicial');
    expect(await grifosNaTela(page)).toEqual({ [ROXO_DO_ESPECTRO]: ['conduta inicial'] });
  });

  test('a grade de cores abre inteira dentro da tela', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    await page.getByRole('button', { name: 'Escolher outra cor para grifar' }).click();

    const painel = page.getByRole('group', { name: 'Cores do marca-texto' });
    await expect(painel).toBeVisible();

    // O seletor do sistema abria ancorado no canto e saía cortado; este é
    // conteúdo da página, então tem que caber por construção.
    const caixa = (await painel.boundingBox())!;
    const tela = page.viewportSize()!;
    expect(caixa.x).toBeGreaterThanOrEqual(0);
    expect(caixa.y).toBeGreaterThanOrEqual(0);
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(tela.width);
    expect(caixa.y + caixa.height).toBeLessThanOrEqual(tela.height);
  });

  test('guardar o marca-texto fecha a grade de cores junto', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    await page.getByRole('button', { name: 'Escolher outra cor para grifar' }).click();
    await expect(page.getByRole('group', { name: 'Cores do marca-texto' })).toBeVisible();

    await page.keyboard.press('g');

    await expect(page.getByRole('group', { name: 'Cores do marca-texto' })).toHaveCount(0);
  });

  test('atalho G pega e guarda o marca-texto', async ({ page }) => {
    await page.keyboard.press('g');
    await expect(page.getByRole('button', { name: 'Guardar o marca-texto' })).toBeVisible();

    await page.keyboard.press('g');
    await expect(pegarMarcaTexto(page)).toBeVisible();
  });

  test('com texto selecionado, G grifa na hora — sem pegar a caneta antes', async ({ page }) => {
    const enunciado = await seletorDoEnunciado(page);

    // Marca-texto guardado: selecionar sozinho não pinta nada.
    await selecionarSemEsperar(page, enunciado, 'conduta inicial');
    expect(await grifosNaTela(page)).toEqual({});

    await page.keyboard.press('g');

    await expect.poll(() => grifosNaTela(page)).toEqual({ [AMARELO]: ['conduta inicial'] });
    // E o atalho não deixa o modo ligado por tabela: era só uma pincelada.
    await expect(pegarMarcaTexto(page)).toBeVisible();
  });

  test('G com seleção respeita a cor escolhida', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    await page.getByRole('button', { name: 'Grifar em azul' }).click();
    const enunciado = await seletorDoEnunciado(page);

    await selecionarSemEsperar(page, enunciado, 'conduta inicial');
    await page.keyboard.press('g');

    await expect.poll(() => grifosNaTela(page)).toEqual({ [AZUL]: ['conduta inicial'] });
  });

  test('Shift + G apaga o trecho selecionado sem trocar a cor da mão', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    await page.getByRole('button', { name: 'Grifar em azul' }).click();
    const enunciado = await seletorDoEnunciado(page);

    await selecionarTrecho(page, enunciado, 'conduta inicial mais adequada');
    expect(await grifosNaTela(page)).toEqual({ [AZUL]: ['conduta inicial mais adequada'] });

    await selecionarSemEsperar(page, enunciado, 'inicial');
    await page.keyboard.press('Shift+G');

    await expect.poll(() => grifosNaTela(page)).toEqual({ [AZUL]: ['conduta', 'mais adequada'] });
    // A caneta azul continua na mão: o atalho foi uma passada, não uma troca.
    await expect(page.getByRole('button', { name: 'Grifar em azul' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('Shift + G sem seleção entrega a borracha', async ({ page }) => {
    await page.keyboard.press('Shift+G');

    await expect(
      page.getByRole('button', { name: 'Apagar grifos do trecho selecionado' }),
    ).toHaveAttribute('aria-pressed', 'true');

    // De novo, guarda — é o mesmo liga/desliga do G.
    await page.keyboard.press('Shift+G');
    await expect(pegarMarcaTexto(page)).toBeVisible();
  });

  test('depois do Shift + G, o G devolve a caneta em vez de guardar', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    await page.getByRole('button', { name: 'Grifar em azul' }).click();

    await page.keyboard.press('Shift+G');
    await expect(
      page.getByRole('button', { name: 'Apagar grifos do trecho selecionado' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('g');

    // Volta a caneta, na cor que estava antes — sem precisar clicar na paleta.
    await expect(page.getByRole('button', { name: 'Grifar em azul' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Guardar o marca-texto' })).toBeVisible();

    const enunciado = await seletorDoEnunciado(page);
    await selecionarTrecho(page, enunciado, 'conduta inicial');
    expect(await grifosNaTela(page)).toEqual({ [AZUL]: ['conduta inicial'] });
  });

  test('o botão principal também devolve a caneta com a borracha na mão', async ({ page }) => {
    await pegarMarcaTexto(page).click();
    await page.getByRole('button', { name: 'Apagar grifos do trecho selecionado' }).click();

    await page.getByRole('button', { name: 'Guardar o marca-texto' }).click();

    await expect(page.getByRole('button', { name: 'Grifar em amarelo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Guardar o marca-texto' })).toBeVisible();
  });

  test('com a caneta na mão, o G segue guardando o marca-texto', async ({ page }) => {
    await pegarMarcaTexto(page).click();

    await page.keyboard.press('g');

    await expect(pegarMarcaTexto(page)).toBeVisible();
  });

  test('G digitado num campo de texto não vira atalho', async ({ page }) => {
    // A questão discursiva tem textarea; aqui basta um campo qualquer na tela.
    await page.evaluate(() => {
      const campo = document.createElement('textarea');
      campo.id = 'campo-teste';
      document.body.appendChild(campo);
      campo.focus();
    });

    await page.keyboard.press('g');

    await expect(pegarMarcaTexto(page)).toBeVisible();
    expect(await page.inputValue('#campo-teste')).toBe('g');
  });
});

/**
 * Revisão pós-prova: o que o aluno grifou durante o simulado continua à vista,
 * e o estojo vira só borracha — grifar ali misturaria o que foi marcado sob o
 * relógio com o que foi marcado depois, já lendo o gabarito.
 */
test.describe('Marca-texto na revisão pós-prova', () => {
  const URL_REVISAO = `${URL_TENTATIVA}/revisao`;
  const INICIO = ENUNCIADO.indexOf('conduta inicial');
  const FIM = INICIO + 'conduta inicial'.length;

  /** Estado que a execução deixou no navegador ao finalizar a prova. */
  const grifosSalvos = JSON.stringify({
    v: 2,
    atualizado_em: Date.now(),
    questoes: {
      'q-grifo': [{ bloco: 'enunciado', inicio: INICIO, fim: FIM, cor: '#fde68a' }],
    },
  });

  const respostaRevisada = {
    id: 'resp-1',
    tentativa_id: 'tent-grifo',
    questao_id: 'q-grifo',
    alternativa_id: 'alt-b',
    correta: true,
    resposta_texto: null,
    enviada_em: null,
    pontos: null,
    correcao: null,
    anulada_usuario: false,
    ordem_na_tentativa: 1,
  };

  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.route(
      '**/rest/v1/rpc/get_revisao_tentativa',
      (route: Route) =>
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ questoes: [questao], respostas: [respostaRevisada] }),
        }),
    );
    await page.addInitScript(
      (payload) => localStorage.setItem('bm_grifos_tent-grifo', payload),
      grifosSalvos,
    );

    await page.goto(URL_REVISAO);
    await expect(page.getByText(ENUNCIADO)).toBeVisible({ timeout: 10_000 });
  });

  test('o que foi grifado na prova continua pintado na revisão', async ({ page }) => {
    await expect.poll(() => grifosNaTela(page)).toEqual({ [AMARELO]: ['conduta inicial'] });
  });

  test('o estojo da revisão não oferece cor, só borracha', async ({ page }) => {
    await page.getByRole('button', { name: 'Apagar grifos' }).click();

    await expect(page.getByRole('button', { name: 'Guardar a borracha' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grifar em amarelo' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Escolher outra cor para grifar' })).toHaveCount(
      0,
    );
  });

  test('a borracha apaga o grifo na revisão', async ({ page }) => {
    await page.getByRole('button', { name: 'Apagar grifos' }).click();

    const enunciado = await seletorDoEnunciado(page);
    await selecionarTrecho(page, enunciado, 'conduta inicial');

    await expect.poll(() => grifosNaTela(page)).toEqual({});
  });

  test('limpar vale para a revisão inteira e pede confirmação', async ({ page }) => {
    await page.getByRole('button', { name: 'Apagar grifos' }).click();
    await page.getByRole('button', { name: 'Limpar todos os grifos desta revisão' }).click();

    // A revisão mostra a prova toda: apagar tudo de uma vez é destrutivo o
    // bastante para não acontecer num clique só.
    await expect(page.getByText('Limpar todos os grifos?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect.poll(() => grifosNaTela(page)).toEqual({ [AMARELO]: ['conduta inicial'] });

    await page.getByRole('button', { name: 'Limpar todos os grifos desta revisão' }).click();
    await page.getByRole('button', { name: 'Limpar tudo' }).click();

    await expect.poll(() => grifosNaTela(page)).toEqual({});
  });

  test('apagar o último grifo devolve o cursor ao normal', async ({ page }) => {
    const enunciado = await seletorDoEnunciado(page);
    await page.getByRole('button', { name: 'Apagar grifos' }).click();
    await expect
      .poll(async () => (await cursorDoTextoGrifavel(page, enunciado)).temDesenho)
      .toBe(true);

    await page.getByRole('button', { name: 'Limpar todos os grifos desta revisão' }).click();
    await page.getByRole('button', { name: 'Limpar tudo' }).click();

    // Sem grifo o estojo some da revisão; se a borracha seguisse na mão, o
    // cursor ficaria preso no texto sem nenhum botão para desligar.
    await expect(page.getByRole('button', { name: 'Guardar a borracha' })).toHaveCount(0);
    await expect
      .poll(async () => (await cursorDoTextoGrifavel(page, enunciado)).temDesenho)
      .toBe(false);
  });

  test('apagar o último trecho pela borracha também solta o cursor', async ({ page }) => {
    const enunciado = await seletorDoEnunciado(page);
    await page.getByRole('button', { name: 'Apagar grifos' }).click();

    await selecionarTrecho(page, enunciado, 'conduta inicial');

    await expect.poll(() => grifosNaTela(page)).toEqual({});
    await expect
      .poll(async () => (await cursorDoTextoGrifavel(page, enunciado)).temDesenho)
      .toBe(false);
  });

  test('clicar no fundo da tela guarda a borracha, como na execução', async ({ page }) => {
    await page.getByRole('button', { name: 'Apagar grifos' }).click();
    await expect(page.getByRole('button', { name: 'Guardar a borracha' })).toBeVisible();

    await page.mouse.click(12, 400);

    await expect(page.getByRole('button', { name: 'Apagar grifos' })).toBeVisible();
  });

  test('na revisão, G apaga o trecho selecionado', async ({ page }) => {
    const enunciado = await seletorDoEnunciado(page);
    await selecionarSemEsperar(page, enunciado, 'conduta inicial');

    await page.keyboard.press('g');

    await expect.poll(() => grifosNaTela(page)).toEqual({});
  });

  test('clicar no texto da revisão não guarda a borracha', async ({ page }) => {
    await page.getByRole('button', { name: 'Apagar grifos' }).click();

    // O texto é onde a borracha trabalha: clique seco ali não a guarda.
    await page.getByText(ENUNCIADO).click();

    await expect(page.getByRole('button', { name: 'Guardar a borracha' })).toBeVisible();
  });

  test('sem grifo salvo, a revisão não mostra estojo nenhum', async ({ page }) => {
    // O `addInitScript` do beforeEach re-semeia o storage a cada carga; um
    // segundo script, registrado depois, roda em seguida e limpa.
    await page.addInitScript(() => localStorage.removeItem('bm_grifos_tent-grifo'));
    await page.reload();
    await expect(page.getByText(ENUNCIADO)).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole('button', { name: 'Apagar grifos' })).toHaveCount(0);
  });
});
