import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real app (next dev) against the Firebase emulators.
 * `npm run test:e2e` starts the emulators, then Playwright starts the app.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    viewport: { width: 1280, height: 860 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
      NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-study-quest.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-study-quest",
      NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      AI_PROVIDER: "mock",
      MOCK_PLANNER_DELAY_MS: "10",
    },
  },
});
