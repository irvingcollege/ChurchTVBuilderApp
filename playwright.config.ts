import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: "http://localhost:4321",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  webServer: {
    command: "npm run dev -- --ignore-lock",
    url: "http://localhost:4321",
    reuseExistingServer: true,
    env: { ASTRO_TELEMETRY_DISABLED: "1" },
  },
  reporter: "list",
});
