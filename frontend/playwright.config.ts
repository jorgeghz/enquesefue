import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-results',
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:4173',
    screenshot: 'on',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },  // Chromium mobile (393×851)
    },
  ],
  // Arranca vite preview antes de los tests
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 30000,
  },
})
