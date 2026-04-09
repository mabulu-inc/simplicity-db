import type { Pool, PoolClient } from 'pg';

/**
 * Check out a single connection from the pool, run the callback, then
 * release the connection regardless of whether the callback throws.
 *
 * All queries inside `fn` run on the **same** connection, so session
 * variables (`SET LOCAL`, `set_config`, custom GUCs) and transaction
 * state apply consistently across the body. Without this, two
 * sequential `pool.query(...)` calls may land on different physical
 * connections from the pool and lose their relationship.
 *
 * The connection is released back to the pool with whatever session
 * state the callback left on it. If you've used `SET SESSION` (not
 * `SET LOCAL`) you should reset the variables before the callback
 * returns, or use `SET LOCAL` inside an explicit `BEGIN/COMMIT` so
 * the variables are scoped to the transaction.
 *
 * @example
 * ```ts
 * import connect, { withClient } from '@smplcty/db';
 *
 * const pool = connect();
 *
 * const result = await withClient(pool, async (client) => {
 *   await client.query("SET LOCAL app.tenant_id = '42'");
 *   const { rows } = await client.query('SELECT * FROM widgets');
 *   return rows;
 * });
 * ```
 *
 * @returns Whatever the callback returns.
 */
export async function withClient<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
