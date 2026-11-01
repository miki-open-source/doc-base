# doc-base

Build connected documentation from local directories and Git repositories with TypeScript, Astro, and Starlight.

Requires Node.js 22.12 or later. This repository implements the v1 documentation pipeline; see [IMPLEMENTATION.md](IMPLEMENTATION.md) for verified scope and release readiness.

Use pnpm 12.11.2, pinned in `package.json`. See the [pnpm installation guide](https://pnpm.io/installation) if it is not installed.

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run example:setup
pnpm run example:validate
pnpm run example:build
```

Audience metadata filters publishing and discoverability. It is not authorization. Combined output contains every audience. Build confidential content separately and deploy behind external access controls. Markdown/MDX and extensions are trusted executable build inputs.

Configuration schema: https://doc-base.dev/schemas/v1/doc-base.schema.json

## Development

`pnpm run check` runs formatting, lint, strict type checking, and tests. Git pre-commit hooks run the same checks. `pnpm run docs:build` builds this project's documentation. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Use the CLI

After the first registry release, run `pnpm add doc-base`, `pnpm exec doc-base init documentation`, then `pnpm exec doc-base build --config documentation/doc-base.yaml`. See the source repository’s documentation for library and extension APIs. Yarn projects require `nodeLinker: node-modules`; Plug’n’Play rendering is unsupported.

Source repository: [miki-open-source/doc-base](https://github.com/miki-open-source/doc-base). Report reproducible problems through [GitHub issues](https://github.com/miki-open-source/doc-base/issues).
