import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { runPnpm } from "./pnpm.mjs";
const artifacts = path.resolve(".artifacts");
const packages = {};
for (const file of await readdir(artifacts))
  if (file.endsWith(".tgz")) {
    if (file.startsWith("doc-base-schema-"))
      packages["@doc-base/schema"] = "file:" + path.join(artifacts, file);
    else if (file.startsWith("doc-base-extension-api-"))
      packages["@doc-base/extension-api"] =
        "file:" + path.join(artifacts, file);
    else if (file.startsWith("doc-base-sources-"))
      packages["@doc-base/sources"] = "file:" + path.join(artifacts, file);
    else if (file.startsWith("doc-base-core-"))
      packages["@doc-base/core"] = "file:" + path.join(artifacts, file);
    else if (file.startsWith("doc-base-starlight-"))
      packages["@doc-base/starlight"] = "file:" + path.join(artifacts, file);
    else if (/^doc-base-\d/.test(file))
      packages["doc-base"] = "file:" + path.join(artifacts, file);
  }
if (Object.keys(packages).length !== 6)
  throw new Error("Run the package test first to create tarballs.");
const yarn = fileURLToPath(
  import.meta.resolve("@yarnpkg/cli-dist/bin/yarn.js"),
);
for (const mode of ["pnpm", "yarn-node-modules"]) {
  const directory = await mkdtemp(path.join(tmpdir(), "doc-base-manager-"));
  try {
    const config = {
      name: "manager-consumer",
      private: true,
      type: "module",
      dependencies: packages,
      ...(mode === "pnpm" ? {} : { resolutions: packages }),
    };
    await writeFile(
      path.join(directory, "package.json"),
      JSON.stringify(config, null, 2) + "\n",
    );
    if (mode === "pnpm")
      await writeFile(
        path.join(directory, "pnpm-workspace.yaml"),
        "overrides:\n" +
          Object.entries(packages)
            .map(
              ([name, value]) =>
                `  ${JSON.stringify(name)}: ${JSON.stringify(value)}`,
            )
            .join("\n") +
          "\nallowBuilds:\n  esbuild: true\n  sharp: true\n",
      );
    if (mode.startsWith("yarn"))
      await writeFile(
        path.join(directory, ".yarnrc.yml"),
        `nodeLinker: ${mode === "yarn-pnp" ? "pnp" : "node-modules"}\nenableGlobalCache: false\n`,
      );
    const run = (args) => {
      const options = {
        cwd: directory,
        stdio: "inherit",
        env: {
          ...process.env,
          ASTRO_TELEMETRY_DISABLED: "1",
          YARN_ENABLE_IMMUTABLE_INSTALLS: "false",
        },
      };
      return mode === "pnpm"
        ? runPnpm(args, options)
        : execFileSync(process.execPath, [yarn, ...args], options);
    };
    run(["install"]);
    const execute =
      mode === "pnpm" ? ["exec", "doc-base"] : ["exec", "doc-base"];
    run([...execute, "init", "site"]);
    run([...execute, "validate", "--config", "site/doc-base.yaml"]);
    run([...execute, "build", "--config", "site/doc-base.yaml"]);
    const manifest = JSON.parse(
      await readFile(
        path.join(directory, "site/dist/_doc-base/build-manifest.json"),
        "utf8",
      ),
    );
    if (!manifest.outputFingerprint) throw new Error("Build manifest missing");
    console.log(`Verified ${mode} consumer.`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
