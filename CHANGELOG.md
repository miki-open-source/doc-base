# Changelog

## 1.0.0 — Unreleased

- Development navigation forwards live-update WebSockets through the public server and closes them during rebuilds and shutdown.
- Sidebar links apply site and audience URL prefixes exactly once.
- pnpm is the default repository package manager, with a pinned version, workspace lockfile, and pnpm-based development and CI commands.
- Releases publish inspected tarballs with pnpm provenance and verify a clean pnpm registry install; npm consumer compatibility remains covered.

- Initial connected documentation pipeline, CLI, schemas, extension API, source snapshots, and Astro/Starlight static rendering.
- Git source operations enable long-path support for Windows cache directories.
- Release remains pending completion of all acceptance checks recorded in IMPLEMENTATION.md.
