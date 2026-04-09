/**
 * Postgres SQLSTATE codes that this library knows how to translate
 * into user-friendly messages. The full list is at:
 * https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export const ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  RESTRICT_VIOLATION: '23001',
  NOT_NULL_VIOLATION: '23502',
  STRING_DATA_RIGHT_TRUNCATION: '22001',
  UNDEFINED_COLUMN: '42703',
} as const;

/**
 * Message templates the library returns. Each entry is either a plain
 * string (the default) or a function that interpolates table/column
 * info from the error.
 *
 * Exported so consumers can override individual messages if they want
 * different copy.
 */
export const MESSAGES = {
  UNIQUE_VIOLATION: (tableInfo: string, columnInfo: string): string =>
    `A record with these details already exists${tableInfo}${columnInfo}. Please use different values..`,
  FOREIGN_KEY_VIOLATION_MISSING_PARENT: (tableInfo: string): string =>
    `You're trying to reference a record that doesn't exist${tableInfo}.`,
  FOREIGN_KEY_VIOLATION_REFERENCED: (tableInfo: string): string =>
    `This record cannot be changed or removed${tableInfo} because it’s still referenced by other records.`,
  FOREIGN_KEY_VIOLATION_GENERIC: (tableInfo: string): string =>
    `This operation violates a foreign key constraint${tableInfo}. Please ensure all references are valid.`,
  NOT_NULL_VIOLATION: (tableInfo: string, columnInfo: string): string =>
    `A required field is missing${tableInfo}${columnInfo}. Please fill in all required information.`,
  STRING_DATA_RIGHT_TRUNCATION: (
    tableInfo: string,
    columnInfo: string,
  ): string =>
    `The text you entered is too long${tableInfo}${columnInfo}. Please shorten it and try again.`,
  UNDEFINED_COLUMN: (tableInfo: string, columnInfo: string): string =>
    `An unexpected database error occurred${tableInfo}${columnInfo}. Please try again later.`,
  DEFAULT:
    'An error occurred while processing your request. Please try again later.',
} as const;

/**
 * The shape of a `pg` error that `friendlyError` cares about. The
 * real `pg` error class has many more fields; this interface lists
 * the ones we read.
 */
export interface PgErrorLike {
  code?: string;
  table?: string;
  column?: string;
  detail?: string;
}

/**
 * Format the table and column hints used inside the message templates.
 * Exported because tests use it; not part of the canonical public API.
 */
export function formatTableColumnInfo(
  table: string | undefined,
  column: string | undefined,
): { tableInfo: string; columnInfo: string } {
  const tableInfo = table ? ` in table "${table}"` : '';
  const columnInfo = column ? ` (column "${column}")` : '';
  return { tableInfo, columnInfo };
}

/**
 * Translate a `pg` error into a short, user-facing message.
 *
 * Returns `MESSAGES.DEFAULT` for any error this library doesn't
 * recognize, including a missing or undefined `error.code`. Never
 * throws.
 *
 * The mapping is opinionated about a handful of common constraint
 * codes — uniqueness, foreign key, not-null, truncation, undefined
 * column. For anything beyond these, you'll get the default message
 * and should log the original error for the application's developers.
 *
 * @example
 * ```ts
 * import { friendlyError } from '@smplcty/db';
 *
 * try {
 *   await client.query('INSERT INTO users (email) VALUES ($1)', [email]);
 * } catch (err) {
 *   return res.status(400).json({ message: friendlyError(err) });
 * }
 * ```
 */
export function friendlyError(error: PgErrorLike | null | undefined): string {
  if (!error || !error.code) {
    return MESSAGES.DEFAULT;
  }

  const { code, table, column, detail } = error;
  const { tableInfo, columnInfo } = formatTableColumnInfo(table, column);

  if (
    code === ERROR_CODES.FOREIGN_KEY_VIOLATION ||
    code === ERROR_CODES.RESTRICT_VIOLATION
  ) {
    if (detail?.includes('is not present in table')) {
      return MESSAGES.FOREIGN_KEY_VIOLATION_MISSING_PARENT(tableInfo);
    }
    if (detail?.includes('referenced from table')) {
      return MESSAGES.FOREIGN_KEY_VIOLATION_REFERENCED(tableInfo);
    }
    return MESSAGES.FOREIGN_KEY_VIOLATION_GENERIC(tableInfo);
  }

  switch (code) {
    case ERROR_CODES.UNIQUE_VIOLATION:
      return MESSAGES.UNIQUE_VIOLATION(tableInfo, columnInfo);
    case ERROR_CODES.NOT_NULL_VIOLATION:
      return MESSAGES.NOT_NULL_VIOLATION(tableInfo, columnInfo);
    case ERROR_CODES.STRING_DATA_RIGHT_TRUNCATION:
      return MESSAGES.STRING_DATA_RIGHT_TRUNCATION(tableInfo, columnInfo);
    case ERROR_CODES.UNDEFINED_COLUMN:
      return MESSAGES.UNDEFINED_COLUMN(tableInfo, columnInfo);
    default:
      return MESSAGES.DEFAULT;
  }
}
