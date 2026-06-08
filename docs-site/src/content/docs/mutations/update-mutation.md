---
title: updateMutation
description: Generate a parameterized, change-only UPDATE from a field list.
---

```ts
updateMutation(
  table: string,
  fieldset: readonly FieldSpec[],
  updated?: string | MutationOptions,
): string
```

Builds a parameterized `UPDATE … FROM jsonb_to_record($1)` that joins a
JSONB parameter against the target table by its key fields and updates
non-key columns whose values actually changed.

```ts
import { updateMutation } from '@smplcty/db';

const sql = updateMutation('users', [
  ['user_id', 'int', true], // key field
  ['email', 'text'],
  ['name', 'text'],
]);

await client.query(sql, [
  JSON.stringify({ user_id: 42, email: 'new@example.com', name: 'New Name' }),
]);
```

The `IS DISTINCT FROM` predicates skip rows where nothing changed, so
`updated_at` isn't touched on no-op writes (and downstream
change-detection isn't tripped).

## FieldSpec

Each field is a tuple `[field, sqlType, isKey?, valueExpr?]`:

| Element | Meaning |
| --- | --- |
| `field` | column name |
| `sqlType` | Postgres type for the `jsonb_to_record` cast (`'int'`, `'text'`, `'timestamptz'`, …) |
| `isKey` | when truthy, the field is matched in the `WHERE` clause instead of being set |
| `valueExpr` | optional SQL substituted for `n.{field}` — e.g. `lower(n.email)` or an FK-resolving subselect |

## Options

The third argument is either a column name (string) or an options
object:

| Option | Effect |
| --- | --- |
| `updated: 'modified_at'` | name of the auto-updated timestamp column (default `'updated_at'`) |
| `updated: false` | write **no** timestamp — for tables that don't have one |
| `bulk: true` | read `$1` as a `jsonb_to_recordset` so one statement updates many rows |

```ts
updateMutation('events', fieldset, { updated: false, bulk: true });
```

To also insert genuinely new rows, see
[`upsertMutation`](/simplicity-db/mutations/upsert-mutation/).
