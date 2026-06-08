import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { withTransaction } from '../src/index.js';

// Own random schema so the suite is safe against a shared dev database.
const SCHEMA = `test_with_transaction_${randomBytes(4).toString('hex')}`;
const TABLE = `${SCHEMA}.items`;

let pool: pg.Pool;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: process.env['DATABASE_URL'] });
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA ${SCHEMA}`);
    await client.query(`CREATE TABLE ${TABLE} (id int primary key, v text)`);
  } finally {
    client.release();
  }
});

beforeEach(async () => {
  await pool.query(`TRUNCATE ${TABLE}`);
});

afterAll(async () => {
  await pool.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
  await pool.end();
});

describe('withTransaction', () => {
  it('commits writes made inside the callback', async () => {
    await withTransaction(pool, async (client) => {
      await client.query(`insert into ${TABLE} (id, v) values (1, 'a')`);
    });
    const { rows } = await pool.query<{ v: string }>(
      `select v from ${TABLE} where id = 1`,
    );
    expect(rows[0]?.v).toBe('a');
  });

  it('returns the callback result', async () => {
    const result = await withTransaction(pool, async () => 42);
    expect(result).toBe(42);
  });

  it('rolls back every write when the callback throws', async () => {
    await expect(
      withTransaction(pool, async (client) => {
        await client.query(`insert into ${TABLE} (id, v) values (2, 'b')`);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const { rowCount } = await pool.query(
      `select 1 from ${TABLE} where id = 2`,
    );
    expect(rowCount).toBe(0);
  });

  it('propagates the original error type, not a wrapped one', async () => {
    class CustomError extends Error {}
    await expect(
      withTransaction(pool, async () => {
        throw new CustomError('nope');
      }),
    ).rejects.toBeInstanceOf(CustomError);
  });

  it('releases the connection after repeated failures (no pool exhaustion)', async () => {
    // Default pool max is 10; fail more times than that, then prove a
    // fresh transaction can still acquire a connection.
    for (let i = 0; i < 15; i++) {
      await withTransaction(pool, async () => {
        throw new Error('fail');
      }).catch(() => undefined);
    }

    const ok = await withTransaction(pool, async (client) => {
      const { rows } = await client.query<{ n: number }>('select 1 as n');
      return rows[0]?.n;
    });
    expect(ok).toBe(1);
  });
});
