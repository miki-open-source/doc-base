import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { VERSION, stableJson } from "@doc-base/schema";
let fingerprint: Promise<string> | undefined;
export function parserVersion(): Promise<string> {
  return (fingerprint ??= (async () => {
    const versions: Record<string, string> = { docBase: VERSION };
    for (const name of [
      "unified",
      "remark-parse",
      "remark-mdx",
      "remark-directive",
      "remark-gfm",
      "remark-stringify",
      "github-slugger",
    ]) {
      let directory = path.dirname(fileURLToPath(import.meta.resolve(name)));
      while (path.dirname(directory) !== directory) {
        try {
          const pkg = JSON.parse(
            await readFile(path.join(directory, "package.json"), "utf8"),
          ) as { name: string; version: string };
          if (pkg.name === name) {
            versions[name] = pkg.version;
            break;
          }
        } catch {
          /* Search package parents. */
        }
        directory = path.dirname(directory);
      }
      if (!versions[name])
        throw new Error(`Parser package version unavailable: ${name}`);
    }
    return stableJson(versions);
  })());
}
