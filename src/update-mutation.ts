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
 * - `valueExpr` — optional SQL expression substituted in the SET
 *                 clause instead of `n.{field}`. Useful for derived
 *                 values like `current_timestamp` or `lower(n.email)`.
 */
export type FieldSpec = readonly [
  field: string,
  sqlType: string,
  isKey?: boolean,
  valueExpr?: string,
];

/**
 * Build a parameterized UPDATE statement that takes a single JSONB
 * record as `$1`, joins it against the target table by the key fields,
 * and updates non-key columns whose values have changed.
 *
 * The generated query also writes `current_timestamp` to the
 * `updated_at` column (or whatever name you pass as `updated`).
 *
 * The pattern is `UPDATE … FROM jsonb_to_record($1) AS n(…)` so the
 * single JSONB parameter carries every field's new value, and the
 * `IS DISTINCT FROM` predicates skip rows where nothing actually
 * changed (avoiding spurious row writes that would touch
 * `updated_at` and trip downstream change-detection).
 *
 * @example
 * ```ts
 * import updateMutation from '@smplcty/db/update-mutation';
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
 * @param table   - target table name (no schema qualifier)
 * @param fieldset - field specs (see {@link FieldSpec})
 * @param updated  - column name for the auto-updated timestamp
 *                   (default `updated_at`)
 */
export function updateMutation(
  table: string,
  fieldset: readonly FieldSpec[],
  updated?: string,
): string {
  const updatedColumn = updated ?? 'updated_at';

  const setClauses = fieldset
    .filter(([, , isKey]) => !isKey)
    .map(
      ([field, , , value]) => `
  ${field} = ${value ?? `n.${field}`}`,
    )
    .join(',');

  const recordTypes = fieldset
    .map(
      ([field, type]) => `
  ${field} ${type}`,
    )
    .join(',');

  const keyMatches = fieldset
    .filter(([, , isKey]) => isKey)
    .map(([field]) => `o.${field} = n.${field}`)
    .join(`
  and `);

  const distinctChecks = fieldset
    .filter(([, , isKey]) => !isKey)
    .map(([field]) => `o.${field} is distinct from n.${field}`)
    .join(`
    or `);

  return `
update ${table} o
set${setClauses},
  ${updatedColumn} = current_timestamp
from jsonb_to_record($1) as n(${recordTypes}
) where
  ${keyMatches}
  and (
    ${distinctChecks}
  )
returning *`;
}
