---
title: upsertMutation
description: Paired UPDATE + INSERT-where-not-exists, never ON CONFLICT.
---

```ts
upsertMutation(
  table: string,
  fieldset: readonly FieldSpec[],
  options?: MutationOptions,
): { update: string; insert: string }
```

Returns two statements for a non-destructive upsert: the
[`updateMutation`](/simplicity-db/mutations/update-mutation/) UPDATE plus
a matching `INSERT … SELECT … WHERE NOT EXISTS`. Run both with the
**same** JSONB parameter — `update` first (so changed rows are touched),
then `insert` (so genuinely new rows are added).

```ts
import { upsertMutation } from '@smplcty/db';

const { update, insert } = upsertMutation(
  'tares',
  [
    ['plant_id', 'int', true],
    ['source_id', 'text', true],
    ['weight', 'numeric'],
  ],
  { bulk: true },
);

const rows = JSON.stringify(records);
await client.query(update, [rows]);
await client.query(insert, [rows]);
```

## Why not `ON CONFLICT`?

On tables with serial/identity primary keys, `INSERT … ON CONFLICT`
**burns sequence values** on every conflict, leaving gaps in the id
space. The UPDATE-then-INSERT-where-not-exists pattern only inserts rows
that genuinely don't exist, so no sequence value is wasted.

## Options

Same [`MutationOptions`](/simplicity-db/mutations/update-mutation/#options)
as `updateMutation` — `{ bulk: true }` drives both halves from a single
`jsonb_to_recordset` (one round-trip each), and per-field `valueExpr`s
apply to both the UPDATE `SET` and the INSERT `SELECT`.
