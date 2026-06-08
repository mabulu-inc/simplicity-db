---
title: withClient
description: Checkout-run-release a single pooled connection.
---

```ts
withClient<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T>
```

Check out one connection from the pool, run the callback, then release
it — even if the callback throws. Returns whatever the callback returns.

```ts
import connect, { withClient } from '@smplcty/db';

const pool = connect();

const rows = await withClient(pool, async (client) => {
  const { rows } = await client.query('select 1 as n');
  return rows;
});
```

## Why it matters

Every query inside `fn` runs on the **same** physical connection, so
session state (`SET LOCAL`, `set_config`, custom GUCs) and transaction
state apply consistently across the body. Two separate `pool.query(...)`
calls may land on different connections and lose that relationship.

:::note
`withClient` runs no transaction. If you need `BEGIN`/`COMMIT`, use
[`withTransaction`](/simplicity-db/queries/with-transaction/). The
connection is released with whatever session state the callback left on
it — prefer `SET LOCAL` inside a transaction over `SET SESSION`.
:::
