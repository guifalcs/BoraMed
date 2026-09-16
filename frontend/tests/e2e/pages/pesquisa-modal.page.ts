import type { Page, Locator } from '@playwright/test';

/** Page object do modal de pesquisa exibido na entrada do dashboard. */
export class PesquisaModalPage {
  constructor(private readonly page: Page) {}

  get modal(): Locator {
    return this.page.locator('app-pesquisa-modal [role="dialog"]');
  }

  get titulo(): Locator {
    return this.modal.getByRole('heading', { level: 2 });
  }

  get botaoEnviar(): Locator {
    return this.modal.getByRole('button', { name: /Enviar respostas|Enviando/ });
  }

  get botaoAgoraNao(): Locator {
    return this.modal.getByRole('button', { name: 'Agora não' });
  }

  get botaoFechar(): Locator {
    return this.modal.getByRole('button', { name: 'Dispensar pesquisa' });
  }

  get agradecimento(): Locator {
    return this.page.locator('app-pesquisa-modal').getByRole('heading', { name: 'Obrigado!' });
  }

  /** Bloco (fieldset) de uma pergunta, localizado pelo enunciado. */
  pergunta(enunciado: string): Locator {
    return this.modal.locator('fieldset').filter({ hasText: enunciado });
  }

  /** Botão de uma nota de escala/NPS dentro da pergunta informada. */
  nota(enunciado: string, valor: number): Locator {
    return this.pergunta(enunciado).getByRole('button', { name: String(valor), exact: true });
  }

  alternativa(enunciado: string, label: string): Locator {
    return this.pergunta(enunciado).locator('label').filter({ hasText: label });
  }

  campoTexto(enunciado: string): Locator {
    return this.pergunta(enunciado).locator('input[type="text"], textarea');
  }

  get erro(): Locator {
    return this.modal.getByText('Responda as perguntas marcadas com *.');
  }
}
