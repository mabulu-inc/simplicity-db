// Default export — the connect() factory, matching v2.x.
export { default } from './connect.js';

// Named exports
export { withClient } from './with-client.js';
export { withTransaction } from './with-transaction.js';
export { resolveDatabaseUrl } from './resolve-database-url.js';
export {
  updateMutation,
  upsertMutation,
  type FieldSpec,
  type MutationOptions,
  type ScalarSpec,
  type UpsertMutation,
} from './update-mutation.js';
export {
  friendlyError,
  classifyPgError,
  formatTableColumnInfo,
  ERROR_CODES,
  MESSAGES,
  type PgErrorLike,
  type PgErrorClassification,
  type PgErrorCategory,
} from './friendly-error.js';
