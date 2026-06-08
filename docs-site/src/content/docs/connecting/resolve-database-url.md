---
title: resolveDatabaseUrl
description: Resolve a connection string from a URL var or a secret JSON var.
---

```ts
resolveDatabaseUrl(urlVar = 'DATABASE_URL', secretVar = 'DB_SECRET'): string
```

Returns a Postgres connection string from one of two env vars.

- If `${urlVar}` is set and non-empty, it wins and is returned as-is.
- Otherwise `${secretVar}` is parsed as JSON of shape
  `{ host, port?, dbname?, username, password }` and assembled into a
  `postgresql://` URL with the username and password percent-encoded.
  The port defaults to `5432` and the database to `postgres`.

```ts
import connect, { resolveDatabaseUrl } from '@smplcty/db';

const pool = connect(undefined, {
  connectionString: resolveDatabaseUrl('DATABASE_URL', 'DB_SECRET'),
  statement_timeout: 30_000,
});
```

:::caution
This reads an env string **already present in the process** — it does
not call AWS or any secrets backend. Fetch the secret at the edge of
your application (e.g. in your entrypoint or deployment config) and
expose it as an env var, the same way you would a `DATABASE_URL`.
:::

## Errors

It throws (never returns a malformed string) when:

- neither `${urlVar}` nor `${secretVar}` is set,
- the secret is not valid JSON, or
- the secret is missing `host` or `username`.
