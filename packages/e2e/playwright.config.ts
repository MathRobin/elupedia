import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['github']] : 'html',
  // Les baselines (tests/*-snapshots/) sont générées via l'image Docker
  // officielle Playwright (voir packages/e2e/README.md) pour matcher le
  // rendu du runner CI — sinon les différences de police entre systèmes
  // font échouer les tests sans vraie régression visuelle.
  expect: {
    // maxDiffPixelRatio seul est trop permissif sur une longue page en
    // fullPage (un petit bouton ne pèse jamais 2% du total) : on plafonne
    // aussi en pixels absolus pour détecter un changement localisé.
    toHaveScreenshot: { maxDiffPixelRatio: 0.001, maxDiffPixels: 150 },
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'yarn --cwd ../site dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
