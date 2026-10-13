---
id: diagnostics
title: Diagnostic catalog
order: 8
---

Codes are stable public contracts. Strict mode changes the failure threshold while preserving the recorded severity. Reference errors may become warnings when strictRefs is disabled. Suppressed diagnostics remain visible in JSON. Extension rule codes use registered DBX allocations; DBX001 is reserved for extension infrastructure failures.

| Code   | Default severity | Suppressible | Cause                                                                      | Fix                                                                                |
| ------ | ---------------- | ------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| DBA100 | error            | no           | Audience metadata names an unknown audience.                               | Declare the audience or remove the invalid restriction.                            |
| DBA120 | info             | yes          | An embed is filtered from broader audience projections.                    | Review the host, target, and directive audience intersection.                      |
| DBA210 | warning          | yes          | A visible page links to a target hidden in that projection.                | Restrict the containing content equally or remove the cross-audience link.         |
| DBC001 | error            | no           | Configuration or YAML cannot be parsed.                                    | Fix the located YAML error or provide an existing configuration file.              |
| DBC002 | error            | no           | Configuration violates its JSON Schema.                                    | Remove unknown fields and use the documented field types.                          |
| DBC003 | error            | no           | Cross-field configuration or package compatibility is invalid.             | Use configured audience/inverse IDs and supported package versions.                |
| DBC010 | error            | no           | Command-line or environment settings are invalid.                          | Check command help, flag combinations, and override syntax.                        |
| DBC012 | error            | no           | A local overlay contains a forbidden field.                                | Keep only allowlisted machine-local settings in the overlay.                       |
| DBE100 | error            | yes          | An embed target requires module-scope MDX state.                           | Move reusable Markdown content into a target without imports or exports.           |
| DBE110 | error            | yes          | An embed directive is dynamic or structurally invalid.                     | Use a standalone leaf directive with supported static attributes.                  |
| DBE120 | error            | yes          | The requested embed section does not exist.                                | Choose an existing section heading fragment.                                       |
| DBE200 | error            | no           | Recursive embeds contain a cycle.                                          | Break the reported document/section cycle.                                         |
| DBE210 | error            | no           | Recursive embedding exceeds the configured depth.                          | Reduce nesting or deliberately increase maxDepth.                                  |
| DBE230 | warning          | yes          | A heading offset exceeds heading level six.                                | Reduce the offset or nesting depth.                                                |
| DBE240 | error            | no           | Expanded headings collide under the error policy.                          | Use distinct headings or the prefix collision policy.                              |
| DBF100 | error            | no           | Frontmatter is missing or violates its schema.                             | Provide a valid stable ID, title, and supported metadata.                          |
| DBF110 | error            | no           | Document identities collide.                                               | Assign distinct IDs, including after ASCII case folding.                           |
| DBF120 | error            | no           | Source paths collide after case or Unicode normalization.                  | Rename the colliding files to portable distinct paths.                             |
| DBF130 | error            | no           | Markdown, MDX, or UTF-8 content cannot be parsed.                          | Fix the located syntax or encoding error.                                          |
| DBN100 | warning          | yes          | Native navigation cannot guarantee audience-specific sidebars.             | Configure doc-base navigation when those guarantees are needed.                    |
| DBN110 | error            | no           | Autogenerated navigation selects an invalid source or directory.           | Use an existing source and a source-content-relative directory.                    |
| DBN200 | error            | no           | An explicit navigation target is missing or ambiguous.                     | Use a unique or qualified stable document ID.                                      |
| DBN210 | error            | no           | A document appears more than once in a navigation projection.              | Remove the duplicate entry or overlapping autogeneration.                          |
| DBN220 | warning          | yes          | A visible page is omitted from strict navigation.                          | Add navigation coverage or disable strictNavigation deliberately.                  |
| DBN230 | error            | no           | Documents in one directory specify conflicting group labels.               | Use one nav.group value for that source directory.                                 |
| DBR100 | error            | yes          | A logical or relative document reference is unresolved.                    | Use the stable ID of an included non-draft document.                               |
| DBR110 | error            | yes          | An unqualified reference has multiple candidates.                          | Qualify the reference with its source ID.                                          |
| DBR120 | error            | yes          | A referenced heading fragment does not exist.                              | Use the normalized generated heading ID.                                           |
| DBR130 | error            | yes          | A relationship type is undeclared.                                         | Declare the relationship vocabulary in configuration.                              |
| DBS100 | error            | no           | A source or content directory is unavailable.                              | Provide an existing readable source and content directory.                         |
| DBS110 | error            | no           | A Git operation failed.                                                    | Check Git, the repository/ref, and credential helpers.                             |
| DBS120 | error            | no           | A lockfile or required cache entry is unavailable or mismatched.           | Fetch online and commit the intended source lock before frozen/offline use.        |
| DBS130 | error            | no           | A source, symlink, or asset escapes its source root.                       | Keep content and referenced assets within the source root.                         |
| DBS140 | error            | no           | Source bytes changed repeatedly during snapshotting.                       | Stop concurrent source writes and retry validation.                                |
| DBU100 | error            | no           | A route contains invalid encoding or path segments.                        | Use a portable URL path without traversal, queries, or fragments.                  |
| DBU110 | error            | no           | A document uses a reserved output prefix.                                  | Choose a route outside reserved infrastructure prefixes.                           |
| DBU120 | error            | no           | Canonical document routes collide.                                         | Choose distinct normalized slugs or route prefixes.                                |
| DBU130 | error            | no           | A redirect conflicts, escapes the base, or output would overwrite content. | Use a unique redirect under the base and an owned output directory.                |
| DBU140 | error            | yes          | A referenced local asset is missing or invalid.                            | Provide the source-relative asset and correct its URL.                             |
| DBV100 | error            | no           | Generated inputs, output verification, or an internal operation failed.    | Inspect the error, run doctor, and report a minimal reproduction if needed.        |
| DBV240 | warning          | yes          | A relative documentation link is coupled to a file path.                   | Replace it with a logical doc: link.                                               |
| DBV901 | error            | no           | A diagnostic suppression has expired.                                      | Fix the diagnostic or review and renew the audit record.                           |
| DBV902 | error            | no           | A suppression names an unknown diagnostic code.                            | Use a code from this catalog or a registered extension rule.                       |
| DBV903 | warning          | yes          | A suppression matches no suppressible diagnostic.                          | Remove the obsolete suppression.                                                   |
| DBX001 | error            | no           | Extension loading, registration, options, or execution failed.             | Use API major one, valid options, unique registrations, and supported view models. |
