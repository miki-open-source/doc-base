import { afterEach, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { compile, loadConfig, applySuppressions, passes } from "@doc-base/core";
import { buildSite } from "@doc-base/starlight";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { schema } from "@doc-base/core";
import { stableJson } from "@doc-base/schema";
import { verifySnapshots } from "@doc-base/sources";
import { parseArguments, main } from "doc-base";
const directories: string[] = [];
async function fixture(
  files: Record<string, string>,
  extra = "",
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "doc-base-contract-"));
  directories.push(root);
  await mkdir(path.join(root, "docs"));
  await writeFile(
    path.join(root, "doc-base.yaml"),
    `schemaVersion: 1\nsite: {title: Test}\nsources:\n  docs: {type: local, path: ./docs}\nnavigation:\n  - autogenerate: {source: docs, directory: .}\n${extra}`,
  );
  for (const [name, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, "docs", name)), {
      recursive: true,
    });
    await writeFile(path.join(root, "docs", name), body);
  }
  return root;
}
const page = (id: string, body = "Text", extra = "") =>
  `---\nid: ${id}\ntitle: ${id}\n${extra}---\n${body}\n`;
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});
it.each([
  [
    "missing reference",
    { "index.md": page("home", "[Missing](doc:missing)") },
    "",
    "DBR100",
  ],
  [
    "missing fragment",
    { "index.md": page("home", "[Missing](doc:home#absent)") },
    "",
    "DBR120",
  ],
  [
    "missing embed section",
    { "index.md": page("home", '::doc-embed{ref="home#absent"}') },
    "",
    "DBE120",
  ],
  [
    "unknown embed attribute",
    { "index.md": page("home", '::doc-embed{ref="home" extra="x"}') },
    "",
    "DBE110",
  ],
  [
    "unknown relationship",
    {
      "index.md": page(
        "home",
        "Text",
        "relationships: [{type: invented, target: home}]\n",
      ),
    },
    "",
    "DBR130",
  ],
  [
    "unknown audience",
    { "index.md": page("home", "Text", "audiences: [unknown]\n") },
    "",
    "DBA100",
  ],
  [
    "missing asset",
    { "index.md": page("home", "![Image](missing.png)") },
    "",
    "DBU140",
  ],
  [
    "reserved route",
    { "index.md": page("home", "Text", "slug: _doc-base/private\n") },
    "",
    "DBU110",
  ],
  [
    "redirect shadow",
    { "index.md": page("home", "Text", "redirects: [/]\n") },
    "",
    "DBU130",
  ],
  [
    "case-folded identity",
    { "a.md": page("Home"), "b.md": page("home") },
    "",
    "DBF110",
  ],
  [
    "duplicate embed headings",
    {
      "index.md": page("home", '## Same\n\n::doc-embed{ref="target"}'),
      "target.md": page("target", "## Same"),
    },
    "embeds: {duplicateHeadingIds: error}\n",
    "DBE240",
  ],
  [
    "embed depth",
    {
      "index.md": page("home", '::doc-embed{ref="target"}'),
      "target.md": page("target", '::doc-embed{ref="leaf"}'),
      "leaf.md": page("leaf"),
    },
    "embeds: {maxDepth: 1}\n",
    "DBE210",
  ],
] as const)("reports %s", async (_name, files, extra, code) => {
  const result = await compile(await fixture(files, extra));
  expect(result.ok).toBe(false);
  expect(result.diagnostics.some((item) => item.code === code)).toBe(true);
});
it("GIVEN inverse relationships authored reciprocally\nWHEN compiling\nTHEN each panel shows the edge once", async () => {
  // GIVEN
  const root = await fixture(
    {
      "a.md": page(
        "a",
        "Text",
        "relationships: [{type: related, target: b}]\n",
      ),
      "b.md": page(
        "b",
        "Text",
        "relationships: [{type: related, target: a}]\n",
      ),
    },
    "relationships:\n  related: {label: Related, inverse: related}\n",
  );
  // WHEN
  const result = await compile(root);
  // THEN
  expect(result.ok).toBe(true);
  expect(
    result.projections[0].pages.map((page) => page.relationships.length),
  ).toEqual([1, 1]);
});
it("GIVEN prefix heading policy\nWHEN embedding a colliding heading\nTHEN its local fragment points at the prefixed ID", async () => {
  // GIVEN
  const root = await fixture({
    "index.md": page("home", '## Same\n\n::doc-embed{ref="target"}'),
    "target.mdx": page(
      "target",
      '## Same\n\n[Section](#same)\n\n<a href="#same">Jump</a>',
    ),
  });
  // WHEN
  const result = await compile(root);
  // THEN
  const host = result.projections[0].pages.find(
    (page) => page.key === "docs::home",
  )!;
  expect(host.headings.map((heading) => heading.id)).toEqual([
    "same",
    "embed-target-same",
  ]);
  expect(host.markdown).toContain("#embed-target-same");
  expect(host.markdown).toContain('href="#embed-target-same"');
});
it("GIVEN excluded pages and draft content\nWHEN creating a production projection\nTHEN routes and search respect independent policies", async () => {
  // GIVEN
  const root = await fixture(
    {
      "index.md": page("home"),
      "draft.md": page("draft", "Draft", "draft: true\n"),
      "hidden.md": page("hidden", "Find me", "nav: {hidden: true}\n"),
      "excluded.md": page("excluded", "Secret", "search: {exclude: true}\n"),
    },
    "validation: {strictNavigation: false}\n",
  );
  // WHEN
  const result = await compile(root);
  // THEN
  expect(result.projections[0].pages.map((page) => page.key)).not.toContain(
    "docs::draft",
  );
  expect(result.projections[0].search.map((page) => page.key)).toContain(
    "docs::hidden",
  );
  expect(result.projections[0].search.map((page) => page.key)).not.toContain(
    "docs::excluded",
  );
});
it("GIVEN local overlay and environment settings\nWHEN CLI flags override them\nTHEN the documented precedence applies", async () => {
  // GIVEN
  const root = await fixture({ "index.md": page("home") });
  await mkdir(path.join(root, ".doc-base"));
  await writeFile(
    path.join(root, ".doc-base/local.yaml"),
    "cache: {directory: overlay-cache}\ndevelopment: {port: 4400}\n",
  );
  // WHEN
  const result = await loadConfig(
    root,
    { offline: false },
    { DOC_BASE_OFFLINE: "true", DOC_BASE_CACHE_DIR: "env-cache" },
  );
  // THEN
  expect(result.options.offline).toBe(false);
  expect(result.config.cache.directory).toBe(path.resolve(root, "env-cache"));
  expect(result.config.development.port).toBe(4400);
});
it("rejects missing frozen locks and escaping symlinks", async () => {
  const root = await fixture({ "index.md": page("home") });
  await expect(compile(root, { frozenLockfile: true })).rejects.toMatchObject({
    exitCode: 3,
  });
  if (process.platform !== "win32") {
    await symlink(tmpdir(), path.join(root, "docs", "escape"));
    await expect(compile(root)).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "DBS130" })],
    });
  }
});
it("GIVEN failed validation\nWHEN requesting a build\nTHEN generated and output directories are untouched", async () => {
  // GIVEN
  const root = await fixture({
    "index.md": page("home", "[Broken](doc:missing)"),
  });
  const result = await compile(root);
  // WHEN
  await expect(buildSite(result)).rejects.toMatchObject({ exitCode: 1 });
  // THEN
  await expect(
    access(path.join(root, ".doc-base/generated")),
  ).rejects.toBeDefined();
  await expect(access(path.join(root, "dist"))).rejects.toBeDefined();
});
it("GIVEN a package extension\nWHEN validating\nTHEN rules receive frozen public records and run once", async () => {
  // GIVEN
  const root = await fixture(
    { "index.md": page("home") },
    "extensions: [{package: test-extension}]\n",
  );
  const extension = path.join(root, "node_modules/test-extension");
  await mkdir(extension, { recursive: true });
  await writeFile(
    path.join(extension, "package.json"),
    stableJson({
      name: "test-extension",
      version: "1.0.0",
      type: "module",
      main: "index.js",
    }),
  );
  await writeFile(
    path.join(extension, "index.js"),
    `let calls=0;export default {apiVersion:'1',name:'Test',setup(api){api.validation.registerRule({code:'DBX101',defaultSeverity:'info',description:'Check context',run(ctx){if(++calls!==1||!Object.isFrozen(ctx.documents[0])||'ast' in ctx.documents[0]||'sources' in ctx.config)throw Error('Invalid context');return [{message:'Extension ran'}];}})}}`,
  );
  // WHEN
  const result = await compile(root);
  // THEN
  expect(result.ok).toBe(true);
  expect(
    result.diagnostics.filter((item) => item.code === "DBX101"),
  ).toHaveLength(1);
  expect(result.manifest.extensions[0].version).toBe("1.0.0");
});
it("GIVEN non-interactive init collisions\nWHEN initializing again\nTHEN existing files remain unchanged", async () => {
  // GIVEN
  const root = await fixture({ "index.md": page("home") });
  const config = await readFile(path.join(root, "doc-base.yaml"), "utf8");
  const cli = path.resolve("packages/cli/dist/index.js");
  // WHEN
  expect(() =>
    execFileSync(process.execPath, [cli, "init", root, "--force"], {
      stdio: "pipe",
    }),
  ).toThrow();
  // THEN
  expect(await readFile(path.join(root, "doc-base.yaml"), "utf8")).toBe(config);
});
it("GIVEN generated embed rings\nWHEN validating\nTHEN every cycle is rejected", async () => {
  // GIVEN / WHEN / THEN: each generated ring is an independent scenario.
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (size) => {
      const files = Object.fromEntries(
        Array.from({ length: size }, (_, i) => [
          `${i}.md`,
          page(`doc-${i}`, `::doc-embed{ref="doc-${(i + 1) % size}"}`),
        ]),
      );
      const result = await compile(await fixture(files));
      expect(result.diagnostics.some((item) => item.code === "DBE200")).toBe(
        true,
      );
    }),
    { numRuns: 5 },
  );
});
it("expired, unknown and unused suppressions remain visible", () => {
  const diagnostics = applySuppressions(
    [],
    [
      {
        value: {
          code: "DBV240",
          reason: "Expired exception",
          expires: "2020-01-01",
        },
      },
      { value: { code: "DBV999", reason: "Unknown exception" } },
      { value: { code: "DBV240", reason: "Unused exception" } },
    ],
    new Set(["DBV240"]),
    new Date("2026-10-12T00:00:00Z"),
  );
  expect(diagnostics.map((item) => item.code)).toEqual([
    "DBV901",
    "DBV902",
    "DBV903",
  ]);
  expect(passes(diagnostics, "never")).toBe(false);
});
it("GIVEN an unrelated source file\nWHEN its bytes change\nTHEN the local revision remains stable while referenced assets affect it", async () => {
  // GIVEN
  const root = await fixture({
    "index.md": page("home", "![Diagram](diagram.svg)"),
    "diagram.svg": "<svg />",
    "unrelated.txt": "First",
  });
  const initial = await compile(root);
  // WHEN 1
  await writeFile(path.join(root, "docs/unrelated.txt"), "Second");
  const unrelated = await compile(root);
  // THEN 1
  expect(unrelated.sources[0].revision).toBe(initial.sources[0].revision);
  // WHEN 2
  await writeFile(
    path.join(root, "docs/diagram.svg"),
    "<svg><title>Changed</title></svg>",
  );
  const changed = await compile(root);
  // THEN 2
  expect(changed.sources[0].revision).not.toBe(initial.sources[0].revision);
});
it("GIVEN a selected audience and hidden cyclic content\nWHEN validating\nTHEN graph integrity is checked globally", async () => {
  // GIVEN
  const root = await fixture(
    {
      "index.md": page("home"),
      "hidden.md": page(
        "hidden",
        '::doc-embed{ref="hidden"}',
        "audiences: [contributor]\n",
      ),
    },
    "audiences:\n  public: {label: Public}\n  contributor: {label: Contributor}\n",
  );
  const file = path.join(root, "doc-base.yaml");
  await writeFile(
    file,
    (await readFile(file, "utf8")).replace(
      "site: {title: Test}",
      "site: {title: Test, defaultAudience: public}",
    ),
  );
  // WHEN
  const result = await compile(root, { audience: "public" });
  // THEN
  expect(result.ok).toBe(false);
  expect(result.diagnostics.some((item) => item.code === "DBE200")).toBe(true);
});
it("GIVEN reference-style links and an MDX asset\nWHEN compiling\nTHEN URLs resolve against their owning source", async () => {
  // GIVEN
  const root = await fixture({
    "index.md": page("home", "[Target][target]\n\n[target]: doc:target"),
    "target.mdx": page("target", '<img src="./diagram.svg" alt="Diagram" />'),
    "diagram.svg": "<svg />",
  });
  // WHEN
  const result = await compile(root);
  // THEN
  expect(result.ok).toBe(true);
  expect(
    result.projections[0].pages.find((page) => page.key === "docs::home")
      ?.markdown,
  ).toContain("/target/");
  expect(
    result.projections[0].pages.find((page) => page.key === "docs::target")
      ?.markdown,
  ).toContain("/_doc-base/assets/");
  expect(result.assets.size).toBe(1);
});
it("GIVEN a content directory and an asset outside it but inside the source\nWHEN compiling\nTHEN provenance uses source-relative paths and the asset is valid", async () => {
  // GIVEN
  const root = await fixture({
    "content/index.md": page("home", "![Diagram](../diagram.svg)"),
    "diagram.svg": "<svg />",
  });
  const file = path.join(root, "doc-base.yaml");
  await writeFile(
    file,
    (await readFile(file, "utf8")).replace(
      "path: ./docs}",
      "path: ./docs, content: content}",
    ),
  );
  // WHEN
  const result = await compile(root);
  // THEN
  expect(result.ok).toBe(true);
  expect(result.documents[0].sourcePath).toBe("content/index.md");
  expect(result.documents[0].url).toBe("/");
  expect(result.assets.size).toBe(1);
});
it("GIVEN an import-only ESM extension\nWHEN loading it from the project\nTHEN options and rule registration are supported", async () => {
  // GIVEN
  const root = await fixture(
    { "index.md": page("home") },
    "extensions: [{package: import-only, options: {enabled: true}}]\n",
  );
  const extension = path.join(root, "node_modules/import-only");
  await mkdir(extension, { recursive: true });
  await writeFile(
    path.join(extension, "package.json"),
    stableJson({
      name: "import-only",
      version: "1.0.0",
      type: "module",
      exports: { ".": { import: "./index.js" } },
    }),
  );
  await writeFile(
    path.join(extension, "index.js"),
    `export default {apiVersion:'1',name:'Import only',optionsSchema:{type:'object',additionalProperties:false,properties:{enabled:{type:'boolean'}},required:['enabled']},setup(api,options){if(options.enabled)api.validation.registerRule({code:'DBX102',defaultSeverity:'info',description:'Loaded',run(){return [{message:'Import-only extension loaded'}]}})}}`,
  );
  // WHEN
  const result = await compile(root);
  // THEN
  expect(result.ok).toBe(true);
  expect(result.diagnostics.some((item) => item.code === "DBX102")).toBe(true);
});
it("GIVEN repeated embeds of a heading section\nWHEN assigning collision prefixes\nTHEN each instance links to its own heading", async () => {
  // GIVEN
  const root = await fixture({
    "index.md": page(
      "home",
      '## Same\n\n::doc-embed{ref="target"}\n\n::doc-embed{ref="target"}',
    ),
    "target.md": page("target", "## Same\n\n[Section](#same)"),
  });
  // WHEN
  const result = await compile(root);
  // THEN
  const host = result.projections[0].pages.find(
    (page) => page.key === "docs::home",
  )!;
  expect(host.markdown).toContain("[Section](#embed-target-same)");
  expect(host.markdown).toContain("[Section](#embed-target-same-2)");
});
it.each(["sha1", "sha256"])(
  "GIVEN a local Git %s history\nWHEN resolving a commit expression\nTHEN the selected immutable history is used",
  async (format) => {
    // GIVEN
    const root = await fixture({ "index.md": page("home") });
    const repository = path.join(root, "repository");
    await mkdir(repository);
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: repository, stdio: "pipe" });
    git("init", "--object-format=" + format, "-b", "main");
    await writeFile(path.join(repository, "index.md"), page("first"));
    git("add", ".");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-m",
      "First",
    );
    const first = git("rev-parse", "HEAD").toString().trim();
    await writeFile(path.join(repository, "index.md"), page("second"));
    git("add", ".");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-m",
      "Second",
    );
    const config = path.join(root, "doc-base.yaml");
    await writeFile(
      config,
      (await readFile(config, "utf8")).replace(
        "type: local, path: ./docs",
        "type: git, repository: ./repository, ref: main~1",
      ),
    );
    // WHEN
    const result = await compile(root);
    // THEN
    expect(result.ok).toBe(true);
    expect(result.sources[0].revision).toBe(first);
    expect(result.documents[0].id).toBe("first");
    const lock = await readFile(
      path.join(root, ".doc-base/sources.lock.json"),
      "utf8",
    );
    expect(lock).toContain('"repository": "./repository"');
    expect(lock).not.toContain(root);
  },
);
it("GIVEN one custom directory label and unlabeled siblings\nWHEN generating navigation\nTHEN the custom label applies without a conflict", async () => {
  // GIVEN
  const root = await fixture({
    "guides/a.md": page("a"),
    "guides/b.md": page("b", "Text", "nav: {group: Tutorials}\n"),
  });
  // WHEN
  const result = await compile(root);
  // THEN
  expect(result.ok).toBe(true);
  expect(result.projections[0].navigation[0].label).toBe("Tutorials");
  expect(result.diagnostics.some((item) => item.code === "DBN230")).toBe(false);
});
it("GIVEN inclusion rules and a draft\nWHEN snapshotting content\nTHEN every excluded document has an attributable policy", async () => {
  // GIVEN
  const root = await fixture({
    "index.md": page("home"),
    "draft.md": page("draft", "Draft", "draft: true\n"),
    "ignored.md": page("ignored"),
  });
  const file = path.join(root, "doc-base.yaml");
  await writeFile(
    file,
    (await readFile(file, "utf8")).replace(
      "path: ./docs}",
      "path: ./docs, exclude: [ignored.md]}",
    ),
  );
  // WHEN
  await compile(root);
  // THEN
  const snapshot = JSON.parse(
    await readFile(path.join(root, ".doc-base/source-snapshot.json"), "utf8"),
  );
  expect(snapshot.sources[0].excluded).toEqual([
    { sourcePath: "ignored.md", reason: "exclude" },
  ]);
  expect(snapshot.draftExclusions).toEqual([
    { sourceId: "docs", sourcePath: "draft.md", reason: "draft" },
  ]);
});
it.each(["md", "mdx"])(
  "rejects dynamic embed attributes in %s",
  async (format) => {
    const result = await compile(
      await fixture({
        [`index.${format}`]: page("home", "::doc-embed{ref={target}}"),
      }),
    );
    expect(
      result.diagnostics.some(
        (item) => item.code === "DBE110" && item.range?.start.line === 5,
      ),
    ).toBe(true);
  },
);
it("rejects routes that collide under full Unicode case folding", async () => {
  const result = await compile(
    await fixture({
      "a.md": page("a", "Text", "slug: Straße\n"),
      "b.md": page("b", "Text", "slug: strasse\n"),
    }),
  );
  expect(result.diagnostics.some((item) => item.code === "DBU120")).toBe(true);
});
it("GIVEN a Git tree with portable path collisions\nWHEN resolving it on any host filesystem\nTHEN the collision is rejected before checkout", async () => {
  // GIVEN
  const root = await fixture({ "index.md": page("home") });
  const repository = path.join(root, "repository");
  await mkdir(repository);
  const git = (args: string[], input?: string) =>
    execFileSync("git", args, {
      cwd: repository,
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  git(["init", "--bare"]);
  const upper = git(["hash-object", "-w", "--stdin"], page("upper"));
  const lower = git(["hash-object", "-w", "--stdin"], page("lower"));
  const tree = git(
    ["mktree"],
    `100644 blob ${upper}\tA.md\n100644 blob ${lower}\ta.md\n`,
  );
  const commit = git([
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit-tree",
    tree,
    "-m",
    "Collision",
  ]);
  git(["update-ref", "refs/heads/main", commit]);
  const config = path.join(root, "doc-base.yaml");
  await writeFile(
    config,
    (await readFile(config, "utf8")).replace(
      "type: local, path: ./docs",
      "type: git, repository: ./repository, ref: main",
    ),
  );
  // WHEN / THEN
  await expect(compile(root)).rejects.toMatchObject({
    exitCode: 3,
    diagnostics: [expect.objectContaining({ code: "DBF120" })],
  });
});
it("GIVEN a static MDX target embedded into Markdown\nWHEN compiling\nTHEN the generated module retains the MDX content", async () => {
  // GIVEN
  const root = await fixture({
    "index.md": page("home", '<br>\n\n::doc-embed{ref="target"}'),
    "target.mdx": page("target", "<strong>Shared MDX text</strong>"),
  });
  // WHEN
  const result = await compile(root);
  // THEN
  expect(result.ok).toBe(true);
  const host = result.projections[0].pages.find(
    (page) => page.key === "docs::home",
  )!;
  expect(host.format).toBe("mdx");
  expect(host.markdown).toContain("<strong>Shared MDX text</strong>");
  expect(host.markdown).toContain("<br />");
});
it("indexes visible HTML text while excluding script and code blocks", async () => {
  const root = await fixture({
    "index.md": page(
      "home",
      "<div>Visible HTML text</div>\n\n<script>hiddenScript()</script>\n\n```js\nexcludedCode()\n```",
    ),
  });
  const record = (await compile(root)).projections[0].search[0];
  expect(record.bodyText).toContain("Visible HTML text");
  expect(record.bodyText).not.toContain("hiddenScript");
  expect(record.bodyText).not.toContain("excludedCode");
});

it("GIVEN an immutable local snapshot\nWHEN a required file changes\nTHEN snapshot verification fails with a source diagnostic", async () => {
  // GIVEN
  const root = await fixture({ "index.md": page("home") });
  const result = await compile(root);
  // WHEN
  await writeFile(
    path.join(root, "docs/index.md"),
    page("home", "Changed bytes"),
  );
  // THEN
  await expect(
    verifySnapshots(result.sources, new Map([["docs", new Set(["index.md"])]])),
  ).rejects.toMatchObject({
    exitCode: 3,
    diagnostics: [expect.objectContaining({ code: "DBS140" })],
  });
});
it("GIVEN decomposed Unicode content and asset paths\nWHEN compiling normalized paths\nTHEN both the document and referenced asset resolve", async () => {
  // GIVEN
  const root = await fixture({
    "cafe\u0301/index.md": page("home", "![Image](./image.svg)"),
    "cafe\u0301/image.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>',
  });
  const config = path.join(root, "doc-base.yaml");
  await writeFile(
    config,
    (await readFile(config, "utf8")).replace(
      "path: ./docs",
      "path: ./docs, content: café",
    ),
  );
  // WHEN
  const result = await compile(root);
  // THEN
  expect(result.ok).toBe(true);
  expect(result.documents).toHaveLength(1);
  expect(result.documents[0].sourcePath).toBe("café/index.md");
  expect(result.assets.size).toBe(1);
});
it("includes explicitly selected documents beneath a directory named node_modules", async () => {
  const root = await fixture({ "node_modules/index.md": page("home") });
  const result = await compile(root);
  expect(result.ok).toBe(true);
  expect(result.documents[0].id).toBe("home");
});
it.each([
  ["validate", "--offline", "--refresh"],
  ["build", "--json"],
  ["dev", "--strict"],
  ["fetch", "--source-path", "docs=./docs"],
  ["doctor", "--audience", "public"],
  ["init", "--log-level", "invalid"],
  ["schema", "--config", "unused.yaml"],
  ["--version", "--unknown"],
  ["validate", "--audience"],
  ["validate", "--unknown"],
  ["validate", "--local-config", "local.yaml", "--no-local-config"],
])(
  "rejects invalid arguments %j before reading sources",
  (...args: string[]) => {
    expect(() => parseArguments(args)).toThrowError();
  },
);
it.each([
  "dev",
  "validate",
  "build",
  "fetch",
  "clean",
  "doctor",
  "schema",
  "init",
])("accepts help for %s", (command) => {
  expect(parseArguments([command, "--help"]).command).toBe("--help");
});

it.each([
  ["unsupported API", "apiVersion:'2',name:'Bad',setup(){}"],
  [
    "invalid options",
    "apiVersion:'1',name:'Bad',optionsSchema:{type:'object',required:['enabled']},setup(){}",
  ],
  [
    "duplicate registrations",
    "apiVersion:'1',name:'Bad',setup(api){const rule={code:'DBX199',defaultSeverity:'error',description:'Bad',run(){return []}};api.validation.registerRule(rule);api.validation.registerRule(rule)}",
  ],
  [
    "thrown rule",
    "apiVersion:'1',name:'Bad',setup(api){api.validation.registerRule({code:'DBX199',defaultSeverity:'error',description:'Bad',run(){throw Error('Rule failed')}})}",
  ],
  [
    "invalid presenter",
    "apiVersion:'1',name:'Bad',setup(api){api.metadata.registerPresenter({key:'owner',label:'Owner',placement:'header',present(){return {kind:'html',html:'<script>bad()</script>'}}})}",
  ],
])(
  "GIVEN %s in an extension\nWHEN compiling\nTHEN it fails with exit 4",
  async (_name, definition) => {
    // GIVEN
    const root = await fixture(
      { "index.md": page("home", "Text", "metadata: {owner: Example}\n") },
      "extensions: [{package: failing-extension}]\n",
    );
    const directory = path.join(root, "node_modules/failing-extension");
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "package.json"),
      JSON.stringify({
        name: "failing-extension",
        version: "1.0.0",
        type: "module",
        exports: "./index.js",
      }),
    );
    await writeFile(
      path.join(directory, "index.js"),
      `export default {${definition}}`,
    );
    // WHEN / THEN
    await expect(compile(root)).rejects.toMatchObject({
      exitCode: 4,
      diagnostics: [expect.objectContaining({ code: "DBX001" })],
    });
  },
);
it("GIVEN a validation failure\nWHEN requesting JSON\nTHEN the exit status and diagnostic contract agree", async () => {
  // GIVEN
  const root = await fixture({
    "index.md": page("home", "[Missing](doc:missing)"),
  });
  let stdout = "";
  const output = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((value) => {
      stdout += String(value);
      return true;
    });
  const errors = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  // WHEN
  try {
    const code = await main(["validate", "--json"], root);
    // THEN
    const result = JSON.parse(stdout);
    const validator = new Ajv2020({ strict: false });
    (addFormats as unknown as (ajv: Ajv2020) => void)(validator);
    const contract = validator.compile(await schema("diagnostic"));
    for (const diagnostic of result.diagnostics)
      expect(contract(diagnostic), JSON.stringify(contract.errors)).toBe(true);

    expect(code).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "DBR100",
        severity: "error",
        sourceId: "docs",
        file: "index.md",
        range: expect.objectContaining({
          start: expect.objectContaining({ line: 5 }),
        }),
      }),
    );
    expect(errors).not.toHaveBeenCalled();
  } finally {
    output.mockRestore();
    errors.mockRestore();
  }
});

