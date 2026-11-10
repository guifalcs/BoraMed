import { defineConfig } from '@playwright/test';
import base from './playwright.screenshots.config';
export default defineConfig({
  ...base,
  testMatch: /flashcards\.shots\.spec\.ts/,
  use: { ...base.use, baseURL: process.env['SHOT_BASE_URL'] ?? 'http://localhost:4210' },
  webServer: process.env['SHOT_BASE_URL'] ? undefined : base.webServer,
});
