import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://127.0.0.1:4399" },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:4399",
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
