import { defineConfig } from '@playwright/test';

// Config separada da e2e: testDir próprio para que `npx playwright test` do CI
// (testDir ./tests/e2e) nunca colete estes prints de auditoria.
export default defineConfig({
  testDir: '.',
  testMatch: /shots\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:4210',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  webServer: {
    command: 'ng serve --configuration=e2e --port=4210',
    url: 'http://localhost:4210',
    reuseExistingServer: true,
    timeout: 180_000,
    cwd: '../..',
  },
});
