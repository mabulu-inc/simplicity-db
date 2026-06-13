---
title: upsertMutation
description: Paired UPDATE + INSERT-where-not-exists, with optional ON CONFLICT DO NOTHING race backstop.
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

## Why `WHERE NOT EXISTS` instead of plain `ON CONFLICT`?

On tables with serial/identity primary keys, an `INSERT` that **attempts**
every row and relies on `ON CONFLICT` to skip duplicates still asks the
sequence for a value on each attempt — so conflicts **burn sequence
values** and leave gaps in the id space. The `WHERE NOT EXISTS` guard
generates rows only for keys that genuinely don't exist yet, so no
sequence value is wasted. It is always emitted and is never replaced by
`ON CONFLICT`.

## Race backstop: `onConflict`

`WHERE NOT EXISTS` and `ON CONFLICT DO NOTHING` solve **different**
problems and are complementary, not alternatives:

- `WHERE NOT EXISTS` is the anti-churn guard above — it keeps the INSERT
  from advancing the sequence for rows that already exist.
- `ON CONFLICT DO NOTHING` closes a **concurrency race**: between the
  not-exists check and the INSERT committing, two writers can both pass
  the check and then collide on the unique constraint, raising
  `unique_violation`. `ON CONFLICT DO NOTHING` swallows that without
  reintroducing churn — the sequence only advances for rows that actually
  insert.

Opt in with `{ onConflict: 'DO NOTHING' }` (default: omitted):

```ts
const { update, insert } = upsertMutation('tares', fieldset, {
  bulk: true,
  onConflict: 'DO NOTHING',
});
// insert ends with:  … where not exists (…) on conflict do nothing returning *
```

A bare `ON CONFLICT DO NOTHING` (no conflict target) is enough as a race
guard. The option has no effect on the `update` half.

## Options

Same [`MutationOptions`](/simplicity-db/mutations/update-mutation/#options)
as `updateMutation` — `{ bulk: true }` drives both halves from a single
`jsonb_to_recordset` (one round-trip each), and per-field `valueExpr`s
apply to both the UPDATE `SET` and the INSERT `SELECT`. `upsertMutation`
additionally reads `{ onConflict: 'DO NOTHING' }` (see above).
