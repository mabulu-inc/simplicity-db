import { afterEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import connect from '../src/index.js';

let pool: pg.Pool | undefined;

afterEach(async () => {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
});

describe('connect', () => {
  it('returns a working pool from DATABASE_URL when no options are given', async () => {
    pool = connect();
    const { rows } = await pool.query<{ n: number }>('select 1 as n');
    expect(rows[0]?.n).toBe(1);
  });

  it('passes through pg.PoolConfig options — statement_timeout aborts a long query', async () => {
    pool = connect(undefined, { statement_timeout: 100 });
    // 57014 = query_canceled (canceling statement due to statement timeout)
    await expect(pool.query('select pg_sleep(1)')).rejects.toMatchObject({
      code: '57014',
    });
  });
});
