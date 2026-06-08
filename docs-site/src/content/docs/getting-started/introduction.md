---
title: Introduction
description: What @smplcty/db is, and what it deliberately is not.
---

`@smplcty/db` is a handful of tiny TypeScript helpers for
[`pg`](https://node-postgres.com) (node-postgres). It's the code you'd
otherwise copy between services: an env-driven `Pool` factory, a
connection-string resolver, checkout/transaction wrappers, a
parameterized UPDATE/upsert generator, and friendly Postgres error
messages.

## What it is not

- **Not an ORM or query builder.** You write SQL. The only SQL it
  generates is the mechanical UPDATE/INSERT-upsert pattern, from a
  field list you provide.
- **Not a `pg` replacement.** `pg` is a peer dependency — you install it
  and pick the version. Every helper takes a `pg.Pool` or `PoolClient`.
- **Not coupled to your schema.** No helper assumes a table, column, or
  session variable exists. SQL generators take the table and columns as
  arguments; the transaction wrapper sets no session GUCs (layer RLS on
  top, e.g. with `@smplcty/auth`).

## Design principles

- **Stay thin over `pg`.** If a feature belongs in `pg`, it belongs in
  `pg`.
- **Simplicity over cleverness.** The best change is usually the one
  that removes code.
- **Behavioral tests only.** The suite runs against a real Postgres —
  no mocks.

Continue to [Installation](/simplicity-db/getting-started/installation/).
