---
title: connect
description: Env-driven pg.Pool factory that requires server-side time limits.
---

```ts
connect(prefix: string | undefined, options: ConnectOptions): pg.Pool

type ConnectOptions = pg.PoolConfig & {
  statement_timeout: number;                    // ms; 0 keeps the server default
  idle_in_transaction_session_timeout: number;  // ms; 0 keeps the server default
};
```

The default export. Builds a `pg.Pool` from an environment variable.

## Reading the connection string

Without a `prefix`, it reads `DATABASE_URL`. With a `prefix`, it reads
`${PREFIX}_DATABASE_URL` and falls back to `DATABASE_URL` — useful when
one process talks to more than one database.

```ts
import connect from '@smplcty/db';

const limits = { statement_timeout: 30_000, idle_in_transaction_session_timeout: 60_000 };

const pool = connect(undefined, limits);    // DATABASE_URL
const replica = connect('REPLICA', limits); // REPLICA_DATABASE_URL || DATABASE_URL
```

## Time limits

`statement_timeout` and `idle_in_transaction_session_timeout` are
required, in milliseconds, and `connect()` throws without them. Postgres
has no limit on either by default: a query whose client has gone away
keeps running, and a connection left inside a transaction holds back
vacuum, for as long as the server is up. Both are enforced by the
server — a client-side `query_timeout` would only stop you waiting while
the query kept running.

`0` sends no limit, so the session keeps the role's or database's own
setting — none, unless one is configured. It has to be written out, so it
shows up in review.

The pool's values are a default, not a ceiling: a `statement_timeout`
parameter in the connection string, or a later `SET`, still overrides them.

Work that legitimately needs longer raises the limit for its own
transaction, leaving the pool's default in place for everything else:

```ts
await withTransaction(pool, async (client) => {
  await client.query("select set_config('statement_timeout', '600000', true)");
  // ... the long statement
});
```

## Other pool options

Any other [`pg.PoolConfig`](https://node-postgres.com/apis/pool) field
is passed through and merged **over** the resolved `connectionString`,
so you can set pool sizing — or override the connection string itself
(for example with [`resolveDatabaseUrl`](/simplicity-db/connecting/resolve-database-url/)).

:::note
`connect()` does not load `.env`. Ensure your environment variables are
set before importing the module that calls it. See
[Installation](/simplicity-db/getting-started/installation/).
:::
