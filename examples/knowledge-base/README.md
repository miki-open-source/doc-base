# Example Documentation

From the repository root run `pnpm run build`, `pnpm run example:setup`, `pnpm run example:validate`, and `pnpm run example:build`. The setup creates a temporary local Git repository; no external content service is used.

Pages include `/`, `/guides/quick-start/`, `/api/api/`, `/shared/note/`, and the contributor projection under `/_audience/contributor/`. `/getting-started/` redirects to the quick start. Search excludes the small-note page. Audience metadata is not authorization.

From this directory, `pnpm run setup`, `pnpm run dev`, `pnpm run validate`, and `pnpm run build` use the installed CLI. `pnpm run test:e2e` checks the static build after Playwright’s Chromium browser has been installed. In this workspace, first build the library and extension from the repository root; the repository’s browser command also tests this sample from packed artifacts.
