import { caseFold } from "unicode-case-folding";
export const VERSION = "1.0.0";
export type Severity = "error" | "warning" | "info";
export interface Position {
  line: number;
  column: number;
}
export interface Diagnostic {
  code: string;
  severity: Severity;
  message: string;
  sourceId?: string;
  file?: string;
  range?: { start: Position; end: Position };
  documentKey?: string;
  related?: Array<{
    message: string;
    sourceId?: string;
    file?: string;
    range?: Diagnostic["range"];
  }>;
  help?: string;
  suppressible: boolean;
  suppressedBy?: { scope: "document" | "project"; reason: string };
}
export const DIAGNOSTIC_CATALOG = freeze({
  DBC001: {
    severity: "error",
    suppressible: false,
    cause: "Configuration or YAML cannot be parsed.",
    fix: "Fix the located YAML error or provide an existing configuration file.",
  },
  DBC002: {
    severity: "error",
    suppressible: false,
    cause: "Configuration violates its JSON Schema.",
    fix: "Remove unknown fields and use the documented field types.",
  },
  DBC003: {
    severity: "error",
    suppressible: false,
    cause: "Cross-field configuration or package compatibility is invalid.",
    fix: "Use configured audience/inverse IDs and supported package versions.",
  },
  DBC010: {
    severity: "error",
    suppressible: false,
    cause: "Command-line or environment settings are invalid.",
    fix: "Check command help, flag combinations, and override syntax.",
  },
  DBC012: {
    severity: "error",
    suppressible: false,
    cause: "A local overlay contains a forbidden field.",
    fix: "Keep only allowlisted machine-local settings in the overlay.",
  },
  DBS100: {
    severity: "error",
    suppressible: false,
    cause: "A source or content directory is unavailable.",
    fix: "Provide an existing readable source and content directory.",
  },
  DBS110: {
    severity: "error",
    suppressible: false,
    cause: "A Git operation failed.",
    fix: "Check Git, the repository/ref, and credential helpers.",
  },
  DBS120: {
    severity: "error",
    suppressible: false,
    cause: "A lockfile or required cache entry is unavailable or mismatched.",
    fix: "Fetch online and commit the intended source lock before frozen/offline use.",
  },
  DBS130: {
    severity: "error",
    suppressible: false,
    cause: "A source, symlink, or asset escapes its source root.",
    fix: "Keep content and referenced assets within the source root.",
  },
  DBS140: {
    severity: "error",
    suppressible: false,
    cause: "Source bytes changed repeatedly during snapshotting.",
    fix: "Stop concurrent source writes and retry validation.",
  },
  DBF100: {
    severity: "error",
    suppressible: false,
    cause: "Frontmatter is missing or violates its schema.",
    fix: "Provide a valid stable ID, title, and supported metadata.",
  },
  DBF110: {
    severity: "error",
    suppressible: false,
    cause: "Document identities collide.",
    fix: "Assign distinct IDs, including after ASCII case folding.",
  },
  DBF120: {
    severity: "error",
    suppressible: false,
    cause: "Source paths collide after case or Unicode normalization.",
    fix: "Rename the colliding files to portable distinct paths.",
  },
  DBF130: {
    severity: "error",
    suppressible: false,
    cause: "Markdown, MDX, or UTF-8 content cannot be parsed.",
    fix: "Fix the located syntax or encoding error.",
  },
  DBR100: {
    severity: "error",
    suppressible: true,
    cause: "A logical or relative document reference is unresolved.",
    fix: "Use the stable ID of an included non-draft document.",
  },
  DBR110: {
    severity: "error",
    suppressible: true,
    cause: "An unqualified reference has multiple candidates.",
    fix: "Qualify the reference with its source ID.",
  },
  DBR120: {
    severity: "error",
    suppressible: true,
    cause: "A referenced heading fragment does not exist.",
    fix: "Use the normalized generated heading ID.",
  },
  DBR130: {
    severity: "error",
    suppressible: true,
    cause: "A relationship type is undeclared.",
    fix: "Declare the relationship vocabulary in configuration.",
  },
  DBE100: {
    severity: "error",
    suppressible: true,
    cause: "An embed target requires module-scope MDX state.",
    fix: "Move reusable Markdown content into a target without imports or exports.",
  },
  DBE110: {
    severity: "error",
    suppressible: true,
    cause: "An embed directive is dynamic or structurally invalid.",
    fix: "Use a standalone leaf directive with supported static attributes.",
  },
  DBE120: {
    severity: "error",
    suppressible: true,
    cause: "The requested embed section does not exist.",
    fix: "Choose an existing section heading fragment.",
  },
  DBE200: {
    severity: "error",
    suppressible: false,
    cause: "Recursive embeds contain a cycle.",
    fix: "Break the reported document/section cycle.",
  },
  DBE210: {
    severity: "error",
    suppressible: false,
    cause: "Recursive embedding exceeds the configured depth.",
    fix: "Reduce nesting or deliberately increase maxDepth.",
  },
  DBE230: {
    severity: "warning",
    suppressible: true,
    cause: "A heading offset exceeds heading level six.",
    fix: "Reduce the offset or nesting depth.",
  },
  DBE240: {
    severity: "error",
    suppressible: false,
    cause: "Expanded headings collide under the error policy.",
    fix: "Use distinct headings or the prefix collision policy.",
  },
  DBA100: {
    severity: "error",
    suppressible: false,
    cause: "Audience metadata names an unknown audience.",
    fix: "Declare the audience or remove the invalid restriction.",
  },
  DBA120: {
    severity: "info",
    suppressible: true,
    cause: "An embed is filtered from broader audience projections.",
    fix: "Review the host, target, and directive audience intersection.",
  },
  DBA210: {
    severity: "warning",
    suppressible: true,
    cause: "A visible page links to a target hidden in that projection.",
    fix: "Restrict the containing content equally or remove the cross-audience link.",
  },
  DBN100: {
    severity: "warning",
    suppressible: true,
    cause: "Native navigation cannot guarantee audience-specific sidebars.",
    fix: "Configure doc-base navigation when those guarantees are needed.",
  },
  DBN110: {
    severity: "error",
    suppressible: false,
    cause: "Autogenerated navigation selects an invalid source or directory.",
    fix: "Use an existing source and a source-content-relative directory.",
  },
  DBN200: {
    severity: "error",
    suppressible: false,
    cause: "An explicit navigation target is missing or ambiguous.",
    fix: "Use a unique or qualified stable document ID.",
  },
  DBN210: {
    severity: "error",
    suppressible: false,
    cause: "A document appears more than once in a navigation projection.",
    fix: "Remove the duplicate entry or overlapping autogeneration.",
  },
  DBN220: {
    severity: "warning",
    suppressible: true,
    cause: "A visible page is omitted from strict navigation.",
    fix: "Add navigation coverage or disable strictNavigation deliberately.",
  },
  DBN230: {
    severity: "error",
    suppressible: false,
    cause: "Documents in one directory specify conflicting group labels.",
    fix: "Use one nav.group value for that source directory.",
  },
  DBU100: {
    severity: "error",
    suppressible: false,
    cause: "A route contains invalid encoding or path segments.",
    fix: "Use a portable URL path without traversal, queries, or fragments.",
  },
  DBU110: {
    severity: "error",
    suppressible: false,
    cause: "A document uses a reserved output prefix.",
    fix: "Choose a route outside reserved infrastructure prefixes.",
  },
  DBU120: {
    severity: "error",
    suppressible: false,
    cause: "Canonical document routes collide.",
    fix: "Choose distinct normalized slugs or route prefixes.",
  },
  DBU130: {
    severity: "error",
    suppressible: false,
    cause:
      "A redirect conflicts, escapes the base, or output would overwrite content.",
    fix: "Use a unique redirect under the base and an owned output directory.",
  },
  DBU140: {
    severity: "error",
    suppressible: true,
    cause: "A referenced local asset is missing or invalid.",
    fix: "Provide the source-relative asset and correct its URL.",
  },
  DBV100: {
    severity: "error",
    suppressible: false,
    cause:
      "Generated inputs, output verification, or an internal operation failed.",
    fix: "Inspect the error, run doctor, and report a minimal reproduction if needed.",
  },
  DBV240: {
    severity: "warning",
    suppressible: true,
    cause: "A relative documentation link is coupled to a file path.",
    fix: "Replace it with a logical doc: link.",
  },
  DBV901: {
    severity: "error",
    suppressible: false,
    cause: "A diagnostic suppression has expired.",
    fix: "Fix the diagnostic or review and renew the audit record.",
  },
  DBV902: {
    severity: "error",
    suppressible: false,
    cause: "A suppression names an unknown diagnostic code.",
    fix: "Use a code from this catalog or a registered extension rule.",
  },
  DBV903: {
    severity: "warning",
    suppressible: true,
    cause: "A suppression matches no suppressible diagnostic.",
    fix: "Remove the obsolete suppression.",
  },
  DBX001: {
    severity: "error",
    suppressible: false,
    cause: "Extension loading, registration, options, or execution failed.",
    fix: "Use API major one, valid options, unique registrations, and supported view models.",
  },
} as const);
export class DocBaseError extends Error {
  constructor(
    public readonly exitCode: number,
    public readonly diagnostics: Diagnostic[],
  ) {
    super(diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"));
    this.name = "DocBaseError";
  }
}
export function diagnostic(
  code: string,
  message: string,
  details: Partial<Diagnostic> = {},
): Diagnostic {
  const definition =
    DIAGNOSTIC_CATALOG[code as keyof typeof DIAGNOSTIC_CATALOG];
  const publicRange = (range: Diagnostic["range"]): Diagnostic["range"] =>
    range
      ? {
          start: { line: range.start.line, column: range.start.column },
          end: { line: range.end.line, column: range.end.column },
        }
      : undefined;
  return {
    ...details,
    range: publicRange(details.range),
    related: details.related?.map((item) => ({
      ...item,
      range: publicRange(item.range),
    })),
    code,
    message,
    severity: details.severity ?? definition?.severity ?? "error",
    suppressible: details.suppressible ?? definition?.suppressible ?? false,
    help: details.help ?? definition?.fix,
  };
}
export const foldCase = (value: string): string =>
  caseFold(value.normalize("NFC")).normalize("NFC");
export function compare(a: string, b: string): number {
  let left = 0;
  let right = 0;
  while (left < a.length && right < b.length) {
    const x = a.codePointAt(left)!;
    const y = b.codePointAt(right)!;
    if (x !== y) return x - y;
    left += x > 0xffff ? 2 : 1;
    right += y > 0xffff ? 2 : 1;
  }
  return left < a.length ? 1 : right < b.length ? -1 : 0;
}
export function stableJson(value: unknown): string {
  return (
    JSON.stringify(
      value,
      (_, item: unknown) => {
        if (item && typeof item === "object" && !Array.isArray(item))
          return Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => compare(a, b)),
          );
        return item;
      },
      2,
    ) + "\n"
  );
}
export function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
export interface Suppression {
  code: string;
  reason: string;
  path?: string;
  source?: string;
  expires?: string;
}
export interface SourceConfig {
  type: "local" | "git";
  path?: string;
  repository?: string;
  ref?: string;
  content: string;
  include: string[];
  exclude: string[];
  routePrefix: string;
}
export type NavigationItem = { audiences?: string[] } & (
  | { doc: string; label?: string }
  | { group: string; items: NavigationItem[]; collapsed?: boolean }
  | { autogenerate: { source: string; directory: string } }
  | { link: { label: string; href: string } }
);
export interface Config {
  schemaVersion: 1;
  site: {
    title: string;
    description?: string;
    baseUrl: string;
    outputDir: string;
    trailingSlash: "always" | "never" | "ignore";
    defaultAudience?: string;
  };
  sources: Record<string, SourceConfig>;
  audiences: Record<string, { label: string; description?: string }>;
  relationships: Record<
    string,
    { label: string; inverse?: string; showOnPage?: boolean }
  >;
  navigation?: NavigationItem[];
  search: {
    enabled: boolean;
    indexBody: boolean;
    indexEmbeds: boolean;
    maxHeadingDepth: number;
  };
  validation: {
    failOn: "error" | "warning" | "never";
    strictRefs: boolean;
    strictNavigation: boolean;
    suppressions: Suppression[];
  };
  embeds: { maxDepth: number; duplicateHeadingIds: "prefix" | "error" };
  cache: { directory: string; maxAge: string };
  extensions: Array<{ package: string; options?: Record<string, unknown> }>;
  development: { host: string; port: number; open: boolean };
}
export interface Frontmatter {
  id: string;
  title: string;
  description?: string;
  slug?: string;
  audiences?: string[];
  tags?: string[];
  order?: number;
  nav?: { label?: string; hidden?: boolean; group?: string };
  relationships?: Relationship[];
  redirects?: string[];
  search?: { exclude?: boolean; boost?: number };
  metadata?: Record<string, unknown>;
  validation?: { suppress?: Suppression[] };
  draft?: boolean;
}
export interface Relationship {
  type: string;
  target: string;
  label?: string;
}
export interface Provenance {
  sourceId: string;
  sourcePath: string;
  revision: string;
}
export interface HeadingRecord {
  id: string;
  text: string;
  level: number;
}
export interface DocumentRecord {
  key: string;
  id: string;
  sourceId: string;
  sourceRevision: string;
  sourcePath: string;
  format: "md" | "mdx";
  title: string;
  description?: string;
  slug: string;
  url: string;
  audiences: readonly string[] | null;
  tags: readonly string[];
  relationships: readonly Relationship[];
  redirects: readonly string[];
  nav: { label: string; hidden: boolean; group?: string; order?: number };
  search: { exclude: boolean; boost: number };
  customMetadata: Readonly<Record<string, unknown>>;
  headings: readonly HeadingRecord[];
  ast: unknown;
  provenance: Provenance;
}
export interface SourceSnapshot {
  id: string;
  type: "local" | "git";
  revision: string;
  requestedRef?: string;
  overridden: boolean;
  override?: { ref?: string; path?: string };
  root: string;
  contentRoot: string;
  gitFiles?: ReadonlyMap<string, { oid: string; mode: string }>;
  files: ReadonlyMap<string, Uint8Array>;
  documents: readonly string[];
  exclusions?: readonly {
    sourcePath: string;
    reason: "include" | "exclude" | "content-root";
  }[];
}
export interface RunOptions {
  signal?: AbortSignal;
  config?: string;
  localConfig?: string;
  noLocalConfig?: boolean;
  sourceRef?: string[];
  sourcePath?: string[];
  audience?: string;
  offline?: boolean;
  refresh?: boolean;
  frozenLockfile?: boolean;
  strict?: boolean;
  excludeDrafts?: boolean;
  dev?: boolean;
  json?: boolean;
  logLevel?: string;
  noColor?: boolean;
  sourceOverrides?: Record<string, { ref?: string; path?: string }>;
}
export interface SearchRecord {
  key: string;
  url: string;
  title: string;
  description?: string;
  headings: HeadingRecord[];
  bodyText?: string;
  tags: string[];
  sourceId: string;
  audience: string | null;
  boost: number;
  metadata?: Record<string, unknown>;
}
export interface NavEntry {
  label: string;
  link?: string;
  items?: NavEntry[];
  collapsed?: boolean;
}
export interface PageOutput {
  key: string;
  url: string;
  route: string;
  title: string;
  description?: string;
  markdown: string;
  format: "md" | "mdx";
  headings: HeadingRecord[];
  draft: boolean;
  relationships: Array<{ label: string; url: string; title: string }>;
  metadata: Array<{ label: string; placement: string; value: PresenterValue }>;
}
export type PresenterValue =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "list"; items: string[] };
export interface Projection {
  audience: string | null;
  baseUrl: string;
  pages: PageOutput[];
  navigation: NavEntry[];
  search: SearchRecord[];
  redirects: Array<{ from: string; to: string }>;
}
export interface BuildManifestV1 {
  schemaVersion: 1;
  docBaseVersion: string;
  configFingerprint: string;
  createdAt: string;
  selectedAudiences: string[];
  sources: Array<{
    id: string;
    type: "local" | "git";
    requestedRef?: string;
    revision: string;
    overridden: boolean;
    override?: { ref?: string; path?: string };
  }>;
  extensions: Array<{ package: string; version: string; apiVersion: "1" }>;
  documents: Array<{
    key: string;
    sourcePath: string;
    urlByAudience: Record<string, string | null>;
    contentHash: string;
  }>;
  redirects: Array<{ from: string; to: string }>;
  outputFingerprint: string;
}
export interface Compilation {
  schemaVersion: 1;
  config: Readonly<Config>;
  projectDir: string;
  configPath: string;
  options: RunOptions;
  documents: readonly Readonly<DocumentRecord>[];
  sources: SourceSnapshot[];
  projections: Projection[];
  diagnostics: Diagnostic[];
  ok: boolean;
  assets: Map<string, Uint8Array>;
  manifest: BuildManifestV1;
}
