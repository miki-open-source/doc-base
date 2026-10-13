# Example Documentation

From the repository root run `npm run build`, `npm run example:setup`, `npm run example:validate`, and `npm run example:build`. The setup creates a temporary local Git repository; no external content service is used.

Pages include `/`, `/guides/quick-start/`, `/api/api/`, `/shared/note/`, and the contributor projection under `/_audience/contributor/`. `/getting-started/` redirects to the quick start. Search excludes the small-note page. Audience metadata is not authorization.

From this directory, `npm run setup`, `npm run dev`, `npm run validate`, and `npm run build` use the installed CLI. `npm run test:e2e` checks the static build after Playwright’s Chromium browser has been installed. In this workspace, first build the library and extension from the repository root; the repository’s browser command also tests this sample from packed artifacts.
