# Next version upgrades

The repository MUST create `next-version-upgrades.md` during implementation and copy the following items into it. They are intentionally deferred and MUST NOT block v1 unless a prerequisite defect makes the v1 contract impossible.

1. **Authorization-aware publishing:** authenticated serving, policy enforcement, and guarantees that restricted source bytes are absent from unauthorized deployments.
2. **First-class documentation versions:** version selectors, versioned routes, cross-version refs, and retention policies.
3. **Localization:** locale-aware routes, fallback chains, translated navigation, localized search indexes, and translation completeness diagnostics.
4. **Additional source adapters:** HTTP archives, object storage, package registries, and provider APIs with integrity verification.
5. **Richer extension hooks:** carefully scoped source, AST transformation, navigation, search, and UI component hooks after concrete use cases and isolation/security design exist.
6. **Sandboxed extensions:** process or capability isolation for untrusted extension code.
7. **Multiple simultaneous audience expressions:** unions/intersections, hierarchical audiences, and reusable audience groups.
8. **External search adapters:** Algolia or other hosted providers while preserving audience projection guarantees.
9. **Incremental build optimization:** persisted fine-grained dependency graph and partial re-rendering with correctness parity tests.
10. **Remote link checking:** retry/caching policies and separately configurable CI gating.
11. **Documentation graph visualization:** backlinks, interactive relationship exploration, and graph exports.
12. **Authoring/editor tooling:** language-server support, editor diagnostics, completion, refactoring, and ID-aware rename/move tools.
13. **Automatic redirect assistance:** compare manifests and propose redirects after slug/path changes without silently authoring them.
14. **Content collections beyond pages:** reusable structured records and generated reference pages.
15. **PDF/offline bundle export:** alternate render targets with explicit pagination and asset rules.
16. **Submodule support:** opt-in, pinned recursive Git submodules with credential and cache rules.
17. **Content provenance UI:** optional end-user links to source revision and edit locations.
18. **Advanced search semantics:** synonyms, stemming configuration, section-level result ranking, and analytics hooks.
19. **Migration tooling:** automated config/frontmatter migrations between future schema majors.
20. **Hosted preview coordination:** optional pull-request preview orchestration; core must remain host-neutral.

Each deferred item MUST include, when work begins, a design note addressing compatibility, security, deterministic builds, audience behavior, diagnostics, testing, and migration from v1.
