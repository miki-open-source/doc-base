# Security policy

Report vulnerabilities through the repository's private vulnerability reporting feature. Do not include credentials or exploit details in public issues. Maintainers assess impact, coordinate fixes, and disclose after a fix is available. Only the latest stable release is supported.

MDX and npm extensions are trusted build code. Audience filtering is not authorization. Use separate builds and external access controls for confidential content. Git uses existing credential helpers and does not initialize submodules or run source repository hooks.

CI audits production dependencies and fails on high or critical advisories. Moderate advisories require documented triage before release. License review permits MIT, ISC, BSD, Apache-2.0 and other reviewed OSI-compatible dependencies; investigate unknown or incompatible licenses before publishing.

## Dependency audit triage

The current lockfile reports the moderate [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) selector-parser CPU exhaustion advisory through Starlight’s Expressive Code / postcss-nested dependency. Ten audit entries trace to this one dependency chain; there are no reported high or critical runtime advisories in the local audit. The vulnerable parser runs during trusted stylesheet processing at build time, not in the published site. Treat third-party CSS and extensions as trusted build inputs, bound CI build time, and recheck upstream fixes before release. Do not apply npm’s suggested downgrade to an incompatible Starlight version. This documented exposure must be reviewed by maintainers at the release gate.
