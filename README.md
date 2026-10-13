# doc-base

Build connected documentation from local directories and Git repositories with TypeScript, Astro, and Starlight.

Requires Node.js 22.12 or later. This repository implements the v1 documentation pipeline; see [IMPLEMENTATION.md](IMPLEMENTATION.md) for verified scope and release readiness.

```sh
npm ci
npm run build
npm test
npm run example:setup
npm run example:validate
npm run example:build
```

Audience metadata filters publishing and discoverability. It is not authorization. Combined output contains every audience. Build confidential content separately and deploy behind external access controls. Markdown/MDX and extensions are trusted executable build inputs.

Configuration schema: https://doc-base.dev/schemas/v1/doc-base.schema.json

## Development

`npm run check` runs formatting, lint, strict type checking, and tests. Git pre-commit hooks run the same checks. `npm run docs:build` builds this project's documentation. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Use the CLI

After the first registry release, install `doc-base`, run `doc-base init documentation`, then `doc-base build --config documentation/doc-base.yaml`. See the source repository’s documentation for library and extension APIs. Yarn projects require `nodeLinker: node-modules`; Plug’n’Play rendering is unsupported.

Source repository: [miki-open-source/doc-base](https://github.com/miki-open-source/doc-base). Report reproducible problems through [GitHub issues](https://github.com/miki-open-source/doc-base/issues).
