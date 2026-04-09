// Default export — the connect() factory, matching v2.x.
export { default } from './connect.js';

// Named exports
export { withClient } from './with-client.js';
export {
  updateMutation,
  type FieldSpec,
} from './update-mutation.js';
export {
  friendlyError,
  formatTableColumnInfo,
  ERROR_CODES,
  MESSAGES,
  type PgErrorLike,
} from './friendly-error.js';
