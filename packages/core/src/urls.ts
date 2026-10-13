import { DocBaseError, diagnostic, foldCase } from "@doc-base/schema";
export function normalizeRoute(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value.replace(/\\/g, "/")).normalize("NFC");
  } catch {
    throw new DocBaseError(1, [diagnostic("DBU100", "Invalid URL encoding")]);
  }
  if (
    /[?#]/.test(decoded) ||
    [...decoded].some((char) => char.charCodeAt(0) < 32) ||
    /%2f|%5c/i.test(value) ||
    decoded.split("/").some((part) => part === "." || part === "..")
  )
    throw new DocBaseError(1, [diagnostic("DBU100", `Invalid route ${value}`)]);
  return decoded.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}
export function routeUrl(
  base: string,
  route: string,
  trailing: "always" | "never" | "ignore",
): string {
  const encoded = normalizeRoute(route)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const url = base + encoded;
  return trailing === "always"
    ? url.replace(/\/?$/, "/")
    : trailing === "never" && url !== "/"
      ? url.replace(/\/$/, "")
      : trailing === "ignore" && route.endsWith("/")
        ? url.replace(/\/?$/, "/")
        : url;
}
export const routeIdentity = (url: string): string =>
  foldCase(normalizeRoute(url));
