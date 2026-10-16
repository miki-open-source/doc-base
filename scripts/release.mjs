import {
  readFile,
  mkdtemp,
  rm,
  writeFile,
  mkdir,
  readdir,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { runPnpm } from "./pnpm.mjs";
const directories = [
  "schema",
  "extension-api",
  "sources",
  "core",
  "starlight",
  "cli",
];
const root = JSON.parse(await readFile("package.json", "utf8"));
const tag = process.env.RELEASE_TAG;
if (tag !== `v${root.version}`)
  throw new Error("Release tag must match the coordinated package version");
const taggedCommit = execFileSync(
  "git",
  ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`],
  { encoding: "utf8" },
).trim();
assert.equal(
  taggedCommit,
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  "The checkout must match the release tag",
);
const changelog = await readFile("CHANGELOG.md", "utf8");
if (!changelog.includes(`## ${root.version}`))
  throw new Error("A reviewed changelog entry is required");
const artifacts = await readdir(".artifacts");
const packages = [];
for (const directory of directories) {
  const pkg = JSON.parse(
    await readFile(`packages/${directory}/package.json`, "utf8"),
  );
  if (pkg.version !== root.version) throw new Error("Package version mismatch");
  const tarball =
    pkg.name.replace("@", "").replace("/", "-") + "-" + pkg.version + ".tgz";
  if (!artifacts.includes(tarball))
    throw new Error("Missing inspected release tarball: " + tarball);
  packages.push({
    name: pkg.name,
    tarball: path.resolve(".artifacts", tarball),
  });
}
const report = {
  version: root.version,
  tag,
  published: [],
  failed: null,
  registryVerified: false,
};
await mkdir(".artifacts", { recursive: true });
const save = () =>
  writeFile(
    ".artifacts/release-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
await save();
for (const pkg of packages) {
  try {
    runPnpm(
      [
        "publish",
        pkg.tarball,
        "--access",
        "public",
        "--provenance",
        "--no-git-checks",
      ],
      { stdio: "inherit" },
    );
    report.published.push(pkg.name);
    await save();
  } catch (error) {
    report.failed = pkg.name;
    await save();
    console.error(
      "Publishing stopped. Review the release report and repair any partial publish with a new coordinated version. Published versions must never be overwritten.",
    );
    throw error;
  }
}
const consumer = await mkdtemp(path.join(tmpdir(), "doc-base-release-"));
try {
  await writeFile(path.join(consumer, "package.json"), "{}");
  await writeFile(
    path.join(consumer, "pnpm-workspace.yaml"),
    "allowBuilds:\n  esbuild: true\n  sharp: true\n",
  );
  runPnpm(["add", `doc-base@${root.version}`], {
    cwd: consumer,
    stdio: "inherit",
  });
  const cli = path.join(consumer, "node_modules/doc-base/dist/index.js");
  assert.equal(
    execFileSync(process.execPath, [cli, "--version"], {
      encoding: "utf8",
    }).trim(),
    root.version,
  );
  execFileSync(process.execPath, [cli, "init", "site"], {
    cwd: consumer,
    stdio: "inherit",
  });
  execFileSync(
    process.execPath,
    [cli, "build", "--config", "site/doc-base.yaml"],
    { cwd: consumer, stdio: "inherit" },
  );
  report.registryVerified = true;
  await save();
} finally {
  await rm(consumer, { recursive: true, force: true });
}
