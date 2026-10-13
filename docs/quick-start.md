---
id: quick-start
title: Quick start
order: 1
---

Install Node.js 22.12 or newer and the `doc-base` package.

```sh
npm install doc-base
npx doc-base init documentation
npx doc-base validate --config documentation/doc-base.yaml
npx doc-base build --config documentation/doc-base.yaml
```

The CLI does not run a package manager during validation, development, or builds. npm, pnpm, and Yarn can install the packages. In a directory with an existing package.json, initialize in a new directory and copy the desired scripts; initialization refuses non-interactive overwrites.

Each document needs a stable `id` and a `title` in YAML frontmatter. Write `[Overview](doc:overview)` to reference a document by ID.

A complete minimal configuration:

```yaml runnable
schemaVersion: 1
site:
  title: Example Documentation
sources:
  docs:
    type: local
    path: ./docs
navigation:
  - autogenerate:
      source: docs
      directory: .
```

## Package managers and runtime

Install with `npm install doc-base`, `pnpm add doc-base`, or `yarn add doc-base`. Node.js 22.12 or later is required; CI covers the Node 22 and Node 24 majors. The integration supports Astro `^7.3.8` and Starlight `^0.42.6` and declares both peer ranges.

For Yarn 2 and later, use this `.yarnrc.yml` setting before installation:

```yaml
nodeLinker: node-modules
```

The clean-install suite covers npm, pnpm, and Yarn with this linker. Plug’n’Play rendering is unsupported: the generated Astro configuration cannot resolve its imports through PnP. This setting follows [Astro’s Yarn troubleshooting guidance](https://docs.astro.build/en/guides/troubleshooting/). Normal documentation commands never invoke a package manager.
