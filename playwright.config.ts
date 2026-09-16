import { defineConfig, devices } from "@playwright/test";

/**
 * One smoke path: log in → Today shows day N/47 → Plan shows 47 days and 26 tasks.
 * Runs against a throwaway DB so it never touches data/pmp.db.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3100",
    ...devices["Pixel 5"],
    // Optional: point at a system Chromium instead of `npx playwright install chromium`.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "npm run build >/dev/null && npm run start -- -p 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      DATABASE_URL: "file:./data/e2e.db",
      APP_PASSPHRASE: "e2e-passphrase",
      SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
      OPENROUTER_API_KEY: "e2e-placeholder",
      LLM_TRANSPORT: "mock",
      EMBEDDINGS: "fake",
    },
  },
});
