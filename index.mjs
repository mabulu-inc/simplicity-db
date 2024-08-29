import pg from 'pg';
const { Pool } = pg;

const connect = (prefix) => {
  const connectionString =
    process.env[`${prefix ? `${prefix}_` : ''}DATABASE_URL`];

  return new Pool({
    connectionString,
  });
};

export default connect;
