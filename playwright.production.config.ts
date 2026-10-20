import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/production",
  timeout: 15000,
  workers: 1,
  use: {
    baseURL: "http://localhost:4323",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  webServer: {
    command: "node scripts/serve-built-test.mjs",
    url: "http://localhost:4323/staff/login",
    reuseExistingServer: false,
    env: { SITE_URL: "http://localhost:4323" },
  },
  reporter: "list",
});
