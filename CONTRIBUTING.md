# Contributing

Use a current Node 22 or 24 release and pnpm 12.11.2 (pinned in `package.json`). Run `pnpm install --frozen-lockfile`, `pnpm run build`, and `pnpm run check`. Installation configures the pre-commit hook. Do not bypass failing checks. Keep tests focused on observable behavior, using GIVEN/WHEN/THEN for scenarios with multiple phases.

The package boundaries are schema, sources, core, extension-api, starlight, and CLI. Core must not exit the process or own UI; the rendering package must not fetch Git sources. Public imports must use package exports.

Run `pnpm run example:setup` to create the local Git fixture. Never require network services or credentials in content tests. `pnpm run test:package` packs and installs the release packages in an isolated consumer. `pnpm run test:e2e` checks the built example in Chromium.

The development test verifies graceful SIGINT shutdown on Linux and macOS. On Windows, Node's child-process signal API forcibly terminates the child, so the test verifies termination by SIGINT instead. See [Node's signal documentation](https://nodejs.org/api/process.html#signal-events).

Use a pull request describing the behavior change and validation. Add a changelog entry for user-visible changes. Releases use coordinated semantic versions. Any partial publish must be documented and repaired with a new version; do not overwrite published versions.

## Repository commands

Run commands from the repository root after installation and the first build. `pnpm-workspace.yaml` includes the library packages and both examples; local package dependencies use the workspace protocol. Commit `pnpm-lock.yaml` when dependencies change.

| Purpose              | Commands                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Compile and check    | `pnpm run build`, `pnpm run check`                                                               |
| Individual checks    | `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm test`                      |
| Apply formatting     | `pnpm run format`                                                                                |
| Neutral sample       | `pnpm run example:setup`, `pnpm run example:validate`, `pnpm run example:build`                  |
| Self documentation   | `pnpm run docs:reference`, `pnpm run test:docs`, `pnpm run docs:validate`, `pnpm run docs:build` |
| Packed consumers     | `pnpm run test:package`, then `pnpm run test:managers`                                           |
| Browser journeys     | `pnpm exec playwright install chromium`, then `pnpm run test:e2e`                                |
| Development watching | `pnpm run test:dev`                                                                              |
| Dependency policy    | `pnpm audit --prod --audit-level=high`, `pnpm run audit:licenses`                                |
| Reinstall hooks      | `pnpm run prepare` (also runs during installation)                                               |

`test:package` creates pnpm tarballs and checks them in a clean npm consumer; `test:managers` additionally checks pnpm and Yarn consumers without extra tooling setup. The approved registry publishing workflow uses `pnpm run release` for trusted publishing with provenance and a clean pnpm registry-install/build check. Run it only through that workflow with the reviewed release tag and publisher configuration in place.
