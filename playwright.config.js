const { defineConfig, devices } = require('@playwright/test');
const port = Number(process.env.POS_E2E_BOUND_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535 || !process.env.POS_E2E_TENANT_ID) {
  throw new Error('Ejecuta npm run test:e2e para preparar el servidor y las bases PostgreSQL temporales.');
}

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://cafeteria.localhost:${port}`,
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