it("GIVEN directory and file-style slugs\nWHEN trailingSlash is ignore\nTHEN their authored slash style survives final URL generation", async () => {
  // GIVEN
  const root = await fixture({
    "folder/index.md": page("directory"),
    "page.md": page("file"),
    "explicit.md": page("explicit", "Text", "slug: custom/\n"),
  });
  const config = path.join(root, "doc-base.yaml");
  await writeFile(
    config,
    (await readFile(config, "utf8")).replace(
      "title: Test",
      "title: Test, trailingSlash: ignore",
    ),
  );
  // WHEN
  const result = await compile(root);
  // THEN
  expect(
    Object.fromEntries(
      result.documents.map((document) => [document.id, document.url]),
    ),
  ).toEqual({ directory: "/folder/", file: "/page", explicit: "/custom/" });
});

it("validates the complete specification example against the shipped configuration contract", async () => {
  const root = await fixture({ "index.md": page("home") });
  await writeFile(
    path.join(root, "doc-base.yaml"),
    await readFile(
      new URL("./fixtures/complete-config.yaml", import.meta.url),
      "utf8",
    ),
  );
  const result = await loadConfig(root, {}, {});
  expect(result.config.site.baseUrl).toBe("/docs/");
  expect(Object.keys(result.config.sources)).toEqual(["portal", "api"]);
});
it("GIVEN a nonexistent explicit autogenerated directory\nWHEN creating navigation\nTHEN it fails instead of silently discarding the selection", async () => {
  // GIVEN
  const root = await fixture({ "index.md": page("home") });
  const config = path.join(root, "doc-base.yaml");
  await writeFile(
    config,
    (await readFile(config, "utf8")).replace(
      "directory: .",
      "directory: missing",
    ),
  );
  // WHEN
  const result = await compile(root);
  // THEN
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: "DBN110" }),
  );
});

