---
title: classifyPgError
description: Structured { code, httpStatus, message } classification of a pg error.
---

```ts
classifyPgError(error: PgErrorLike | null | undefined): {
  code: string | undefined;
  httpStatus: number;
  message: string;
}
```

The structured counterpart to
[`friendlyError`](/simplicity-db/errors/friendly-error/). Returns the
SQLSTATE `code`, a suggested `httpStatus`, and the **same** user-facing
`message` — so a service can wrap it in its own typed error class
without restating the copy.

```ts
import { classifyPgError } from '@smplcty/db';

try {
  await client.query(sql, params);
} catch (err) {
  const { httpStatus, message } = classifyPgError(err);
  reply.code(httpStatus).send({ message });
}
```

## Status mapping

| `httpStatus` | When |
| --- | --- |
| `409` | unique violation |
| `400` | foreign-key / restrict / not-null / truncation |
| `503` | connection failure / admin shutdown |
| `500` | anything else, including a missing code |

The `message` is byte-for-byte what `friendlyError` returns for the same
error, so the two helpers never disagree.
