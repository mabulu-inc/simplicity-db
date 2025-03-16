import dotenv from 'dotenv';
dotenv.config(); 
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
const { Client } = pg;

import { getFriendlyPgErrorMessage } from '../getFriendlyPgErrorMessage.js';

let client;

before(async () => {
  client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();

  await client.query(`
    DROP TABLE IF EXISTS test_users_integration;
    CREATE TABLE test_users_integration (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL
    );
  `);

  await client.query(`
    DROP TABLE IF EXISTS test_children;
    DROP TABLE IF EXISTS test_parents;

    CREATE TABLE test_parents (
      id SERIAL PRIMARY KEY,
      parent_data TEXT NOT NULL
    );

    CREATE TABLE test_children (
      id SERIAL PRIMARY KEY,
      parent_id INT NOT NULL,
      child_data TEXT NOT NULL,
      CONSTRAINT fk_parent
        FOREIGN KEY (parent_id)
        REFERENCES test_parents (id)
        ON DELETE RESTRICT
    );
  `);

  await client.query(`
    DROP TABLE IF EXISTS test_not_null;
    CREATE TABLE test_not_null (
      id SERIAL PRIMARY KEY,
      required_field TEXT NOT NULL
    );
  `);

  await client.query(`
    DROP TABLE IF EXISTS test_truncation;
    CREATE TABLE test_truncation (
      id SERIAL PRIMARY KEY,
      short_text VARCHAR(5)
    );
  `);
});

after(async () => {
  await client.query('DROP TABLE IF EXISTS test_truncation;');
  await client.query('DROP TABLE IF EXISTS test_not_null;');
  await client.query('DROP TABLE IF EXISTS test_children;');
  await client.query('DROP TABLE IF EXISTS test_parents;');
  await client.query('DROP TABLE IF EXISTS test_users_integration;');
  await client.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1) UNIQUE
// ─────────────────────────────────────────────────────────────────────────────
test('Integration: getFriendlyPgErrorMessage handles UNIQUE_VIOLATION', async () => {
  const emailValue = 'duplicate_test@example.com';

  // Insert the first row (should succeed)
  await client.query('INSERT INTO test_users_integration (email) VALUES ($1)', [
    emailValue,
  ]);

  // Insert the second row with the same email => triggers UNIQUE constraint error
  try {
    await client.query(
      'INSERT INTO test_users_integration (email) VALUES ($1)',
      [emailValue]
    );
    assert.fail('Expected UNIQUE constraint violation, but query succeeded.');
  } catch (error) {
    const friendlyMessage = getFriendlyPgErrorMessage(error);
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
describe('Integration: getFriendlyPgErrorMessage handles FOREIGN_KEY_VIOLATION', () => {
  test('Missing parent record', async () => {
    // Try inserting into test_children referencing a non-existent parent.
    const missingParentId = 999999; // Some ID that won't exist
    try {
      await client.query(
        `
        INSERT INTO test_children (parent_id, child_data)
        VALUES ($1, 'child referencing missing parent');
      `,
        [missingParentId]
      );

      assert.fail(
        'Expected foreign key violation for missing parent, but succeeded.'
      );
    } catch (error) {
      const friendlyMessage = getFriendlyPgErrorMessage(error);
      assert.match(
        friendlyMessage,
        /doesn't exist|missing parent/i,
        'Should mention referencing a non-existent (missing) parent.'
      );
    }
  });

  test('Still referenced parent record', async () => {
    // 1) Insert parent
    const { rows } = await client.query(`
      INSERT INTO test_parents (parent_data)
      VALUES ('parent row')
      RETURNING id;
    `);
    const parentId = rows[0].id;

    // 2) Insert child referencing that parent
    await client.query(
      `
      INSERT INTO test_children (parent_id, child_data)
      VALUES ($1, 'child referencing existing parent');
    `,
      [parentId]
    );

    // 3) Attempt to delete the parent => triggers "still referenced" violation
    try {
      await client.query(
        `
        DELETE FROM test_parents
        WHERE id = $1;
      `,
        [parentId]
      );

      assert.fail(
        'Expected foreign key violation for a referenced parent, but succeeded.'
      );
    } catch (error) {
      const friendlyMessage = getFriendlyPgErrorMessage(error);
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
test('Integration: getFriendlyPgErrorMessage handles NOT_NULL_VIOLATION', async () => {
  try {
    // Insert a NULL into the "required_field" column (which is NOT NULL).
    await client.query(
      `
      INSERT INTO test_not_null (required_field)
      VALUES ($1);
    `,
      [null]
    );

    assert.fail('Expected NOT NULL violation, but query succeeded.');
  } catch (error) {
    const friendlyMessage = getFriendlyPgErrorMessage(error);
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
test('Integration: getFriendlyPgErrorMessage handles STRING_DATA_RIGHT_TRUNCATION', async () => {
  // Insert text longer than 5 chars into "short_text VARCHAR(5)"
  const tooLongString = 'abcdefg'; // 7 chars

  try {
    await client.query(
      `
      INSERT INTO test_truncation (short_text)
      VALUES ($1);
    `,
      [tooLongString]
    );

    assert.fail(
      'Expected string data right truncation violation, but query succeeded.'
    );
  } catch (error) {
    const friendlyMessage = getFriendlyPgErrorMessage(error);
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
test('Integration: getFriendlyPgErrorMessage handles UNDEFINED_COLUMN', async () => {
  // Attempt to insert into a non-existent column "non_existent_column"
  try {
    await client.query(`
      INSERT INTO test_not_null (non_existent_column)
      VALUES ('some_value');
    `);

    assert.fail('Expected undefined column violation, but query succeeded.');
  } catch (error) {
    const friendlyMessage = getFriendlyPgErrorMessage(error);
    assert.match(
      friendlyMessage,
      /unexpected database error|undefined column|does not exist/i,
      'Should mention that the referenced column does not exist.'
    );
  }
});