it("GIVEN literal MDX and HTML links to a restricted target\nWHEN compiling a public projection\nTHEN link labels remain visible without hidden target URLs", async () => {
  // GIVEN
  const root = await fixture(
    {
      "index.mdx": page("home", '<a href="doc:restricted">MDX label</a>'),
      "html.md": page("html", '<a href="doc:restricted">HTML label</a>'),
      "restricted.md": page(
        "restricted",
        "Restricted",
        "audiences: [contributor]\n",
      ),
    },
    "audiences: {public: {label: Public}, contributor: {label: Contributor}}\n",
  );
  const config = path.join(root, "doc-base.yaml");
  await writeFile(
    config,
    (await readFile(config, "utf8")).replace(
      "title: Test",
      "title: Test, defaultAudience: public",
    ),
  );
  // WHEN
  const result = await compile(root, { audience: "public", dev: true });
  // THEN
  const pages = result.projections[0].pages;
  expect(result.ok).toBe(true);
  expect(pages.find((page) => page.key === "docs::home")!.markdown).toContain(
    "MDX label",
  );
  expect(pages.find((page) => page.key === "docs::html")!.markdown).toContain(
    "HTML label",
  );
  for (const page of pages)
    expect(page.markdown).not.toContain('href="doc:restricted"');
  expect(
    result.diagnostics.some((diagnostic) => diagnostic.code === "DBA210"),
  ).toBe(true);
});
it("validates literal references in audience-hidden MDX documents", async () => {
  const root = await fixture(
    {
      "index.md": page("home"),
      "hidden.mdx": page(
        "hidden",
        '<a href="doc:missing">Missing</a>',
        "audiences: [contributor]\n",
      ),
    },
    "audiences: {public: {label: Public}, contributor: {label: Contributor}}\n",
  );
  const config = path.join(root, "doc-base.yaml");
  await writeFile(
    config,
    (await readFile(config, "utf8")).replace(
      "title: Test",
      "title: Test, defaultAudience: public",
    ),
  );
  const result = await compile(root, { audience: "public" });
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: "DBR100", documentKey: "docs::hidden" }),
  );
});
it("excludes embedded HTML body text when indexEmbeds is false", async () => {
  const root = await fixture(
    {
      "index.md": page("home", '::doc-embed{ref="target"}'),
      "target.md": page("target", "<p>Embedded HTML text</p>"),
    },
    "search: {indexEmbeds: false}\n",
  );
  const result = await compile(root);
  expect(
    result.projections[0].search.find((record) => record.key === "docs::home")!
      .bodyText,
  ).not.toContain("Embedded HTML text");
  expect(
    result.projections[0].search.find(
      (record) => record.key === "docs::target",
    )!.bodyText,
  ).toContain("Embedded HTML text");
});

