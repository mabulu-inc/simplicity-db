import pg from 'pg';
import updateMutation from './src/update-mutation.mjs';
import { friendlyError } from '../src/friendly-error.mjs';
const { Pool } = pg;

const connect = (prefix) => {
  const connectionString =
    process.env[`${prefix ? `${prefix}_` : ''}DATABASE_URL`] ||
    process.env.DATABASE_URL;

  return new Pool({
    connectionString,
  });
};

export { friendlyError, updateMutation };
export default connect;
