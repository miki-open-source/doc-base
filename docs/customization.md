---
id: customization
title: Astro and Starlight customization
order: 6
---

The generated site uses Astro 7.3 and Starlight 0.42. The integration declares compatible peer ranges. TypeScript 6 is used for the library because the selected ESLint TypeScript tooling does not yet accept TypeScript 7.

Project `src` and `public` files are copied into each generated projection. doc-base owns the generated docs content collection and generated routes. MDX imports retain source-relative module context through snapshots; embedded targets with module-scope declarations are rejected.

A project `astro.config.mjs`, `.js`, or `.ts` must export a configuration object, which is merged into each generated Astro configuration. Use it for integrations, Vite settings, Markdown processing, and ordinary Astro settings. doc-base keeps its configured base URL, trailing-slash behavior, and explicit navigation after merging. Custom asset-prefix route collisions fail the build.

For Starlight options, export an options object from `starlight.config.mjs`. This is passed to the generated Starlight integration, so do not add a second Starlight integration in astro.config. Component overrides, custom CSS, and other standard Starlight options remain available. Replacing generated navigation, search, or metadata components makes the author responsible for preserving the corresponding audience behavior.

Generated metadata uses header, footer, or sidebar placement and safely renders text, links, or lists. Search receives the same metadata view model.
