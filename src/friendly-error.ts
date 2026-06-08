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
  // Connection / availability — class 08 plus admin shutdown. These
  // surface when the database is unreachable or going away; they map to
  // a 503 rather than a client error.
  CONNECTION_EXCEPTION: '08000',
  CONNECTION_FAILURE: '08006',
  SQLCLIENT_UNABLE_TO_ESTABLISH: '08001',
  ADMIN_SHUTDOWN: '57P01',
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
  SERVICE_UNAVAILABLE:
    'The service is temporarily unavailable. Please try again in a moment.',
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
    case ERROR_CODES.CONNECTION_EXCEPTION:
    case ERROR_CODES.CONNECTION_FAILURE:
    case ERROR_CODES.SQLCLIENT_UNABLE_TO_ESTABLISH:
    case ERROR_CODES.ADMIN_SHUTDOWN:
      return MESSAGES.SERVICE_UNAVAILABLE;
    default:
      return MESSAGES.DEFAULT;
  }
}

/**
 * Structured classification of a `pg` error: the SQLSTATE `code`, a
 * suggested `httpStatus`, and the same user-facing `message` that
 * {@link friendlyError} returns.
 */
export interface PgErrorClassification {
  code: string | undefined;
  httpStatus: number;
  message: string;
}

/**
 * Map a SQLSTATE code to a suggested HTTP status:
 *
 * - `409` — unique violation (conflict)
 * - `400` — foreign-key / restrict / not-null / truncation (bad input)
 * - `503` — connection failure / admin shutdown (unavailable)
 * - `500` — anything else, including a missing code
 */
function httpStatusFor(code: string | undefined): number {
  switch (code) {
    case ERROR_CODES.UNIQUE_VIOLATION:
      return 409;
    case ERROR_CODES.FOREIGN_KEY_VIOLATION:
    case ERROR_CODES.RESTRICT_VIOLATION:
    case ERROR_CODES.NOT_NULL_VIOLATION:
    case ERROR_CODES.STRING_DATA_RIGHT_TRUNCATION:
      return 400;
    case ERROR_CODES.CONNECTION_EXCEPTION:
    case ERROR_CODES.CONNECTION_FAILURE:
    case ERROR_CODES.SQLCLIENT_UNABLE_TO_ESTABLISH:
    case ERROR_CODES.ADMIN_SHUTDOWN:
      return 503;
    default:
      return 500;
  }
}

/**
 * Classify a `pg` error into `{ code, httpStatus, message }`. The
 * `message` is byte-for-byte what {@link friendlyError} returns, so a
 * service can wrap this in its own typed error class without restating
 * the copy.
 *
 * @example
 * ```ts
 * import { classifyPgError } from '@smplcty/db';
 *
 * try {
 *   await client.query(sql, params);
 * } catch (err) {
 *   const { httpStatus, message } = classifyPgError(err);
 *   reply.code(httpStatus).send({ message });
 * }
 * ```
 */
export function classifyPgError(
  error: PgErrorLike | null | undefined,
): PgErrorClassification {
  return {
    code: error?.code,
    httpStatus: httpStatusFor(error?.code),
    message: friendlyError(error),
  };
}
