---
id: cli
title: Command-line reference
order: 3
---

`doc-base init [directory]` creates a starter. Overwrites require `--force` and interactive confirmation. Non-interactive collisions fail.

`dev` serves documentation and watches local content; `validate` checks without rendering; `build` validates then creates static output. `fetch` resolves sources without parsing documents. `clean` removes generated files by default, or explicitly selected `--cache`, `--generated`, `--output` artifacts. `doctor` checks runtime, Git, and configuration. `schema [config|frontmatter]` prints the installed schema. `--help` and `--version` print command information.

## Flags

Configuration flags apply to dev, validate, build, fetch, clean, and doctor. Init and schema accept only `--log-level` and `--no-color` from the common flags.

Common flags: `--config <file>`, `--local-config <file>`, `--no-local-config`, `--log-level <silent|error|warn|info|debug>`, `--no-color`.

Source operations accept `--source-ref <id>=<ref>`, `--offline`, `--refresh`, and `--frozen-lockfile`. Dev, validate, and build accept repeatable `--source-path <id>=<directory>` and a single `--audience <id>`. Validate and build accept `--strict`; dev and validate accept `--exclude-drafts`. Validate and doctor accept `--json`. Unsupported combinations fail before fetching.

## Environment

`DOC_BASE_CONFIG`, `DOC_BASE_LOCAL_CONFIG`, `DOC_BASE_CACHE_DIR`, `DOC_BASE_AUDIENCE`, `DOC_BASE_OFFLINE`, `DOC_BASE_FROZEN_LOCKFILE`, `DOC_BASE_LOG_LEVEL`, and `NO_COLOR` are recognized. Boolean environment settings accept only `1`, `true`, `0`, or `false`. Empty values are errors except NO_COLOR. Flags take precedence. Relative CLI paths start at the current directory.

## Exit status and JSON

Exit codes are 0 success, 1 validation/build failure, 2 usage/configuration, 3 source/cache, 4 extension, and 5 unexpected internal errors. Interrupted development exits 130.

Human diagnostics go to stderr. JSON validation emits one object with schemaVersion, ok, counts, diagnostics, sources, and audiences. Suppressed diagnostics remain present with their suppression reason. Strict mode changes the failure threshold, not diagnostic severity.

`doctor --json` returns schemaVersion, ok, node, gitVersion, credentialsReady, packages, extensions, config, and cacheWritable. Failure JSON uses schemaVersion, ok: false, counts, and diagnostics. Source availability failures exit 3; extension failures exit 4. `schema` emits the schema directly without a wrapper.

In development, invalid edits leave the last valid render available. A visible banner marks it stale and shows the validation error; fixing the source rebuilds the page. Git refs are resolved on startup and stay locked through local edits. Restart with `--refresh` to explicitly refresh a movable ref.
