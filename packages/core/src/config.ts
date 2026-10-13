import { readFile, access, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { parseDocument, LineCounter } from "yaml";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  DocBaseError,
  diagnostic,
  freeze,
  type Config,
  type RunOptions,
  type Diagnostic,
  type NavigationItem,
} from "@doc-base/schema";
const require = createRequire(import.meta.url);
export const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  addUsedSchema: false,
});
(addFormats as unknown as (ajv: Ajv2020) => void)(ajv);
export async function schema(
  name: "doc-base" | "frontmatter" | "diagnostic" | "build-manifest",
): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(
      require.resolve(`@doc-base/schema/schemas/${name}.schema.json`),
      "utf8",
    ),
  ) as Record<string, unknown>;
}
export function parseYaml(text: string, file: string, lineOffset = 0): unknown {
  const parsed = parseDocument(text, {
    schema: "core",
    uniqueKeys: true,
    lineCounter: new LineCounter(),
  });
  if (parsed.errors.length || parsed.warnings.length)
    throw new DocBaseError(
      2,
      [...parsed.errors, ...parsed.warnings].map((error) =>
        diagnostic("DBC001", error.message, {
          file,
          range: error.linePos
            ? {
                start: {
                  line: error.linePos[0].line + lineOffset,
                  column: error.linePos[0].col,
                },
                end: {
                  line:
                    (error.linePos[1] ?? error.linePos[0]).line + lineOffset,
                  column: (error.linePos[1] ?? error.linePos[0]).col,
                },
              }
            : undefined,
        }),
      ),
    );
  return parsed.toJSON() as unknown;
}
export function yamlRange(
  text: string,
  pointer: string,
  lineOffset = 0,
): Diagnostic["range"] {
  const counter = new LineCounter();
  const document = parseDocument(text, { lineCounter: counter });
  const keys = pointer
    .split("/")
    .slice(1)
    .map((key) => key.replace(/~1/g, "/").replace(/~0/g, "~"));
  const node = document.getIn(keys, true) as
    { range?: [number, number, number] } | undefined;
  const start = counter.linePos(node?.range?.[0] ?? 0);
  const end = counter.linePos(node?.range?.[1] ?? 0);
  return {
    start: { line: start.line + lineOffset, column: start.col },
    end: { line: end.line + lineOffset, column: end.col },
  };
}
async function readYamlText(file: string): Promise<string> {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      await readFile(file),
    );
  } catch {
    throw new DocBaseError(2, [
      diagnostic("DBC001", `Configuration must be readable UTF-8: ${file}`, {
        file,
      }),
    ]);
  }
}
async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
export async function discoverConfig(
  cwd: string,
  explicit?: string,
): Promise<string> {
  if (explicit) return path.resolve(cwd, explicit);
  let directory = path.resolve(cwd);
  while (true) {
    const file = path.join(directory, "doc-base.yaml");
    if (await exists(file)) return file;
    if (
      (await exists(path.join(directory, ".git"))) ||
      path.dirname(directory) === directory
    )
      break;
    directory = path.dirname(directory);
  }
  throw new DocBaseError(2, [
    diagnostic("DBC001", "Cannot find doc-base.yaml"),
  ]);
}
function merge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(overlay)) {
    if (value && typeof value === "object" && !Array.isArray(value))
      base[key] = merge(
        (base[key] ?? {}) as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    else base[key] = value;
  }
  return base;
}
export function environmentOptions(
  env: Readonly<Record<string, string | undefined>>,
): RunOptions {
  const result: RunOptions = {};
  const mapping = {
    DOC_BASE_CONFIG: "config",
    DOC_BASE_LOCAL_CONFIG: "localConfig",
    DOC_BASE_AUDIENCE: "audience",
    DOC_BASE_LOG_LEVEL: "logLevel",
  } as const;
  for (const [key, value] of Object.entries(env))
    if (
      [
        ...Object.keys(mapping),
        "DOC_BASE_CACHE_DIR",
        "DOC_BASE_OFFLINE",
        "DOC_BASE_FROZEN_LOCKFILE",
      ].includes(key) &&
      value === ""
    )
      throw new DocBaseError(2, [
        diagnostic("DBC010", `${key} must not be empty`),
      ]);
  for (const [key, field] of Object.entries(mapping))
    if (env[key] !== undefined) result[field] = env[key];
  for (const [key, field] of [
    ["DOC_BASE_OFFLINE", "offline"],
    ["DOC_BASE_FROZEN_LOCKFILE", "frozenLockfile"],
  ] as const)
    if (env[key] !== undefined) {
      if (!["1", "true", "0", "false"].includes(env[key]!))
        throw new DocBaseError(2, [
          diagnostic("DBC010", `Invalid boolean ${key}`),
        ]);
      result[field] = ["1", "true"].includes(env[key]!);
    }
  result.noColor = env.NO_COLOR !== undefined;
  return result;
}
export async function loadConfig(
  cwd: string,
  flags: RunOptions = {},
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<{
  config: Readonly<Config>;
  projectDir: string;
  configPath: string;
  options: RunOptions;
}> {
  const options = { ...environmentOptions(env), ...flags };
  options.sourceOverrides = { ...flags.sourceOverrides };
  if (options.offline && options.refresh)
    throw new DocBaseError(2, [
      diagnostic("DBC010", "--offline cannot be combined with --refresh"),
    ]);
  if (options.noLocalConfig && options.localConfig)
    throw new DocBaseError(2, [
      diagnostic(
        "DBC010",
        "--local-config cannot be combined with --no-local-config",
      ),
    ]);
  if (
    options.logLevel &&
    !["silent", "error", "warn", "info", "debug"].includes(options.logLevel)
  )
    throw new DocBaseError(2, [diagnostic("DBC010", "Invalid log level")]);
  const discovered = await discoverConfig(cwd, options.config);
  let configPath: string;
  try {
    configPath = await realpath(discovered);
  } catch {
    throw new DocBaseError(2, [
      diagnostic("DBC001", `Cannot read configuration: ${discovered}`),
    ]);
  }
  const projectDir = path.dirname(configPath);
  let raw: Record<string, unknown>;
  let configText: string;
  try {
    configText = await readYamlText(configPath);
    raw = parseYaml(configText, configPath) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof DocBaseError) throw error;
    throw new DocBaseError(2, [
      diagnostic("DBC001", `Cannot read configuration: ${configPath}`),
    ]);
  }
  const validator = ajv.compile(await schema("doc-base"));
  if (!validator(raw))
    throw new DocBaseError(
      2,
      (validator.errors ?? []).map((error) =>
        diagnostic("DBC002", `${error.instancePath || "/"} ${error.message}`, {
          file: configPath,
          range: yamlRange(configText, error.instancePath),
        }),
      ),
    );
  const localFile = options.localConfig
    ? path.resolve(cwd, options.localConfig)
    : path.join(projectDir, ".doc-base/local.yaml");
  if (
    !options.noLocalConfig &&
    (options.localConfig || (await exists(localFile)))
  ) {
    const overlay = parseYaml(await readYamlText(localFile), localFile);
    const check = (node: unknown, keys: string[] = []): void => {
      if (!node || typeof node !== "object" || Array.isArray(node))
        throw new DocBaseError(2, [
          diagnostic("DBC012", `Invalid local overlay ${keys.join(".")}`, {
            file: localFile,
          }),
        ]);
      for (const [key, value] of Object.entries(node)) {
        const next = [...keys, key];
        const field = next.join(".");
        if (
          /^(sources\.[a-z][a-z0-9-]*\.(path|ref)|site\.outputDir|cache\.directory|development\.(open|host|port))$/.test(
            field,
          )
        )
          continue;
        if (
          (next.length === 1 &&
            ["sources", "site", "cache", "development"].includes(key)) ||
          (next.length === 2 && next[0] === "sources")
        )
          check(value, next);
        else
          throw new DocBaseError(2, [
            diagnostic("DBC012", `Local overlay cannot set ${field}`, {
              file: localFile,
            }),
          ]);
      }
    };
    check(overlay);
    const overlaySources =
      (overlay as { sources?: Record<string, { ref?: string; path?: string }> })
        .sources ?? {};
    for (const [id, override] of Object.entries(overlaySources))
      options.sourceOverrides[id] = { ...override };
    raw = merge(raw, overlay as Record<string, unknown>);
    const sourceMap = raw.sources as Record<string, Record<string, unknown>>;
    for (const source of Object.values(sourceMap))
      if (source.type === "git" && source.path) {
        source.type = "local";
        delete source.repository;
        delete source.ref;
      }
  }
  const sourceMap = raw.sources as Record<string, Record<string, unknown>>;
  for (const [values, field] of [
    [options.sourceRef, "ref"],
    [options.sourcePath, "path"],
  ] as const) {
    const seen = new Set<string>();
    for (const value of values ?? []) {
      const split = value.indexOf("=");
      const id = value.slice(0, split);
      const setting = value.slice(split + 1);
      if (split < 1 || !setting || !sourceMap[id] || seen.has(id))
        throw new DocBaseError(2, [
          diagnostic("DBC010", `Invalid or duplicate source override: ${id}`),
        ]);
      seen.add(id);
      options.sourceOverrides[id] = {
        ...options.sourceOverrides[id],
        [field]: field === "path" ? path.resolve(cwd, setting) : setting,
      };
      const source = sourceMap[id];
      if (field === "ref" && source.type !== "git")
        throw new DocBaseError(2, [
          diagnostic("DBC010", `Source ${id} is not Git-backed`),
        ]);
      if (field === "path") {
        try {
          if (!(await stat(path.resolve(cwd, setting))).isDirectory())
            throw new Error("Not a directory");
        } catch {
          throw new DocBaseError(2, [
            diagnostic(
              "DBC010",
              `Source override path is not an available directory: ${id}`,
            ),
          ]);
        }

        source.type = "local";
        source.path = path.resolve(cwd, setting);
        delete source.repository;
        delete source.ref;
      } else source.ref = setting;
    }
  }
  if (env.DOC_BASE_CACHE_DIR)
    raw.cache = merge((raw.cache ?? {}) as Record<string, unknown>, {
      directory: path.resolve(cwd, env.DOC_BASE_CACHE_DIR),
    });
  if (!validator(raw))
    throw new DocBaseError(
      2,
      (validator.errors ?? []).map((error) =>
        diagnostic("DBC002", `${error.instancePath} ${error.message}`, {
          file: configPath,
          range: yamlRange(configText, error.instancePath),
        }),
      ),
    );
  const config = merge(
    {
      site: { baseUrl: "/", outputDir: "dist", trailingSlash: "always" },
      audiences: {},
      relationships: {},
      search: {
        enabled: true,
        indexBody: true,
        indexEmbeds: true,
        maxHeadingDepth: 4,
      },
      validation: {
        failOn: "error",
        strictRefs: true,
        strictNavigation: true,
        suppressions: [],
      },
      embeds: { maxDepth: 10, duplicateHeadingIds: "prefix" },
      cache: { directory: ".doc-base/cache", maxAge: "24h" },
      extensions: [],
      development: { host: "127.0.0.1", port: 4321, open: false },
    },
    raw,
  ) as unknown as Config;
  for (const [id, source] of Object.entries(config.sources))
    config.sources[id] = {
      ...source,
      content: source.content ?? ".",
      include: source.include ?? ["**/*.md", "**/*.mdx"],
      exclude: source.exclude ?? [],
      routePrefix: source.routePrefix ?? "",
    };
  const errors: Array<{ message: string; pointer: string }> = [];
  if (
    Object.keys(config.audiences).length
      ? !config.site.defaultAudience ||
        !config.audiences[config.site.defaultAudience]
      : config.site.defaultAudience !== undefined
  )
    errors.push({
      message: "site.defaultAudience must name a configured audience",
      pointer: "/site/defaultAudience",
    });
  if (options.audience && !config.audiences[options.audience])
    errors.push({
      message: `Unknown audience ${options.audience}`,
      pointer: "/audiences",
    });
  for (const source of Object.values(config.sources))
    if (
      source.routePrefix
        .split("/")
        .some((part) => part === "." || part === "..")
    )
      errors.push({
        message: "routePrefix cannot contain dot segments",
        pointer: "/sources",
      });
  for (const [id, relationship] of Object.entries(config.relationships))
    if (relationship.inverse && !config.relationships[relationship.inverse])
      errors.push({
        message: `Unknown inverse ${relationship.inverse} for ${id}`,
        pointer: `/relationships/${id}/inverse`,
      });
  const inspectNavigation = (
    items: NavigationItem[],
    pointer: string,
  ): void => {
    for (const [index, item] of items.entries()) {
      const location = pointer + "/" + index;
      if (item.audiences?.some((id) => !config.audiences[id]))
        errors.push({
          message: "Unknown navigation audience",
          pointer: location + "/audiences",
        });
      if ("group" in item) inspectNavigation(item.items, location + "/items");
      if (
        "autogenerate" in item &&
        (!config.sources[item.autogenerate.source] ||
          item.autogenerate.directory.split(/[\\/]/).includes("..") ||
          item.autogenerate.directory.startsWith("/"))
      )
        errors.push({
          message: "Invalid autogenerated navigation source or directory",
          pointer: location + "/autogenerate",
        });
    }
  };
  if (config.navigation) inspectNavigation(config.navigation, "/navigation");
  if (errors.length)
    throw new DocBaseError(
      2,
      errors.map(({ message, pointer }) =>
        diagnostic("DBC003", message, {
          file: configPath,
          range: yamlRange(configText, pointer),
        }),
      ),
    );
  return { config: freeze(config), projectDir, configPath, options };
}
