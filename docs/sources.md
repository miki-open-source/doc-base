---
id: sources
title: Sources, snapshots, and reproducible builds
order: 4
---

A local source selects a directory through `path`. A Git source selects `repository` and any unambiguous Git commit-ish through `ref`, including branches, tags, full commits, and history expressions. `content` chooses a directory beneath that root. Include globs select Markdown/MDX files, then exclude globs remove matches; matching uses normalized POSIX paths and picomatch syntax. Case/Unicode collisions and symlinks escaping the source root fail on every platform. Submodules are never initialized; content inside an unavailable submodule fails.

Local revisions hash relevant source configuration, included document bytes, and referenced assets/modules. File timestamps do not contribute. Snapshot verification retries a changing local source once, then fails rather than producing mixed content. Git sources resolve to an immutable commit before parsing. Cached bytes are checked against the commit’s blob identities. Discovery exclusions and draft exclusions are recorded in `.doc-base/source-snapshot.json`.

## Authentication and trust

Use existing Git credential helpers, SSH configuration, or CI-provided credentials. Interactive credential prompts are disabled. Never store credentials in committed URLs or YAML. URL user information and recognized secret query parameters are redacted from logs and lockfiles. Fetched Git hooks and checkout filters are not executed, and sources are never formatted or changed by doc-base.

Git content repositories may contain executable MDX and imported components. Treat content owners and installed extensions as trusted build-code owners. Source authentication does not create audience authorization.

## Cache and locks

The configured cache directory separates Git ref resolutions, immutable snapshots/objects, and derived parse data. Ref age uses `cache.maxAge`; `--refresh` ignores that age. Immutable commits are reusable. Writes use temporary complete entries and atomic promotion, so simultaneous runs cannot expose partial data. Generated sites and final output use directory locks and atomic replacement.

Commit `.doc-base/sources.lock.json`. It records the configured repository, requested ref, and resolved commit for each Git source in stable order. `--frozen-lockfile` requires matching entries and never rewrites them. `--offline` forbids network operations and requires the matching lock and complete cached checkout. Pre-fetch online before running offline. Offline and refresh conflict. `fetch` prepares sources and locks without parsing documents.

## Local overrides

Use `.doc-base/local.yaml` for personal paths/refs, output/cache directories, or development host/port/open. Add it to gitignore. Other overlay keys fail. Explicit `--source-ref id=ref` changes a Git ref; `--source-path id=directory` temporarily treats the source as local while preserving its ID, globs, content, and route prefix. Source-path flags must name an existing directory. Multiple values for the same override are errors. Overrides appear in the build manifest.

Precedence is defaults, project YAML, local overlay, documented environment variables, then CLI flags. Debug logging shows the effective settings with recognized credentials redacted. To refresh a development Git ref, restart with `--refresh`; local file watching keeps the starting lock.
