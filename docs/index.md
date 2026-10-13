---
id: overview
title: doc-base
order: 0
---

Build connected documentation from local and Git-backed Markdown and MDX.

Start with the [quick start](doc:quick-start) and [configuration reference](doc:configuration).

## Security boundary

Audiences filter publishing and discovery, not access. Combined output contains every audience. Build confidential audiences separately and enforce authorization at your hosting boundary. Extensions and MDX are trusted executable build inputs. Raw HTML is not sanitized by doc-base.

## Scope

The library compiles Markdown and MDX into static Astro/Starlight documentation, with logical links, relationships, recursive embeds, audience projections, navigation, search, and redirects. It needs no database, hosted service, prescribed taxonomy, or content editing application.

Version 1 does not provide authentication, live content federation, a CMS, automatic path-history redirects, a relationship graph editor, or a hosted search service. Audience labels have no hierarchy or built-in roles. See the repository’s `next-version-upgrades.md` for deferred features.
