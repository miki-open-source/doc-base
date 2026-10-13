import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import fc from "fast-check";
import {
  compile,
  loadConfig,
  normalizeRoute,
  routeIdentity,
  applySuppressions,
} from "@doc-base/core";
import { stableJson } from "@doc-base/schema";
import { parseArguments } from "../packages/cli/src/index.js";
const directories: string[] = [];
async function project(
  configExtra = "",
  files: Record<string, string> = {
    "index.md": "---\nid: home\ntitle: Home\n---\nWelcome.",
  },
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "doc-base-test-"));
  directories.push(root);
  await mkdir(path.join(root, "docs"));
  await writeFile(
    path.join(root, "doc-base.yaml"),
    `schemaVersion: 1\nsite:\n  title: Test\nsources:\n  docs:\n    type: local\n    path: ./docs\nnavigation:\n  - autogenerate:\n      source: docs\n      directory: .\n${configExtra}`,
  );
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, "docs", file)), {
      recursive: true,
    });
    await writeFile(path.join(root, "docs", file), text);
  }
  return root;
}
const page = (id: string, body: string, extra = "") =>
  `---\nid: ${id}\ntitle: ${id}\n${extra}---\n${body}\n`;
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
describe("content pipeline", () => {
  it("GIVEN nested section embeds and logical links\nWHEN compiling\nTHEN content and search preserve target context", async () => {
    // GIVEN
    const root = await project("", {
      "index.md": page("home", '::doc-embed{ref="shared#section"}'),
      "shared.md": page(
        "shared",
        '## Section\n\n::doc-embed{ref="leaf"}\n\n## Other\nExcluded.',
      ),
      "leaf.md": page("leaf", "[Home](doc:home)"),
    });
    // WHEN
    const result = await compile(root);
    // THEN
    expect(result.ok).toBe(true);
    const home = result.projections[0].pages.find(
      (page) => page.key === "docs::home",
    )!;
    expect(home.markdown).toContain("[Home](/)");
    expect(home.markdown).not.toContain("Excluded");
    expect(
      result.projections[0].search.find((page) => page.key === "docs::home")
        ?.bodyText,
    ).toContain("Home");
  });
  it("GIVEN a recursive embed cycle\nWHEN validating\nTHEN the shortest active cycle is reported", async () => {
    // GIVEN
    const root = await project("", {
      "a.md": page("a", '::doc-embed{ref="b"}'),
      "b.md": page("b", '::doc-embed{ref="a"}'),
    });
    // WHEN
    const result = await compile(root);
    // THEN
    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (item) =>
          item.code === "DBE200" &&
          item.message.includes("docs::a -> docs::b -> docs::a"),
      ),
    ).toBe(true);
  });
  it("GIVEN two audiences and a restricted embed\nWHEN compiling combined output\nTHEN only the eligible projection contains restricted text", async () => {
    // GIVEN
    const root = await project(
      "audiences:\n  public: {label: Public}\n  contributor: {label: Contributor}\n",
      {
        "index.md": page("home", '::doc-embed{ref="private"}'),
        "private.md": page(
          "private",
          "Contributor-only text",
          "audiences: [contributor]\n",
        ),
      },
    );
    const file = path.join(root, "doc-base.yaml");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace(
        "title: Test",
        "title: Test\n  defaultAudience: public",
      ),
    );
    // WHEN
    const result = await compile(root);
    // THEN
    expect(result.ok).toBe(true);
    expect(result.projections).toHaveLength(2);
    expect(result.projections[0].pages[0].markdown).not.toContain(
      "Contributor-only",
    );
    expect(
      result.projections[1].pages.find((page) => page.key === "docs::home")
        ?.markdown,
    ).toContain("Contributor-only");
    expect(result.projections[1].pages[0].url).toContain(
      "/_audience/contributor/",
    );
  });
  it.each([
    ["unknown: true\n", "DBF100"],
    ["id: duplicate\n", "DBC001"],
  ])("rejects invalid frontmatter %s", async (extra, code) => {
    const root = await project("", { "index.md": page("home", "Text", extra) });
    expect(
      (await compile(root)).diagnostics.some((item) => item.code === code),
    ).toBe(true);
  });
  it("rejects route collisions across case and Unicode normalization", async () => {
    const root = await project("", {
      "a.md": page("a", "Text", "slug: Café\n"),
      "b.md": page("b", "Text", "slug: café\n"),
    });
    expect(
      (await compile(root)).diagnostics.some((item) => item.code === "DBU120"),
    ).toBe(true);
  });
  it("rejects forbidden local overrides", async () => {
    const root = await project();
    await mkdir(path.join(root, ".doc-base"));
    await writeFile(
      path.join(root, ".doc-base/local.yaml"),
      "site:\n  title: Overridden\n",
    );
    await expect(loadConfig(root)).rejects.toMatchObject({
      exitCode: 2,
      diagnostics: [
        {
          code: "DBC012",
          message: expect.any(String),
          severity: "error",
          suppressible: false,
          file: expect.any(String),
        },
      ],
    });
  });
  it("GIVEN local Git content\nWHEN 1 fetched then rebuilt offline with a frozen lock\nTHEN 1 the immutable revision and content agree\nWHEN 2 its cache is modified\nTHEN 2 tampered bytes are rejected", async () => {
    // GIVEN
    const root = await project();
    const repo = path.join(root, "repository");
    await mkdir(repo);
    await writeFile(
      path.join(repo, "index.md"),
      page("git-home", "Git content"),
    );
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: repo, stdio: "pipe" });
    git("init", "-b", "main");
    git("add", ".");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-m",
      "fixture",
    );
    const file = path.join(root, "doc-base.yaml");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace(
        "type: local\n    path: ./docs",
        `type: git\n    repository: ${repo}\n    ref: main`,
      ),
    );
    // WHEN
    const first = await compile(root);
    const offline = await compile(root, {
      offline: true,
      frozenLockfile: true,
    });
    // THEN
    expect(first.ok).toBe(true);
    expect(offline.sources[0].revision).toBe(first.sources[0].revision);
    expect(offline.projections[0].pages[0].markdown).toContain("Git content");
    // WHEN 2: a cached checkout is modified outside the pipeline.
    await writeFile(
      path.join(first.sources[0].root, "index.md"),
      page("git-home", "Tampered content"),
    );
    // THEN 2: offline mode refuses bytes that do not match the locked commit.
    await expect(
      compile(root, { offline: true, frozenLockfile: true }),
    ).rejects.toMatchObject({
      exitCode: 3,
      diagnostics: [expect.objectContaining({ code: "DBS120" })],
    });
  });
  it("GIVEN an asset path escape\nWHEN validating\nTHEN it is an unsuppressible failure", async () => {
    // GIVEN
    const root = await project("", {
      "index.md": page("home", "![Secret](../../secret.png)"),
    });
    // WHEN
    await expect(compile(root)).rejects.toMatchObject({
      exitCode: 3,
      diagnostics: [
        expect.objectContaining({ code: "DBS130", suppressible: false }),
      ],
    });
  });
});
describe("portable contracts", () => {
  it("normalization is idempotent across generated portable paths", () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,12}$/), {
          minLength: 1,
          maxLength: 5,
        }),
        (parts) => {
          const route = parts.join("/");
          expect(normalizeRoute(normalizeRoute(route))).toBe(route);
          expect(routeIdentity(route)).toBe(routeIdentity(route.toUpperCase()));
        },
      ),
    );
  });
  it("serialization is independent of object insertion order", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.integer()), (value) => {
        expect(stableJson(value)).toBe(
          stableJson(Object.fromEntries(Object.entries(value).reverse())),
        );
      }),
    );
  });
  it("rejects command-specific flags before source work", () => {
    expect(() =>
      parseArguments(["fetch", "--source-path", "docs=."]),
    ).toThrow();
    expect(() => parseArguments(["build", "--offline", "--refresh"])).toThrow();
  });
  it("preserves suppression audit records without changing severity", () => {
    const result = applySuppressions(
      [
        {
          code: "DBV240",
          severity: "warning",
          message: "Path-coupled link",
          file: "index.md",
          suppressible: true,
        },
      ],
      [{ value: { code: "DBV240", reason: "Documented exception" } }],
      new Set(["DBV240"]),
    );
    expect(result[0].severity).toBe("warning");
    expect(result[0].suppressedBy?.reason).toBe("Documented exception");
  });
});
