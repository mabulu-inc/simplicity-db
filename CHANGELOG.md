# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **`updateMutation`/`upsertMutation` `scalars` option** — constant bind
  params applied to every row (e.g. a `tenant_id`/`plant_id` partition
  key), sourced from `$2…$N` rather than repeated in each record. Makes
  the generator usable for the dominant multi-tenant bulk-upsert shape
  (`WHERE o.plant_id = $2 AND o.source_id = n.source_id`). Scalar keys
  are matched in the WHERE / WHERE NOT EXISTS and included in the INSERT;
  non-key scalars are written in SET. Exported `ScalarSpec`.

### Changed

- **BREAKING: `classifyPgError` is now copy-free.** It returns
  `{ code, category, httpStatus, constraint?, table?, column? }` (was
  `{ code, httpStatus, message }`). Classification (a low-level `pg`
  concern) is separated from user-facing copy (an app/i18n concern), and
  nothing leaks unless the caller surfaces it. Map `category`
  (`unique_violation` | `foreign_key_violation` | `not_null_violation` |
  `string_truncation` | `connection` | `unknown`) to your own message.
  Exported `PgErrorCategory`.
- **`friendlyError` documented as logs-only.** Its message embeds
  `table`/`column` names; returning it to clients leaks schema. Use
  `classifyPgError` for responses. (Behaviour unchanged; doc + guidance.)

## 3.1.0 (2026-06-08)

Absorbs the `pg` plumbing that downstream services kept reimplementing
(pool guardrails, secret resolution, transactions, bulk upserts, typed
error mapping). All additive — existing `connect`, `withClient`,
`updateMutation`, and `friendlyError` callers are unaffected.

### Added

- **`resolveDatabaseUrl(urlVar?, secretVar?)`** — resolve a connection
  string from a URL env var, or parse a Secrets-Manager-style JSON env
  var (`{ host, port?, dbname?, username, password }`) with the
  credentials percent-encoded. Reads an env string already in the
  process; never calls AWS.
- **`withTransaction(pool, fn)`** — checkout-run-release wrapper that
  runs the callback inside `BEGIN`/`COMMIT`, rolls back and rethrows the
  original error on throw, and destroys the connection (rather than
  reusing it) if the rollback itself fails. Stays RLS-agnostic so
  services with different session conventions can share it.
- **`upsertMutation(table, fieldset, options?)`** — returns paired
  `{ update, insert }` statements: the `updateMutation` UPDATE plus a
  matching `INSERT … SELECT … WHERE NOT EXISTS` (never `ON CONFLICT`).
  Honors bulk recordset mode and per-field value expressions.
- **`classifyPgError(err)`** — structured `{ code, httpStatus, message }`
  classification sharing `friendlyError`'s copy. New connection-failure
  codes (`08000`, `08006`, `08001`, `57P01`) now map to a
  service-unavailable message and HTTP 503.

### Changed

- **`connect(prefix?, options?)`** now accepts an optional `pg.PoolConfig`
  merged over the resolved connection string, so callers can set
  `statement_timeout`, `idle_in_transaction_session_timeout`, pool size,
  SSL, and the rest. No options → identical to before.
- **`updateMutation`'s third argument** also accepts an options object:
  `{ updated: false }` writes no timestamp (for tables without one) and
  `{ bulk: true }` reads `$1` as a `jsonb_to_recordset`. Passing a string
  still names the timestamp column, unchanged.

## 3.0.0 (2026-04-09)

TypeScript port of v2.x. **No API changes** — same default
`connect` export, same named `withClient`, `updateMutation`, and
`friendlyError`. `@smplcty/db` stays a thin `pg` helper that knows
nothing about sessions or RLS; session/role GUC setup lives in
`@smplcty/auth` via `withSession`. Consumers upgrade by swapping
`@mabulu-inc/db` → `@smplcty/db`. Major version bump because the
package is republished under a new name, drops `dotenv`, makes
`pg` a peer dependency, and ships type declarations.

### What changed

- **Source is now TypeScript** (`src/*.ts`), compiled to `dist/` via
  `tsc`. Type declarations ship in the package — no more
  `// @ts-expect-error` at the consumer's import site.
- **`pg` is now a peer dependency** (was a direct dep). Install
  `pg` in the consuming service; `@smplcty/db` will use whichever
  version the consumer picks.
- **No more `dotenv`**. Load `.env` at the edge of your application
  (e.g., via `node --env-file=.env`), not inside a library.
- **Tests migrated to vitest**. Unit tests for `updateMutation` and
  `friendlyError` plus integration tests against a real Postgres
  (docker-compose locally, service container in CI) for
  `withClient` and `friendlyError` round-tripping real pg error
  codes.
