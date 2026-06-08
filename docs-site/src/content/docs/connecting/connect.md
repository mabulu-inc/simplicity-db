---
title: connect
description: Env-driven pg.Pool factory with optional pool config.
---

```ts
connect(prefix?: string, options?: pg.PoolConfig): pg.Pool
```

The default export. Builds a `pg.Pool` from an environment variable.

## Reading the connection string

Without a `prefix`, it reads `DATABASE_URL`. With a `prefix`, it reads
`${PREFIX}_DATABASE_URL` and falls back to `DATABASE_URL` — useful when
one process talks to more than one database.

```ts
import connect from '@smplcty/db';

const pool = connect();          // DATABASE_URL
const replica = connect('REPLICA'); // REPLICA_DATABASE_URL || DATABASE_URL
```

## Pool options

The second argument is any [`pg.PoolConfig`](https://node-postgres.com/apis/pool).
It's merged **over** the resolved `connectionString`, so you can set
guardrails and pool sizing — or override the connection string itself
(for example with [`resolveDatabaseUrl`](/simplicity-db/connecting/resolve-database-url/)).

```ts
// Server-side guardrails for a user-facing pool
const app = connect(undefined, {
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 60_000,
});
```

`statement_timeout` makes Postgres abort a runaway query and free the
backend — a client-side `query_timeout` would only stop you waiting
while the query kept running.

:::note
`connect()` does not load `.env`. Ensure your environment variables are
set before importing the module that calls it. See
[Installation](/simplicity-db/getting-started/installation/).
:::
