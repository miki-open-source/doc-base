import path from "node:path";
import { slug as headingSlug } from "github-slugger";
import { TextDecoder } from "node:util";
import {
  DocBaseError,
  diagnostic,
  freeze,
  compare,
  foldCase,
  stableJson,
  VERSION,
  type Config,
  type Diagnostic,
  type DocumentRecord,
  type Frontmatter,
  type RunOptions,
  type Compilation,
  type Projection,
  type PageOutput,
  type SearchRecord,
  type PresenterValue,
} from "@doc-base/schema";
import {
  hash,
  resolveSources,
  redact,
  readDerivedContent,
  writeDerivedContent,
  recordSnapshots,
  readSourceFile,
  verifySnapshots,
  SnapshotChangedError,
} from "@doc-base/sources";
import type {
  ReadonlyDocumentV1,
  ReadonlyRelationshipV1,
} from "@doc-base/extension-api";
import { ajv, schema, parseYaml, loadConfig, yamlRange } from "./config.js";
import { normalizeRoute, routeUrl, routeIdentity } from "./urls.js";
import {
  parseContent,
  stringifyContent,
  walk,
  textContent,
  headings,
  staticUrlAttributes,
  logicalReferences,
  type ContentNode,
} from "./content.js";
import { navigation } from "./navigation.js";
import { parserVersion } from "./parser-version.js";
import {
  applySuppressions,
  CORE_CODES,
  passes,
  type ScopedSuppression,
} from "./diagnostics.js";
import { loadExtensions } from "./extensions.js";
export {
  loadConfig,
  discoverConfig,
  environmentOptions,
  schema,
} from "./config.js";
export { normalizeRoute, routeUrl, routeIdentity } from "./urls.js";
export { counts, applySuppressions, passes } from "./diagnostics.js";
export async function inspectExtensions(
  config: Readonly<Config>,
  projectDir: string,
): Promise<Array<{ package: string; version: string; apiVersion: "1" }>> {
  return (await loadExtensions(config, projectDir)).versions;
}
interface Parsed {
  document: Readonly<DocumentRecord>;
  frontmatter: Frontmatter;
  body: string;
}
export async function compile(
  cwd: string,
  flags: RunOptions = {},
): Promise<Compilation> {
  for (let attempt = 0; attempt < 2; attempt++)
    try {
      return await compileSnapshot(cwd, flags);
    } catch (error) {
      if (!(error instanceof SnapshotChangedError) || attempt === 1)
        throw error;
    }
  throw new Error("Snapshot retry did not complete");
}
async function compileSnapshot(
  cwd: string,
  flags: RunOptions = {},
): Promise<Compilation> {
  flags.signal?.throwIfAborted();
  const loaded = await loadConfig(cwd, flags);
  const { config, projectDir, options } = loaded;
  const extensions = await loadExtensions(config, projectDir);
  const sources = await resolveSources(config, projectDir, options);
  const parserFingerprint = await parserVersion();
  const cacheDirectory = path.resolve(projectDir, config.cache.directory);
  const diagnostics: Diagnostic[] = [];
  const draftExclusions: Array<{
    sourceId: string;
    sourcePath: string;
    reason: "draft";
  }> = [];
  const parsed = new Map<string, Parsed>();
  const identities = new Map<string, string>();
  const routes = new Map<string, string>();
  const suppressions: ScopedSuppression[] = config.validation.suppressions.map(
    (value) => ({ value }),
  );
  const validateFrontmatter = ajv.compile(await schema("frontmatter"));
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const report = (
    code: string,
    message: string,
    doc?: Readonly<DocumentRecord>,
    node?: ContentNode,
    severity: Diagnostic["severity"] = "error",
    suppressible?: boolean,
  ): void => {
    diagnostics.push(
      diagnostic(code, message, {
        severity,
        suppressible,
        sourceId: doc?.sourceId,
        file: doc?.sourcePath,
        documentKey: doc?.key,
        range: node?.position,
        related: node?.embedStack?.map((key) => ({
          message: `Embedded through ${key}`,
          file: parsed.get(key.split("#")[0])?.document.sourcePath,
          sourceId: parsed.get(key.split("#")[0])?.document.sourceId,
        })),
      }),
    );
  };
  for (const source of sources)
    for (const sourcePath of source.documents) {
      try {
        options.signal?.throwIfAborted();
        const text = decoder.decode(source.files.get(sourcePath)!);
        const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
        if (!match) {
          diagnostics.push(
            diagnostic("DBF100", "Document requires YAML frontmatter", {
              sourceId: source.id,
              file: sourcePath,
            }),
          );
          continue;
        }
        const frontmatter = parseYaml(match[1], sourcePath, 1) as Frontmatter;
        if (!validateFrontmatter(frontmatter)) {
          for (const error of validateFrontmatter.errors ?? [])
            diagnostics.push(
              diagnostic("DBF100", `${error.instancePath} ${error.message}`, {
                sourceId: source.id,
                file: sourcePath,
                range: yamlRange(match[1], error.instancePath, 1),
              }),
            );
          continue;
        }
        if (frontmatter.audiences?.some((id) => !config.audiences[id]))
          diagnostics.push(
            diagnostic("DBA100", "Unknown document audience", {
              sourceId: source.id,
              file: sourcePath,
            }),
          );
        const key = `${source.id}::${frontmatter.id}`;
        const portableKey = key.replace(/[A-Z]/g, (letter) =>
          letter.toLowerCase(),
        );
        if (identities.has(portableKey)) {
          diagnostics.push(
            diagnostic(
              "DBF110",
              `Duplicate identity ${key}; existing ${identities.get(portableKey)}`,
              { sourceId: source.id, file: sourcePath },
            ),
          );
          continue;
        }
        identities.set(portableKey, key);
        const draft = frontmatter.draft ?? false;
        if (draft && (!options.dev || options.excludeDrafts)) {
          draftExclusions.push({
            sourceId: source.id,
            sourcePath,
            reason: "draft",
          });
          continue;
        }
        const contentPrefix = path
          .relative(source.root, source.contentRoot)
          .split(path.sep)
          .join("/")
          .normalize("NFC");
        const contentPath = contentPrefix
          ? sourcePath.slice(contentPrefix.length + 1)
          : sourcePath;
        const derived = contentPath
          .replace(/\.mdx?$/, "")
          .replace(/(^|\/)index$/, "$1");
        const rawSlug = [
          config.sources[source.id].routePrefix,
          frontmatter.slug ?? derived,
        ]
          .filter(Boolean)
          .join("/");
        const slug =
          normalizeRoute(rawSlug) +
          (config.site.trailingSlash === "ignore" &&
          rawSlug.endsWith("/") &&
          normalizeRoute(rawSlug)
            ? "/"
            : "");
        if (
          ["_astro", "_audience", "_doc-base"].includes(
            foldCase(slug.split("/")[0]),
          )
        ) {
          diagnostics.push(
            diagnostic("DBU110", `Reserved route ${slug}`, {
              sourceId: source.id,
              file: sourcePath,
            }),
          );
          continue;
        }
        const route = routeIdentity(slug);
        if (routes.has(route)) {
          diagnostics.push(
            diagnostic(
              "DBU120",
              `Route collision between ${key} and ${routes.get(route)}`,
              { sourceId: source.id, file: sourcePath },
            ),
          );
          continue;
        }
        routes.set(route, key);
        for (const value of frontmatter.validation?.suppress ?? [])
          suppressions.push({ value, documentKey: key });
        const body = text.slice(match[0].length);
        const format = sourcePath.endsWith(".mdx") ? "mdx" : "md";
        const cacheKey = hash(
          stableJson({
            sourceRevision: source.revision,
            sourcePath,
            config: config.sources[source.id],
            parser: parserFingerprint,
            extensions: extensions.versions,
            format,
            key,
          }),
        );
        const cached = (await readDerivedContent(cacheDirectory, cacheKey)) as
          ContentNode | undefined;
        const ast =
          cached?.type === "root" && Array.isArray(cached.children)
            ? cached
            : parseContent(body, format, key, match[0].split("\n").length - 1);
        if (ast !== cached)
          await writeDerivedContent(cacheDirectory, cacheKey, ast);
        const document: DocumentRecord = {
          key,
          id: frontmatter.id,
          sourceId: source.id,
          sourceRevision: source.revision,
          sourcePath,
          format,
          title: frontmatter.title,
          description: frontmatter.description,
          slug,
          url: routeUrl(config.site.baseUrl, slug, config.site.trailingSlash),
          audiences: frontmatter.audiences ?? null,
          tags: frontmatter.tags ?? [],
          relationships: frontmatter.relationships ?? [],
          redirects: frontmatter.redirects ?? [],
          nav: {
            label: frontmatter.nav?.label ?? frontmatter.title,
            hidden: frontmatter.nav?.hidden ?? false,
            group: frontmatter.nav?.group,
            order: frontmatter.order,
          },
          search: {
            exclude: frontmatter.search?.exclude ?? false,
            boost: frontmatter.search?.boost ?? 1,
          },
          customMetadata: frontmatter.metadata ?? {},
          headings: headings(ast),
          ast,
          provenance: {
            sourceId: source.id,
            sourcePath,
            revision: source.revision,
          },
        };
        parsed.set(key, { document: freeze(document), frontmatter, body });
      } catch (error) {
        if (error instanceof DocBaseError && error.exitCode >= 3) throw error;
        if (error instanceof DocBaseError)
          diagnostics.push(
            ...error.diagnostics.map((item) => ({
              ...item,
              sourceId: source.id,
              file: sourcePath,
            })),
          );
        else
          diagnostics.push(
            diagnostic(
              "DBF130",
              `Cannot parse document: ${error instanceof Error ? error.message : String(error)}`,
              { sourceId: source.id, file: sourcePath },
            ),
          );
      }
    }
  const requiredFiles = new Map<string, Set<string>>();
  for (const source of sources) {
    const included = new Set(source.documents);
    requiredFiles.set(source.id, included);
    const addDependency = async (
      from: string,
      reference: string,
    ): Promise<void> => {
      if (!reference || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(reference)) return;
      let dependency: string;
      try {
        dependency = path.posix
          .normalize(
            path.posix.join(
              path.posix.dirname(from),
              decodeURIComponent(reference.split(/[?#]/)[0]).replace(
                /\\/g,
                "/",
              ),
            ),
          )
          .normalize("NFC");
      } catch {
        return;
      }
      if (included.has(dependency)) return;
      const bytes = await readSourceFile(source, dependency);
      if (!bytes) return;
      included.add(dependency);
      if (/\.(?:astro|[cm]?[jt]sx?|css)$/.test(dependency)) {
        const code = decoder.decode(bytes);
        for (const match of code.matchAll(
          /(?:from\s+|import\s*)["'](\.[^"']+)["']/g,
        ))
          await addDependency(dependency, match[1]);
        for (const match of code.matchAll(/url\(\s*(["']?)([^"'\s)]+)\1\s*\)/g))
          await addDependency(dependency, match[2]);
      }
    };
    for (const item of parsed.values())
      if (item.document.sourceId === source.id) {
        const references: Array<{ address: string; node: ContentNode }> = [];
        walk(item.document.ast as ContentNode, (node) => {
          if (node.url) references.push({ address: node.url, node });
          for (const attribute of staticUrlAttributes(node))
            references.push({ address: attribute.value, node });
          if (node.type === "html")
            for (const match of (node.value ?? "").matchAll(
              /(?:src|href|poster)\s*=\s*["']([^"']+)["']/g,
            ))
              references.push({ address: match[1], node });
          if (node.type === "mdxjsEsm")
            for (const match of (node.value ?? "").matchAll(
              /(?:from\s+|import\s*)["'](\.[^"']+)["']/g,
            ))
              references.push({ address: match[1], node });
        });
        for (const { address, node } of references) {
          await addDependency(item.document.sourcePath, address);
          if (
            node.type === "mdxjsEsm" ||
            !address ||
            /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(address)
          )
            continue;
          let dependency: string;
          try {
            dependency = path.posix
              .normalize(
                path.posix.join(
                  path.posix.dirname(item.document.sourcePath),
                  decodeURIComponent(address.split(/[?#]/)[0]).replace(
                    /\\/g,
                    "/",
                  ),
                ),
              )
              .normalize("NFC");
          } catch {
            continue;
          }
          if (!source.files.has(dependency))
            report(
              "DBU140",
              `Missing asset ${dependency}`,
              item.document,
              node,
            );
        }
      }
    if (source.type === "local") {
      source.revision = `sha256:${hash(stableJson({ source: config.sources[source.id], files: [...included].sort(compare).map((name) => [name, hash(source.files.get(name)!)]) }))}`;
      for (const [key, item] of parsed)
        if (item.document.sourceId === source.id)
          parsed.set(key, {
            ...item,
            document: freeze({
              ...item.document,
              sourceRevision: source.revision,
              provenance: {
                ...item.document.provenance,
                revision: source.revision,
              },
            }),
          });
    }
  }
  await verifySnapshots(sources, requiredFiles);
  await recordSnapshots(projectDir, sources, draftExclusions);
  const documents = [...parsed.values()]
    .map((item) => item.document)
    .sort((a, b) => compare(a.key, b.key));
  const candidates = (
    ref: string,
    from?: Readonly<DocumentRecord>,
  ): Readonly<DocumentRecord>[] => {
    const target = ref.split("#")[0];
    if (target.includes("::")) {
      const doc = parsed.get(target)?.document;
      return doc ? [doc] : [];
    }
    if (from) {
      const local = parsed.get(`${from.sourceId}::${target}`)?.document;
      if (local) return [local];
    }
    return documents.filter((doc) => doc.id === target);
  };
  const resolve = (
    ref: string,
    from?: Readonly<DocumentRecord>,
    node?: ContentNode,
    emit = true,
  ): Readonly<DocumentRecord> | undefined => {
    const found = candidates(ref, from);
    if (found.length !== 1) {
      if (emit)
        report(
          found.length ? "DBR110" : "DBR100",
          found.length
            ? `Ambiguous reference ${ref}: ${found.map((doc) => doc.key).join(", ")}`
            : `Unresolved reference ${ref}`,
          from,
          node,
          config.validation.strictRefs ? "error" : "warning",
        );
      return undefined;
    }
    return found[0];
  };
  const visible = (
    doc: Readonly<DocumentRecord>,
    audience: string | null,
  ): boolean =>
    !doc.audiences || (!!audience && doc.audiences.includes(audience));
  for (const doc of documents)
    walk(doc.ast as ContentNode, (node) => {
      for (const reference of logicalReferences(node))
        resolve(reference, doc, node);
    });
  const inspectEmbeds = (
    doc: Readonly<DocumentRecord>,
    fragment: string | undefined,
    stack: string[],
  ): void => {
    const identity = doc.key + (fragment ? "#" + fragment : "");
    if (stack.includes(identity)) {
      report(
        "DBE200",
        `Embed cycle: ${[...stack.slice(stack.indexOf(identity)), identity].join(" -> ")}`,
        doc,
        undefined,
        "error",
        false,
      );
      return;
    }
    if (stack.length > config.embeds.maxDepth) {
      report(
        "DBE210",
        `Embed depth exceeds ${config.embeds.maxDepth}: ${[...stack, identity].join(" -> ")}`,
        doc,
        undefined,
        "error",
        false,
      );
      return;
    }
    let children = (doc.ast as ContentNode).children ?? [];
    if (fragment) {
      const start = children.findIndex(
        (node) => node.type === "heading" && node.headingId === fragment,
      );
      if (start < 0) {
        report("DBE120", `Missing embed section ${identity}`, doc);
        return;
      }
      let end = start + 1;
      while (
        end < children.length &&
        !(
          children[end].type === "heading" &&
          children[end].depth! <= children[start].depth!
        )
      )
        end++;
      children = children.slice(start, end);
    }
    for (const child of children)
      walk(child, (node) => {
        if (node.name !== "doc-embed") return;
        const attrs = node.attributes ?? {};
        if (
          node.type !== "leafDirective" ||
          !attrs.ref ||
          Object.keys(attrs).some(
            (key) =>
              !["ref", "headingOffset", "includeTitle", "audiences"].includes(
                key,
              ),
          ) ||
          /[{}]/.test(Object.values(attrs).join("")) ||
          (attrs.headingOffset !== undefined &&
            !/^[0-5]$/.test(attrs.headingOffset ?? "")) ||
          (attrs.includeTitle !== undefined &&
            !["true", "false"].includes(attrs.includeTitle ?? ""))
        ) {
          report("DBE110", "Invalid static doc-embed attributes", doc, node);
          return;
        }
        if (
          attrs.audiences?.split(",").some((id) => !config.audiences[id.trim()])
        )
          report("DBA100", "Unknown embed audience", doc, node);
        const target = resolve(attrs.ref, doc, node);
        if (!target) return;
        let moduleScope = false;
        walk(target.ast as ContentNode, (item) => {
          if (item.type === "mdxjsEsm") moduleScope = true;
        });
        if (moduleScope) {
          report(
            "DBE100",
            `Cannot embed module-scope MDX state from ${target.key}`,
            doc,
            node,
          );
          return;
        }
        inspectEmbeds(target, attrs.ref.split("#")[1], [...stack, identity]);
      });
  };
  for (const doc of documents) inspectEmbeds(doc, undefined, []);
  const graph: ReadonlyRelationshipV1[] = [];
  const addEdge = (edge: ReadonlyRelationshipV1): void => {
    if (
      !graph.some(
        (item) =>
          item.from === edge.from &&
          item.to === edge.to &&
          item.type === edge.type,
      )
    )
      graph.push(edge);
  };
  for (const doc of documents)
    for (const relationship of doc.relationships) {
      const type = config.relationships[relationship.type];
      if (!type) {
        report("DBR130", `Unknown relationship type ${relationship.type}`, doc);
        continue;
      }
      const target = resolve(relationship.target, doc);
      if (!target) continue;
      addEdge({
        from: doc.key,
        to: target.key,
        type: relationship.type,
        label: relationship.label,
      });
    }
  const derived = graph
    .flatMap((edge) => {
      const inverse = config.relationships[edge.type].inverse;
      return inverse ? [{ from: edge.to, to: edge.from, type: inverse }] : [];
    })
    .sort(
      (a, b) =>
        compare(
          parsed.get(a.to)!.document.title,
          parsed.get(b.to)!.document.title,
        ) || compare(a.to, b.to),
    );
  for (const edge of derived) addEdge(edge);
  const publicDocument = (
    doc: Readonly<DocumentRecord>,
  ): ReadonlyDocumentV1 => {
    const { ast: _ast, ...publicFields } = doc;
    return freeze(publicFields);
  };
  const publicDocuments = documents.map(publicDocument);
  const validateDiagnostic = ajv.compile(await schema("diagnostic"));
  for (const rule of extensions.rules)
    try {
      const emitted = await rule.run(
        freeze({
          documents: publicDocuments,
          relationships: graph,
          audiences: Object.keys(config.audiences),
          config: {
            schemaVersion: 1 as const,
            site: {
              title: config.site.title,
              baseUrl: config.site.baseUrl,
              defaultAudience: config.site.defaultAudience,
            },
          },
          resolve(ref: string, fromKey: string) {
            const found = candidates(ref, parsed.get(fromKey)?.document);
            return found.length === 1
              ? {
                  ok: true as const,
                  document: publicDocument(found[0]),
                  fragment: ref.split("#")[1],
                }
              : { ok: false as const, candidates: found.map((doc) => doc.key) };
          },
        }),
      );
      for await (const item of emitted) {
        if (item.code && item.code !== rule.code)
          throw new Error("Rule emitted a different diagnostic code");
        const entry = {
          ...item,
          code: rule.code,
          severity: item.severity ?? rule.defaultSeverity,
          suppressible: true,
        };
        if (!validateDiagnostic(entry))
          throw new Error(
            "Invalid extension diagnostic: " +
              ajv.errorsText(validateDiagnostic.errors),
          );
        diagnostics.push(entry);
      }
    } catch (error) {
      throw new DocBaseError(4, [
        diagnostic("DBX001", `Rule ${rule.code} failed: ${String(error)}`),
      ]);
    }
  const assets = new Map<string, Uint8Array>();
  const selected = options.audience
    ? [options.audience]
    : Object.keys(config.audiences).length
      ? [
          config.site.defaultAudience!,
          ...Object.keys(config.audiences)
            .filter((id) => id !== config.site.defaultAudience)
            .sort(compare),
        ]
      : [null];
  const projections: Projection[] = [];
  const globalTrees = new Map<string, ContentNode>();
  for (const audience of selected) {
    const baseUrl =
      options.audience ||
      audience === config.site.defaultAudience ||
      audience === null
        ? config.site.baseUrl
        : `${config.site.baseUrl}_audience/${audience}/`;
    const url = (doc: Readonly<DocumentRecord>): string =>
      routeUrl(baseUrl, doc.slug, config.site.trailingSlash);
    const trees = new Map<string, ContentNode>();
    const expand = (
      doc: Readonly<DocumentRecord>,
      fragment: string | undefined,
      stack: string[],
      offset = 0,
      global = false,
    ): ContentNode => {
      const identity = doc.key + (fragment ? "#" + fragment : "");
      if (stack.includes(identity)) {
        report(
          "DBE200",
          `Embed cycle: ${[...stack.slice(stack.indexOf(identity)), identity].join(" -> ")}`,
          doc,
          undefined,
          "error",
          false,
        );
        return { type: "root", children: [] };
      }
      if (stack.length > config.embeds.maxDepth) {
        report(
          "DBE210",
          `Embed depth exceeds ${config.embeds.maxDepth}: ${[...stack, identity].join(" -> ")}`,
          doc,
          undefined,
          "error",
          false,
        );
        return { type: "root", children: [] };
      }
      const tree = structuredClone(doc.ast) as ContentNode;
      walk(tree, (node) => {
        node.embedStack = [...stack];
      });
      if (fragment) {
        const nodes = tree.children ?? [];
        const start = nodes.findIndex(
          (node) => node.type === "heading" && node.headingId === fragment,
        );
        if (start < 0) {
          report("DBE120", `Missing embed section ${identity}`, doc);
          return { type: "root", children: [] };
        }
        let end = start + 1;
        while (
          end < nodes.length &&
          !(
            nodes[end].type === "heading" &&
            nodes[end].depth! <= nodes[start].depth!
          )
        )
          end++;
        tree.children = nodes.slice(start, end);
      }
      const transform = (parent: ContentNode): void => {
        parent.children = (parent.children ?? []).flatMap((node) => {
          if (node.type === "leafDirective" && node.name === "doc-embed") {
            const attrs = node.attributes ?? {};
            const ref = attrs.ref;
            if (
              !ref ||
              Object.keys(attrs).some(
                (key) =>
                  ![
                    "ref",
                    "headingOffset",
                    "includeTitle",
                    "audiences",
                  ].includes(key),
              ) ||
              /[{}]/.test(Object.values(attrs).join("")) ||
              (attrs.headingOffset !== undefined &&
                !/^[0-5]$/.test(attrs.headingOffset ?? "")) ||
              (attrs.includeTitle !== undefined &&
                !["true", "false"].includes(attrs.includeTitle ?? ""))
            ) {
              report(
                "DBE110",
                "Invalid static doc-embed attributes",
                doc,
                node,
              );
              return [];
            }
            const restriction = attrs.audiences
              ?.split(",")
              .map((id) => id.trim());
            if (restriction?.some((id) => !config.audiences[id]))
              report("DBA100", "Unknown embed audience", doc, node);
            const target = resolve(ref, doc, node);
            if (!target) return [];
            if (
              Object.keys(config.audiences).some(
                (id) =>
                  visible(doc, id) &&
                  (!visible(target, id) ||
                    (restriction && !restriction.includes(id))),
              )
            )
              report(
                "DBA120",
                `Embed ${target.key} is filtered in broader audiences`,
                doc,
                node,
                "info",
              );
            if (
              !global &&
              (!visible(target, audience) ||
                (restriction && (!audience || !restriction.includes(audience))))
            )
              return [];
            let hasModule = false;
            walk(target.ast as ContentNode, (item) => {
              if (item.type === "mdxjsEsm") hasModule = true;
            });
            if (hasModule) {
              report(
                "DBE100",
                `Cannot embed module-scope MDX state from ${target.key}`,
                doc,
                node,
              );
              return [];
            }
            const part = ref.split("#")[1];
            const instance = `${identity}:${node.position?.start.line ?? 0}:${node.position?.start.column ?? 0}:${stack.join(">")}`;
            const nested = expand(
              target,
              part,
              [...stack, identity],
              offset + Number(attrs.headingOffset ?? 0),
              global,
            );
            let children = nested.children ?? [];
            if (part && attrs.includeTitle === "false")
              children = children.slice(1);
            if (!part && attrs.includeTitle === "true")
              children = [
                {
                  type: "heading",
                  depth: Math.min(
                    6,
                    1 + offset + Number(attrs.headingOffset ?? 0),
                  ),
                  headingId: headingSlug(target.title),
                  children: [{ type: "text", value: target.title }],
                  owner: target.key,
                },
                ...children,
              ];
            for (const child of children)
              walk(child, (item) => {
                item.embedded = true;
                item.embedStack ??= [...stack, identity];
                item.embedInstance =
                  instance + "/" + (item.embedInstance ?? "");
              });
            return children;
          }
          if (node.type.includes("Directive") && node.name === "doc-embed") {
            report(
              "DBE110",
              "doc-embed must be a standalone leaf directive",
              doc,
              node,
            );
            return [];
          }
          if (node.type === "heading" && offset) {
            if (node.depth! + offset > 6)
              report(
                "DBE230",
                "Embedded heading clamped to level 6",
                doc,
                node,
                "warning",
              );
            node.depth = Math.min(6, node.depth! + offset);
          }
          if (node.children) transform(node);
          return [node];
        });
      };
      transform(tree);
      return tree;
    };
    const assignHeadingIds = (
      tree: ContentNode,
      doc: Readonly<DocumentRecord>,
      emit: boolean,
    ): void => {
      const used = new Set<string>();
      walk(tree, (node) => {
        if (node.type === "heading") {
          let id = node.headingId!;
          if (used.has(id)) {
            if (emit && config.embeds.duplicateHeadingIds === "error")
              report(
                "DBE240",
                `Duplicate heading ${id}`,
                doc,
                node,
                "error",
                false,
              );
            const target = parsed.get(node.owner ?? "")?.document;
            const prefix = `embed-${target?.id ?? doc.id}-${id}`;
            let count = 2;
            id = prefix;
            while (used.has(id)) id = `${prefix}-${count++}`;
            const previous = node.headingId;
            walk(tree, (link) => {
              if (link.embedded && link.embedInstance === node.embedInstance) {
                if (link.url === `#${previous}`) link.url = `#${id}`;
                for (const attribute of staticUrlAttributes(link))
                  if (
                    attribute.name === "href" &&
                    attribute.value === `#${previous}`
                  )
                    attribute.value = `#${id}`;
                if (link.type === "html" && link.value)
                  link.value = link.value.replace(
                    /(\bhref\s*=\s*)(["'])([^"']+)\2/g,
                    (match, prefix: string, quote: string, address: string) =>
                      address === `#${previous}`
                        ? prefix + quote + "#" + id + quote
                        : match,
                  );
              }
            });
          }
          node.headingId = id;
          used.add(id);
        }
      });
    };
    if (!globalTrees.size) {
      for (const doc of documents) {
        const tree = expand(doc, undefined, [], 0, true);
        assignHeadingIds(tree, doc, false);
        globalTrees.set(doc.key, tree);
      }
      const checkFragment = (
        ref: string,
        from: Readonly<DocumentRecord>,
        node?: ContentNode,
      ): void => {
        const fragment = ref.split("#")[1];
        if (!fragment) return;
        const target = resolve(ref, from, node, false);
        if (
          target &&
          !headings(globalTrees.get(target.key)!).some(
            (heading) => heading.id === fragment,
          )
        )
          report("DBR120", `Missing heading ${ref}`, from, node);
      };
      for (const doc of documents) {
        walk(doc.ast as ContentNode, (node) => {
          for (const reference of logicalReferences(node))
            checkFragment(reference, doc, node);
        });
        for (const relationship of doc.relationships)
          checkFragment(relationship.target, doc);
      }
    }
    for (const doc of documents.filter((doc) => visible(doc, audience))) {
      const tree = expand(doc, undefined, []);
      assignHeadingIds(tree, doc, true);
      trees.set(doc.key, tree);
    }
    const pages: PageOutput[] = [];
    const search: SearchRecord[] = [];
    for (const doc of documents.filter((doc) => visible(doc, audience))) {
      const tree = trees.get(doc.key)!;
      const rewrite = (parent: ContentNode): void => {
        parent.children = (parent.children ?? []).flatMap((node) => {
          const owner = parsed.get(node.owner ?? doc.key)?.document ?? doc;
          for (const attribute of staticUrlAttributes(node)) {
            const synthetic: ContentNode = {
              ...node,
              type: attribute.name === "href" ? "link" : "image",
              url: attribute.value,
              attributes: undefined,
              children: [],
            };
            const container: ContentNode = {
              type: "root",
              children: [synthetic],
            };
            rewrite(container);
            if (!container.children?.includes(synthetic) && node.name === "a")
              return [...(node.children ?? []), ...(container.children ?? [])];
            attribute.value = synthetic.url!;
          }
          if (node.type === "html" && node.value) {
            node.value = node.value.replace(
              /(\b(?:src|href|poster)\s*=\s*)(["'])([^"']+)\2/g,
              (_match, prefix: string, quote: string, address: string) => {
                const synthetic: ContentNode = {
                  ...node,
                  type: prefix.trim().startsWith("href") ? "link" : "image",
                  url: address,
                  value: undefined,
                  children: [],
                };
                const container: ContentNode = {
                  type: "root",
                  children: [synthetic],
                };
                rewrite(container);
                return container.children?.includes(synthetic)
                  ? prefix + quote + synthetic.url + quote
                  : "";
              },
            );
          }

          if (node.type === "link" && node.url?.startsWith("doc:")) {
            const reference = node.url.slice(4);
            const target = resolve(reference, owner, node);
            if (!target) return node.children ?? [];
            const fragment = reference.split("#")[1];
            if (!visible(target, audience)) {
              report(
                "DBA210",
                `Link to ${target.key} is unavailable for ${audience}`,
                owner,
                node,
                "warning",
              );
              return [
                ...(node.children ?? []),
                ...(options.dev
                  ? [{ type: "text", value: " ⚠ unavailable" }]
                  : []),
              ];
            }
            if (
              fragment &&
              !headings(trees.get(target.key)!).some(
                (heading) => heading.id === fragment,
              )
            )
              report("DBR120", `Missing heading ${reference}`, owner, node);
            node.url = url(target) + (fragment ? "#" + fragment : "");
          } else if (
            (node.type === "image" || node.type === "link") &&
            node.url &&
            !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(node.url)
          ) {
            let relative: string;
            try {
              relative = decodeURIComponent(node.url.split(/[?#]/)[0]);
            } catch {
              report("DBU140", "Invalid asset URL", owner, node);
              return [node];
            }
            const targetPath = path.posix
              .normalize(
                path.posix.join(
                  path.posix.dirname(owner.sourcePath),
                  relative.replace(/\\/g, "/"),
                ),
              )
              .normalize("NFC");
            if (targetPath === ".." || targetPath.startsWith("../"))
              report(
                "DBS130",
                `Asset escapes source: ${node.url}`,
                owner,
                node,
                "error",
                false,
              );
            else if (/\.mdx?$/.test(targetPath) && node.type === "link") {
              report(
                "DBV240",
                `Relative documentation link ${node.url} is path-coupled; use doc:`,
                owner,
                node,
                "warning",
              );
              const target = documents.find(
                (item) =>
                  item.sourceId === owner.sourceId &&
                  item.sourcePath === targetPath,
              );
              if (target)
                node.url =
                  url(target) +
                  (node.url.includes("#") ? "#" + node.url.split("#")[1] : "");
              else
                report(
                  "DBR100",
                  `Missing relative document ${targetPath}`,
                  owner,
                  node,
                );
            } else {
              const bytes = sources
                .find((source) => source.id === owner.sourceId)!
                .files.get(targetPath);
              if (!bytes)
                report("DBU140", `Missing asset ${targetPath}`, owner, node);
              else {
                const name = `_doc-base/assets/${hash(bytes)}${path.posix.extname(targetPath)}`;
                assets.set(name, bytes);
                node.url = config.site.baseUrl + name;
              }
            }
          }
          if (node.children) rewrite(node);
          return [node];
        });
      };
      rewrite(tree);
      const pageHeadings = headings(tree);
      const metadata: PageOutput["metadata"] = [];
      for (const presenter of extensions.presenters)
        if (Object.hasOwn(doc.customMetadata, presenter.key))
          try {
            const value = presenter.present(
              doc.customMetadata[presenter.key],
              freeze({ document: publicDocument(doc), audience }),
            );
            if (value) {
              const valid =
                (value.kind === "text" && typeof value.text === "string") ||
                (value.kind === "link" &&
                  typeof value.text === "string" &&
                  typeof value.href === "string" &&
                  /^(https?:|mailto:|\/|#)/.test(value.href)) ||
                (value.kind === "list" &&
                  Array.isArray(value.items) &&
                  value.items.every((item) => typeof item === "string"));
              const allowed =
                value.kind === "text"
                  ? ["kind", "text"]
                  : value.kind === "link"
                    ? ["kind", "text", "href"]
                    : ["kind", "items"];
              if (
                !valid ||
                Object.keys(value).some((key) => !allowed.includes(key))
              )
                throw new Error("Invalid presenter view model");
              metadata.push({
                label: presenter.label,
                placement: presenter.placement,
                value: JSON.parse(JSON.stringify(value)) as PresenterValue,
              });
            }
          } catch (error) {
            throw new DocBaseError(4, [
              diagnostic(
                "DBX001",
                `Presenter ${presenter.key} failed: ${String(error)}`,
              ),
            ]);
          }
      const relationships = graph
        .filter(
          (edge) =>
            edge.from === doc.key &&
            config.relationships[edge.type].showOnPage !== false,
        )
        .flatMap((edge) => {
          const target = parsed.get(edge.to)!.document;
          return visible(target, audience)
            ? [
                {
                  label: config.relationships[edge.type].label,
                  url: url(target),
                  title: edge.label ?? target.title,
                },
              ]
            : [];
        });
      let compiledFormat = doc.format;
      walk(tree, (node) => {
        if (node.type.startsWith("mdx")) compiledFormat = "mdx";
      });
      pages.push({
        key: doc.key,
        url: url(doc),
        route: doc.slug,
        title: doc.title,
        description: doc.description,
        markdown: stringifyContent(tree, compiledFormat),
        format: compiledFormat,
        headings: pageHeadings,
        draft: parsed.get(doc.key)!.frontmatter.draft ?? false,
        relationships,
        metadata,
      });
      if (
        config.search.enabled &&
        !doc.search.exclude &&
        !parsed.get(doc.key)!.frontmatter.draft
      )
        search.push({
          key: doc.key,
          url: url(doc),
          title: doc.title,
          description: doc.description,
          headings: pageHeadings.filter(
            (heading) =>
              heading.level <= config.search.maxHeadingDepth &&
              (config.search.indexEmbeds ||
                (() => {
                  let embedded = false;
                  walk(tree, (node) => {
                    if (
                      node.type === "heading" &&
                      node.headingId === heading.id
                    )
                      embedded = !!node.embedded;
                  });
                  return !embedded;
                })()),
          ),
          bodyText: config.search.indexBody
            ? textContent(tree, true, !config.search.indexEmbeds)
                .replace(/\s+/g, " ")
                .trim()
            : undefined,
          tags: [...doc.tags],
          sourceId: doc.sourceId,
          audience,
          boost: doc.search.boost,
          metadata: Object.fromEntries(
            metadata.map((item) => [item.label, item.value]),
          ),
        });
    }
    const projectedDocuments = documents.filter((doc) =>
      visible(doc, audience),
    );
    const nav = navigation(
      config,
      projectedDocuments,
      audience,
      url,
      (ref) => resolve(ref, undefined, undefined, false),
      diagnostics,
      documents,
    );
    const redirects: Array<{ from: string; to: string }> = [];
    const occupied = new Set(pages.map((page) => routeIdentity(page.url)));
    for (const doc of projectedDocuments)
      for (const redirect of doc.redirects) {
        if (!redirect.startsWith(config.site.baseUrl)) {
          report(
            "DBU130",
            `Redirect ${redirect} is outside base ${config.site.baseUrl}`,
            doc,
            undefined,
            "error",
            false,
          );
          continue;
        }
        const from = routeUrl(
          baseUrl,
          redirect.slice(config.site.baseUrl.length),
          config.site.trailingSlash,
        );
        const identity = routeIdentity(from);
        if (
          occupied.has(identity) ||
          ["_astro", "_doc-base", "_audience"].includes(
            foldCase(
              normalizeRoute(redirect.slice(config.site.baseUrl.length)).split(
                "/",
              )[0],
            ),
          )
        ) {
          report(
            "DBU130",
            `Redirect collision at ${from}`,
            doc,
            undefined,
            "error",
            false,
          );
          continue;
        }
        occupied.add(identity);
        redirects.push({ from, to: url(doc) });
      }
    projections.push({
      audience,
      baseUrl,
      pages,
      navigation: nav,
      search,
      redirects: redirects.sort((a, b) => compare(a.from, b.from)),
    });
  }
  options.signal?.throwIfAborted();
  const unique = [
    ...new Map(diagnostics.map((item) => [stableJson(item), item])).values(),
  ];
  const finalDiagnostics = applySuppressions(
    unique,
    suppressions,
    new Set([...CORE_CODES, ...extensions.rules.map((rule) => rule.code)]),
  );
  for (const item of finalDiagnostics) {
    item.message = redact(item.message);
    if (item.help) item.help = redact(item.help);
    for (const related of item.related ?? [])
      related.message = redact(related.message);
  }
  const ok = passes(
    finalDiagnostics,
    options.strict ? "warning" : config.validation.failOn,
  );
  const manifest: Compilation["manifest"] = {
    schemaVersion: 1,
    docBaseVersion: VERSION,
    configFingerprint: hash(stableJson(config)),
    createdAt: new Date().toISOString(),
    selectedAudiences: selected
      .filter((id): id is string => id !== null)
      .sort(compare),
    sources: sources.map(
      ({ id, type, revision, requestedRef, overridden, override }) => ({
        id,
        type,
        revision,
        requestedRef,
        overridden,
        override,
      }),
    ),
    extensions: extensions.versions.sort((a, b) =>
      compare(a.package, b.package),
    ),
    documents: documents.map((doc) => ({
      key: doc.key,
      sourcePath: doc.sourcePath,
      urlByAudience: Object.fromEntries(
        projections.map((projection) => [
          projection.audience ?? "default",
          projection.pages.find((page) => page.key === doc.key)?.url ?? null,
        ]),
      ),
      contentHash: hash(parsed.get(doc.key)!.body),
    })),
    redirects: projections
      .flatMap((projection) => projection.redirects)
      .sort((a, b) => compare(a.from, b.from)),
    outputFingerprint: "",
  };
  return {
    ...loaded,
    schemaVersion: 1,
    documents,
    sources,
    projections,
    diagnostics: finalDiagnostics,
    ok,
    assets,
    manifest,
  };
}
