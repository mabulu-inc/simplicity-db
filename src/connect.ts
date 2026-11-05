import pg from 'pg';

const { Pool } = pg;

/**
 * The pool options `connect` requires. Both limits are enforced by the server, in
 * milliseconds. pg sends nothing for `0`, so the session keeps the role's or
 * database's own setting, which Postgres leaves unlimited unless one is configured.
 */
export type ConnectOptions = pg.PoolConfig & {
  statement_timeout: number;
  idle_in_transaction_session_timeout: number;
};

const REQUIRED_LIMITS = ['statement_timeout', 'idle_in_transaction_session_timeout'] as const;

/**
 * Build a `pg.Pool` from a `DATABASE_URL` env var.
 *
 * If `prefix` is given, the function looks for `${PREFIX}_DATABASE_URL`
 * first and falls back to `DATABASE_URL`. Use this when one process
 * needs to connect to multiple databases — for example a dev-server
 * that hosts both `handle-graphql` (default `DATABASE_URL`) and
 * `sign-in` (`SIGNIN_DATABASE_URL`).
 *
 * `options` must set `statement_timeout` and
 * `idle_in_transaction_session_timeout`. Postgres has no limit on either by
 * default, so a query whose client has gone away keeps running, and a
 * connection left inside a transaction holds back vacuum, for as long as the
 * server is up. Work that legitimately needs longer raises the limit for its
 * own transaction with `SET LOCAL statement_timeout`. A `statement_timeout`
 * parameter in the connection string, or a later `SET`, still overrides the
 * pool's value.
 *
 * Any other `pg.PoolConfig` field (pool size, SSL, …) is passed through and
 * merged over the resolved `connectionString`, so a caller can also override
 * the connection string itself (e.g. with the result of `resolveDatabaseUrl`).
 *
 * @example
 * ```ts
 * import connect from '@smplcty/db';
 *
 * const app = connect(undefined, {
 *   statement_timeout: 30_000,
 *   idle_in_transaction_session_timeout: 60_000,
 * });
 * const replica = connect('REPLICA', {   // REPLICA_DATABASE_URL || DATABASE_URL
 *   statement_timeout: 300_000,
 *   idle_in_transaction_session_timeout: 300_000,
 * });
 * ```
 *
 * The function does NOT call `dotenv/config`. Make sure your env vars
 * are set before importing the module that calls `connect()` — either
 * by your runtime (Lambda env vars, docker-compose, systemd) or by
 * importing `dotenv/config` yourself at the top of your entrypoint.
 */
export default function connect(
  prefix: string | undefined,
  options: ConnectOptions,
): pg.Pool {
  const envKey = prefix ? `${prefix}_DATABASE_URL` : 'DATABASE_URL';
  const config: pg.PoolConfig = { connectionString: process.env[envKey] ?? process.env['DATABASE_URL'], ...options };
  for (const limit of REQUIRED_LIMITS) {
    const ms: unknown = config[limit];
    if (typeof ms !== 'number' || !Number.isInteger(ms) || ms < 0) {
      throw new TypeError(
        `connect() requires ${limit} as a whole number of milliseconds (0 keeps the server default); got ${String(ms)}`,
      );
    }
  }
  return new Pool(config);
}
