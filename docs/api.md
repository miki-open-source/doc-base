---
id: api
title: Library and extension API
order: 6
---

All packages are ESM and expose explicit package exports. The CLI package `doc-base` also re-exports compile, loadConfig, buildSite, generate, and the Config, DocumentRecord, Diagnostic, and Compilation types.

```typescript
import { compile } from "@doc-base/core";
import { buildSite } from "@doc-base/starlight";

const result = await compile(process.cwd(), { frozenLockfile: true });
if (result.ok) await buildSite(result);
```

`compile(cwd, options)` performs configuration, source resolution, parsing, validation, audience projection, navigation, search, and manifest preparation without rendering. Its result contains immutable document records, projections, diagnostics, source snapshots, assets, and the manifest. A failed validation gate returns `ok: false`; configuration, source, and extension failures throw `DocBaseError` with exitCode and diagnostics. Library functions do not exit the process. `RunOptions.signal` supports cancellation.

`@doc-base/schema` supplies public contracts, version, errors, diagnostics, and canonical JSON schemas through `@doc-base/schema/schemas/*.schema.json`. `@doc-base/sources` resolves source snapshots and manages source/cache contracts. `@doc-base/core` owns content semantics and validation. `@doc-base/starlight` exposes generate, buildSite, devSite, assertManifest, and checkCompatibility. `devSite` returns stop and markStale controls. `@doc-base/extension-api` supplies the versioned extension types and defineExtension helper.

## Defining an extension

```typescript
import { defineExtension } from "@doc-base/extension-api";

export default defineExtension({
  apiVersion: "1",
  name: "Example owner metadata",
  setup(api) {
    api.metadata.registerPresenter({
      key: "owner",
      label: "Owner",
      placement: "header",
      present(value) {
        return typeof value === "string" ? { kind: "text", text: value } : null;
      },
    });
  },
});
```

Install the extension package alongside doc-base, then list its name under extensions. Export compiled ESM and declarations through the package’s exports field. An optional optionsSchema validates options with JSON Schema 2020-12 before setup. Invalid options, API versions, duplicate registrations, and thrown errors fail with exit 4.

Rules register unique DBX plus three-digit codes, a defaultSeverity, description, and run function. DBX001 is reserved for infrastructure failures. The frozen ValidationContextV1 contains readonly documents, graph edges, audience IDs, a public configuration subset, and resolve(ref, fromDocumentKey). Rules return synchronous or asynchronous diagnostic iterables and run at most once per validation. Rule diagnostics use the same locations and suppression machinery as core diagnostics.

ReadonlyDocumentV1 includes normalized metadata and provenance, with no AST or cache paths. Presenter context contains the document and active audience. A presenter reads its metadata key and returns null or a serializable text, link, or list view model. The same model is used in page UI and search metadata. HTML, functions, and unsafe URL schemes are rejected.

The public extension API follows semantic versioning. Breaking changes require an API major and migration guidance. The sample TypeScript extension demonstrates a packed, independently installed rule and presenter.
