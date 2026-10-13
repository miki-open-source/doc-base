#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { realpathSync, constants } from "node:fs";
import { mkdir, writeFile, rm, access } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { watch } from "chokidar";
import open from "open";
import {
  compile,
  loadConfig,
  counts,
  schema,
  inspectExtensions,
} from "@doc-base/core";
import {
  resolveSources,
  redact,
  within,
  inspectSources,
} from "@doc-base/sources";
import { buildSite, devSite, checkCompatibility } from "@doc-base/starlight";
import {
  DocBaseError,
  diagnostic,
  stableJson,
  VERSION,
  type RunOptions,
  type Diagnostic,
} from "@doc-base/schema";
export { compile, loadConfig } from "@doc-base/core";
export { buildSite, generate } from "@doc-base/starlight";
export type {
  Config,
  DocumentRecord,
  Diagnostic,
  Compilation,
} from "@doc-base/schema";
const commands = [
  "init",
  "dev",
  "validate",
  "build",
  "fetch",
  "clean",
  "doctor",
  "schema",
];
const common = [
  "config",
  "local-config",
  "no-local-config",
  "log-level",
  "no-color",
];
const source = ["source-ref", "offline", "refresh", "frozen-lockfile"];
const commandFlags: Record<string, string[]> = {
  init: ["force"],
  dev: [...source, "source-path", "audience", "exclude-drafts"],
  validate: [
    ...source,
    "source-path",
    "audience",
    "strict",
    "exclude-drafts",
    "json",
  ],
  build: [...source, "source-path", "audience", "strict"],
  fetch: source,
  clean: ["cache", "generated", "output"],
  doctor: ["json"],
  schema: [],
};
const takesValue = new Set([
  "config",
  "local-config",
  "source-ref",
  "source-path",
  "audience",
  "log-level",
]);
interface Arguments {
  command: string;
  positional: string[];
  options: RunOptions;
  switches: Set<string>;
}
export function parseArguments(argv: string[]): Arguments {
  const command = argv[0] ?? "--help";
  const options: Record<string, unknown> = {};
  const positional: string[] = [];
  const switches = new Set<string>();
  if (["--help", "--version"].includes(command)) {
    if (argv.length > 1)
      throw new DocBaseError(2, [
        diagnostic("DBC010", "Unexpected argument after " + command),
      ]);
    return { command, options, positional, switches };
  }
  if (!commands.includes(command))
    throw new DocBaseError(2, [
      diagnostic("DBC010", `Unknown command ${command}`),
    ]);
  for (let index = 1; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--help")
      return { command: "--help", options: {}, positional: [], switches };
    if (!argument.startsWith("-")) {
      positional.push(argument);
      continue;
    }
    const [name, inline] = argument.slice(2).split(/=(.*)/s);
    if (
      !argument.startsWith("--") ||
      ![
        ...(command === "init" || command === "schema"
          ? ["log-level", "no-color"]
          : common),
        ...commandFlags[command],
      ].includes(name)
    )
      throw new DocBaseError(2, [
        diagnostic(
          "DBC010",
          `Unknown or unsupported flag ${argument} for ${command}`,
        ),
      ]);
    const field = name.replace(/-([a-z])/g, (_, letter: string) =>
      letter.toUpperCase(),
    );
    if (takesValue.has(name)) {
      const value = inline ?? argv[++index];
      if (!value || value.startsWith("--"))
        throw new DocBaseError(2, [
          diagnostic("DBC010", `Missing value for --${name}`),
        ]);
      if (name === "source-ref" || name === "source-path")
        options[field] = [
          ...((options[field] as string[] | undefined) ?? []),
          value,
        ];
      else {
        if (switches.has(name))
          throw new DocBaseError(2, [
            diagnostic("DBC010", `Duplicate --${name}`),
          ]);
        options[field] = value;
      }
    } else {
      if (inline !== undefined)
        throw new DocBaseError(2, [
          diagnostic("DBC010", `--${name} takes no value`),
        ]);
      options[field] = true;
    }
    switches.add(name);
  }
  if (positional.length > (["init", "schema"].includes(command) ? 1 : 0))
    throw new DocBaseError(2, [
      diagnostic("DBC010", "Unexpected positional argument"),
    ]);
  if (
    (options.offline && options.refresh) ||
    (options.localConfig && options.noLocalConfig)
  )
    throw new DocBaseError(2, [diagnostic("DBC010", "Conflicting flags")]);
  if (
    options.logLevel &&
    !["silent", "error", "warn", "info", "debug"].includes(
      String(options.logLevel),
    )
  )
    throw new DocBaseError(2, [diagnostic("DBC010", "Invalid log level")]);
  return { command, options: options as RunOptions, positional, switches };
}
const help = `doc-base ${VERSION}\n\nCommands: ${commands.join(", ")}\n\ninit [directory] [--force]\nschema [config|frontmatter]\nclean [--cache] [--generated] [--output]\n\nCommon: --config <file> --local-config <file> --no-local-config\n        --log-level <silent|error|warn|info|debug> --no-color\nSources: --source-ref <id>=<ref> --source-path <id>=<directory>\n         --offline --refresh --frozen-lockfile\nProjections: --audience <id> --exclude-drafts\nValidation: --strict --json (validate/doctor)\n\nUse --help with any command. Source paths are accepted by dev/validate/build;\nsource refs by fetch/dev/validate/build. --strict applies to validate/build.\n--exclude-drafts applies to dev/validate.\n`;
async function initialize(directory: string, force: boolean): Promise<void> {
  const files: Record<string, string> = {
    "doc-base.yaml":
      "# yaml-language-server: $schema=https://doc-base.dev/schemas/v1/doc-base.schema.json\nschemaVersion: 1\nsite:\n  title: Example Documentation\nsources:\n  docs:\n    type: local\n    path: ./docs\nnavigation:\n  - autogenerate:\n      source: docs\n      directory: .\n",
    "docs/index.md":
      "---\nid: welcome\ntitle: Welcome\n---\n\nYour documentation starts here.\n",
    ".gitignore":
      "node_modules/\ndist/\n.astro/\n.doc-base/local.yaml\n.doc-base/cache/\n.doc-base/generated*/\n",
    "package.json": stableJson({
      name: "example-documentation",
      private: true,
      type: "module",
      scripts: {
        dev: "doc-base dev",
        validate: "doc-base validate",
        build: "doc-base build",
      },
      dependencies: { "doc-base": `^${VERSION}` },
    }),
  };
  const collisions: string[] = [];
  for (const file of Object.keys(files))
    try {
      await access(path.join(directory, file));
      collisions.push(file);
    } catch {
      /* Missing file is safe to create. */
    }
  if (collisions.length) {
    if (!force || !process.stdin.isTTY)
      throw new DocBaseError(2, [
        diagnostic(
          "DBC010",
          `Initialization would overwrite: ${collisions.join(", ")}; requires --force and interactive confirmation`,
        ),
      ]);
    const prompt = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    const answer = await prompt.question(
      `Overwrite ${collisions.join(", ")}? Type yes: `,
    );
    prompt.close();
    if (answer !== "yes")
      throw new DocBaseError(2, [
        diagnostic("DBC010", "Initialization cancelled"),
      ]);
  }
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await writeFile(path.join(directory, file), content);
  }
}
function printDiagnostics(items: Diagnostic[]): void {
  for (const item of items)
    process.stderr.write(
      `${item.file ? `${item.file}${item.range ? ":" + item.range.start.line : ""}: ` : ""}${item.severity} ${item.code}: ${redact(item.message)}${item.suppressedBy ? " (suppressed)" : ""}\n`,
    );
}
export async function main(
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  signal?: AbortSignal,
): Promise<number> {
  const json = argv.includes("--json");
  try {
    const args = parseArguments(argv);
    const { command, options } = args;
    options.signal = signal;
    if (command === "--help") {
      process.stdout.write(help);
      return 0;
    }
    if (command === "--version") {
      process.stdout.write(VERSION + "\n");
      return 0;
    }
    if (command === "schema") {
      const name = args.positional[0] ?? "config";
      if (!["config", "frontmatter"].includes(name))
        throw new DocBaseError(2, [
          diagnostic("DBC010", "Schema must be config or frontmatter"),
        ]);
      process.stdout.write(
        stableJson(
          await schema(name === "config" ? "doc-base" : "frontmatter"),
        ),
      );
      return 0;
    }
    if (command === "init") {
      await initialize(
        path.resolve(cwd, args.positional[0] ?? "."),
        args.switches.has("force"),
      );
      return 0;
    }
    if (command === "fetch") {
      const loaded = await loadConfig(cwd, options);
      await resolveSources(loaded.config, loaded.projectDir, loaded.options);
      return 0;
    }
    if (command === "clean") {
      const loaded = await loadConfig(cwd, options);
      const selected = ["cache", "generated", "output"].filter((flag) =>
        args.switches.has(flag),
      );
      if (!selected.length) selected.push("generated");
      const targets = selected.map((flag) =>
        path.resolve(
          loaded.projectDir,
          flag === "cache"
            ? loaded.config.cache.directory
            : flag === "output"
              ? loaded.config.site.outputDir
              : ".doc-base/generated",
        ),
      );
      for (const target of targets)
        if (
          !within(loaded.projectDir, target) ||
          target === loaded.projectDir ||
          Object.values(loaded.config.sources).some(
            (source) =>
              source.path &&
              within(target, path.resolve(loaded.projectDir, source.path)),
          )
        )
          throw new DocBaseError(2, [
            diagnostic("DBU130", `Unsafe clean target ${target}`),
          ]);
      for (const target of targets) {
        if (process.stderr.isTTY) process.stderr.write(`Removing ${target}\n`);
        await rm(target, { recursive: true, force: true });
      }
      return 0;
    }
    if (command === "doctor") {
      const loaded = await loadConfig(cwd, options);
      const [major, minor] = process.versions.node.split(".").map(Number);
      if (major < 22 || (major === 22 && minor < 12))
        throw new DocBaseError(2, [
          diagnostic("DBC003", "Node.js 22.12 or later is required"),
        ]);
      const extensions = await inspectExtensions(
        loaded.config,
        loaded.projectDir,
      );
      const sourceReadiness = await inspectSources(
        loaded.config,
        loaded.projectDir,
        signal,
      );
      const packages = await checkCompatibility();
      const cache = path.resolve(
        loaded.projectDir,
        loaded.config.cache.directory,
      );
      await mkdir(cache, { recursive: true });
      await access(cache, constants.W_OK);
      const result = {
        schemaVersion: 1,
        ok: true,
        node: process.version,
        ...sourceReadiness,
        packages,
        extensions,
        config: loaded.configPath,
        cacheWritable: true,
      };
      if (json) process.stdout.write(stableJson(result));
      else process.stderr.write(stableJson(result));
      return 0;
    }
    const compilation = await compile(cwd, {
      ...options,
      dev: command === "dev",
    });
    if (compilation.options.logLevel === "debug")
      process.stderr.write(
        stableJson({
          effectiveConfiguration: JSON.parse(
            stableJson(compilation.config),
            (key, value: unknown) =>
              /password|token|secret|authorization|credential|private.?key/i.test(
                key,
              )
                ? "[redacted]"
                : typeof value === "string"
                  ? redact(value)
                  : value,
          ),
          overrides: compilation.options,
        }),
      );
    if (json)
      process.stdout.write(
        stableJson({
          schemaVersion: 1,
          ok: compilation.ok,
          counts: counts(compilation.diagnostics),
          diagnostics: compilation.diagnostics,
          sources: compilation.sources.map(({ id, type, revision }) => ({
            id,
            type,
            revision,
          })),
          audiences: compilation.manifest.selectedAudiences,
        }),
      );
    else printDiagnostics(compilation.diagnostics);
    if (!compilation.ok) return 1;
    if (command === "build") {
      const output = await buildSite(compilation);
      if (options.logLevel !== "silent")
        process.stderr.write(`Built ${output}\n`);
    }
    if (command === "dev") {
      let server = await devSite(compilation);
      let rebuilding = false;
      let pending = false;
      const watcher = watch(
        [
          compilation.configPath,
          path.join(compilation.projectDir, ".doc-base/local.yaml"),
          path.join(compilation.projectDir, "src"),
          path.join(compilation.projectDir, "public"),
          ...[
            "astro.config.mjs",
            "astro.config.js",
            "astro.config.ts",
            "starlight.config.mjs",
          ].map((file) => path.join(compilation.projectDir, file)),
          ...compilation.sources
            .filter((source) => source.type === "local")
            .map((source) => source.root),
        ],
        {
          ignoreInitial: true,
          ignored: (file: string) => {
            const relative = path
              .relative(compilation.projectDir, file)
              .split(path.sep)
              .join("/");
            return (
              /(^|\/)\.git(\/|$)/.test(relative) ||
              relative === "node_modules" ||
              relative.startsWith("node_modules/") ||
              relative === "dist" ||
              relative.startsWith("dist/") ||
              relative === ".astro" ||
              relative.startsWith(".astro/") ||
              (relative.startsWith(".doc-base/") &&
                relative !== ".doc-base/local.yaml")
            );
          },
        },
      );
      await new Promise<void>((resolve) => watcher.once("ready", resolve));
      process.stderr.write(
        `Serving documentation at http://${compilation.config.development.host}:${compilation.config.development.port}${compilation.config.site.baseUrl}\n`,
      );
      if (compilation.config.development.open)
        await open(
          `http://${compilation.config.development.host}:${compilation.config.development.port}${compilation.config.site.baseUrl}`,
        );
      watcher.on("all", () => {
        pending = true;
        void rebuild();
      });
      async function rebuild(): Promise<void> {
        if (rebuilding) return;
        rebuilding = true;
        try {
          while (pending) {
            pending = false;
            const next = await compile(cwd, {
              ...options,
              dev: true,
              refresh: false,
              frozenLockfile: true,
            });
            printDiagnostics(next.diagnostics);
            if (next.ok) {
              await server.stop();
              server = await devSite(next);
              watcher.add(
                next.sources
                  .filter((source) => source.type === "local")
                  .map((source) => source.root),
              );
              process.stderr.write("Rebuilt documentation.\n");
            } else {
              server.markStale(
                next.diagnostics
                  .filter(
                    (item) => item.severity === "error" && !item.suppressedBy,
                  )
                  .map((item) => `${item.code}: ${item.message}`)
                  .join("; ") || "Validation failed.",
              );
              process.stderr.write("Output is stale: validation failed.\n");
            }
          }
        } catch (error) {
          server.markStale(redact(String(error)));
          process.stderr.write(`Output is stale: ${redact(String(error))}\n`);
        } finally {
          rebuilding = false;
        }
      }
      await new Promise<void>((resolve) => {
        process.once("SIGINT", () => {
          void (async () => {
            await watcher.close();
            await server.stop();
            process.exitCode = 130;
            resolve();
          })();
        });
      });
      return 130;
    }
    return 0;
  } catch (error) {
    if (signal?.aborted) return 130;
    const failure =
      error instanceof DocBaseError
        ? error
        : new DocBaseError(5, [
            diagnostic(
              "DBV100",
              redact(error instanceof Error ? error.message : String(error)),
            ),
          ]);
    for (const item of failure.diagnostics) item.message = redact(item.message);
    if (json)
      process.stdout.write(
        stableJson({
          schemaVersion: 1,
          ok: false,
          counts: counts(failure.diagnostics),
          diagnostics: failure.diagnostics,
          sources: [],
          audiences: [],
        }),
      );
    else printDiagnostics(failure.diagnostics);
    return failure.exitCode;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  const controller = new AbortController();
  const interrupted = () => {
    controller.abort();
    setTimeout(() => process.exit(130), 5000).unref();
  };
  process.once("SIGINT", interrupted);
  try {
    process.exitCode = await main(
      process.argv.slice(2),
      process.cwd(),
      controller.signal,
    );
  } finally {
    process.removeListener("SIGINT", interrupted);
  }
}
