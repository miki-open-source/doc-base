import { writeFile, mkdir } from "node:fs/promises";
import { runPnpm } from "./pnpm.mjs";
const licenses = JSON.parse(
  runPnpm(["licenses", "list", "--recursive", "--json"], { encoding: "utf8" }),
);
const entries = Object.entries(licenses).flatMap(([license, packages]) =>
  packages.flatMap((pkg) =>
    pkg.versions.map((version) => ({ name: pkg.name, version, license })),
  ),
);
const supported = new Set([
  "MIT",
  "ISC",
  "0BSD",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "LGPL-3.0-or-later",
  "MPL-2.0",
  "Python-2.0",
  "CC0-1.0",
  "BlueOak-1.0.0",
  "AND",
  "OR",
]);
const unknown = entries.filter(
  (entry) =>
    !entry.license ||
    entry.license
      .replace(/[()]/g, "")
      .split(/\s+/)
      .some((part) => !supported.has(part)),
);
await mkdir(".artifacts", { recursive: true });
await writeFile(
  ".artifacts/dependency-licenses.json",
  JSON.stringify(entries, null, 2) + "\n",
);
if (unknown.length)
  throw new Error(
    "Unrecognized license declarations: " +
      unknown.map((entry) => entry.name).join(", "),
  );
console.log(`Recorded ${entries.length} dependency license declarations.`);
