---
name: e2e-testing
description: Use when writing or running end-to-end tests with Playwright. Covers page object pattern, test structure, selectors, and CI integration.
---

# Testes E2E com Playwright

## Estrutura

```
tests/e2e/
├── pages/                    → Page Objects
│   ├── login.page.ts
│   └── tasks.page.ts
├── fixtures/                 → Fixtures e helpers
│   └── auth.fixture.ts
├── task-creation.spec.ts     → Testes por fluxo
└── playwright.config.ts
```

## Page Object Pattern

```typescript
// tests/e2e/pages/tasks.page.ts
import { Page, Locator } from '@playwright/test';

export class TasksPage {
  readonly page: Page;
  readonly newTaskButton: Locator;
  readonly taskList: Locator;
  readonly typeSelect: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newTaskButton = page.getByRole('button', { name: 'Nova Tarefa' });
    this.taskList = page.getByTestId('task-list');
    this.typeSelect = page.getByLabel('Tipo');
  }

  async goto() {
    await this.page.goto('/tarefas');
  }

  async createTask(type: string, description: string) {
    await this.newTaskButton.click();
    await this.typeSelect.selectOption(type);
    await this.page.getByLabel('Descrição').fill(description);
    await this.page.getByRole('button', { name: 'Salvar' }).click();
  }
}
```

## Template de teste

```typescript
// tests/e2e/task-creation.spec.ts
import { test, expect } from '@playwright/test';
import { TasksPage } from './pages/tasks.page';

test.describe('Criação de Tarefas', () => {
  let tasksPage: TasksPage;

  test.beforeEach(async ({ page }) => {
    // Autenticar (usar fixture)
    tasksPage = new TasksPage(page);
    await tasksPage.goto();
  });

  test('deve criar tarefa com sucesso', async ({ page }) => {
    await tasksPage.createTask('ferias', 'Férias do João');
    await expect(tasksPage.taskList).toContainText('Férias do João');
  });

  test('deve mostrar erro quando campos obrigatórios vazios', async ({ page }) => {
    await tasksPage.newTaskButton.click();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Campo obrigatório')).toBeVisible();
  });
});
```

## Regras

1. Usar Page Objects para toda página — nunca selectors soltos nos testes
2. Preferir `getByRole`, `getByLabel`, `getByTestId` — nunca CSS selectors frágeis
3. Testar happy path + erro principal de cada fluxo
4. Testes devem ser independentes — não depender de ordem de execução
5. Usar fixtures para autenticação e setup de dados

## Rodar

```bash
npx playwright test                    # Todos
npx playwright test task-creation      # Um arquivo específico
npx playwright test --ui               # Modo visual interativo
npx playwright test --headed           # Com browser visível
```
