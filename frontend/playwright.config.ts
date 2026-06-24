import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4210',
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
    url: 'http://localhost:4210',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
