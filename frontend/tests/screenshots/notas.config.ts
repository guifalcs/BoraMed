import { defineConfig } from '@playwright/test';
import base from './playwright.screenshots.config';

// Permite comparar outra cópia do app sem interferir no servidor compartilhado.
const baseURL = process.env['SHOT_BASE_URL'] ?? 'http://localhost:4210';
export default defineConfig({
  ...base,
  testMatch: /notas\.shots\.spec\.ts/,
  use: { ...base.use, baseURL },
  webServer: process.env['SHOT_BASE_URL'] ? undefined : base.webServer,
});
