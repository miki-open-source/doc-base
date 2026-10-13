import {
  readFile,
  readdir,
  mkdtemp,
  mkdir,
  writeFile,
  rm,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
const cli = path.resolve("packages/cli/dist/index.js");
let count = 0;
for (const file of await readdir("docs"))
  if (/\.mdx?$/.test(file)) {
    const text = await readFile(path.join("docs", file), "utf8");
    for (const match of text.matchAll(/```yaml runnable\n([\s\S]*?)\n```/g)) {
      const directory = await mkdtemp(
        path.join(tmpdir(), "doc-base-doc-example-"),
      );
      try {
        await mkdir(path.join(directory, "docs"));
        await writeFile(
          path.join(directory, "docs/index.md"),
          "---\nid: welcome\ntitle: Welcome\n---\nExample documentation.\n",
        );
        await writeFile(path.join(directory, "doc-base.yaml"), match[1]);
        execFileSync(
          process.execPath,
          [cli, "validate", "--config", path.join(directory, "doc-base.yaml")],
          { stdio: "inherit" },
        );
        count++;
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  }
if (!count) throw new Error("No runnable configuration examples found");
console.log(`Validated ${count} runnable configuration examples.`);
