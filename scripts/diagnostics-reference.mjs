import { readFile, writeFile } from "node:fs/promises";
import { format } from "prettier";
import { DIAGNOSTIC_CATALOG } from "@doc-base/schema";
const rows = Object.entries(DIAGNOSTIC_CATALOG)
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(
    ([code, entry]) =>
      `| ${code} | ${entry.severity} | ${entry.suppressible ? "yes" : "no"} | ${entry.cause} | ${entry.fix} |`,
  );
const text = await format(
  "---\nid: diagnostics\ntitle: Diagnostic catalog\norder: 8\n---\n\nCodes are stable public contracts. Strict mode changes the failure threshold while preserving the recorded severity. Reference errors may become warnings when strictRefs is disabled. Suppressed diagnostics remain visible in JSON. Extension rule codes use registered DBX allocations; DBX001 is reserved for extension infrastructure failures.\n\n| Code | Default severity | Suppressible | Cause | Fix |\n| --- | --- | --- | --- | --- |\n" +
    rows.join("\n") +
    "\n",
  { parser: "markdown" },
);
if (process.argv.includes("--check")) {
  if ((await readFile("docs/diagnostics.md", "utf8")) !== text)
    throw new Error(
      "Diagnostic reference is out of date. Run npm run docs:reference.",
    );
} else await writeFile("docs/diagnostics.md", text);
