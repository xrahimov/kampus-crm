import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.APP_URL ?? "http://localhost:3000";
const isCI = !!process.env.CI;
// Optional: run against an already-installed Chromium instead of the one
// `npx playwright install` downloads (useful on machines without download access).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    locale: "en-US",
    // The daily summary (A-190) opens by itself once a day and would cover the
    // page under test, so every spec starts with that switch off; the
    // assistant spec clears this state to test the opening itself.
    storageState: {
      cookies: [],
      origins: [{ origin: baseURL, localStorage: [{ name: "kampus.summary.auto", value: "off" }] }],
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  webServer: {
    // CI builds first and runs the production server; locally the dev server is enough.
    command: isCI ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
