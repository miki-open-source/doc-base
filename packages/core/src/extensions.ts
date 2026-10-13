import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve as resolveModule } from "import-meta-resolve";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DocBaseError, diagnostic, type Config } from "@doc-base/schema";
import type {
  DocBaseExtensionV1,
  ValidationRuleV1,
  MetadataPresenterV1,
} from "@doc-base/extension-api";
import { ajv } from "./config.js";
export async function loadExtensions(
  config: Readonly<Config>,
  projectDir: string,
): Promise<{
  rules: ValidationRuleV1[];
  presenters: MetadataPresenterV1[];
  versions: Array<{ package: string; version: string; apiVersion: "1" }>;
}> {
  const rules: ValidationRuleV1[] = [];
  const presenters: MetadataPresenterV1[] = [];
  const versions: Array<{ package: string; version: string; apiVersion: "1" }> =
    [];
  const parentUrl = pathToFileURL(path.join(projectDir, "package.json")).href;
  for (const entry of config.extensions)
    try {
      const resolvedUrl = resolveModule(entry.package, parentUrl);
      const resolved = fileURLToPath(resolvedUrl);
      const definition = (
        (await import(resolvedUrl)) as {
          default: DocBaseExtensionV1;
        }
      ).default;
      if (
        definition?.apiVersion !== "1" ||
        typeof definition.setup !== "function"
      )
        throw new Error("Unsupported extension API");
      if (definition.optionsSchema) {
        const validate = ajv.compile(definition.optionsSchema);
        if (!validate(entry.options ?? {}))
          throw new Error(ajv.errorsText(validate.errors));
      } else if (Object.keys(entry.options ?? {}).length)
        throw new Error("Extension accepts no options");
      let directory = path.dirname(resolved);
      let version: string | undefined;
      while (path.dirname(directory) !== directory) {
        try {
          const pkg = JSON.parse(
            await readFile(path.join(directory, "package.json"), "utf8"),
          ) as { name?: string; version?: string };
          if (pkg.name === entry.package) {
            version = pkg.version;
            break;
          }
        } catch {
          /* Continue to the package root. */
        }
        directory = path.dirname(directory);
      }
      if (!version) throw new Error("Package version is unavailable");
      await definition.setup(
        {
          validation: {
            registerRule(rule) {
              if (
                !/^DBX\d{3}$/.test(rule.code) ||
                rule.code === "DBX001" ||
                !["error", "warning", "info"].includes(rule.defaultSeverity) ||
                typeof rule.description !== "string" ||
                typeof rule.run !== "function" ||
                rules.some((item) => item.code === rule.code)
              )
                throw new Error("Invalid or duplicate rule code");
              rules.push(rule);
            },
          },
          metadata: {
            registerPresenter(presenter) {
              if (
                !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(presenter.key) ||
                typeof presenter.label !== "string" ||
                !["header", "footer", "sidebar"].includes(
                  presenter.placement,
                ) ||
                typeof presenter.present !== "function" ||
                presenters.some((item) => item.key === presenter.key)
              )
                throw new Error("Duplicate metadata presenter");
              presenters.push(presenter);
            },
          },
        },
        entry.options ?? {},
      );
      versions.push({ package: entry.package, version, apiVersion: "1" });
    } catch (error) {
      throw new DocBaseError(4, [
        diagnostic(
          "DBX001",
          `Extension ${entry.package}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ]);
    }
  return { rules, presenters, versions };
}
