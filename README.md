# @smplcty/db

Tiny TypeScript helpers for `pg` — an env-driven `Pool` factory, a
`withClient` checkout-run-release wrapper, a parameterized UPDATE
statement generator, and friendly error messages for common
Postgres constraint codes.

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

### `connect(prefix?)` — env-driven Pool factory

```ts
import connect from '@smplcty/db';

// Reads DATABASE_URL
const pool = connect();

// Reads REPLICA_DATABASE_URL, falls back to DATABASE_URL
const replica = connect('REPLICA');
```

If `${PREFIX}_DATABASE_URL` is unset, it falls through to
`DATABASE_URL`. No `.env` loading — do that at the edge of your
application.

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
changed, so `updated_at` isn't touched for no-op writes.

### `friendlyError(err)` — human-readable constraint errors

Maps common `pg` error codes (unique violation, foreign key
violation, not-null violation, string truncation, …) to
user-friendly messages:

```ts
import { friendlyError } from '@smplcty/db';

try {
  await client.query('insert into users (email) values ($1)', [dupe]);
} catch (err) {
  // "A user with that email already exists."
  throw new Error(friendlyError(err));
}
```

Unknown codes return a generic "unexpected database error" message.

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
