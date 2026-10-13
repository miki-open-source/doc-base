import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import GithubSlugger from "github-slugger";
import { htmlText, mdxCompatibleHtml } from "./html-text.js";
import { DocBaseError, diagnostic } from "@doc-base/schema";
import type { HeadingRecord, Position } from "@doc-base/schema";
export interface ContentNode {
  type: string;
  value?: string;
  url?: string;
  depth?: number;
  name?: string;
  attributes?: Record<string, string | null>;
  children?: ContentNode[];
  position?: { start: Position; end: Position };
  data?: Record<string, unknown>;
  owner?: string;
  embedded?: boolean;
  embedStack?: string[];
  headingId?: string;
  embedInstance?: string;
  [key: string]: unknown;
}
export function parser(format: "md" | "mdx") {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkStringify);
  if (format === "mdx") processor.use(remarkMdx);
  return processor;
}
export function parseContent(
  body: string,
  format: "md" | "mdx",
  owner: string,
  lineOffset: number,
): ContentNode {
  let fence: string | undefined;
  for (const [index, line] of body.split("\n").entries()) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker[0];
      else if (marker[0] === fence) fence = undefined;
      continue;
    }
    if (!fence && /^\s*::doc-embed/.test(line) && /\b\w+=\{/.test(line))
      throw new DocBaseError(1, [
        diagnostic("DBE110", "Dynamic doc-embed attributes are unsupported", {
          documentKey: owner,
          range: {
            start: { line: lineOffset + index + 1, column: 1 },
            end: { line: lineOffset + index + 1, column: line.length + 1 },
          },
        }),
      ]);
  }
  const root = parser(format).parse(body) as unknown as ContentNode;
  const definitions = new Map<string, ContentNode>();
  walk(root, (node) => {
    if (node.type === "definition")
      definitions.set(String(node.identifier).toLowerCase(), node);
  });
  walk(root, (node) => {
    if (node.type === "linkReference" || node.type === "imageReference") {
      const definition = definitions.get(String(node.identifier).toLowerCase());
      if (definition) {
        node.type = node.type === "linkReference" ? "link" : "image";
        node.url = definition.url;
        node.title = definition.title;
        delete node.identifier;
        delete node.referenceType;
        delete node.label;
      }
    }
  });
  root.children = root.children?.filter((node) => node.type !== "definition");
  walk(root, (node) => {
    node.owner = owner;
    if (node.position) {
      node.position.start.line += lineOffset;
      node.position.end.line += lineOffset;
    }
  });
  headings(root);
  return root;
}
export function stringifyContent(
  root: ContentNode,
  format: "md" | "mdx",
): string {
  if (format === "mdx")
    walk(root, (node) => {
      if (node.type === "html" && node.value)
        node.value = mdxCompatibleHtml(node.value);
    });
  return parser(format).stringify(root as never);
}
export function walk(
  node: ContentNode,
  visit: (node: ContentNode) => void,
): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}
export interface StaticUrlAttribute {
  name: string;
  value: string;
}
export function staticUrlAttributes(node: ContentNode): StaticUrlAttribute[] {
  if (!node.type.startsWith("mdxJsx") || !Array.isArray(node.attributes))
    return [];
  return (
    node.attributes as unknown as Array<{ name?: string; value?: unknown }>
  ).filter(
    (attribute): attribute is StaticUrlAttribute =>
      typeof attribute.name === "string" &&
      ["src", "href", "poster"].includes(attribute.name) &&
      typeof attribute.value === "string",
  );
}
export function logicalReferences(node: ContentNode): string[] {
  const urls = node.type === "link" && node.url ? [node.url] : [];
  urls.push(
    ...staticUrlAttributes(node)
      .filter((attribute) => attribute.name === "href")
      .map((attribute) => attribute.value),
  );
  if (node.type === "html")
    for (const match of (node.value ?? "").matchAll(
      /\bhref\s*=\s*["']([^"']+)["']/gi,
    ))
      urls.push(match[1]);
  return urls
    .filter((url) => url.startsWith("doc:"))
    .map((url) => url.slice(4));
}
export function textContent(
  node: ContentNode,
  excludeCode = false,
  excludeEmbeds = false,
): string {
  if (
    (excludeEmbeds && node.embedded) ||
    (excludeCode &&
      ["code", "mdxjsEsm", "mdxTextExpression", "mdxFlowExpression"].includes(
        node.type,
      ))
  )
    return "";
  if (node.type === "html") return htmlText(node.value ?? "");
  return (
    node.value ??
    (node.children ?? [])
      .map((child) => textContent(child, excludeCode, excludeEmbeds))
      .join(
        node.type === "paragraph" ||
          node.type === "heading" ||
          node.type === "link"
          ? ""
          : " ",
      )
  );
}
export function headings(root: ContentNode): HeadingRecord[] {
  const slugger = new GithubSlugger();
  const records: HeadingRecord[] = [];
  walk(root, (node) => {
    if (node.type === "heading") {
      const text = textContent(node);
      node.headingId ||= slugger.slug(text);
      records.push({ id: node.headingId, text, level: node.depth! });
    }
  });
  return records;
}
