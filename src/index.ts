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
  type UpsertMutation,
} from './update-mutation.js';
export {
  friendlyError,
  formatTableColumnInfo,
  ERROR_CODES,
  MESSAGES,
  type PgErrorLike,
} from './friendly-error.js';
