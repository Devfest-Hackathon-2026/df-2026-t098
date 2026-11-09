import { defineConfig, devices } from '@playwright/test';

const origin = `http://localhost:${process.env.WHYLINT_E2E_FRONTEND_PORT ?? 4200}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  globalTimeout: 300_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  use: {
    baseURL: origin,
    locale: 'ja-JP',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    // Recordings can contain cookies and request bodies.
    trace: 'off',
    video: 'off',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'node scripts/stack.mjs',
    url: `${origin}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
