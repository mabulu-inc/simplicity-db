import type { Pool, PoolClient } from 'pg';

/**
 * Check out a single connection, run the callback inside a
 * `BEGIN`/`COMMIT` transaction, and release the connection regardless
 * of how the callback finishes.
 *
 * On success the transaction is committed. If the callback throws, the
 * transaction is rolled back and the **original** error is rethrown (the
 * `ROLLBACK` itself never masks it). If the `ROLLBACK` also fails — which
 * usually means the underlying connection is broken — the connection is
 * destroyed rather than returned to the pool, so a poisoned connection
 * can't be handed to the next caller.
 *
 * This wrapper is deliberately **RLS-agnostic**: it sets no session
 * variables. Layer session/tenant GUCs inside the callback (or use a
 * higher-level helper such as `@smplcty/auth`'s `withSession`) so that
 * services with different RLS conventions can still share this plumbing.
 *
 * @example
 * ```ts
 * import connect, { withTransaction } from '@smplcty/db';
 *
 * const pool = connect();
 *
 * await withTransaction(pool, async (client) => {
 *   await client.query("select set_config('app.tenant_id', $1, true)", [id]);
 *   await client.query('insert into widgets (name) values ($1)', [name]);
 * });
 * ```
 *
 * @returns Whatever the callback returns.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let rollbackFailed = false;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The connection is likely broken; flag it so it's destroyed on
      // release instead of being reused. Swallow so the original error
      // (below) is what surfaces to the caller.
      rollbackFailed = true;
    }
    throw err;
  } finally {
    client.release(rollbackFailed);
  }
}
