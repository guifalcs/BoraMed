import { defineConfig } from '@playwright/test';
import base from './playwright.screenshots.config';

// SHOT_BASE_URL permite capturar uma cópia isolada do app.
const baseURL = process.env['SHOT_BASE_URL'] ?? 'http://localhost:4210';
export default defineConfig({
  ...base,
  testMatch: /historico\.shots\.spec\.ts/,
  outputDir: '../../tmp/historico-results/shots',
  use: { ...base.use, baseURL },
  webServer: process.env['SHOT_BASE_URL'] ? undefined : base.webServer,
});
