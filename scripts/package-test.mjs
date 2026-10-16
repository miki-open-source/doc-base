import { mkdir, mkdtemp, readFile, writeFile, cp, rm } from "node:fs/promises";
import { execFileSync, execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { runPnpm } from "./pnpm.mjs";
const root = process.cwd();
const artifacts = path.join(root, ".artifacts");
await mkdir(artifacts, { recursive: true });
const packages = [
  "schema",
  "extension-api",
  "sources",
  "core",
  "starlight",
  "cli",
];
const tarballs = [];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
for (const name of packages) {
  const output = JSON.parse(
    runPnpm(["pack", "--json", "--pack-destination", artifacts], {
      cwd: path.join(root, "packages", name),
      encoding: "utf8",
    }),
  );
  const files = output.files.map((file) => file.path);
  for (const required of [
    "LICENSE",
    "README.md",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/index.js.map",
    "dist/index.d.ts.map",
  ])
    if (!files.includes(required))
      throw new Error(`${name} missing ${required}`);
  if (name === "schema")
    for (const schema of [
      "doc-base",
      "frontmatter",
      "diagnostic",
      "build-manifest",
    ])
      assert.ok(
        files.includes(`schemas/${schema}.schema.json`),
        "Missing shipped schema",
      );
  if (files.some((file) => file.includes("node_modules")))
    throw new Error("Packed dependencies");
  tarballs.push(path.resolve(artifacts, output.filename));
}
const extensionPackage = JSON.parse(
  runPnpm(["pack", "--json", "--pack-destination", artifacts], {
    cwd: path.join(root, "examples/extension"),
    encoding: "utf8",
  }),
);
const extensionTarball = path.resolve(artifacts, extensionPackage.filename);
const consumer = await mkdtemp(path.join(tmpdir(), "doc-base-consumer-"));
try {
  await writeFile(
    path.join(consumer, "package.json"),
    ' {"name":"doc-base-consumer","private":true,"type":"module"}\n',
  );
  execFileSync(
    npm,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      ...tarballs,
      extensionTarball,
    ],
    { cwd: consumer, stdio: "inherit" },
  );
  const cli = path.join(consumer, "node_modules/doc-base/dist/index.js");
  assert.equal(
    execFileSync(npm, ["exec", "--", "doc-base", "--version"], {
      cwd: consumer,
      encoding: "utf8",
    }).trim(),
    "1.0.0",
  );
  await writeFile(
    path.join(consumer, "consumer.ts"),
    `import {VERSION,type Config} from '@doc-base/schema';
import {defineExtension,type ReadonlyDocumentV1} from '@doc-base/extension-api';
import {compile} from '@doc-base/core';
import {resolveSources} from '@doc-base/sources';
import {buildSite} from '@doc-base/starlight';
import {main} from 'doc-base';
const extension=defineExtension({apiVersion:'1',name:'Consumer',setup(){}});
function checkReadonly(document:ReadonlyDocumentV1){
// @ts-expect-error Extension provenance is immutable.
document.provenance.sourcePath='changed';
// @ts-expect-error Extensions have no AST.
document.ast;
}
const config:Pick<Config,'schemaVersion'>={schemaVersion:1};
if(!VERSION || !extension || !config || [compile,resolveSources,buildSite,main,checkReadonly].some(value=>typeof value!=='function'))throw Error('Missing public export');
`,
  );
  await writeFile(
    path.join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2023",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        types: [],
        skipLibCheck: false,
        outDir: "compiled",
      },
      include: ["consumer.ts"],
    }),
  );
  execFileSync(
    process.execPath,
    [path.join(root, "node_modules/typescript/bin/tsc"), "-p", consumer],
    { stdio: "inherit" },
  );
  execFileSync(
    process.execPath,
    [path.join(consumer, "compiled/consumer.js")],
    { stdio: "inherit" },
  );
  const initialized = path.join(consumer, "initialized");
  execFileSync(process.execPath, [cli, "init", initialized], {
    stdio: "inherit",
  });
  await writeFile(
    path.join(initialized, "docs/explicit.md"),
    "---\nid: explicit\ntitle: Explicit Index\nslug: guides/index\n---\nExplicit index route.\n",
  );
  execFileSync(
    process.execPath,
    [cli, "validate", "--config", path.join(initialized, "doc-base.yaml")],
    { stdio: "inherit" },
  );
  execFileSync(
    process.execPath,
    [cli, "build", "--config", path.join(initialized, "doc-base.yaml")],
    { stdio: "inherit" },
  );
  assert.match(
    await readFile(
      path.join(initialized, "dist/guides/index/index.html"),
      "utf8",
    ),
    /Explicit index route/,
  );
  await cp(
    path.join(root, "examples/knowledge-base"),
    path.join(consumer, "example"),
    {
      recursive: true,
      filter: (source) =>
        !source.includes(`${path.sep}.doc-base`) &&
        !source.includes(`${path.sep}dist`) &&
        !source.includes(`${path.sep}node_modules`),
    },
  );
  execFileSync(
    process.execPath,
    [cli, "build", "--config", path.join(consumer, "example/doc-base.yaml")],
    { stdio: "inherit" },
  );
  const manifest = JSON.parse(
    await readFile(
      path.join(consumer, "example/dist/_doc-base/build-manifest.json"),
      "utf8",
    ),
  );
  const { Ajv2020 } = await import(
    path.join(root, "node_modules/ajv/dist/2020.js")
  );
  const addFormats = (
    await import(path.join(root, "node_modules/ajv-formats/dist/index.js"))
  ).default;
  const validator = new Ajv2020({ strict: false });
  addFormats(validator);
  const contract = validator.compile(
    JSON.parse(
      await readFile(
        path.join(
          consumer,
          "node_modules/@doc-base/schema/schemas/build-manifest.schema.json",
        ),
        "utf8",
      ),
    ),
  );
  assert.ok(contract(manifest), JSON.stringify(contract.errors));
  if (!manifest.outputFingerprint)
    throw new Error("Missing output fingerprint");
  execFileSync(
    process.execPath,
    [cli, "build", "--config", path.join(consumer, "example/doc-base.yaml")],
    { stdio: "inherit" },
  );
  const repeated = JSON.parse(
    await readFile(
      path.join(consumer, "example/dist/_doc-base/build-manifest.json"),
      "utf8",
    ),
  );
  assert.equal(
    repeated.outputFingerprint,
    manifest.outputFingerprint,
    "Repeated builds must be deterministic",
  );
  const execute = promisify(execFile);
  await Promise.all([
    execute(process.execPath, [
      cli,
      "build",
      "--config",
      path.join(initialized, "doc-base.yaml"),
    ]),
    execute(process.execPath, [
      cli,
      "build",
      "--config",
      path.join(initialized, "doc-base.yaml"),
    ]),
  ]);
  const concurrent = JSON.parse(
    await readFile(
      path.join(initialized, "dist/_doc-base/build-manifest.json"),
      "utf8",
    ),
  );
  assert.equal(concurrent.schemaVersion, 1);

  await cp(
    path.join(consumer, "example/dist"),
    path.join(artifacts, "example"),
    { recursive: true },
  );
  await cp(path.join(root, "public"), path.join(consumer, "public"), {
    recursive: true,
  });
  await cp(path.join(root, "docs"), path.join(consumer, "docs"), {
    recursive: true,
  });
  await cp(
    path.join(root, "doc-base.yaml"),
    path.join(consumer, "doc-base.yaml"),
  );
  execFileSync(process.execPath, [cli, "build"], {
    cwd: consumer,
    stdio: "inherit",
  });
  assert.equal(
    await readFile(
      path.join(consumer, "dist/schemas/v1/doc-base.schema.json"),
      "utf8",
    ),
    await readFile(path.join(root, "schemas/doc-base.schema.json"), "utf8"),
  );
  console.log(
    `Verified ${tarballs.length} packed packages, initialization, example, and self documentation.`,
  );
} finally {
  await rm(consumer, { recursive: true, force: true });
}
