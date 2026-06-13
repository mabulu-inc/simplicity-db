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

### `resolveDatabaseUrl(urlVar?, secretVar?, opts?)` — URL or secret JSON

Returns the connection string from `${urlVar}` if set, otherwise
parses `${secretVar}` as a Secrets-Manager-style JSON
(`{ host, port?, dbname?, username, password }`), percent-encoding
the credentials. It reads an env string already present in the
process — it does **not** call AWS.

The port defaults to `5432`, but there is **no default database name**
— a wrong one connects you somewhere you didn't mean to. `dbname` must
come from the secret or `opts.dbname`, else it throws.

```ts
import connect, { resolveDatabaseUrl } from '@smplcty/db';

const pool = connect(undefined, {
  // dbname from the secret JSON, or pass a fixed one:
  connectionString: resolveDatabaseUrl('DATABASE_URL', 'DB_SECRET', { dbname: 'salez1' }),
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
- `{ scalars: { plant_id: { type: 'int', key: true } } }` — constant
  bind params applied to every row (a partition key). The recordset is
  `$1`; scalars follow in declared order as `$2…$N`.

### `upsertMutation(table, fieldset, options?)` — UPDATE + INSERT

Returns `{ update, insert }` — the `updateMutation` above plus a
matching `INSERT … SELECT … WHERE NOT EXISTS`. The `WHERE NOT EXISTS`
guard is what keeps the INSERT from burning serial/bigserial sequence
values (it generates rows only for genuinely new keys), so it is always
emitted and `ON CONFLICT` never replaces it. Run both with the same
JSONB parameter:

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
handy for FK-resolving subselects or `lower(n.email)`. For a partition
key that's constant per batch (e.g. `plant_id`), use `scalars` instead
of repeating it in every row:

```ts
const { update, insert } = upsertMutation('tares', [
  ['source_id', 'text', true],
  ['weight',    'numeric'],
], { bulk: true, scalars: { plant_id: { type: 'int', key: true } } });

await client.query(update, [rows, plantId]); // $1 = rows, $2 = plantId
await client.query(insert, [rows, plantId]);
```

For FK-resolving upserts, a field can also declare a `kind` (5th tuple
slot):

- `'derived'` — an **output** column computed by its `valueExpr` (e.g. a
  subselect on a source column) and not present in the input JSON. It's
  omitted from the recordset, and both its SET and its change-check use
  the `valueExpr`.
- `'input'` — an **input-only** column kept in the recordset so other
  `valueExpr`s can reference `n.{field}`, but never written.

```ts
const { update, insert } = upsertMutation('tares', [
  ['source_id', 'text', true],
  ['unit',      'text', false, undefined, 'input'],   // feeds the subselect
  ['unit_id',   'int',  false,
    '(select unit_id from units where code = n.unit)', 'derived'],
], { bulk: true, scalars: { plant_id: { type: 'int', key: true } } });
```

The subselect is written once in the fieldset rather than repeated across
the UPDATE SET, the `IS DISTINCT FROM` check, and the INSERT.

For concurrent writers, pass `{ onConflict: 'DO NOTHING' }` to append
`ON CONFLICT DO NOTHING` to the INSERT. This is a **complement** to
`WHERE NOT EXISTS`, not a replacement: `WHERE NOT EXISTS` prevents
sequence churn, while `ON CONFLICT DO NOTHING` closes the race where two
writers both pass the not-exists check and then collide on the unique
constraint. It only affects the `insert` half.

```ts
const { insert } = upsertMutation('tares', fieldset, {
  bulk: true,
  onConflict: 'DO NOTHING',
});
// insert ends with: … WHERE NOT EXISTS (…) ON CONFLICT DO NOTHING RETURNING *
```

### `classifyPgError(err)` — structured error classification

Returns a **copy-free** `{ code, category, httpStatus, constraint?,
table?, column? }`. Pick the status from `httpStatus`/`category`, then
supply your **own** user-facing message — the library deliberately bakes
in no copy, so nothing leaks unless you choose to surface it:

```ts
import { classifyPgError } from '@smplcty/db';

try {
  await client.query('insert into users (email) values ($1)', [dupe]);
} catch (err) {
  const { httpStatus, category, constraint } = classifyPgError(err);
  reply.code(httpStatus).send({ message: messageFor(category, constraint) });
}
```

`category` is one of `unique_violation`, `foreign_key_violation`,
`not_null_violation`, `string_truncation`, `connection`, or `unknown`
(→ 409 / 400 / 400 / 400 / 503 / 500).

### `friendlyError(err)` — readable message **for logs only**

Maps common `pg` codes to a short string. ⚠️ The message embeds the
`table`/`column` names, so it is **for logs/diagnostics only — never
return it to clients** (that leaks your schema). Use `classifyPgError`
for responses.

```ts
import { friendlyError } from '@smplcty/db';

try {
  await client.query('insert into users (email) values ($1)', [dupe]);
} catch (err) {
  logger.warn({ err }, friendlyError(err)); // logs, not responses
  throw err;
}
```

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
