import { afterEach, beforeEach, expect, it, vi } from "vitest";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  mkdtemp: vi.fn(),
  readdir: vi.fn(),
  rm: vi.fn(),
  execFileSync: vi.fn(),
  runPnpm: vi.fn(),
}));
vi.mock("node:fs/promises", () => mocks);
vi.mock("node:child_process", () => ({ execFileSync: mocks.execFileSync }));
vi.mock("../scripts/pnpm.mjs", () => ({ runPnpm: mocks.runPnpm }));

const names = [
  "@doc-base/schema",
  "@doc-base/extension-api",
  "@doc-base/sources",
  "@doc-base/core",
  "@doc-base/starlight",
  "doc-base",
];
const tarballs = names.map(
  (name) => name.replace("@", "").replace("/", "-") + "-1.0.0.tgz",
);
const consumer = path.resolve("release-consumer");

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("RELEASE_TAG", "v1.0.0");
  mocks.readFile.mockImplementation(async (file: string) => {
    if (file === "CHANGELOG.md") return "## 1.0.0";
    if (file === "package.json") return JSON.stringify({ version: "1.0.0" });
    const directory = file.split("/")[1];
    const name = directory === "cli" ? "doc-base" : "@doc-base/" + directory;
    return JSON.stringify({ name, version: "1.0.0" });
  });
  mocks.readdir.mockResolvedValue(tarballs);
  mocks.mkdtemp.mockResolvedValue(consumer);
  mocks.execFileSync.mockImplementation((command: string, args: string[]) => {
    if (command === "git") return "tagged-commit";
    if (command === process.execPath)
      return args[1] === "--version" ? "1.0.0" : "";
    throw new Error("Unexpected executable: " + command);
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function report() {
  const writes = mocks.writeFile.mock.calls.filter(
    ([file]) => file === ".artifacts/release-report.json",
  );
  return JSON.parse(writes.at(-1)![1]);
}

it("GIVEN inspected packages at the release tag\nWHEN publishing succeeds\nTHEN pnpm publishes with provenance and verifies a clean registry install", async () => {
  // GIVEN: the release fixtures are prepared by beforeEach.
  // WHEN
  await import("../scripts/release.mjs");
  // THEN
  expect(mocks.runPnpm.mock.calls.slice(0, 6).map(([args]) => args)).toEqual(
    tarballs.map((file) => [
      "publish",
      path.resolve(".artifacts", file),
      "--access",
      "public",
      "--provenance",
      "--no-git-checks",
    ]),
  );
  expect(mocks.runPnpm).toHaveBeenLastCalledWith(["add", "doc-base@1.0.0"], {
    cwd: consumer,
    stdio: "inherit",
  });
  expect(mocks.execFileSync).toHaveBeenCalledWith(
    process.execPath,
    [
      path.join(consumer, "node_modules/doc-base/dist/index.js"),
      "build",
      "--config",
      "site/doc-base.yaml",
    ],
    { cwd: consumer, stdio: "inherit" },
  );
  expect(report()).toMatchObject({
    published: names,
    failed: null,
    registryVerified: true,
  });
  expect(mocks.rm).toHaveBeenCalledWith(consumer, {
    recursive: true,
    force: true,
  });
});

it("GIVEN one published package\nWHEN the next pnpm publish fails\nTHEN the report preserves partial success and no later package is attempted", async () => {
  // GIVEN
  mocks.runPnpm
    .mockImplementationOnce(() => "")
    .mockImplementationOnce(() => {
      throw new Error("Registry unavailable");
    });
  // WHEN
  const result = import("../scripts/release.mjs");
  // THEN
  await expect(result).rejects.toThrow("Registry unavailable");
  expect(mocks.runPnpm).toHaveBeenCalledTimes(2);
  expect(report()).toMatchObject({
    published: [names[0]],
    failed: names[1],
    registryVerified: false,
  });
  expect(mocks.mkdtemp).not.toHaveBeenCalled();
});

it("GIVEN a checkout that differs from the release tag\nWHEN releasing\nTHEN publishing is rejected before any registry command", async () => {
  // GIVEN
  mocks.execFileSync
    .mockReturnValueOnce("tagged-commit")
    .mockReturnValueOnce("different-commit");
  // WHEN
  const result = import("../scripts/release.mjs");
  // THEN
  await expect(result).rejects.toThrow(
    "The checkout must match the release tag",
  );
  expect(mocks.runPnpm).not.toHaveBeenCalled();
  expect(mocks.writeFile).not.toHaveBeenCalled();
});
