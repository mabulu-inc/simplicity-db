import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { upsertMutation, type FieldSpec } from '../src/index.js';

const SCHEMA = `test_upsert_${randomBytes(4).toString('hex')}`;
const TABLE = `${SCHEMA}.widgets`;

let pool: pg.Pool;

const fieldset: FieldSpec[] = [
  ['id', 'int', true],
  ['name', 'text'],
];
const { update, insert } = upsertMutation(TABLE, fieldset, { bulk: true });

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: process.env['DATABASE_URL'] });
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA ${SCHEMA}`);
    await client.query(`
      CREATE TABLE ${TABLE} (
        id         int primary key,
        name       text not null,
        updated_at timestamptz not null default now()
      )
    `);
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

describe('upsertMutation — round trip against real Postgres', () => {
  it('inserts genuinely new rows', async () => {
    const rows = JSON.stringify([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);
    await pool.query(update, [rows]); // nothing to update yet
    const inserted = await pool.query(insert, [rows]);
    expect(inserted.rowCount).toBe(2);

    const { rows: stored } = await pool.query(
      `select id, name from ${TABLE} order by id`,
    );
    expect(stored).toEqual([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);
  });

  it('updates only changed rows and skips unchanged ones', async () => {
    const seed = JSON.stringify([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);
    await pool.query(insert, [seed]);

    const before = await pool.query<{ id: number; updated_at: Date }>(
      `select id, updated_at from ${TABLE} order by id`,
    );

    // Change row 1 only; row 2 is byte-identical.
    const next = JSON.stringify([
      { id: 1, name: 'changed' },
      { id: 2, name: 'b' },
    ]);
    const updated = await pool.query(update, [next]);
    expect(updated.rowCount).toBe(1); // IS DISTINCT FROM skips row 2

    const noNewInserts = await pool.query(insert, [next]);
    expect(noNewInserts.rowCount).toBe(0); // both rows already exist

    const after = await pool.query<{ id: number; updated_at: Date }>(
      `select id, updated_at from ${TABLE} order by id`,
    );
    const { rows: names } = await pool.query(
      `select id, name from ${TABLE} order by id`,
    );
    expect(names).toEqual([
      { id: 1, name: 'changed' },
      { id: 2, name: 'b' },
    ]);

    // Row 1's timestamp moved; row 2's did not.
    expect(after.rows[0]?.updated_at).not.toEqual(before.rows[0]?.updated_at);
    expect(after.rows[1]?.updated_at).toEqual(before.rows[1]?.updated_at);
  });
});

const PART_TABLE = `${SCHEMA}.scoped_widgets`;
const scoped = upsertMutation(
  PART_TABLE,
  [
    ['source_id', 'text', true],
    ['val', 'numeric'],
  ],
  { bulk: true, scalars: { plant_id: { type: 'int', key: true } } },
);

describe('upsertMutation — scalar partition key', () => {
  beforeAll(async () => {
    await pool.query(`
      CREATE TABLE ${PART_TABLE} (
        plant_id   int  not null,
        source_id  text not null,
        val        numeric,
        updated_at timestamptz not null default now(),
        primary key (plant_id, source_id)
      )
    `);
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE ${PART_TABLE}`);
  });

  it('scopes inserts and updates to the partition-key bind param', async () => {
    const rows = JSON.stringify([
      { source_id: 's1', val: 10 },
      { source_id: 's2', val: 20 },
    ]);

    await pool.query(scoped.update, [rows, 1]); // nothing yet
    expect((await pool.query(scoped.insert, [rows, 1])).rowCount).toBe(2);

    // Same source_ids under a different plant must NOT collide.
    expect((await pool.query(scoped.insert, [rows, 2])).rowCount).toBe(2);

    const all = await pool.query(
      `SELECT plant_id, source_id, val FROM ${PART_TABLE} ORDER BY plant_id, source_id`,
    );
    expect(all.rows).toEqual([
      { plant_id: 1, source_id: 's1', val: '10' },
      { plant_id: 1, source_id: 's2', val: '20' },
      { plant_id: 2, source_id: 's1', val: '10' },
      { plant_id: 2, source_id: 's2', val: '20' },
    ]);

    // Change only plant 1 / s1; plant 2 must be untouched.
    const changed = JSON.stringify([
      { source_id: 's1', val: 99 },
      { source_id: 's2', val: 20 },
    ]);
    const upd = await pool.query(scoped.update, [changed, 1]);
    expect(upd.rowCount).toBe(1);

    const p2 = await pool.query(
      `SELECT val FROM ${PART_TABLE} WHERE plant_id = 2 AND source_id = 's1'`,
    );
    expect(p2.rows[0]?.val).toBe('10');
  });
});
