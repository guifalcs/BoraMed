import { test, expect } from '@playwright/test';
import { MontarSimuladoPage } from './pages/montar-simulado.page';

/**
 * E2E das questões abertas (discursivas) — projeto `chromium` (autenticado),
 * backend Supabase LOCAL real + seed (`supabase/seed.sql` cria o usuário admin,
 * a assinatura e 2 questões discursivas de Cardiologia).
 *
 * PRÉ-REQUISITOS (rodar antes de `npx playwright test`):
 *   1. Stack local:  npx supabase start  (+ db reset para aplicar o seed)
 *   2. Edge functions com o provider fake (correção determinística, sem rede):
 *        npx supabase functions serve --env-file ./supabase/functions/.env.local
 *      com  AI_GRADING_PROVIDER=fake  no .env.local
 *
 * Sem as functions no ar, a correção não resolve e os testes que dependem do
 * feedback/nota falham (é esperado — a feature depende da edge function).
 *
 * O provider fake pontua pela cobertura literal dos pontos-chave; por isso as
 * respostas abaixo repetem os termos esperados para produzir nota alta.
 */

const RESPOSTA_CHARCOT =
  'A tríade de Charcot é composta por febre, icterícia e dor em hipocôndrio direito, e sugere colangite aguda.';

test.describe('Questões abertas — modo estudo', () => {
  test('responder discursiva mostra feedback da correção e resposta padrão', async ({ page }) => {
    const montar = new MontarSimuladoPage(page);
    await montar.goto();
    await montar.escolherFormatoQuestao('Discursivas');
    await montar.escolherModo('Estudo');
    await montar.gerar();

    // Bloco discursivo em vez de alternativas
    const textarea = page.getByRole('textbox', { name: 'Resposta discursiva' });
    await expect(textarea).toBeVisible();

    await textarea.fill(RESPOSTA_CHARCOT);
    await page.getByRole('button', { name: 'Enviar resposta' }).click();
    await page.getByRole('button', { name: 'Confirmar envio' }).click();

    // Correção pela IA fake (aguarda resolver)
    await expect(page.getByText(/\/100/)).toBeVisible({ timeout: 20_000 });
    // Resposta padrão sempre visível após responder no estudo
    await expect(page.getByRole('heading', { name: 'Resposta padrão' })).toBeVisible();
    // Textarea vira somente-leitura ("Resposta enviada")
    await expect(page.getByText('Resposta enviada')).toBeVisible();
  });
});

test.describe('Questões abertas — modo simulado', () => {
  test('enviar não revela feedback durante a prova; resultado consolida a nota', async ({ page }) => {
    const montar = new MontarSimuladoPage(page);
    await montar.goto();
    await montar.escolherFormatoQuestao('Discursivas');
    await montar.escolherModo('Simulado');
    await montar.gerar();

    const textarea = page.getByRole('textbox', { name: 'Resposta discursiva' });
    await expect(textarea).toBeVisible();

    await textarea.fill(RESPOSTA_CHARCOT);
    await page.getByRole('button', { name: 'Enviar resposta' }).click();
    await page.getByRole('button', { name: 'Confirmar envio' }).click();
    await expect(page.getByText('Resposta enviada')).toBeVisible();

    // Durante o simulado a nota/feedback NÃO aparecem (gabarito mascarado)
    await expect(page.getByText(/\/100/)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Resposta padrão' })).toHaveCount(0);

    // Finaliza (única questão respondida → sem alerta de pendência, mas confirma mesmo assim)
    await page.getByRole('button', { name: 'Finalizar prova' }).click();
    const confirmar = page.getByRole('button', { name: 'Finalizar' });
    if (await confirmar.isVisible().catch(() => false)) {
      await confirmar.click();
    }

    // Tela de resultado: consolida e mostra a nota
    await expect(page).toHaveURL(/\/resultado$/, { timeout: 30_000 });
    await expect(page.getByText('Sua nota')).toBeVisible({ timeout: 30_000 });
    // Card de aproveitamento por pontos (há discursivas na tentativa)
    await expect(page.getByText(/Aproveitamento/)).toBeVisible();
  });
});
