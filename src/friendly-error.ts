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
  constraint?: string;
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
 * Translate a `pg` error into a short message — **for logs / internal
 * diagnostics only.**
 *
 * ⚠️ The returned string embeds the offending `table` and `column` names
 * (e.g. `… in table "users" (column "email")`). Returning it in an HTTP
 * response or any other untrusted channel leaks your schema. For
 * responses, use {@link classifyPgError} to pick a status/category and
 * supply your own user-facing copy.
 *
 * Returns `MESSAGES.DEFAULT` for any error this library doesn't
 * recognize, including a missing or undefined `error.code`. Never throws.
 *
 * @example
 * ```ts
 * import { friendlyError } from '@smplcty/db';
 *
 * try {
 *   await client.query('INSERT INTO users (email) VALUES ($1)', [email]);
 * } catch (err) {
 *   logger.warn({ err }, friendlyError(err)); // logs, not responses
 *   throw err;
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
 * Coarse category of a `pg` error — a stable, copy-free classification
 * the caller maps to its own user-facing message and i18n.
 */
export type PgErrorCategory =
  | 'unique_violation'
  | 'foreign_key_violation'
  | 'not_null_violation'
  | 'string_truncation'
  | 'connection'
  | 'unknown';

/**
 * Structured, **copy-free** classification of a `pg` error. Carries the
 * SQLSTATE `code`, a coarse `category`, a suggested `httpStatus`, and the
 * raw `constraint`/`table`/`column` fields — but no human-facing copy, so
 * nothing leaks unless the caller chooses to surface it. The app owns the
 * message (wording, i18n, what to expose).
 */
export interface PgErrorClassification {
  code: string | undefined;
  category: PgErrorCategory;
  httpStatus: number;
  constraint?: string;
  table?: string;
  column?: string;
}

function categoryFor(code: string | undefined): PgErrorCategory {
  switch (code) {
    case ERROR_CODES.UNIQUE_VIOLATION:
      return 'unique_violation';
    case ERROR_CODES.FOREIGN_KEY_VIOLATION:
    case ERROR_CODES.RESTRICT_VIOLATION:
      return 'foreign_key_violation';
    case ERROR_CODES.NOT_NULL_VIOLATION:
      return 'not_null_violation';
    case ERROR_CODES.STRING_DATA_RIGHT_TRUNCATION:
      return 'string_truncation';
    case ERROR_CODES.CONNECTION_EXCEPTION:
    case ERROR_CODES.CONNECTION_FAILURE:
    case ERROR_CODES.SQLCLIENT_UNABLE_TO_ESTABLISH:
    case ERROR_CODES.ADMIN_SHUTDOWN:
      return 'connection';
    default:
      return 'unknown';
  }
}

const HTTP_STATUS: Record<PgErrorCategory, number> = {
  unique_violation: 409,
  foreign_key_violation: 400,
  not_null_violation: 400,
  string_truncation: 400,
  connection: 503,
  unknown: 500,
};

/**
 * Classify a `pg` error into `{ code, category, httpStatus, constraint?,
 * table?, column? }` — no baked-in copy. Use this in request handlers:
 * pick the status from `httpStatus`/`category`, then build your own
 * message (keyed off `constraint` if you like). For a quick log line, see
 * {@link friendlyError}.
 *
 * @example
 * ```ts
 * import { classifyPgError } from '@smplcty/db';
 *
 * try {
 *   await client.query(sql, params);
 * } catch (err) {
 *   const { httpStatus, category, constraint } = classifyPgError(err);
 *   reply.code(httpStatus).send({ message: messageFor(category, constraint) });
 * }
 * ```
 */
export function classifyPgError(
  error: PgErrorLike | null | undefined,
): PgErrorClassification {
  const category = categoryFor(error?.code);
  return {
    code: error?.code,
    category,
    httpStatus: HTTP_STATUS[category],
    constraint: error?.constraint,
    table: error?.table,
    column: error?.column,
  };
}
