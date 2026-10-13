import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "examples/knowledge-base/e2e",
  use: { baseURL: "http://127.0.0.1:4399" },
  webServer: {
    command: "node scripts/serve-example.mjs",
    url: "http://127.0.0.1:4399",
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
