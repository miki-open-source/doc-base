import { readFile, writeFile, mkdir } from "node:fs/promises";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const entries = Object.entries(lock.packages)
  .filter(([name, pkg]) => name.includes("node_modules") && !pkg.link)
  .map(([name, pkg]) => ({ name, version: pkg.version, license: pkg.license }));
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
