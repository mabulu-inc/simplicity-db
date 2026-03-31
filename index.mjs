import pg from 'pg';
import updateMutation from './src/update-mutation.mjs';
import { friendlyError } from './src/friendly-error.mjs';
const { Pool } = pg;

const connect = (prefix) => {
  const connectionString =
    process.env[`${prefix ? `${prefix}_` : ''}DATABASE_URL`] ||
    process.env.DATABASE_URL;

  return new Pool({
    connectionString,
  });
};

/**
 * Check out a single connection from the pool, run the callback, then release.
 * All queries inside `fn` run on the SAME connection, so session variables
 * and RLS context work correctly.
 */
const withClient = async (pool, fn) => {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
};

export { friendlyError, updateMutation, withClient };
export default connect;
