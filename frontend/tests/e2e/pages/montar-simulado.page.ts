import { type Page, type Locator, expect } from '@playwright/test';

type FormatoQuestao = 'Objetivas' | 'Discursivas' | 'Misto';
type Modo = 'Simulado' | 'Estudo';

/** Page object da tela Montar simulado (/dashboard/simulados/montar). */
export class MontarSimuladoPage {
  readonly gerarBtn: Locator;

  constructor(private readonly page: Page) {
    this.gerarBtn = page.getByRole('button', { name: /Gerar simulado|Gerando/ });
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard/simulados/montar');
    await this.dispensarOnboarding();
    // A tela carrega os temas de forma assíncrona; espera o botão aparecer.
    await expect(this.gerarBtn).toBeVisible({ timeout: 15_000 });
  }

  /** O tour de onboarding (usuário novo) cobre a tela e intercepta cliques. */
  private async dispensarOnboarding(): Promise<void> {
    const pular = this.page.getByRole('button', { name: 'Pular onboarding' }).first();
    if (await pular.isVisible().catch(() => false)) {
      await pular.click();
      await expect(pular).toHaveCount(0, { timeout: 5_000 });
    }
  }

  async escolherFormatoQuestao(formato: FormatoQuestao): Promise<void> {
    // O nome acessível do botão inclui rótulo + descrição, então casamos por prefixo.
    await this.page.getByRole('button', { name: new RegExp(formato) }).first().click();
    // Trocar o formato recarrega a contagem de temas (skeleton some).
    await this.page.waitForTimeout(800);
  }

  async escolherModo(modo: Modo): Promise<void> {
    await this.page.getByRole('button', { name: new RegExp(modo) }).first().click();
  }

  async gerar(): Promise<void> {
    await this.gerarBtn.click();
    // Cai na execução da tentativa.
    await expect(this.page).toHaveURL(/\/dashboard\/simulados\/[a-f0-9-]+\/tentativa\/[a-f0-9-]+$/, {
      timeout: 15_000,
    });
  }
}
