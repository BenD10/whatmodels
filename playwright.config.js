import { defineConfig } from '@playwright/test';

// End-to-end tests run against the production build (the same static output
// that deploys), served by `vite preview` on its own port.
// Set E2E_BASE_URL to test an already-running server instead; this skips the
// rebuild, which would otherwise swap build/ out from under that server.
const PORT = 4174;
const externalServer = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: externalServer ?? `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: externalServer
    ? undefined
    : {
        // Bind IPv4 explicitly: on CI runners `localhost` can resolve to ::1 only,
        // and the readiness check below polls 127.0.0.1
        command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
