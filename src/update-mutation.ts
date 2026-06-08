/**
 * One field in an `updateMutation` fieldset.
 *
 * Tuple shape: `[fieldName, sqlType, isKey?, valueExpr?]`
 *
 * - `fieldName` — column name in the target table
 * - `sqlType`  — Postgres type used in the `jsonb_to_record` cast
 *   (e.g., `'int'`, `'text'`, `'jsonb'`, `'timestamptz'`)
 * - `isKey`    — when truthy, the field is part of the WHERE clause
 *                (used to match the row), not the SET clause. At
 *                least one key field is required.
 * - `valueExpr` — optional SQL expression substituted in the SET /
 *                 SELECT clause instead of `n.{field}`. Useful for
 *                 derived values like `lower(n.email)` or a FK-resolving
 *                 subselect such as
 *                 `(select id from parents where source_id = n.parent_source_id)`.
 */
export type FieldSpec = readonly [
  field: string,
  sqlType: string,
  isKey?: boolean,
  valueExpr?: string,
];

/**
 * Options shared by {@link updateMutation} and {@link upsertMutation}.
 *
 * - `updated` — name of the auto-updated timestamp column, or `false`
 *   to write no timestamp at all (for tables that have none). Defaults
 *   to `'updated_at'`.
 * - `bulk` — when `true`, read the JSONB parameter as a **recordset**
 *   (`jsonb_to_recordset`) so a single statement upserts many rows. When
 *   `false` (default), read it as a single record (`jsonb_to_record`).
 */
export interface MutationOptions {
  updated?: string | false;
  bulk?: boolean;
}

function resolveOptions(updated?: string | MutationOptions): {
  updatedColumn: string | null;
  source: 'jsonb_to_record' | 'jsonb_to_recordset';
} {
  const opts: MutationOptions =
    typeof updated === 'string' ? { updated } : (updated ?? {});
  return {
    updatedColumn:
      opts.updated === false ? null : (opts.updated ?? 'updated_at'),
    source: opts.bulk ? 'jsonb_to_recordset' : 'jsonb_to_record',
  };
}

function recordTypesOf(fieldset: readonly FieldSpec[]): string {
  return fieldset.map(([field, type]) => `\n  ${field} ${type}`).join(',');
}

function keyMatchesOf(fieldset: readonly FieldSpec[], indent: string): string {
  return fieldset
    .filter(([, , isKey]) => isKey)
    .map(([field]) => `o.${field} = n.${field}`)
    .join(`\n${indent}and `);
}

/**
 * Build a parameterized UPDATE statement that takes a JSONB parameter as
 * `$1`, joins it against the target table by the key fields, and updates
 * non-key columns whose values have changed.
 *
 * By default the query also writes `current_timestamp` to the
 * `updated_at` column. Pass `{ updated: 'other_col' }` to rename it, or
 * `{ updated: false }` to write no timestamp (for tables without one).
 * Pass `{ bulk: true }` to read `$1` as a `jsonb_to_recordset` so one
 * statement updates many rows.
 *
 * The `IS DISTINCT FROM` predicates skip rows where nothing actually
 * changed, so the timestamp isn't touched on no-op writes (and
 * downstream change-detection isn't tripped).
 *
 * @example
 * ```ts
 * import { updateMutation } from '@smplcty/db';
 *
 * const sql = updateMutation('users', [
 *   ['user_id', 'int', true],     // key
 *   ['email',   'text'],
 *   ['name',    'text'],
 * ]);
 *
 * await client.query(sql, [JSON.stringify({
 *   user_id: 42,
 *   email: 'new@example.com',
 *   name: 'New Name',
 * })]);
 * ```
 *
 * @param table    - target table name (may be schema-qualified)
 * @param fieldset - field specs (see {@link FieldSpec})
 * @param updated  - timestamp column name (string), or a
 *                   {@link MutationOptions} object. Defaults to
 *                   `'updated_at'`.
 */
export function updateMutation(
  table: string,
  fieldset: readonly FieldSpec[],
  updated?: string | MutationOptions,
): string {
  const { updatedColumn, source } = resolveOptions(updated);

  const setClauses = fieldset
    .filter(([, , isKey]) => !isKey)
    .map(([field, , , value]) => `\n  ${field} = ${value ?? `n.${field}`}`)
    .join(',');

  const timestampClause = updatedColumn
    ? `,\n  ${updatedColumn} = current_timestamp`
    : '';

  const distinctChecks = fieldset
    .filter(([, , isKey]) => !isKey)
    .map(([field]) => `o.${field} is distinct from n.${field}`)
    .join(`\n    or `);

  return `
update ${table} o
set${setClauses}${timestampClause}
from ${source}($1) as n(${recordTypesOf(fieldset)}
) where
  ${keyMatchesOf(fieldset, '  ')}
  and (
    ${distinctChecks}
  )
returning *`;
}

function insertMutation(
  table: string,
  fieldset: readonly FieldSpec[],
  source: 'jsonb_to_record' | 'jsonb_to_recordset',
): string {
  const columns = fieldset.map(([field]) => field).join(', ');
  const values = fieldset
    .map(([field, , , value]) => value ?? `n.${field}`)
    .join(', ');

  return `
insert into ${table} (${columns})
select ${values}
from ${source}($1) as n(${recordTypesOf(fieldset)}
) where not exists (
  select 1 from ${table} o
    where ${keyMatchesOf(fieldset, '      ')}
)
returning *`;
}

/**
 * The paired statements returned by {@link upsertMutation}. Run both
 * with the **same** JSONB parameter — `update` first (so changed rows
 * are touched), then `insert` (so genuinely new rows are added).
 */
export interface UpsertMutation {
  update: string;
  insert: string;
}

/**
 * Build a non-destructive upsert as two statements: the
 * {@link updateMutation} UPDATE plus a matching
 * `INSERT … SELECT … WHERE NOT EXISTS`. This is the
 * UPDATE-then-INSERT-where-not-exists pattern — **never** `ON CONFLICT`,
 * which burns serial sequence values and causes id gaps.
 *
 * Pass `{ bulk: true }` to drive both halves from a single
 * `jsonb_to_recordset` parameter — one round-trip each for any number of
 * rows. Per-field `valueExpr`s (FK-resolving subselects, `lower(...)`,
 * etc.) apply to both the UPDATE SET and the INSERT SELECT.
 *
 * @example
 * ```ts
 * import { upsertMutation } from '@smplcty/db';
 *
 * const { update, insert } = upsertMutation('tares', [
 *   ['plant_id',  'int',  true],
 *   ['source_id', 'text', true],
 *   ['weight',    'numeric'],
 * ], { bulk: true });
 *
 * const rows = JSON.stringify(records);
 * await client.query(update, [rows]);
 * await client.query(insert, [rows]);
 * ```
 */
export function upsertMutation(
  table: string,
  fieldset: readonly FieldSpec[],
  options: MutationOptions = {},
): UpsertMutation {
  const { source } = resolveOptions(options);
  return {
    update: updateMutation(table, fieldset, options),
    insert: insertMutation(table, fieldset, source),
  };
}
