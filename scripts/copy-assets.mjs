import { cp, mkdir } from "node:fs/promises";
await mkdir("packages/schema/schemas", { recursive: true });
await cp("schemas", "packages/schema/schemas", { recursive: true });
await mkdir("public/schemas/v1", { recursive: true });
await cp("schemas", "public/schemas/v1", { recursive: true });
for (const name of [
  "schema",
  "core",
  "sources",
  "starlight",
  "extension-api",
  "cli",
]) {
  await cp("LICENSE", `packages/${name}/LICENSE`);
  await cp("README.md", `packages/${name}/README.md`);
}

await cp("LICENSE", "examples/extension/LICENSE");
