# @smplcty/db

Tiny TypeScript helpers for `pg` — an env-driven `Pool` factory, a
connection-string resolver, checkout-run-release and transaction
wrappers, a parameterized UPDATE/upsert statement generator, and
friendly error messages for common Postgres codes.

This package does **not** reinvent `pg`. It's a handful of thin
domain helpers we reach for on every service. Bring your own `pg`
as a peer dependency.

## Install

```sh
pnpm add @smplcty/db pg
pnpm add -D @types/pg
```

Requires Node ≥ 20 and `pg` ≥ 8.

## Usage

### `connect(prefix?, options?)` — env-driven Pool factory

```ts
import connect from '@smplcty/db';

// Reads DATABASE_URL
const pool = connect();

// Reads REPLICA_DATABASE_URL, falls back to DATABASE_URL
const replica = connect('REPLICA');

// Any pg.PoolConfig option — e.g. server-side guardrails
const app = connect(undefined, {
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 60_000,
});
```

If `${PREFIX}_DATABASE_URL` is unset, it falls through to
`DATABASE_URL`. `options` are merged over the resolved
`connectionString`, so you can also override it (see
`resolveDatabaseUrl`). No `.env` loading — do that at the edge of
your application.

### `resolveDatabaseUrl(urlVar?, secretVar?)` — URL or secret JSON

Returns the connection string from `${urlVar}` if set, otherwise
parses `${secretVar}` as a Secrets-Manager-style JSON
(`{ host, port?, dbname?, username, password }`), percent-encoding
the credentials. It reads an env string already present in the
process — it does **not** call AWS.

```ts
import connect, { resolveDatabaseUrl } from '@smplcty/db';

const pool = connect(undefined, {
  connectionString: resolveDatabaseUrl('DATABASE_URL', 'DB_SECRET'),
  statement_timeout: 30_000,
});
```

### `withClient(pool, fn)` — checkout-run-release

```ts
import connect, { withClient } from '@smplcty/db';

const pool = connect();

const rows = await withClient(pool, async (client) => {
  const { rows } = await client.query('select 1 as n');
  return rows;
});
```

The client is always released, even on error.

### `withTransaction(pool, fn)` — checkout-run-release in a transaction

Like `withClient`, but wraps the callback in `BEGIN`/`COMMIT`. On
throw it rolls back and rethrows the **original** error; if the
rollback itself fails (broken connection) the connection is
destroyed rather than reused.

```ts
import connect, { withTransaction } from '@smplcty/db';

const pool = connect();

await withTransaction(pool, async (client) => {
  // Set session/tenant GUCs here — withTransaction stays RLS-agnostic.
  await client.query("select set_config('app.tenant_id', $1, true)", [id]);
  await client.query('insert into widgets (name) values ($1)', [name]);
});
```

### `updateMutation(table, fieldset, updated?)` — UPDATE builder

Generates a parameterized `UPDATE … FROM jsonb_to_record($1)` query
that updates only rows whose values actually changed, and writes
`current_timestamp` to `updated_at`:

```ts
import { updateMutation } from '@smplcty/db';

const sql = updateMutation('users', [
  ['user_id', 'int', true],       // key field
  ['email',   'text'],
  ['name',    'text'],
]);

await client.query(sql, [JSON.stringify({
  user_id: 42,
  email: 'new@example.com',
  name: 'New Name',
})]);
```

The `IS DISTINCT FROM` predicates skip rows where nothing actually
changed, so `updated_at` isn't touched for no-op writes. The third
argument also accepts an options object:

- `{ updated: 'modified_at' }` — rename the timestamp column.
- `{ updated: false }` — write no timestamp (table has none).
- `{ bulk: true }` — read `$1` as a `jsonb_to_recordset` so one
  statement updates many rows.

### `upsertMutation(table, fieldset, options?)` — UPDATE + INSERT

Returns `{ update, insert }` — the `updateMutation` above plus a
matching `INSERT … SELECT … WHERE NOT EXISTS`. This is the
UPDATE-then-insert-where-not-exists pattern (**never** `ON CONFLICT`,
which burns serial sequence values). Run both with the same JSONB
parameter:

```ts
import { upsertMutation } from '@smplcty/db';

const { update, insert } = upsertMutation('tares', [
  ['plant_id',  'int',  true],
  ['source_id', 'text', true],
  ['weight',    'numeric'],
], { bulk: true });

const rows = JSON.stringify(records);
await client.query(update, [rows]);
await client.query(insert, [rows]);
```

Per-field `valueExpr`s (the 4th tuple slot) apply to both halves —
handy for FK-resolving subselects or `lower(n.email)`.

### `friendlyError(err)` / `classifyPgError(err)` — readable errors

`friendlyError` maps common `pg` codes (unique, foreign key,
not-null, truncation, connection failure, …) to a user-facing
string. `classifyPgError` returns `{ code, httpStatus, message }`
with the same message plus a suggested status (409 / 400 / 503 /
500):

```ts
import { friendlyError, classifyPgError } from '@smplcty/db';

try {
  await client.query('insert into users (email) values ($1)', [dupe]);
} catch (err) {
  const { httpStatus, message } = classifyPgError(err);
  reply.code(httpStatus).send({ message });
}
```

Unknown codes return a generic message and HTTP 500.

## Development

```sh
pnpm install
pnpm test         # boots docker-compose Postgres on port 54322
pnpm run lint
pnpm run typecheck
pnpm run build
```

Tests set `DATABASE_URL` themselves via the docker-compose fixture
when unset; in CI, set `DATABASE_URL` before running `pnpm test`
and the fixture is skipped.

## License

MIT
