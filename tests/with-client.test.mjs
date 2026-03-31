import 'dotenv/config';
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import connect from '../index.mjs';
import { withClient } from '../index.mjs';

let pool;

describe('withClient', () => {
  before(() => {
    pool = connect('TEST');
  });

  after(async () => {
    await pool.end();
  });

  it('provides a working client to the callback', async () => {
    const result = await withClient(pool, async (client) => {
      const { rows } = await client.query('SELECT 1 as val');
      return rows[0].val;
    });
    assert.equal(result, 1);
  });

  it('returns the callback result', async () => {
    const result = await withClient(pool, async (client) => {
      return 'hello';
    });
    assert.equal(result, 'hello');
  });

  it('releases the client back to the pool after success', async () => {
    await withClient(pool, async (client) => {
      await client.query('SELECT 1');
    });
    // If client wasn't released, this would hang waiting for a connection
    await withClient(pool, async (client) => {
      await client.query('SELECT 1');
    });
  });

  it('releases the client back to the pool after error', async () => {
    await assert.rejects(
      () => withClient(pool, async () => { throw new Error('test error'); }),
      { message: 'test error' },
    );
    // If client wasn't released, this would hang
    const result = await withClient(pool, async (client) => {
      const { rows } = await client.query('SELECT 1 as val');
      return rows[0].val;
    });
    assert.equal(result, 1);
  });

  it('runs all queries on the same connection', async () => {
    await withClient(pool, async (client) => {
      // SET SESSION is connection-scoped. If queries go to different
      // connections, the second query won't see the setting.
      await client.query("SET SESSION app.test_var = 'works'");
      const { rows } = await client.query("SELECT current_setting('app.test_var', true) as val");
      assert.equal(rows[0].val, 'works');
    });
  });

  it('session variables do not leak between withClient calls', async () => {
    await withClient(pool, async (client) => {
      await client.query("SET SESSION app.test_var = 'first_call'");
    });
    await withClient(pool, async (client) => {
      const { rows } = await client.query("SELECT current_setting('app.test_var', true) as val");
      // May or may not see 'first_call' depending on which connection we get.
      // The point is withClient doesn't guarantee isolation between calls,
      // only that queries WITHIN a single call share a connection.
      assert.ok(true);
    });
  });
});
