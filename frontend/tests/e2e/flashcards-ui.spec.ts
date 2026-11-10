import { expect, test } from '@playwright/test';
import {
  abrirFlashcards,
  FLASHCARD_DECK_ID,
  FLASHCARD_MEU_ID,
} from './fixtures/flashcards-ui.fixture';
import { FlashcardsUiPage } from './pages/flashcards-ui.page';
import { clientNavigate } from './fixtures/tier.fixture';

const estudo = `/dashboard/flashcards/${FLASHCARD_DECK_ID}/estudar`;
test.beforeEach(({}, info) => test.skip(info.project.name !== 'mocked', 'Rede interceptada.'));

test('biblioteca tem ações claras e abas acessíveis por teclado', async ({ page }) => {
  await abrirFlashcards(page);
  const ui = new FlashcardsUiPage(page);
  await expect(ui.botao('Criar deck')).toBeVisible();
  await ui.aba('Oficiais').focus();
  await ui.aba('Oficiais').press('ArrowRight');
  await expect(ui.aba('Meus decks')).toBeFocused();
  await expect(ui.aba('Meus decks')).toHaveAttribute('aria-selected', 'true');
  await ui.aba('Meus decks').press('End');
  await expect(ui.aba('Comunidade')).toBeFocused();
  await expect(page).toHaveURL(/aba=comunidade/);
  await expect(page.getByRole('tabpanel')).toHaveAttribute(
    'aria-labelledby',
    'flashcards-aba-comunidade',
  );
});

test('curtir pelo teclado não abre o deck e informa o novo estado', async ({ page }) => {
  await abrirFlashcards(page, 'demo', '/dashboard/flashcards?aba=comunidade');
  const ui = new FlashcardsUiPage(page);
  const like = ui
    .deck('Semiologia cardiovascular')
    .getByRole('button', { name: 'Curtir deck', exact: true });
  await like.focus();
  await like.press('Enter');
  await expect(page).toHaveURL(/flashcards\?aba=comunidade/);
  await expect(
    ui
      .deck('Semiologia cardiovascular')
      .getByRole('button', { name: 'Descurtir deck', exact: true }),
  ).toContainText('25');
});

test('falha ao curtir desfaz a alteração otimista', async ({ page }) => {
  await abrirFlashcards(page, 'demo', '/dashboard/flashcards?aba=comunidade');
  const ui = new FlashcardsUiPage(page);
  await page.route('**/rest/v1/rpc/flashcards_toggle_like', (route) =>
    route.fulfill({ status: 500, json: { message: 'Falha simulada' } }),
  );
  await ui
    .deck('Semiologia cardiovascular')
    .getByRole('button', { name: 'Curtir deck', exact: true })
    .click();
  await expect(
    ui.deck('Semiologia cardiovascular').getByRole('button', { name: 'Curtir deck', exact: true }),
  ).toContainText('24');
});

test('falha de lista oferece retry e não se passa por biblioteca vazia', async ({ page }) => {
  await abrirFlashcards(page, 'error');
  const ui = new FlashcardsUiPage(page);
  await expect(page.getByRole('alert')).toContainText(
    'Não foi possível carregar os decks oficiais.',
  );
  await expect(page.getByText('Nenhum deck oficial ainda', { exact: true })).toBeHidden();
  await ui.botao('Tentar novamente').click();
  await expect(ui.deck('Farmacologia essencial')).toBeVisible();
});

test('biblioteca vazia oferece criação e exploração', async ({ page }) => {
  await abrirFlashcards(page, 'empty');
  const ui = new FlashcardsUiPage(page);
  await ui.botao('Explorar a Comunidade').click();
  await expect(ui.aba('Comunidade')).toHaveAttribute('aria-selected', 'true');
  await ui.botao('Criar deck').click();
  await expect(ui.frente).toBeVisible();
});

