import 'dotenv/config';
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import connect from '../index.mjs';

import { friendlyError } from '../src/friendly-error.mjs';

// Isolate this suite in its own schema so it can safely run against a shared
// dev database without colliding with other tests or real tables. The schema
// name is randomised per run and dropped in `after`.
const schema = `test_friendly_error_${Math.random().toString(36).slice(2, 10)}`;

let pool;
let client;

describe('friendlyError Integration', () => {
  before(async () => {
    pool = connect('TEST');
    client = await pool.connect();

    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);

    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL
      );

      CREATE TABLE parents (
        id SERIAL PRIMARY KEY,
        parent_data TEXT NOT NULL
      );

      CREATE TABLE children (
        id SERIAL PRIMARY KEY,
        parent_id INT NOT NULL,
        child_data TEXT NOT NULL,
        CONSTRAINT fk_parent
          FOREIGN KEY (parent_id)
          REFERENCES parents (id)
          ON DELETE RESTRICT
      );

      CREATE TABLE not_null (
        id SERIAL PRIMARY KEY,
        required_field TEXT NOT NULL
      );

      CREATE TABLE truncation (
        id SERIAL PRIMARY KEY,
        short_text VARCHAR(5)
      );
    `);
  });

  after(async () => {
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    client.release();
    await pool.end();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1) UNIQUE
  // ─────────────────────────────────────────────────────────────────────────────
  it('handles UNIQUE_VIOLATION', async () => {
    const emailValue = 'duplicate_test@example.com';

    await client.query('INSERT INTO users (email) VALUES ($1)', [emailValue]);

    try {
      await client.query('INSERT INTO users (email) VALUES ($1)', [emailValue]);
      assert.fail('Expected UNIQUE constraint violation, but query succeeded.');
    } catch (error) {
      const friendlyMessage = friendlyError(error);
      assert.match(
        friendlyMessage,
        /already exists/i,
        'Should mention that a record already exists (unique violation).'
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2) FOREIGN KEY VIOLATION
  // ─────────────────────────────────────────────────────────────────────────────
  describe('handles FOREIGN_KEY_VIOLATION', () => {
    it('Missing parent record', async () => {
      const missingParentId = 999999;
      try {
        await client.query(
          `INSERT INTO children (parent_id, child_data)
           VALUES ($1, 'child referencing missing parent')`,
          [missingParentId]
        );

        assert.fail(
          'Expected foreign key violation for missing parent, but succeeded.'
        );
      } catch (error) {
        const friendlyMessage = friendlyError(error);
        assert.match(
          friendlyMessage,
          /doesn't exist|missing parent/i,
          'Should mention referencing a non-existent (missing) parent.'
        );
      }
    });

    it('Still referenced parent record', async () => {
      const { rows } = await client.query(
        `INSERT INTO parents (parent_data) VALUES ('parent row') RETURNING id`
      );
      const parentId = rows[0].id;

      await client.query(
        `INSERT INTO children (parent_id, child_data)
         VALUES ($1, 'child referencing existing parent')`,
        [parentId]
      );

      try {
        await client.query('DELETE FROM parents WHERE id = $1', [parentId]);
        assert.fail(
          'Expected foreign key violation for a referenced parent, but succeeded.'
        );
      } catch (error) {
        const friendlyMessage = friendlyError(error);
        assert.match(
          friendlyMessage,
          /still referenced|referenced by other records/i,
          'Should mention the parent is still referenced by another record.'
        );
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3) NOT NULL VIOLATION
  // ─────────────────────────────────────────────────────────────────────────────
  it('handles NOT_NULL_VIOLATION', async () => {
    try {
      await client.query('INSERT INTO not_null (required_field) VALUES ($1)', [
        null,
      ]);
      assert.fail('Expected NOT NULL violation, but query succeeded.');
    } catch (error) {
      const friendlyMessage = friendlyError(error);
      assert.match(
        friendlyMessage,
        /required field is missing|not null/i,
        'Should mention that a required field is missing (NOT NULL violation).'
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4) STRING_DATA_RIGHT_TRUNCATION
  // ─────────────────────────────────────────────────────────────────────────────
  it('handles STRING_DATA_RIGHT_TRUNCATION', async () => {
    const tooLongString = 'abcdefg';

    try {
      await client.query('INSERT INTO truncation (short_text) VALUES ($1)', [
        tooLongString,
      ]);
      assert.fail(
        'Expected string data right truncation violation, but query succeeded.'
      );
    } catch (error) {
      const friendlyMessage = friendlyError(error);
      assert.match(
        friendlyMessage,
        /too long|exceeds|truncation/i,
        'Should mention the text is too long (STRING_DATA_RIGHT_TRUNCATION).'
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5) UNDEFINED_COLUMN
  // ─────────────────────────────────────────────────────────────────────────────
  it('handles UNDEFINED_COLUMN', async () => {
    try {
      await client.query(
        `INSERT INTO not_null (non_existent_column) VALUES ('some_value')`
      );
      assert.fail('Expected undefined column violation, but query succeeded.');
    } catch (error) {
      const friendlyMessage = friendlyError(error);
      assert.match(
        friendlyMessage,
        /unexpected database error|undefined column|does not exist/i,
        'Should mention that the referenced column does not exist.'
      );
    }
  });
});
