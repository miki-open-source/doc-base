import { mkdir, writeFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../git-fixture");
await mkdir(path.join(root, "docs"), { recursive: true });
await writeFile(
  path.join(root, "docs/api.md"),
  "---\nid: api\ntitle: API reference\n---\n\n## Requests\n\nSend a request to the example API.\n\n## Responses\n\nResponses use JSON.\n",
);
try {
  await access(path.join(root, ".git"));
} catch {
  execFileSync("git", ["init", "-b", "main"], { cwd: root });
}
execFileSync("git", ["add", "docs"], { cwd: root });
try {
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Example",
      "-c",
      "user.email=example@example.invalid",
      "commit",
      "-m",
      "Add neutral documentation",
    ],
    { cwd: root, stdio: "pipe" },
  );
} catch (error) {
  if (!String(error.stdout).includes("nothing to commit")) throw error;
}
