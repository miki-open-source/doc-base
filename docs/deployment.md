---
id: deployment
title: Deployment and maintenance
order: 5
---

## Generic static hosting

Run installation with a frozen package-manager lockfile, then `doc-base build --frozen-lockfile`. Upload the contents of dist to any static host. Output needs no Git client, content server, or doc-base runtime. Redirect HTML includes a canonical URL, noindex metadata, and a visible fallback link.

## GitHub Pages

Set site.baseUrl to `/repository-name/` for a repository site, or `/` for a custom domain. Build in GitHub Actions, upload dist with the Pages artifact action, and deploy with the Pages deployment action. Give only the deployment job Pages write and OIDC permissions. Content tests need no secrets.

## Troubleshooting

Run `doc-base doctor` and `doc-base validate --json`. Missing source errors indicate unavailable paths, refs, or checkouts. Refresh an online source before using offline mode. Commit updated source locks after intentional ref changes. Use stable logical IDs when moving pages and add redirects for old public URLs.

## Contributions, releases, and support

See CONTRIBUTING.md, SECURITY.md, and CODE_OF_CONDUCT.md in the package repository. Report minimal neutral reproductions through issues and security vulnerabilities privately. All packages use coordinated semantic versions and reviewed changelog entries. Publishing uses an approved npm-release environment with npm trusted publishing and provenance. Configure repository protection and npm publisher trust before the first release.

No breaking migration has been released. Future breaking releases must include migration instructions. Deferred design topics are tracked in next-version-upgrades.md.

## GitHub Pages workflow example

Use this in an application that has committed source and package-manager lockfiles. Set its baseUrl for its repository path before building. Configure the github-pages environment and Pages to deploy from GitHub Actions.

```yaml
name: Documentation
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
        with:
          version: 12.11.2
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec doc-base build --frozen-lockfile
      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

The upload/deployment flow follows [GitHub’s Pages workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). On a generic static host, publish dist under the configured base URL using its directory index support; the generated HTML redirects work without host-specific routing rules.

## Release gate

The release workflow checks out the requested version tag, runs quality and packed-consumer gates, and uses `pnpm run release` to publish those inspected tarballs in dependency order. It verifies the tag and coordinated versions against the reviewed changelog. The npm-release environment must require approval and be registered as the npm trusted publisher for every package. This workflow uses pnpm 12.11.2 and Node 24; pnpm publishes natively with OIDC and explicit provenance. See [pnpm publishing documentation](https://pnpm.io/cli/publish#--provenance) and [npm trusted publisher configuration](https://docs.npmjs.com/trusted-publishers/).

Publishing uses `--no-git-checks` because the workflow checks out a release tag rather than a branch. The release script independently requires the checked-out commit to match that exact tag and checks coordinated versions before attempting any publish.

A registry install, initialization, and production build run after publishing. Each successful package publish is recorded in a release-report artifact. If publishing stops partway through, maintainers must immediately document which packages are public and issue a new coordinated version to repair the release. Never overwrite or reuse published versions. Only the latest stable release receives fixes; user-visible changes require a reviewed changelog entry, and breaking changes require migration notes.
