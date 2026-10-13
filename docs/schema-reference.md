---
id: schema-reference
title: Schema reference
order: 7
---

Generated from the shipped JSON Schemas. Defaults are schema annotations; behavioral and cross-field rules are described in the [configuration guide](doc:configuration).

## Configuration

Schema: <https://doc-base.dev/schemas/v1/doc-base.schema.json>

| Field                         | Type or values          | Required | Default annotation  |
| ----------------------------- | ----------------------- | -------- | ------------------- |
| `schemaVersion`               | 1                       | yes      | —                   |
| `site`                        | object                  | yes      | —                   |
| `site.title`                  | string                  | yes      | —                   |
| `site.description`            | string                  | no       | —                   |
| `site.baseUrl`                | string                  | no       | `"/"`               |
| `site.outputDir`              | string                  | no       | `"dist"`            |
| `site.trailingSlash`          | always / never / ignore | no       | `"always"`          |
| `site.defaultAudience`        | id                      | no       | —                   |
| `sources`                     | object                  | yes      | —                   |
| `audiences`                   | object                  | no       | —                   |
| `relationships`               | object                  | no       | —                   |
| `navigation`                  | array                   | no       | —                   |
| `search`                      | object                  | no       | —                   |
| `search.enabled`              | boolean                 | no       | `true`              |
| `search.indexBody`            | boolean                 | no       | `true`              |
| `search.indexEmbeds`          | boolean                 | no       | `true`              |
| `search.maxHeadingDepth`      | integer                 | no       | `4`                 |
| `validation`                  | object                  | no       | —                   |
| `validation.failOn`           | error / warning / never | no       | `"error"`           |
| `validation.strictRefs`       | boolean                 | no       | `true`              |
| `validation.strictNavigation` | boolean                 | no       | `true`              |
| `validation.suppressions`     | array                   | no       | —                   |
| `embeds`                      | object                  | no       | —                   |
| `embeds.maxDepth`             | integer                 | no       | `10`                |
| `embeds.duplicateHeadingIds`  | prefix / error          | no       | `"prefix"`          |
| `cache`                       | object                  | no       | —                   |
| `cache.directory`             | string                  | no       | `".doc-base/cache"` |
| `cache.maxAge`                | string                  | no       | `"24h"`             |
| `extensions`                  | array                   | no       | —                   |
| `extensions[].package`        | string                  | yes      | —                   |
| `extensions[].options`        | object                  | no       | —                   |
| `development`                 | object                  | no       | —                   |
| `development.host`            | string                  | no       | `"127.0.0.1"`       |
| `development.port`            | integer                 | no       | `4321`              |
| `development.open`            | boolean                 | no       | `false`             |

### source

| Field                | Type or values | Required | Default annotation |
| -------------------- | -------------- | -------- | ------------------ |
| `source.type`        | "local"        | yes      | —                  |
| `source.path`        | string         | yes      | —                  |
| `source.content`     | string         | no       | `"."`              |
| `source.include`     | globs          | no       | —                  |
| `source.exclude`     | globs          | no       | —                  |
| `source.routePrefix` | routePrefix    | no       | —                  |
| `source.type`        | "git"          | yes      | —                  |
| `source.repository`  | string         | yes      | —                  |
| `source.ref`         | string         | yes      | —                  |
| `source.content`     | string         | no       | `"."`              |
| `source.include`     | globs          | no       | —                  |
| `source.exclude`     | globs          | no       | —                  |
| `source.routePrefix` | routePrefix    | no       | —                  |

### navigationItem

| Field                                   | Type or values | Required | Default annotation |
| --------------------------------------- | -------------- | -------- | ------------------ |
| `navigationItem.doc`                    | string         | yes      | —                  |
| `navigationItem.label`                  | string         | no       | —                  |
| `navigationItem.audiences`              | idArray        | no       | —                  |
| `navigationItem.group`                  | string         | yes      | —                  |
| `navigationItem.items`                  | array          | yes      | —                  |
| `navigationItem.collapsed`              | boolean        | no       | `false`            |
| `navigationItem.audiences`              | idArray        | no       | —                  |
| `navigationItem.autogenerate`           | object         | yes      | —                  |
| `navigationItem.autogenerate.source`    | id             | yes      | —                  |
| `navigationItem.autogenerate.directory` | string         | yes      | —                  |
| `navigationItem.audiences`              | idArray        | no       | —                  |
| `navigationItem.link`                   | object         | yes      | —                  |
| `navigationItem.link.label`             | string         | yes      | —                  |
| `navigationItem.link.href`              | string         | yes      | —                  |
| `navigationItem.audiences`              | idArray        | no       | —                  |

### suppression

| Field                 | Type or values | Required | Default annotation |
| --------------------- | -------------- | -------- | ------------------ |
| `suppression.code`    | string         | yes      | —                  |
| `suppression.path`    | string         | no       | `"**"`             |
| `suppression.source`  | id             | no       | —                  |
| `suppression.reason`  | string         | yes      | —                  |
| `suppression.expires` | string         | no       | —                  |

## Frontmatter

Schema: <https://doc-base.dev/schemas/v1/frontmatter.schema.json>

| Field                           | Type or values | Required | Default annotation |
| ------------------------------- | -------------- | -------- | ------------------ |
| `id`                            | docId          | yes      | —                  |
| `title`                         | string         | yes      | —                  |
| `description`                   | string         | no       | —                  |
| `slug`                          | string         | no       | —                  |
| `audiences`                     | idArray        | no       | —                  |
| `tags`                          | array          | no       | —                  |
| `order`                         | number         | no       | —                  |
| `nav`                           | object         | no       | —                  |
| `nav.label`                     | string         | no       | —                  |
| `nav.hidden`                    | boolean        | no       | `false`            |
| `nav.group`                     | string         | no       | —                  |
| `relationships`                 | array          | no       | —                  |
| `relationships[].type`          | id             | yes      | —                  |
| `relationships[].target`        | string         | yes      | —                  |
| `relationships[].label`         | string         | no       | —                  |
| `redirects`                     | array          | no       | —                  |
| `search`                        | object         | no       | —                  |
| `search.exclude`                | boolean        | no       | `false`            |
| `search.boost`                  | number         | no       | `1`                |
| `metadata`                      | object         | no       | —                  |
| `validation`                    | object         | no       | —                  |
| `validation.suppress`           | array          | no       | —                  |
| `validation.suppress[].code`    | string         | yes      | —                  |
| `validation.suppress[].reason`  | string         | yes      | —                  |
| `validation.suppress[].expires` | string         | no       | —                  |
| `draft`                         | boolean        | no       | `false`            |
