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
 * Pass `options` to set any `pg.PoolConfig` field — pool size, SSL,
 * `statement_timeout`, `idle_in_transaction_session_timeout`, and so
 * on. They are merged over the resolved `connectionString`, so a caller
 * can also override the connection string itself (e.g. by passing the
 * result of `resolveDatabaseUrl`).
 *
 * @example
 * ```ts
 * import connect from '@smplcty/db';
 *
 * const pool = connect();          // reads DATABASE_URL
 * const signInPool = connect('SIGNIN'); // reads SIGNIN_DATABASE_URL || DATABASE_URL
 *
 * // Server-side guardrails for a user-facing pool:
 * const app = connect(undefined, {
 *   statement_timeout: 30_000,
 *   idle_in_transaction_session_timeout: 60_000,
 * });
 * ```
 *
 * The function does NOT call `dotenv/config`. Make sure your env vars
 * are set before importing the module that calls `connect()` — either
 * by your runtime (Lambda env vars, docker-compose, systemd) or by
 * importing `dotenv/config` yourself at the top of your entrypoint.
 */
export default function connect(
  prefix?: string,
  options?: pg.PoolConfig,
): pg.Pool {
  const envKey = prefix ? `${prefix}_DATABASE_URL` : 'DATABASE_URL';
  const connectionString = process.env[envKey] ?? process.env['DATABASE_URL'];
  return new Pool({ connectionString, ...options });
}
