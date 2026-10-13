---
id: extensions
title: Extension author guide
order: 4
---

Install extensions as trusted npm dependencies and list their package names in configuration. Export a default definition using `defineExtension` from `@doc-base/extension-api` with `apiVersion: "1"`, a name, optional JSON Schema 2020-12 options schema, and a setup function.

Register validation rules with a unique `DBX` plus three-digit code. Document your allocation. Each rule runs once per validation and can emit located diagnostics. Register metadata presenters with a unique key, label, placement, and present function. Allowed outputs are text, links, lists, or null. Raw HTML and executable UI are not accepted presenter output.

Contexts expose frozen normalized document metadata, provenance, relationships, audience IDs, and logical resolution. They omit ASTs, credentials, cache directories, and internal service objects. API major 1 follows semantic versioning; breaking changes require a new API major.

Extensions cannot fetch sources or mutate routes, navigation, or ASTs. Use normal Astro/Starlight customization for application-specific UI.
