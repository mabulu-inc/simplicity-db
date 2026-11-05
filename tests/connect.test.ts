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

const LIMITS = { statement_timeout: 30_000, idle_in_transaction_session_timeout: 60_000 };

describe('connect', () => {
  it('returns a working pool from DATABASE_URL', async () => {
    pool = connect(undefined, LIMITS);
    const { rows } = await pool.query<{ n: number }>('select 1 as n');
    expect(rows[0]?.n).toBe(1);
  });

  it('statement_timeout aborts a long query', async () => {
    pool = connect(undefined, { ...LIMITS, statement_timeout: 100 });
    // 57014 = query_canceled (canceling statement due to statement timeout)
    await expect(pool.query('select pg_sleep(1)')).rejects.toMatchObject({
      code: '57014',
    });
  });

  it('idle_in_transaction_session_timeout ends a connection left idle in a transaction', async () => {
    pool = connect(undefined, { ...LIMITS, idle_in_transaction_session_timeout: 100 });
    pool.on('error', () => {});
    const client = await pool.connect();
    client.on('error', () => {});
    try {
      await client.query('begin');
      await new Promise((r) => setTimeout(r, 500));
      await expect(client.query('select 1')).rejects.toThrow();
    } finally {
      client.release(true);
    }
  });

  it('refuses to build a pool without both limits', () => {
    // @ts-expect-error both limits are required
    expect(() => connect()).toThrow(/statement_timeout/);
    // @ts-expect-error idle_in_transaction_session_timeout is required
    expect(() => connect(undefined, { statement_timeout: 1_000 })).toThrow(/idle_in_transaction_session_timeout/);
    // @ts-expect-error statement_timeout is required
    expect(() => connect(undefined, { idle_in_transaction_session_timeout: 1_000 })).toThrow(/statement_timeout/);
  });

  it('refuses a limit that is not a whole number of milliseconds', () => {
    expect(() => connect(undefined, { ...LIMITS, statement_timeout: -1 })).toThrow(/statement_timeout/);
    expect(() => connect(undefined, { ...LIMITS, idle_in_transaction_session_timeout: 1.5 })).toThrow(/idle_in_transaction_session_timeout/);
  });

  it('checks only the limits it actually passes to the pool', () => {
    const inherited = Object.create(LIMITS) as typeof LIMITS;
    expect(() => connect(undefined, inherited)).toThrow(/statement_timeout/);
  });

  it('accepts an explicit 0, which leaves the server default in place', async () => {
    // A session default the pool's 0 must not replace.
    pool = connect(undefined, { statement_timeout: 0, idle_in_transaction_session_timeout: 0, options: '-c statement_timeout=5000' });
    const { rows } = await pool.query<{ t: string }>(`select current_setting('statement_timeout') as t`);
    expect(rows[0]?.t).toBe('5s');
  });
});
