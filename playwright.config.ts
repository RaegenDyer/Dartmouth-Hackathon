import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build. Chat flows will use the mocked LLM adapter.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start -- --port 3100 --hostname 127.0.0.1",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: !process.env.CI,
  },
});
