import pg from 'pg';
const { Pool } = pg;

const makePool = (prefix = '') => {
  return new Pool({
    connectionString: process.env[`${prefix ? `${prefix}_` : ''}DATABASE_URL`],
  });
};

export { makePool };
export default makePool();
