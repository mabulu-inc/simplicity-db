import pg from 'pg';

const { Pool } = pg;

/**
 * Build a `pg.Pool` from a `DATABASE_URL` env var.
 *
 * If `prefix` is given, the function looks for `${PREFIX}_DATABASE_URL`
 * first and falls back to `DATABASE_URL`. Use this when one process
 * needs to connect to multiple databases — for example a dev-server
 * that hosts both `handle-graphql` (default `DATABASE_URL`) and
 * `sign-in` (`SIGNIN_DATABASE_URL`).
 *
 * @example
 * ```ts
 * import connect from '@smplcty/db';
 *
 * const pool = connect();          // reads DATABASE_URL
 * const signInPool = connect('SIGNIN'); // reads SIGNIN_DATABASE_URL || DATABASE_URL
 * ```
 *
 * The function does NOT call `dotenv/config`. Make sure your env vars
 * are set before importing the module that calls `connect()` — either
 * by your runtime (Lambda env vars, docker-compose, systemd) or by
 * importing `dotenv/config` yourself at the top of your entrypoint.
 */
export default function connect(prefix?: string): pg.Pool {
  const envKey = prefix ? `${prefix}_DATABASE_URL` : 'DATABASE_URL';
  const connectionString = process.env[envKey] ?? process.env['DATABASE_URL'];
  return new Pool({ connectionString });
}
