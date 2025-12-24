import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for polaroid extraction E2E tests.
 * 
 * These tests verify that the image processing pipeline correctly
 * extracts polaroids from scanned images.
 */
export default defineConfig({
  testDir: './src/tests',
  testMatch: '**/*.browser.test.ts',
  
  /* Maximum time one test can run */
  timeout: 120000, // 2 minutes per test for large image processing
  
  /* Run tests in files in parallel */
  fullyParallel: false, // Sequential to avoid resource contention
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Limit parallel workers */
  workers: 1,
  
  /* Reporter to use */
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  
  /* Shared settings for all projects */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: 'http://localhost:5173',
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run local dev server before starting the tests */
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60000, // 1 minute to start server
  },
});

