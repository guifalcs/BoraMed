import { expect, test, type Page } from '@playwright/test';
import {
  abrirFlashcards,
  FLASHCARD_DECK_ID,
  FLASHCARD_MEU_ID,
} from '../e2e/fixtures/flashcards-ui.fixture';

const fase = process.env['SHOT_DIR'] ?? 'depois';
const viewport = process.env['SHOT_VP'] ?? 'mobile';
async function registrar(page: Page, nome: string): Promise<void> {
  await page.addStyleTag({
    content: '.bottom-nav, .mobile-notif-float, app-suporte-widget { display: none !important; }',
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `tests/screenshots/out/flashcards/${fase}/${viewport}/${nome}.png`,
    fullPage: true,
    animations: 'disabled',
  });
}
test('biblioteca e criação', async ({ page }) => {
  await abrirFlashcards(page);
  await expect(page.locator('app-deck-card').first()).toBeVisible();
  await registrar(page, 'oficiais');
  await page
    .getByRole(fase === 'antes' ? 'button' : 'tab', { name: 'Comunidade', exact: true })
    .click();
  await expect(page.getByText('Semiologia cardiovascular', { exact: true })).toBeVisible();
  await registrar(page, 'comunidade');
  await page
    .getByRole(fase === 'antes' ? 'button' : 'tab', { name: 'Meus decks', exact: true })
    .click();
  await expect(page.getByText('Minha revisão de farmacologia', { exact: true })).toBeVisible();
  await registrar(page, 'meus');
  await page.getByRole('button', { name: 'Criar deck', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Novo deck' })).toBeVisible();
  await registrar(page, 'editor');
});
test('estudo e conclusão', async ({ page }) => {
  await abrirFlashcards(page, 'demo', `/dashboard/flashcards/${FLASHCARD_DECK_ID}/estudar`);
  await expect(page.locator('app-flashcard-flip')).toBeVisible();
  await registrar(page, 'pergunta');
  await page.locator('app-flashcard-flip button.flip-card').click();
  await expect(page.getByRole('button', { name: 'Acertei', exact: true })).toBeVisible();
  await registrar(page, 'resposta');
  await page.getByRole('button', { name: 'Acertei', exact: true }).click();
  for (const escolha of ['Errei', 'Acertei']) {
    await page.locator('app-flashcard-flip button.flip-card').click();
    await page.getByRole('button', { name: escolha, exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Sessão concluída!' })).toBeVisible();
  await expect(page.locator('app-deck-card').first()).toBeVisible();
  await registrar(page, 'resultado');
});
for (const scenario of ['empty', 'worst', 'error', 'one'] as const) {
  test(`biblioteca — ${scenario}`, async ({ page }) => {
    await abrirFlashcards(page, scenario);
    if (scenario === 'empty')
      await expect(page.getByText('Nenhum deck oficial ainda', { exact: true })).toBeVisible();
    else if (scenario === 'error')
      await expect(
        page.getByText(/Não foi possível carregar os decks oficiais/).first(),
      ).toBeVisible();
    else await expect(page.locator('app-deck-card').first()).toBeVisible();
    await registrar(page, scenario);
  });
}
test('edição existente', async ({ page }) => {
  await abrirFlashcards(page, 'demo', `/dashboard/flashcards/${FLASHCARD_MEU_ID}/editar`);
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue(
    'Minha revisão de farmacologia',
  );
  await registrar(page, 'editar');
});
test('card com imagem', async ({ page }) => {
  await abrirFlashcards(page, 'image', `/dashboard/flashcards/${FLASHCARD_DECK_ID}/estudar`);
  await expect(page.locator('app-flashcard-flip img').first()).toBeVisible();
  await page
    .locator('app-flashcard-flip img')
    .first()
    .evaluate((img) => (img as HTMLImageElement).decode());
  await registrar(page, 'imagem');
});
