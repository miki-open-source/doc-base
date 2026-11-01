# Security policy

Report vulnerabilities through the repository's private vulnerability reporting feature. Do not include credentials or exploit details in public issues. Maintainers assess impact, coordinate fixes, and disclose after a fix is available. Only the latest stable release is supported.

MDX and npm extensions are trusted build code. Audience filtering is not authorization. Use separate builds and external access controls for confidential content. Git uses existing credential helpers and does not initialize submodules or run source repository hooks.

CI audits production dependencies and fails on high or critical advisories. Moderate advisories require documented triage before release. License review permits MIT, ISC, BSD, Apache-2.0 and other reviewed OSI-compatible dependencies; investigate unknown or incompatible licenses before publishing.

## Dependency audit triage

The current lockfile reports the moderate [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) selector-parser CPU exhaustion advisory through Starlight’s Expressive Code / postcss-nested dependency. The vulnerable parser runs during trusted stylesheet processing at build time, not in the published site. Treat third-party CSS and extensions as trusted build inputs, bound CI build time, and recheck upstream fixes before release. Do not apply npm’s suggested downgrade to an incompatible Starlight version. This documented exposure must be reviewed by maintainers at the release gate.

The 2026-11-01 audit reports no high or critical advisories after updating the locked undici resolution to 8.12.3. Two moderate and two low fast-uri findings remain alongside the selector-parser advisory. Review the fast-uri [scheme spoofing](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) and [host canonicalization](https://github.com/advisories/GHSA-wjr9-j795-jxcr) advisories and their compatible patch before registry publication; these findings are not ignored by the audit policy.
