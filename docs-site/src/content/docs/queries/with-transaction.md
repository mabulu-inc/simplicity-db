---
title: withTransaction
description: Checkout-run-release inside a BEGIN/COMMIT transaction.
---

```ts
withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T>
```

Like [`withClient`](/simplicity-db/queries/with-client/), but wraps the
callback in a transaction.

- On success: `COMMIT`.
- On throw: `ROLLBACK`, then rethrow the **original** error — the
  rollback never masks it.
- If the `ROLLBACK` itself fails (usually a broken connection): the
  connection is **destroyed** rather than returned to the pool, so a
  poisoned connection is never handed to the next caller.

```ts
import connect, { withTransaction } from '@smplcty/db';

const pool = connect();

await withTransaction(pool, async (client) => {
  await client.query('insert into widgets (name) values ($1)', [name]);
  await client.query('update counters set n = n + 1 where k = $1', ['widgets']);
});
```

## RLS-agnostic by design

`withTransaction` sets no session variables. Layer session/tenant GUCs
inside the callback so services with different RLS conventions can share
the same wrapper:

```ts
await withTransaction(pool, async (client) => {
  await client.query("select set_config('app.tenant_id', $1, true)", [id]);
  return client.query('select * from widgets'); // RLS now applies
});
```

This is the seam higher-level helpers (such as `@smplcty/auth`'s
`withSession`) build on.
