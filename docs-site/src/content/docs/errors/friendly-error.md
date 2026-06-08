---
title: friendlyError
description: Map a pg error to a short, user-facing message.
---

```ts
friendlyError(error: PgErrorLike | null | undefined): string
```

Translates a `pg` error into a short message safe to show a user. Never
throws; returns `MESSAGES.DEFAULT` for anything it doesn't recognize
(including a missing code).

```ts
import { friendlyError } from '@smplcty/db';

try {
  await client.query('insert into users (email) values ($1)', [dupe]);
} catch (err) {
  return res.status(400).json({ message: friendlyError(err) });
}
```

## Recognized codes

| SQLSTATE | Constant | Message theme |
| --- | --- | --- |
| `23505` | `UNIQUE_VIOLATION` | already exists |
| `23503` / `23001` | `FOREIGN_KEY_VIOLATION` / `RESTRICT_VIOLATION` | missing reference / still referenced |
| `23502` | `NOT_NULL_VIOLATION` | required field missing |
| `22001` | `STRING_DATA_RIGHT_TRUNCATION` | value too long |
| `42703` | `UNDEFINED_COLUMN` | unexpected database error |
| `08000` / `08006` / `08001` / `57P01` | connection / shutdown | service temporarily unavailable |

## Customizing copy

`ERROR_CODES` and `MESSAGES` are exported so you can extend or override
individual messages. For a status code alongside the message, use
[`classifyPgError`](/simplicity-db/errors/classify-pg-error/).
