import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.browser.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5187",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: [
    {
      command: "npm run dev",
      url: "http://127.0.0.1:5187",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "tsx tests/pilot-server-fixture.ts",
      url: "http://127.0.0.1:5188",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
