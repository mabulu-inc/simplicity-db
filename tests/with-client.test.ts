import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { withClient } from '../src/index.js';

let pool: pg.Pool;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: process.env['DATABASE_URL'] });
});

afterAll(async () => {
  await pool.end();
});

describe('withClient', () => {
  it('provides a working client to the callback', async () => {
    const result = await withClient(pool, async (client) => {
      const { rows } = await client.query<{ val: number }>('SELECT 1 AS val');
      return rows[0]?.val;
    });
    expect(result).toBe(1);
  });

  it('returns the callback result', async () => {
    const result = await withClient(pool, async () => 'hello');
    expect(result).toBe('hello');
  });

  it('releases the client back to the pool after success', async () => {
    await withClient(pool, async (client) => {
      await client.query('SELECT 1');
    });
    // If the client wasn't released, this second call would hang.
    await withClient(pool, async (client) => {
      await client.query('SELECT 1');
    });
  });

  it('releases the client back to the pool after the callback throws', async () => {
    await expect(
      withClient(pool, async () => {
        throw new Error('test error');
      }),
    ).rejects.toThrow('test error');

    // If client wasn't released, this would hang waiting for a connection.
    const result = await withClient(pool, async (client) => {
      const { rows } = await client.query<{ val: number }>('SELECT 1 AS val');
      return rows[0]?.val;
    });
    expect(result).toBe(1);
  });

  it('runs all queries on the same connection (session var visibility)', async () => {
    await withClient(pool, async (client) => {
      // SET SESSION is connection-scoped. If the second query landed on
      // a different physical connection, current_setting would return
      // an empty string.
      await client.query("SET SESSION app.test_var = 'works'");
      const { rows } = await client.query<{ val: string }>(
        "SELECT current_setting('app.test_var', true) AS val",
      );
      expect(rows[0]?.val).toBe('works');
    });
  });

  it('propagates the original error type, not a wrapped one', async () => {
    class CustomError extends Error {}
    await expect(
      withClient(pool, async () => {
        throw new CustomError('boom');
      }),
    ).rejects.toBeInstanceOf(CustomError);
  });
});