test('pergunta e resposta têm controles separados, sem botões aninhados', async ({ page }) => {
  await abrirFlashcards(page, 'demo', estudo);
  const ui = new FlashcardsUiPage(page);
  await expect(ui.acertei).toBeHidden();
  await expect(page.locator('app-flashcard-flip .flip-card__face--verso')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  await ui.flip.focus();
  await ui.flip.press('Enter');
  await expect(ui.acertei).toBeVisible();
  await expect(page.locator('app-flashcard-flip .flip-card__inner')).toHaveCSS(
    'transition-duration',
    '0s',
  );
  await expect(page.locator('app-flashcard-flip .flip-card__face--frente')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  await expect(page.locator('button button')).toHaveCount(0);
  await ui.acertei.click();
  await expect(ui.progresso).toHaveAttribute('aria-valuenow', '1');
  await expect(ui.flip).toBeFocused();
  await ui.revelar.focus();
  await ui.revelar.press('Enter');
  await expect(page.locator('app-flashcard-flip .flip-card__inner')).toHaveCSS(
    'transition-duration',
    '0s',
  );
});

test('pular cards não encerra a rodada com avaliações pendentes', async ({ page }) => {
  await abrirFlashcards(page, 'demo', estudo);
  const ui = new FlashcardsUiPage(page);
  await ui.botao('Próximo →').click();
  await ui.botao('Próximo →').click();
  await ui.responder(true);
  await expect(ui.resultado).toBeHidden();
  await expect(page.getByText('Card 1 de 3', { exact: true })).toBeVisible();
  await ui.responder(false);
  await ui.responder(true);
  await expect(ui.resultado).toBeVisible();
  await expect(
    page.getByText('2 acertos · 1 erro · 67% de aproveitamento', { exact: true }),
  ).toBeVisible();
});

test('reforço usa só erros e refazer deck restaura a coleção completa', async ({ page }) => {
  await abrirFlashcards(page, 'demo', estudo);
  const ui = new FlashcardsUiPage(page);
  await ui.responder(true);
  await ui.responder(false);
  await ui.responder(true);
  await ui.botao('Revisar 1 card').click();
  await expect(page.getByText('Card 1 de 1', { exact: true })).toBeVisible();
  await ui.responder(true);
  await expect(
    page.getByText('1 acerto · 0 erros · 100% de aproveitamento', { exact: true }),
  ).toBeVisible();
  await ui.botao('Refazer deck completo').click();
  await expect(page.getByText('Card 1 de 3', { exact: true })).toBeVisible();
});

test('embaralhar pede confirmação quando há respostas', async ({ page }) => {
  await abrirFlashcards(page, 'demo', estudo);
  const ui = new FlashcardsUiPage(page);
  await ui.responder(true);
  await ui.botao('Embaralhar').click();
  await expect(ui.dialogo).toBeVisible();
  await ui.dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(ui.dialogo).toBeHidden();
  await expect(ui.progresso).toHaveAttribute('aria-valuenow', '1');
  await ui.botao('Embaralhar').click();
  await ui.dialogo.getByRole('button', { name: 'Embaralhar', exact: true }).click();
  await expect(ui.progresso).toHaveAttribute('aria-valuenow', '0');
});

test('editor cria deck com frente e verso associados aos campos', async ({ page }) => {
  await abrirFlashcards(page, 'demo', '/dashboard/flashcards/novo');
  const ui = new FlashcardsUiPage(page);
  await ui.preencher('Revisão para a prova', 'Pergunta de revisão', 'Resposta de revisão');
  await ui.botao('Criar deck').click();
  await expect(ui.deck('Revisão para a prova')).toBeVisible();
  await expect(page).toHaveURL(/aba=meus/);
});

test('editor valida e foca o primeiro campo incompleto', async ({ page }) => {
  await abrirFlashcards(page, 'demo', '/dashboard/flashcards/novo');
  const ui = new FlashcardsUiPage(page);
  await ui.botao('Criar deck').click();
  await expect(ui.titulo).toBeFocused();
  await expect(ui.titulo).toHaveAccessibleDescription(
    'O título deve ter entre 3 e 120 caracteres.',
  );
  await ui.titulo.fill('Revisão para a prova');
  await ui.frente.fill('Uma pergunta');
  await ui.botao('Criar deck').click();
  await expect(ui.verso).toBeFocused();
  await expect(ui.verso).toHaveAttribute('aria-invalid', 'true');
});

test('editor preserva conteúdo após falha ao salvar', async ({ page }) => {
  await abrirFlashcards(page, 'demo', '/dashboard/flashcards/novo');
  const ui = new FlashcardsUiPage(page);
  await page.route('**/rest/v1/rpc/flashcards_criar_deck', (route) =>
    route.fulfill({ status: 500, json: { message: 'Falha simulada' } }),
  );
  await ui.preencher('Revisão para a prova', 'Minha pergunta', 'Minha resposta');
  await ui.botao('Criar deck').click();
  await expect(page.locator('#deck-form-erro')).toBeVisible();
  await expect(ui.frente).toHaveValue('Minha pergunta');
  await expect(ui.botao('Criar deck')).toBeEnabled();
});

test('sair do editor protege alterações por navegação interna', async ({ page }) => {
  await abrirFlashcards(page, 'demo', '/dashboard/flashcards/novo');
  const ui = new FlashcardsUiPage(page);
  await ui.titulo.fill('Meu novo deck');
  await ui.botao('Cancelar').click();
  await expect(ui.dialogo).toBeVisible();
  await ui.botao('Continuar editando').click();
  await expect(ui.titulo).toHaveValue('Meu novo deck');
  await ui.botao('Cancelar').click();
  await ui.botao('Sair sem salvar').click();
  await expect(ui.aba('Meus decks')).toBeVisible();
});

test('remover card preenchido pede confirmação e preserva os demais', async ({ page }) => {
  await abrirFlashcards(page, 'demo', '/dashboard/flashcards/novo');
  const ui = new FlashcardsUiPage(page);
  await ui.frente.fill('Card para manter');
  await ui.botao('Adicionar card').click();
  await ui.frente.fill('Card para remover');
  await ui.botao('Remover card').click();
  await ui.dialogo.getByRole('button', { name: 'Remover card', exact: true }).click();
  await expect(ui.frente).toHaveValue('Card para manter');
  await expect(ui.botao('Remover card')).toBeDisabled();
});

test('limite de 200 cards mantém um único par de campos no editor', async ({ page }) => {
  await abrirFlashcards(page, 'max', `/dashboard/flashcards/${FLASHCARD_MEU_ID}/editar`);
  const ui = new FlashcardsUiPage(page);
  await expect(ui.botao('Adicionar card')).toBeDisabled();
  await expect(page.getByText('Card 1 de 200', { exact: true })).toBeVisible();
  await expect(page.locator('#deck-frente, #deck-verso')).toHaveCount(2);
});

test('imagem pode ser ampliada sem virar o card', async ({ page }) => {
  await abrirFlashcards(page, 'image', estudo);
  const ui = new FlashcardsUiPage(page);
  await ui.botao('Ampliar imagem').click();
  await expect(ui.acertei).toBeHidden();
  await expect(page.locator('button button')).toHaveCount(0);
});

test('imagem quebrada tem mensagem e não bloqueia o estudo', async ({ page }) => {
  await abrirFlashcards(page, 'broken-image', estudo);
  const ui = new FlashcardsUiPage(page);
  await expect(
    page.getByText('Não foi possível carregar a imagem da pergunta.', { exact: true }),
  ).toBeVisible();
  await ui.responder(true);
  await expect(ui.progresso).toHaveAttribute('aria-valuenow', '1');
});

test('curtidas têm foco preso no diálogo e retornam ao fechar', async ({ page }) => {
  await abrirFlashcards(page, 'demo', '/dashboard/flashcards?aba=meus');
  const ui = new FlashcardsUiPage(page);
  const origem = ui
    .deck('Conceitos para compartilhar')
    .getByRole('button', { name: 'ver curtidas' });
  await origem.click();
  await expect(ui.dialogo).toBeVisible();
  await expect(ui.botao('Fechar')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(ui.botao('Fechar')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(ui.dialogo).toBeHidden();
  await expect(origem).toBeFocused();
});

test('falha ao abrir editor não oferece um formulário vazio para sobrescrever o deck', async ({
  page,
}) => {
  await abrirFlashcards(page);
  const ui = new FlashcardsUiPage(page);
  let falhar = true;
  await page.route('**/rest/v1/flashcard_decks**', (route) => {
    if (falhar && route.request().url().includes('flashcard_cards')) {
      falhar = false;
      return route.fulfill({ status: 500, json: { message: 'Falha simulada' } });
    }
    return route.fallback();
  });
  await clientNavigate(page, `/dashboard/flashcards/${FLASHCARD_MEU_ID}/editar`);
  await expect(
    page.getByRole('heading', { name: 'Não foi possível abrir o editor' }),
  ).toBeVisible();
  await expect(ui.frente).toBeHidden();
  await ui.botao('Tentar novamente').click();
  await expect(ui.titulo).toHaveValue('Minha revisão de farmacologia');
});

test('imagens acima de 2 MB são recusadas antes de enviar ao storage', async ({ page }) => {
  await abrirFlashcards(page, 'demo', '/dashboard/flashcards/novo');
  await page.getByText('Imagem da pergunta (opcional)', { exact: true }).click();
  let envios = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/storage/v1/object/')) envios++;
  });
  await page
    .locator('app-image-upload input[type="file"]')
    .first()
    .setInputFiles({
      name: 'grande.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
    });
  await expect(page.getByText('Arquivo muito grande. Máximo 2 MB.', { exact: true })).toBeVisible();
  expect(envios).toBe(0);
});

test('gravação pendente bloqueia edição e envio duplicado', async ({ page }) => {
  await abrirFlashcards(page, 'demo', '/dashboard/flashcards/novo');
  const ui = new FlashcardsUiPage(page);
  await ui.preencher('Deck para salvar', 'Pergunta', 'Resposta');
  let liberar: (() => void) | undefined;
  await page.route('**/rest/v1/rpc/flashcards_criar_deck', async (route) => {
    await new Promise<void>((resolve) => {
      liberar = resolve;
    });
    await route.fallback();
  });
  await ui.botao('Criar deck').click();
  await expect(ui.titulo).toBeDisabled();
  await expect(ui.frente).toBeDisabled();
  await expect(ui.botao('Cancelar')).toBeDisabled();
  liberar?.();
  await expect(ui.deck('Deck para salvar')).toBeVisible();
});

for (const width of [320, 390, 1280]) {
  test(`biblioteca, estudo e editor cabem em ${width}px com texto ampliado`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await abrirFlashcards(page, 'worst');
    const ui = new FlashcardsUiPage(page);
    await ui.verificarLargura();
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await ui.verificarLargura();
    await clientNavigate(page, estudo);
    await expect(ui.flip).toBeVisible();
    await ui.revelar.click();
    await ui.verificarLargura();
    await clientNavigate(page, '/dashboard/flashcards/novo');
    await expect(ui.frente).toBeVisible();
    await ui.verificarLargura();
  });
}

test('movimento reduzido mantém revelação e avaliação acessíveis', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrirFlashcards(page, 'one', estudo);
  const ui = new FlashcardsUiPage(page);
  await ui.flip.focus();
  await ui.flip.press('Space');
  await expect(ui.acertei).toBeVisible();
  await ui.acertei.click();
  await expect(ui.resultado).toBeVisible();
});

test('texto longo pode ser lido até o fim usando o teclado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrirFlashcards(page, 'worst', estudo);
  const ui = new FlashcardsUiPage(page);
  await ui.revelar.click();
  await ui.flip.focus();
  const texto = page.locator('app-flashcard-flip .flip-card__face--verso .flip-card__scroll');
  await expect(ui.flip).toHaveAttribute('aria-keyshortcuts', /ArrowDown/);
  expect(await texto.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await ui.flip.press('End');
  await expect
    .poll(() => texto.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1))
    .toBe(true);
  await ui.flip.press('Home');
  await expect.poll(() => texto.evaluate((el) => el.scrollTop)).toBe(0);
});
