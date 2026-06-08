---
title: Quick start
description: Connect, query in a transaction, and bulk-upsert in a few lines.
---

```ts
import connect, {
  withTransaction,
  upsertMutation,
  classifyPgError,
} from '@smplcty/db';

// 1. A pool from DATABASE_URL, with a server-side guardrail.
const pool = connect(undefined, { statement_timeout: 30_000 });

// 2. A bulk, non-destructive upsert (UPDATE then INSERT-where-not-exists).
const { update, insert } = upsertMutation(
  'widgets',
  [
    ['id', 'int', true], // key
    ['name', 'text'],
  ],
  { bulk: true },
);

// 3. Run both halves in one transaction with the same JSONB parameter.
const rows = JSON.stringify([
  { id: 1, name: 'a' },
  { id: 2, name: 'b' },
]);

try {
  await withTransaction(pool, async (client) => {
    await client.query(update, [rows]);
    await client.query(insert, [rows]);
  });
} catch (err) {
  const { httpStatus, message } = classifyPgError(err);
  console.error(httpStatus, message);
}
```

From here, see each helper:

- [`connect`](/simplicity-db/connecting/connect/) and
  [`resolveDatabaseUrl`](/simplicity-db/connecting/resolve-database-url/)
- [`withClient`](/simplicity-db/queries/with-client/) and
  [`withTransaction`](/simplicity-db/queries/with-transaction/)
- [`updateMutation`](/simplicity-db/mutations/update-mutation/) and
  [`upsertMutation`](/simplicity-db/mutations/upsert-mutation/)
- [`friendlyError`](/simplicity-db/errors/friendly-error/) and
  [`classifyPgError`](/simplicity-db/errors/classify-pg-error/)
