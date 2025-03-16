import { test } from 'node:test';
import assert from 'node:assert';
import {
  getFriendlyPgErrorMessage,
  MESSAGES,
  PG_ERROR_CODES,
} from '../getFriendlyPgErrorMessage.js';
getFriendlyPgErrorMessage;

test('Returns default message if no error object is provided', () => {
  const message = getFriendlyPgErrorMessage(null);
  assert.equal(
    message,
    MESSAGES.DEFAULT,
    'Should return the default error message when no error is provided'
  );
});

test('Returns default message if error has no code', () => {
  const message = getFriendlyPgErrorMessage({});
  assert.equal(
    message,
    MESSAGES.DEFAULT,
    'Should return the default error message when error.code is missing'
  );
});

test('Handles UNIQUE_VIOLATION code', () => {
  const error = {
    code: PG_ERROR_CODES.UNIQUE_VIOLATION,
    table: 'tenant',
    column: 'name',
  };
  const message = getFriendlyPgErrorMessage(error);
  assert.match(
    message,
    /A record with these details already exists in table "tenant" \(column "name"\)/,
    'Should include table and column details for unique violation'
  );
});

test('Handles NOT_NULL_VIOLATION code', () => {
  const error = {
    code: PG_ERROR_CODES.NOT_NULL_VIOLATION,
    table: 'tenant',
    column: 'name',
  };
  const message = getFriendlyPgErrorMessage(error);
  assert.match(
    message,
    /A required field is missing in table "tenant" \(column "name"\)/,
    'Should include table and column details for not-null violation'
  );
});

test('Handles STRING_DATA_RIGHT_TRUNCATION code', () => {
  const error = {
    code: PG_ERROR_CODES.STRING_DATA_RIGHT_TRUNCATION,
    table: 'tenant',
    column: 'name',
  };
  const message = getFriendlyPgErrorMessage(error);
  assert.match(
    message,
    /The text you entered is too long in table "tenant" \(column "name"\)/,
    'Should include table and column details for data truncation'
  );
});

test('Handles UNDEFINED_COLUMN code', () => {
  const error = {
    code: PG_ERROR_CODES.UNDEFINED_COLUMN,
    table: 'tenant',
    column: 'non_existent_column',
  };
  const message = getFriendlyPgErrorMessage(error);
  assert.match(
    message,
    /An unexpected database error occurred in table "tenant" \(column "non_existent_column"\)/,
    'Should include table and column details for undefined column'
  );
});

test('Handles FOREIGN_KEY_VIOLATION: missing parent detail', () => {
  const error = {
    code: PG_ERROR_CODES.FOREIGN_KEY_VIOLATION,
    table: 'producer',
    detail: 'Key (parent_id)=(123) is not present in table "producer".',
  };
  const message = getFriendlyPgErrorMessage(error);
  assert.match(
    message,
    /You're trying to reference a record that doesn't exist in table "producer"\./,
    'Should mention missing parent record for foreign key violation'
  );
});

test('Handles FOREIGN_KEY_VIOLATION: still referenced detail', () => {
  const error = {
    code: PG_ERROR_CODES.FOREIGN_KEY_VIOLATION,
    table: 'producer',
    detail: 'Key (id)=(123) is still referenced from table "producer".',
  };
  const message = getFriendlyPgErrorMessage(error);
  assert.match(
    message,
    /This record cannot be changed or removed in table "producer" because it’s still referenced by other records./,
    'Should mention referenced record for foreign key violation'
  );
});

test('Handles FOREIGN_KEY_VIOLATION: generic', () => {
  const error = {
    code: PG_ERROR_CODES.FOREIGN_KEY_VIOLATION,
    table: 'plants',
    detail: 'Some other foreign key issue without specific text',
  };
  const message = getFriendlyPgErrorMessage(error);
  assert.match(
    message,
    /This operation violates a foreign key constraint in table "plants"\./,
    'Should return generic foreign key violation message'
  );
});

test('Returns DEFAULT for unrecognized codes', () => {
  const error = { code: '99999', table: 'random_table' };
  const message = getFriendlyPgErrorMessage(error);
  assert.equal(
    message,
    MESSAGES.DEFAULT,
    'Should fall back to the default message for unrecognized error codes'
  );
});

test('Omits table/column info if not provided', () => {
  const error = { code: PG_ERROR_CODES.UNIQUE_VIOLATION };
  const message = getFriendlyPgErrorMessage(error);
  assert.equal(
    message,
    'A record with these details already exists. Please use different values..',
    'Should omit table/column info if they are missing'
  );
});
