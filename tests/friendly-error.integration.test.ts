import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { friendlyError, type PgErrorLike } from '../src/index.js';

// Each run lives inside its own random schema so the suite is safe
// to run against a shared dev database without colliding with other
// tests or real tables.
const SCHEMA = `test_friendly_error_${randomBytes(4).toString('hex')}`;

let pool: pg.Pool;
let client: pg.PoolClient;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: process.env['DATABASE_URL'] });
  client = await pool.connect();

  await client.query(`CREATE SCHEMA ${SCHEMA}`);
  await client.query(`SET search_path TO ${SCHEMA}`);

  await client.query(`
    CREATE TABLE users (
      id    SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL
    );

    CREATE TABLE parents (
      id          SERIAL PRIMARY KEY,
      parent_data TEXT NOT NULL
    );

    CREATE TABLE children (
      id          SERIAL PRIMARY KEY,
      parent_id   INT NOT NULL,
      child_data  TEXT NOT NULL,
      CONSTRAINT fk_parent
        FOREIGN KEY (parent_id) REFERENCES parents (id) ON DELETE RESTRICT
    );

    CREATE TABLE not_null (
      id             SERIAL PRIMARY KEY,
      required_field TEXT NOT NULL
    );

    CREATE TABLE truncation (
      id         SERIAL PRIMARY KEY,
      short_text VARCHAR(5)
    );
  `);
});

afterAll(async () => {
  if (client) {
    await client.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
    client.release();
  }
  if (pool) {
    await pool.end();
  }
});

describe('friendlyError — integration with real pg errors', () => {
  it('UNIQUE_VIOLATION → "already exists"', async () => {
    const email = 'duplicate_test@example.com';
    await client.query('INSERT INTO users (email) VALUES ($1)', [email]);
    try {
      await client.query('INSERT INTO users (email) VALUES ($1)', [email]);
      throw new Error('expected unique-violation, query succeeded');
    } catch (err) {
      expect(friendlyError(err as PgErrorLike)).toMatch(/already exists/i);
    }
  });

  describe('FOREIGN_KEY_VIOLATION', () => {
    it('missing parent → "doesn\'t exist"', async () => {
      try {
        await client.query(
          `INSERT INTO children (parent_id, child_data) VALUES ($1, 'orphan')`,
          [999999],
        );
        throw new Error('expected fk-violation, query succeeded');
      } catch (err) {
        expect(friendlyError(err as PgErrorLike)).toMatch(
          /doesn't exist|missing parent/i,
        );
      }
    });

    it('still referenced → "still referenced"', async () => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO parents (parent_data) VALUES ('p') RETURNING id`,
      );
      const parentId = rows[0]?.id;
      if (parentId === undefined) throw new Error('parent insert returned no id');

      await client.query(
        `INSERT INTO children (parent_id, child_data) VALUES ($1, 'c')`,
        [parentId],
      );

      try {
        await client.query('DELETE FROM parents WHERE id = $1', [parentId]);
        throw new Error('expected fk-violation, query succeeded');
      } catch (err) {
        expect(friendlyError(err as PgErrorLike)).toMatch(
          /still referenced|referenced by other records/i,
        );
      }
    });
  });

  it('NOT_NULL_VIOLATION → "required field is missing"', async () => {
    try {
      await client.query(
        'INSERT INTO not_null (required_field) VALUES ($1)',
        [null],
      );
      throw new Error('expected not-null violation, query succeeded');
    } catch (err) {
      expect(friendlyError(err as PgErrorLike)).toMatch(
        /required field is missing|not null/i,
      );
    }
  });

  it('STRING_DATA_RIGHT_TRUNCATION → "too long"', async () => {
    try {
      await client.query(
        'INSERT INTO truncation (short_text) VALUES ($1)',
        ['abcdefg'],
      );
      throw new Error('expected truncation, query succeeded');
    } catch (err) {
      expect(friendlyError(err as PgErrorLike)).toMatch(/too long|truncation/i);
    }
  });

  it('UNDEFINED_COLUMN → "unexpected database error"', async () => {
    try {
      await client.query(
        `INSERT INTO not_null (non_existent_column) VALUES ('x')`,
      );
      throw new Error('expected undefined column, query succeeded');
    } catch (err) {
      expect(friendlyError(err as PgErrorLike)).toMatch(
        /unexpected database error|undefined column|does not exist/i,
      );
    }
  });
});
