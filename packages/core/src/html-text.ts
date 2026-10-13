import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";
type HtmlNode =
  ReturnType<typeof fromHtml> | ReturnType<typeof fromHtml>["children"][number];
export function htmlText(value: string): string {
  const text = (node: HtmlNode): string => {
    if (
      node.type === "element" &&
      ["script", "style", "pre"].includes(node.tagName)
    )
      return "";
    if (node.type === "text") return node.value;
    return "children" in node
      ? node.children.map((child) => text(child)).join(" ")
      : "";
  };
  return text(fromHtml(value, { fragment: true }));
}
export function mdxCompatibleHtml(value: string): string {
  const trimmed = value.trim();
  if (
    /^<(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)(?:\s|\/?>)/i.test(
      trimmed,
    ) ||
    /^<([a-z][a-z0-9-]*)\b[\s\S]*<\/\1>$/i.test(trimmed)
  )
    return toHtml(fromHtml(value, { fragment: true }), {
      closeSelfClosing: true,
    });
  if (/^<!--[\s\S]*-->$/.test(trimmed)) return "";
  return value;
}
