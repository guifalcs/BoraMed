import { defineConfig, devices } from '@playwright/test';

// Servidor alvo. Por padrão o dev-server dedicado dos E2E (4210); E2E_BASE_URL
// permite rodar a suíte contra um `ng serve` já no ar, sem esperar outro build.
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4210';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    locale: 'pt-BR',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/fixtures/.auth.json',
      },
      dependencies: ['setup'],
    },
    // Projeto para testes que mockam toda a rede (sem dependência do setup real).
    // Usado por provas.spec.ts, pagamento.spec.ts e similares.
    {
      name: 'mocked',
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
      },
    },
  ],
  webServer: {
    command: 'ng serve --configuration=e2e --port=4210',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