- **`withClient` is now generically typed** — `withClient<T>(pool,
  fn)` infers `T` from the callback's return type.
- **`updateMutation` exports a `FieldSpec` tuple type** so
  consumers get type-checked fieldsets.
- **`friendlyError` exports `PgErrorLike`, `ERROR_CODES`, and
  `MESSAGES`** so consumers can extend or override the mapping.
- **CI workflow added** (`.github/workflows/ci.yml`): lint,
  typecheck, gitleaks scan of full git history, build, tests
  against a Postgres service container, plus a non-blocking
  `pnpm outdated` advisory.
- **Publish workflow rewritten** (`.github/workflows/publish.yml`):
  OIDC trusted publishing with provenance, tag-vs-package version
  check, gitleaks scan, and the same lint/typecheck/test/build
  chain as CI.
- **Action versions bumped** to the fleet baseline: `actions/checkout@v6`,
  `pnpm/action-setup@v5`, `actions/setup-node@v6`, node 24.

### Migration from `@mabulu-inc/db` v2.x

1. `pnpm remove @mabulu-inc/db && pnpm add @smplcty/db`
2. Ensure `pg` is a direct dependency of your service (it was
   previously transitive via `@mabulu-inc/db`).
3. If you were relying on the package to load `.env` for you,
   switch to `node --env-file=.env` or load `dotenv` explicitly at
   your application's entry point.
4. Update imports from `@mabulu-inc/db` to `@smplcty/db`.

---

## Pre-3.0 history

### [2.3.1](https://github.com/mabulu-inc/db/compare/v2.2.4...v2.3.1) (2026-03-31)

### [2.2.4](https://github.com/mabulu-inc/db/compare/v2.2.2...v2.2.4) (2025-03-17)

### [2.2.2](https://github.com/mabulu-inc/db/compare/v2.2.0...v2.2.2) (2025-03-17)


### Bug Fixes

* module path for friendlyError ([5d380a2](https://github.com/mabulu-inc/db/commit/5d380a2f4444274e53c54a1a6f81560203c29914))

## [2.2.0](https://github.com/mabulu-inc/db/compare/v2.0.3...v2.2.0) (2025-03-17)


### Features

* update mutation ([6ee7f99](https://github.com/mabulu-inc/db/commit/6ee7f998d1451fb569c737c1604613ff7ce0069b))

### [2.0.3](https://github.com/mabulu-inc/db/compare/v2.0.2...v2.0.3) (2024-08-29)


### Bug Fixes

* fallback to normal connect string ([fd1a15c](https://github.com/mabulu-inc/db/commit/fd1a15c600103014a263b885f58c22ca808e38fe))

### [2.0.2](https://github.com/mabulu-inc/db/compare/v2.0.1...v2.0.2) (2024-08-29)


### Bug Fixes

* does not supply default value to prefix ([5110b20](https://github.com/mabulu-inc/db/commit/5110b20bd372f0a595e7be8714a84c18ef8a09e5))

### [2.0.1](https://github.com/mabulu-inc/db/compare/v2.0.0...v2.0.1) (2024-08-29)


### Bug Fixes

* uses npm test ([f6c7e00](https://github.com/mabulu-inc/db/commit/f6c7e0059ada60b8ba4cdeb1ce26b7213f8b5821))

## [2.0.0](https://github.com/mabulu-inc/db/compare/v1.3.1...v2.0.0) (2024-08-29)


### ⚠ BREAKING CHANGES

* export connect method

### Features

* export connect method ([705114f](https://github.com/mabulu-inc/db/commit/705114f3567d2633ed3b3b42f4cba526a1e76e15))

### [1.3.1](https://github.com/mabulu-inc/db/compare/v1.3.0...v1.3.1) (2024-08-28)


### Bug Fixes

* npm pkg fix ([81b1860](https://github.com/mabulu-inc/db/commit/81b186073538a801f1bf6185bbb826f186a7b78a))

## [1.3.0](https://github.com/mabulu-inc/db/compare/v1.2.0...v1.3.0) (2024-08-28)


### Features

* enable env var prefixing ([a97341b](https://github.com/mabulu-inc/db/commit/a97341b8edeaf33065a768a6db7a62c57d65baaa))

## [1.2.0](https://github.com/mabulu-inc/db/compare/v1.1.0...v1.2.0) (2024-08-28)


### Features

* lint during release ([b73bc71](https://github.com/mabulu-inc/db/commit/b73bc714476291f74d41299637b6442e8721dc54))

## 1.1.0 (2024-08-28)


### Features

* add standard-version and release script ([8452ecd](https://github.com/mabulu-inc/db/commit/8452ecd23c28afcf5fb9e24cb77fcc1c19e89742))
