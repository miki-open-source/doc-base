import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readFile,
  readdir,
  realpath,
  stat,
  mkdir,
  writeFile,
  rename,
  rm,
  readlink,
  symlink,
  lstat,
} from "node:fs/promises";
import path from "node:path";
import picomatch from "picomatch";
import {
  DocBaseError,
  diagnostic,
  compare,
  foldCase,
  stableJson,
  type Config,
  type RunOptions,
  type SourceSnapshot,
} from "@doc-base/schema";
const execute = promisify(execFile);
const gitOptions = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.longpaths=true",
];
export const hash = (input: string | Uint8Array): string =>
  createHash("sha256").update(input).digest("hex");
export function redact(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/g, "$1[redacted]@")
    .replace(
      /([?&](?:token|access_token|auth|authorization|password|api[_-]?key|key|secret|credential)=)[^&\s]+/gi,
      "$1[redacted]",
    );
}
export function within(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(".." + path.sep) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}
function fail(code: string, message: string): never {
  throw new DocBaseError(3, [diagnostic(code, redact(message))]);
}
export async function atomicWrite(
  file: string,
  content: string | Uint8Array,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content);
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}
async function git(
  args: string[],
  cwd?: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const result = await execute("git", [...gitOptions, ...args], {
      cwd,
      signal,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_CONFIG_NOSYSTEM: "1",
      },
      maxBuffer: 16 * 1024 * 1024,
    });
    return result.stdout.trim();
  } catch (error) {
    fail(
      "DBS110",
      `Git operation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
export async function inspectSources(
  config: Readonly<Config>,
  projectDir: string,
  signal?: AbortSignal,
): Promise<{ gitVersion: string | null; credentialsReady: boolean | null }> {
  const gitSources = Object.values(config.sources).filter(
    (source) => source.type === "git",
  );
  if (!gitSources.length) return { gitVersion: null, credentialsReady: null };
  const gitVersion = await git(["--version"], undefined, signal);
  for (const source of gitSources) {
    const repository = source.repository!.startsWith(".")
      ? path.resolve(projectDir, source.repository!)
      : source.repository!;
    if (repository.startsWith("-"))
      fail("DBS110", "Git repository must not begin with a dash");
    await git(
      ["ls-remote", "--heads", "--tags", "--", repository],
      undefined,
      signal,
    );
  }
  return { gitVersion, credentialsReady: true };
}
interface LockEntry {
  type: "local" | "git";
  repository?: string;
  requestedRef?: string;
  resolvedCommit?: string;
}
interface Lock {
  schemaVersion: number;
  sources: Record<string, LockEntry>;
}
async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    fail("DBS120", `Cannot read ${file}`);
  }
}
export async function resolveSources(
  config: Readonly<Config>,
  projectDir: string,
  options: RunOptions = {},
): Promise<SourceSnapshot[]> {
  try {
    return await resolveSourceSnapshots(config, projectDir, options);
  } catch (error) {
    if (error instanceof DocBaseError || options.signal?.aborted) throw error;
    fail(
      "DBS100",
      `Cannot read sources: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
async function resolveSourceSnapshots(
  config: Readonly<Config>,
  projectDir: string,
  options: RunOptions,
): Promise<SourceSnapshot[]> {
  if (options.offline && options.refresh)
    throw new DocBaseError(2, [
      diagnostic("DBC010", "--offline and --refresh cannot be combined"),
    ]);
  options.signal?.throwIfAborted();
  const lockPath = path.join(projectDir, ".doc-base/sources.lock.json");
  const lock = await readJson<Lock>(lockPath);
  if (options.frozenLockfile && (!lock || lock.schemaVersion !== 1))
    fail("DBS120", "A valid source lockfile is required");
  if (
    lock &&
    (lock.schemaVersion !== 1 ||
      !lock.sources ||
      typeof lock.sources !== "object" ||
      Array.isArray(lock.sources))
  )
    fail("DBS120", "Malformed source lockfile");
  if (lock)
    for (const entry of Object.values(lock.sources))
      if (
        !entry ||
        typeof entry !== "object" ||
        !["local", "git"].includes(entry.type) ||
        (entry.type === "git" &&
          (typeof entry.repository !== "string" ||
            typeof entry.requestedRef !== "string" ||
            !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(
              entry.resolvedCommit ?? "",
            )))
      )
        fail("DBS120", "Malformed source lock entry");
  const next: Lock = { schemaVersion: 1, sources: {} };
  const snapshots: SourceSnapshot[] = [];
  for (const [id, source] of Object.entries(config.sources).sort(([a], [b]) =>
    compare(a, b),
  )) {
    options.signal?.throwIfAborted();
    let root: string;
    let revision: string;
    let gitFiles: SourceSnapshot["gitFiles"];
    if (source.type === "git") {
      const configuredRepository = source.repository!;
      const repository =
        !path.isAbsolute(configuredRepository) &&
        !/^[^/\\]+:/.test(configuredRepository)
          ? path.resolve(projectDir, configuredRepository)
          : configuredRepository;
      const requestedRef = source.ref!;
      if (repository.startsWith("-") || requestedRef.startsWith("-"))
        fail("DBS110", "Git repository and ref must not begin with a dash");
      const entry = lock?.sources[id];
      const matches =
        entry?.type === "git" &&
        entry.repository === redact(configuredRepository) &&
        entry.requestedRef === requestedRef &&
        /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(entry.resolvedCommit ?? "");
      if ((options.frozenLockfile || options.offline) && !matches)
        fail("DBS120", `Missing or mismatched lock entry for ${id}`);
      const cacheRoot = path.resolve(
        projectDir,
        config.cache.directory,
        "repositories",
        hash(repository),
      );
      let commit = matches ? entry!.resolvedCommit : undefined;
      const refFile = path.join(
        cacheRoot,
        "refs",
        hash(requestedRef) + ".json",
      );
      const cached = await readJson<{ commit: string; fetchedAt: number }>(
        refFile,
      );
      if (
        cached &&
        (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(cached.commit) ||
          !Number.isFinite(cached.fetchedAt))
      )
        fail("DBS120", `Invalid cached ref for ${id}`);
      const duration = /^(\d+)(ms|s|m|h|d)$/.exec(config.cache.maxAge)!;
      const age =
        Number(duration[1]) *
        { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[duration[2]]!;
      if (
        !options.frozenLockfile &&
        !options.offline &&
        !options.refresh &&
        cached &&
        (Date.now() - cached.fetchedAt < age ||
          /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(requestedRef))
      )
        commit = cached.commit;
      else if (!options.frozenLockfile && !options.offline) commit = undefined;
      let checkout = commit ? path.join(cacheRoot, "snapshots", commit) : "";
      if (
        !checkout ||
        !(
          await readJson<{
            complete: boolean;
            files?: Record<string, { oid: string; mode: string }>;
          }>(checkout + ".json")
        )?.complete
      ) {
        if (options.offline)
          fail("DBS120", `Offline checkout unavailable for ${id}`);
        const temporary = path.join(cacheRoot, `fetch-${randomUUID()}`);
        await mkdir(temporary, { recursive: true });
        try {
          await git(
            [
              "init",
              "--bare",
              `--object-format=${((commit ?? requestedRef).length === 64 && /^[a-f0-9]+$/.test(commit ?? requestedRef)) || /^[a-f0-9]{64}\t/m.test(await git(["ls-remote", "--", repository, "HEAD", requestedRef], undefined, options.signal)) ? "sha256" : "sha1"}`,
              "objects.git",
            ],
            temporary,
            options.signal,
          );
          const objectRoot = path.join(temporary, "objects.git");
          try {
            await git(
              [
                "fetch",
                "--no-tags",
                "--depth=1",
                "--",
                repository,
                commit ?? requestedRef,
              ],
              objectRoot,
              options.signal,
            );
            commit = await git(
              ["rev-parse", "FETCH_HEAD^{commit}"],
              objectRoot,
              options.signal,
            );
          } catch (error) {
            if (commit) throw error;
            // Commit expressions need the repository's history and ref names.
            await git(
              [
                "fetch",
                "--",
                repository,
                "+refs/heads/*:refs/heads/*",
                "+refs/tags/*:refs/tags/*",
              ],
              objectRoot,
              options.signal,
            );
            const symbolic = await git(
              ["ls-remote", "--symref", "--", repository, "HEAD"],
              undefined,
              options.signal,
            );
            const defaultRef = /^ref: (refs\/heads\/[^\t\n]+)\tHEAD/m.exec(
              symbolic,
            )?.[1];
            if (defaultRef)
              await git(
                ["symbolic-ref", "HEAD", defaultRef],
                objectRoot,
                options.signal,
              );
            commit = await git(
              ["rev-parse", "--verify", `${requestedRef}^{commit}`],
              objectRoot,
              options.signal,
            );
          }
          const treeEntries = (
            await git(
              ["ls-tree", "-r", "-z", commit],
              objectRoot,
              options.signal,
            )
          )
            .split("\0")
            .filter(Boolean);
          const blobFiles: Record<string, { oid: string; mode: string }> = {};
          const portablePaths = new Map<string, string>();
          for (const entry of treeEntries) {
            const match = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(entry)!;
            const name = match[4];
            let prefix = "";
            for (const segment of name.split("/")) {
              prefix = prefix ? prefix + "/" + segment : segment;
              const key = foldCase(prefix);
              const previous = portablePaths.get(key);
              if (previous && previous !== prefix)
                fail(
                  "DBF120",
                  `Case/Unicode path collision: ${previous} and ${prefix}`,
                );
              portablePaths.set(key, prefix);
            }
            if (match[2] === "blob")
              blobFiles[name.normalize("NFC")] = {
                oid: match[3],
                mode: match[1],
              };
          }
          const tree = path.join(temporary, "tree");
          await mkdir(tree);
          for (const [name, entry] of Object.entries(blobFiles))
            if (entry.mode !== "120000") {
              const file = path.resolve(tree, name);
              if (
                !within(tree, file) ||
                name.split("/").some((part) => part === "." || part === "..")
              )
                fail("DBS130", `Invalid Git tree path ${name}`);
              await mkdir(path.dirname(file), { recursive: true });
              await writeFile(
                file,
                await gitBlob(objectRoot, entry.oid, options.signal),
              );
            }
          for (const [name, entry] of Object.entries(blobFiles))
            if (entry.mode === "120000") {
              const file = path.resolve(tree, name);
              const target = new TextDecoder("utf-8", { fatal: true }).decode(
                await gitBlob(objectRoot, entry.oid, options.signal),
              );
              if (
                !within(tree, file) ||
                !within(tree, path.resolve(path.dirname(file), target))
              )
                fail("DBS130", `Symlink escapes source ${id}: ${name}`);
              await mkdir(path.dirname(file), { recursive: true });
              await symlink(target, file);
            }
          checkout = path.join(cacheRoot, "snapshots", commit);
          await mkdir(path.dirname(checkout), { recursive: true });
          try {
            await rename(tree, checkout);
          } catch (error) {
            if (
              !["EEXIST", "ENOTEMPTY"].includes(
                (error as NodeJS.ErrnoException).code ?? "",
              )
            )
              throw error;
          }
          await atomicWrite(
            checkout + ".json",
            stableJson({
              schemaVersion: 1,
              complete: true,
              commit,
              files: blobFiles,
            }),
          );
          await rm(path.join(objectRoot, "FETCH_HEAD"), { force: true });
          const objectDestination = path.join(cacheRoot, "objects", commit);
          await mkdir(path.dirname(objectDestination), { recursive: true });
          try {
            await rename(objectRoot, objectDestination);
          } catch (error) {
            if (
              !["EEXIST", "ENOTEMPTY"].includes(
                (error as NodeJS.ErrnoException).code ?? "",
              )
            )
              throw error;
          }
          await atomicWrite(
            refFile,
            stableJson({ commit, fetchedAt: Date.now() }),
          );
        } finally {
          await rm(temporary, { recursive: true, force: true });
        }
      }
      const marker = await readJson<{
        schemaVersion: number;
        complete: boolean;
        commit: string;
        files: Record<string, { oid: string; mode: string }>;
      }>(checkout + ".json");
      if (
        marker?.schemaVersion !== 1 ||
        marker.complete !== true ||
        marker.commit !== commit ||
        !marker.files
      )
        fail("DBS120", `Invalid immutable checkout for ${id}`);
      gitFiles = new Map(Object.entries(marker.files));
      root = checkout;
      revision = commit!;
      next.sources[id] = {
        type: "git",
        repository: redact(configuredRepository),
        requestedRef,
        resolvedCommit: revision,
      };
    } else {
      root = path.resolve(projectDir, source.path!);
      revision = "";
      next.sources[id] = { type: "local" };
    }
    let canonicalRoot: string;
    try {
      canonicalRoot = await realpath(root);
    } catch {
      fail("DBS100", `Source ${id} does not exist: ${root}`);
    }
    const requestedContentRoot = path.resolve(
      canonicalRoot,
      source.content.replace(/\\/g, path.sep),
    );
    if (!within(canonicalRoot, requestedContentRoot))
      fail("DBS130", `Content root escapes source ${id}`);
    const contentRelative = path
      .relative(canonicalRoot, requestedContentRoot)
      .split(path.sep)
      .join("/");
    const contentRoot =
      (await locateSourceFile(
        { id, root: canonicalRoot, revision, gitFiles },
        contentRelative || ".",
      )) ?? requestedContentRoot;
    if (!within(canonicalRoot, contentRoot))
      fail("DBS130", `Content root escapes source ${id}`);
    try {
      if (!within(canonicalRoot, await realpath(contentRoot)))
        fail("DBS130", `Content symlink escapes source ${id}`);
    } catch (error) {
      if (error instanceof DocBaseError) throw error;
      fail("DBS100", `Content directory unavailable for ${id}`);
    }
    const take = async (): Promise<Map<string, Uint8Array>> => {
      const files = new Map<string, Uint8Array>();
      const seen = new Map<string, string>();
      const walk = async (
        directory: string,
        active: Set<string>,
      ): Promise<void> => {
        const actual = await realpath(directory);
        if (!within(canonicalRoot, actual))
          fail("DBS130", `Symlink escapes source ${id}: ${directory}`);
        if (active.has(actual))
          fail("DBS130", `Symlink cycle in ${id}: ${directory}`);
        for (const entry of (
          await readdir(directory, { withFileTypes: true })
        ).sort((a, b) => compare(a.name, b.name))) {
          if ([".git"].includes(entry.name)) continue;
          const full = path.join(directory, entry.name);
          if (full === path.join(projectDir, ".doc-base")) continue;
          if (gitFiles && entry.isSymbolicLink())
            await assertGitSymlink(canonicalRoot, full, gitFiles, revision);
          const real = await realpath(full);
          if (!within(canonicalRoot, real))
            fail("DBS130", `Symlink escapes source ${id}: ${full}`);
          const info = await stat(full);
          if (info.isDirectory())
            await walk(full, new Set([...active, actual]));
          else if (info.isFile()) {
            const relative = path
              .relative(canonicalRoot, full)
              .split(path.sep)
              .join("/")
              .normalize("NFC");
            const portable = foldCase(relative);
            if (seen.has(portable))
              fail(
                "DBF120",
                `Case/Unicode path collision: ${seen.get(portable)} and ${relative}`,
              );
            seen.set(portable, relative);
            const bytes = await readFile(full);
            if (gitFiles)
              await assertGitBytes(
                canonicalRoot,
                full,
                bytes,
                gitFiles,
                revision,
              );
            files.set(relative, bytes);
          }
        }
      };
      await walk(contentRoot, new Set());
      return files;
    };
    const files = await take();
    const fingerprint = (data: Map<string, Uint8Array>): string =>
      hash(stableJson([...data].map(([name, bytes]) => [name, hash(bytes)])));
    const include = picomatch(source.include);
    const exclude = picomatch(source.exclude);
    const contentPrefix = path
      .relative(canonicalRoot, contentRoot)
      .split(path.sep)
      .join("/")
      .normalize("NFC");
    const documents = [...files.keys()]
      .filter((name) => {
        if (contentPrefix && !name.startsWith(contentPrefix + "/"))
          return false;
        const contentPath = contentPrefix
          ? name.slice(contentPrefix.length + 1)
          : name;
        return (
          /\.mdx?$/.test(name) && include(contentPath) && !exclude(contentPath)
        );
      })
      .sort(compare);
    revision ||= `sha256:${hash(stableJson({ source, files: fingerprint(files) }))}`;
    const exclusions: NonNullable<SourceSnapshot["exclusions"]> = [
      ...files.keys(),
    ]
      .filter((name) => /\.mdx?$/.test(name) && !documents.includes(name))
      .map((sourcePath) => {
        const contentPath = contentPrefix
          ? sourcePath.slice(contentPrefix.length + 1)
          : sourcePath;
        const reason =
          contentPrefix && !sourcePath.startsWith(contentPrefix + "/")
            ? "content-root"
            : !include(contentPath)
              ? "include"
              : "exclude";
        return { sourcePath, reason };
      });
    snapshots.push({
      id,
      type: source.type,
      revision,
      requestedRef: source.ref,
      overridden:
        !!options.sourceOverrides?.[id] ||
        [...(options.sourcePath ?? []), ...(options.sourceRef ?? [])].some(
          (value) => value.startsWith(id + "="),
        ),
      override: options.sourceOverrides?.[id],
      root: canonicalRoot,
      contentRoot,
      gitFiles,
      files,
      documents,
      exclusions,
    });
  }
  if (options.frozenLockfile && stableJson(lock) !== stableJson(next))
    fail("DBS120", "Source lockfile does not match effective configuration");
  if (!options.frozenLockfile && !options.offline)
    await atomicWrite(lockPath, stableJson(next));
  return snapshots;
}

export async function readDerivedContent(
  cacheDirectory: string,
  key: string,
): Promise<unknown | undefined> {
  const file = path.join(cacheDirectory, "derived", key + ".json");
  try {
    const envelope = JSON.parse(await readFile(file, "utf8")) as {
      schemaVersion: number;
      key: string;
      value: unknown;
      valueFingerprint: string;
    };
    return envelope.schemaVersion === 1 &&
      envelope.key === key &&
      envelope.valueFingerprint === hash(stableJson(envelope.value))
      ? envelope.value
      : undefined;
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT" ||
      error instanceof SyntaxError
    )
      return undefined;
    fail("DBS120", `Cannot read derived content cache ${key}`);
  }
}
export async function writeDerivedContent(
  cacheDirectory: string,
  key: string,
  value: unknown,
): Promise<void> {
  await atomicWrite(
    path.join(cacheDirectory, "derived", key + ".json"),
    stableJson({
      schemaVersion: 1,
      key,
      value,
      valueFingerprint: hash(stableJson(value)),
    }),
  );
}

export async function recordSnapshots(
  projectDir: string,
  snapshots: readonly SourceSnapshot[],
  draftExclusions: readonly {
    sourceId: string;
    sourcePath: string;
    reason: "draft";
  }[],
): Promise<void> {
  const manifest = {
    schemaVersion: 1,
    sources: snapshots.map((source) => ({
      id: source.id,
      type: source.type,
      revision: source.revision,
      requestedRef: source.requestedRef,
      overridden: source.overridden,
      override: source.override,
      documents: source.documents.map((sourcePath) => ({
        sourcePath,
        contentHash: hash(source.files.get(sourcePath)!),
      })),
      excluded: source.exclusions ?? [],
    })),
    draftExclusions,
  };
  await atomicWrite(
    path.join(projectDir, ".doc-base/source-snapshot.json"),
    stableJson(manifest),
  );
}

export class SnapshotChangedError extends DocBaseError {
  constructor(sourceId: string) {
    super(3, [
      diagnostic(
        "DBS140",
        `Source ${sourceId} changed while its snapshot was being read`,
        { sourceId },
      ),
    ]);
  }
}
async function locateSourceFile(
  source: Pick<SourceSnapshot, "id" | "root" | "revision" | "gitFiles">,
  sourcePath: string,
): Promise<string | undefined> {
  const normalized = sourcePath.replace(/\\/g, "/").normalize("NFC");
  if (path.posix.isAbsolute(normalized) || normalized.split("/").includes(".."))
    fail("DBS130", `Path escapes source ${source.id}: ${sourcePath}`);
  if (normalized === "." || normalized === "") return source.root;
  let directory = source.root;
  for (const segment of normalized.split("/")) {
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch (error) {
      if (
        ["ENOENT", "ENOTDIR"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        return undefined;
      throw error;
    }
    const matches = entries.filter(
      (entry) => entry.normalize("NFC") === segment,
    );
    if (matches.length > 1)
      fail(
        "DBF120",
        `Unicode path collision within ${source.id}: ${sourcePath}`,
      );
    if (!matches.length) return undefined;
    directory = path.join(directory, matches[0]);
    if (source.gitFiles && (await lstat(directory)).isSymbolicLink())
      await assertGitSymlink(
        source.root,
        directory,
        source.gitFiles,
        source.revision,
      );
    let actual: string;
    try {
      actual = await realpath(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    if (!within(source.root, actual))
      fail("DBS130", `Symlink escapes source ${source.id}: ${sourcePath}`);
  }
  return directory;
}
export async function readSourceFile(
  source: SourceSnapshot,
  sourcePath: string,
): Promise<Uint8Array | undefined> {
  try {
    const normalized = path.posix
      .normalize(sourcePath.replace(/\\/g, "/"))
      .normalize("NFC");
    const cached = source.files.get(normalized);
    if (cached) return cached;
    const file = await locateSourceFile(source, normalized);
    if (!file) return undefined;
    if (!(await stat(file)).isFile()) return undefined;
    const bytes = await readFile(file);
    if (source.gitFiles)
      await assertGitBytes(
        source.root,
        file,
        bytes,
        source.gitFiles,
        source.revision,
      );
    (source.files as Map<string, Uint8Array>).set(normalized, bytes);
    return bytes;
  } catch (error) {
    if (error instanceof DocBaseError) throw error;
    fail("DBS100", `Cannot read source file ${source.id}::${sourcePath}`);
  }
}
export async function verifySnapshots(
  snapshots: readonly SourceSnapshot[],
  requiredFiles: ReadonlyMap<string, ReadonlySet<string>>,
): Promise<void> {
  for (const source of snapshots)
    if (source.type === "local")
      for (const sourcePath of requiredFiles.get(source.id) ??
        source.documents) {
        const file = await locateSourceFile(source, sourcePath);
        if (
          !file ||
          hash(await readFile(file)) !== hash(source.files.get(sourcePath)!)
        )
          throw new SnapshotChangedError(source.id);
      }
}

function gitBlobHash(bytes: Uint8Array, revision: string): string {
  return createHash(revision.length === 64 ? "sha256" : "sha1")
    .update(`blob ${bytes.byteLength}\0`)
    .update(bytes)
    .digest("hex");
}
async function assertGitBytes(
  root: string,
  file: string,
  bytes: Uint8Array,
  files: ReadonlyMap<string, { oid: string; mode: string }>,
  revision: string,
): Promise<void> {
  const actual = await realpath(file);
  const relative = path
    .relative(root, actual)
    .split(path.sep)
    .join("/")
    .normalize("NFC");
  const expected = files.get(relative);
  if (!expected || expected.oid !== gitBlobHash(bytes, revision))
    fail(
      "DBS120",
      `Cached checkout bytes do not match the immutable commit: ${relative}`,
    );
}
async function assertGitSymlink(
  root: string,
  file: string,
  files: ReadonlyMap<string, { oid: string; mode: string }>,
  revision: string,
): Promise<void> {
  const parent = await realpath(path.dirname(file));
  const relative = path
    .relative(root, path.join(parent, path.basename(file)))
    .split(path.sep)
    .join("/")
    .normalize("NFC");
  const expected = files.get(relative);
  const target = await readlink(file);
  if (
    expected?.mode !== "120000" ||
    expected.oid !== gitBlobHash(Buffer.from(target), revision)
  )
    fail(
      "DBS120",
      `Cached symlink does not match the immutable commit: ${relative}`,
    );
}
async function gitBlob(
  repository: string,
  oid: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  try {
    const result = await execute(
      "git",
      [...gitOptions, "cat-file", "blob", oid],
      {
        cwd: repository,
        signal,
        encoding: "buffer",
        maxBuffer: 128 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_CONFIG_NOSYSTEM: "1",
        },
      },
    );
    return result.stdout;
  } catch {
    fail("DBS110", `Cannot read immutable Git blob ${oid}`);
  }
}
