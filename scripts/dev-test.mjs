import { mkdir, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const root = path.resolve(".artifacts/dev-project");
const baseUrl = process.env.TEST_DEV_BASE_URL ?? "/";
await rm(root, { recursive: true, force: true });
await mkdir(path.join(root, "docs"), { recursive: true });
const portServer = createServer();
await new Promise((resolve) => portServer.listen(0, "127.0.0.1", resolve));
const port = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
await writeFile(
  path.join(root, "doc-base.yaml"),
  `schemaVersion: 1\nsite: {title: Development, defaultAudience: public, baseUrl: ${baseUrl}}\nsources:\n  docs: {type: local, path: ./docs}\naudiences:\n  public: {label: Public}\n  contributor: {label: Contributor}\nnavigation:\n  - autogenerate: {source: docs, directory: .}\ndevelopment: {port: ${port}}\n`,
);
const document = (body) => `---\nid: home\ntitle: Home\n---\n${body}\n`;
await writeFile(path.join(root, "docs/index.md"), document("Initial content"));
await writeFile(
  path.join(root, "docs/guide.md"),
  "---\nid: guide\ntitle: Guide\n---\nNavigation guide.\n",
);
await writeFile(
  path.join(root, "docs/contributor.md"),
  "---\nid: contributor\ntitle: Contributor\naudiences: [contributor]\n---\nContributor text.\n",
);
const child = spawn(
  process.execPath,
  [
    path.resolve("packages/cli/dist/index.js"),
    "dev",
    "--config",
    path.join(root, "doc-base.yaml"),
  ],
  {
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let output = "";
let exitResult;
child.once("exit", (code, signal) => {
  exitResult = { code, signal };
});
const waiters = new Set();
child.stdout.on("data", (data) => {
  output += data;
  for (const resolve of waiters) resolve();
});
child.stderr.on("data", (data) => {
  output += data;
  for (const resolve of waiters) resolve();
});
function waitFor(marker, start = 0) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(check);
      reject(new Error(`Timed out waiting for ${marker}: ${output}`));
    }, 30000);
    const check = () => {
      if (output.slice(start).includes(marker)) {
        clearTimeout(timer);
        waiters.delete(check);
        resolve();
      }
    };
    waiters.add(check);
    check();
  });
}
let browser;
let page;
const siteUrl = `http://localhost:${port}${baseUrl}`;
try {
  // GIVEN: two audience projections served by the development command.
  await waitFor("Serving documentation");
  if (process.env.TEST_DEV_BROWSER === "1") {
    browser = await chromium.launch();
    page = await browser.newPage();
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    async function openPage(url) {
      const connected = page.waitForEvent("websocket").then(async (socket) => {
        assert.equal(new URL(socket.url()).origin, `ws://localhost:${port}`);
        await socket.waitForEvent("framereceived", {
          predicate: (frame) =>
            String(frame.payload).includes('"type":"connected"'),
          timeout: 10000,
        });
      });
      await Promise.all([page.goto(url), connected]);
    }
    await openPage(siteUrl);
    await expect(page.getByText("Initial content")).toBeVisible();
    // WHEN: navigating repeatedly between sidebar pages in both audiences.
    const sidebar = page.getByRole("navigation", { name: "Main" });
    for (const audienceBase of ["", "_audience/contributor/"]) {
      if (audienceBase) await openPage(siteUrl + audienceBase);
      for (let navigation = 0; navigation < 3; navigation++) {
        await sidebar.getByRole("link", { name: "Guide", exact: true }).click();
        await expect(page.getByText("Navigation guide.")).toBeVisible();
        await sidebar.getByRole("link", { name: "Home", exact: true }).click();
        await expect(page.getByText("Initial content")).toBeVisible();
      }
    }
    // THEN: navigation stays responsive and every audience's HMR connection works.
    assert.deepEqual(browserErrors, []);
    await openPage(siteUrl);
  }

  const response = await fetch(siteUrl);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Initial content/);
  const contributor = await fetch(
    siteUrl + "_audience/contributor/contributor/",
  );
  assert.equal(contributor.status, 200);
  assert.match(await contributor.text(), /Contributor text/);
  // WHEN 1: an original source file changes.
  const before = output.length;
  await writeFile(
    path.join(root, "docs/index.md"),
    document("Updated content"),
  );
  await waitFor("Rebuilt documentation", before);
  // THEN 1: the new valid render is served.
  assert.match(await (await fetch(siteUrl)).text(), /Updated content/);
  // WHEN 2: validation fails on a subsequent edit.
  const beforeFailure = output.length;
  await writeFile(
    path.join(root, "docs/index.md"),
    document("[Missing](doc:missing)"),
  );
  await waitFor("Output is stale", beforeFailure);
  // THEN 2: the previous valid render remains available.
  assert.match(await (await fetch(siteUrl)).text(), /Updated content/);
  const controller = new AbortController();
  const events = await fetch(siteUrl + "_doc-base/development-events", {
    signal: controller.signal,
  });
  const reader = events.body.getReader();
  const event = new TextDecoder().decode((await reader.read()).value);
  controller.abort();
  const status = JSON.parse(event.slice("data: ".length).trim());
  assert.equal(status.stale, true);
  if (page) {
    await expect(page.getByRole("alert")).toContainText("Output is stale.", {
      timeout: 15000,
    });
    await expect(page.getByRole("alert")).toContainText("DBR100");
    // WHEN 3: an invalid edit is repaired.
    const beforeRecovery = output.length;
    await writeFile(
      path.join(root, "docs/index.md"),
      document("Recovered content"),
    );
    await waitFor("Rebuilt documentation", beforeRecovery);
    // THEN 3: the browser reloads the valid content and clears the stale notice.
    await expect(page.getByText("Recovered content")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("alert")).toBeHidden();
  }
  assert.match(status.message, /DBR100/);
  console.log("Development projections, watching, and stale output verified.");
} finally {
  await browser?.close();
  const exited = exitResult
    ? Promise.resolve(exitResult)
    : new Promise((resolve) =>
        child.once("exit", (code, signal) => resolve({ code, signal })),
      );
  child.kill("SIGINT");
  const termination = await exited;
  if (process.platform === "win32") {
    // Node forcibly terminates Windows children instead of delivering SIGINT.
    assert.equal(termination.signal, "SIGINT");
  } else {
    assert.equal(termination.code, 130);
  }
  await rm(root, { recursive: true, force: true });
}
