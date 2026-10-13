# Contributing

Use a current Node 22 or 24 release. Run `npm ci`, `npm run build`, and `npm run check`. Installation configures the pre-commit hook. Do not bypass failing checks. Keep tests focused on observable behavior, using GIVEN/WHEN/THEN for scenarios with multiple phases.

The package boundaries are schema, sources, core, extension-api, starlight, and CLI. Core must not exit the process or own UI; the rendering package must not fetch Git sources. Public imports must use package exports.

Run `npm run example:setup` to create the local Git fixture. Never require network services or credentials in content tests. `npm run test:package` packs and installs the release packages in an isolated consumer. `npm run test:e2e` checks the built example in Chromium.

The development test verifies graceful SIGINT shutdown on Linux and macOS. On Windows, Node's child-process signal API forcibly terminates the child, so the test verifies termination by SIGINT instead. See [Node's signal documentation](https://nodejs.org/api/process.html#signal-events).

Use a pull request describing the behavior change and validation. Add a changelog entry for user-visible changes. Releases use coordinated semantic versions. Any partial publish must be documented and repaired with a new version; do not overwrite published versions.
