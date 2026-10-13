import { format } from "prettier";
import { readFile, writeFile } from "node:fs/promises";
const reference = [];
for (const name of ["doc-base", "frontmatter"]) {
  const schema = JSON.parse(
    await readFile(`schemas/${name}.schema.json`, "utf8"),
  );
  const rows = [];
  function visit(node, prefix = "", seen = new Set()) {
    for (const [key, property] of Object.entries(node.properties ?? {})) {
      const field = prefix ? `${prefix}.${key}` : key;
      const type = property.$ref
        ? property.$ref.replace("#/$defs/", "")
        : property.enum
          ? property.enum.join(" / ")
          : property.const !== undefined
            ? JSON.stringify(property.const)
            : (property.type ??
              (property.oneOf ? "one of the alternatives" : "value"));
      rows.push(
        `| \`${field}\` | ${String(type).replaceAll("|", "\\|")} | ${(node.required ?? []).includes(key) ? "yes" : "no"} | ${property.default === undefined ? "—" : "`" + JSON.stringify(property.default) + "`"} |`,
      );
      if (property.properties) visit(property, field, seen);
      if (property.items?.properties) visit(property.items, field + "[]", seen);
    }
  }
  visit(schema);
  reference.push(
    `## ${name === "doc-base" ? "Configuration" : "Frontmatter"}\n\nSchema: <${schema.$id}>\n\n| Field | Type or values | Required | Default annotation |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`,
  );
  for (const [name, definition] of Object.entries(schema.$defs ?? {})) {
    rows.length = 0;
    visit(definition, name);
    for (const variant of definition.oneOf ?? []) visit(variant, name);
    if (rows.length)
      reference.push(
        `### ${name}\n\n| Field | Type or values | Required | Default annotation |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`,
      );
  }
}
const content =
  "---\nid: schema-reference\ntitle: Schema reference\norder: 7\n---\n\nGenerated from the shipped JSON Schemas. Defaults are schema annotations; behavioral and cross-field rules are described in the [configuration guide](doc:configuration).\n\n" +
  reference.join("\n");
const formatted = await format(content, { parser: "markdown" });
if (process.argv.includes("--check")) {
  if ((await readFile("docs/schema-reference.md", "utf8")) !== formatted)
    throw new Error(
      "Schema reference is out of date. Run npm run docs:reference.",
    );
} else await writeFile("docs/schema-reference.md", formatted);