it("validates statically referenced assets in audience-hidden content", async () => {
  const root = await fixture(
    {
      "index.md": page("home"),
      "hidden.md": page(
        "hidden",
        "![Missing](missing.svg)",
        "audiences: [contributor]\n",
      ),
    },
    "audiences: {public: {label: Public}, contributor: {label: Contributor}}\n",
  );
  const config = path.join(root, "doc-base.yaml");
  await writeFile(
    config,
    (await readFile(config, "utf8")).replace(
      "title: Test",
      "title: Test, defaultAudience: public",
    ),
  );
  const result = await compile(root, { audience: "public" });
  expect(result.ok).toBe(false);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: "DBU140", documentKey: "docs::hidden" }),
  );
});

it("retains document-scoped suppression for a diagnosed content parsing failure", async () => {
  const root = await fixture({
    "index.md": page(
      "home",
      "::doc-embed{ref={target}}",
      "validation:\n  suppress:\n    - code: DBE110\n      reason: Unsupported directive retained for author review\n",
    ),
  });
  const result = await compile(root);
  expect(result.ok).toBe(true);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "DBE110",
      suppressedBy: {
        scope: "document",
        reason: "Unsupported directive retained for author review",
      },
    }),
  );
  expect(
    result.diagnostics.some((diagnostic) => diagnostic.code === "DBV903"),
  ).toBe(false);
});

it("GIVEN heading offset five\nWHEN demoting an embedded level two heading\nTHEN it clamps at level six and reports a warning", async () => {
  // GIVEN
  const root = await fixture({
    "index.md": page("home", '::doc-embed{ref="target" headingOffset="5"}'),
    "target.md": page("target", "## Shared"),
  });
  // WHEN
  const result = await compile(root);
  // THEN
  expect(result.ok).toBe(true);
  expect(
    result.projections[0].pages.find((page) => page.key === "docs::home")!
      .headings[0].level,
  ).toBe(6);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: "DBE230", severity: "warning" }),
  );
});
it.each([-1, 6])(
  "rejects headingOffset %s outside the documented zero-to-five range",
  async (offset) => {
    const root = await fixture({
      "index.md": page(
        "home",
        `::doc-embed{ref="target" headingOffset="${offset}"}`,
      ),
      "target.md": page("target", "## Shared"),
    });
    const result = await compile(root);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "DBE110" }),
    );
  },
);
