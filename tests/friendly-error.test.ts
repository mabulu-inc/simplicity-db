import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  friendlyError,
  formatTableColumnInfo,
  MESSAGES,
} from '../src/index.js';

describe('friendlyError — unit', () => {
  it('returns MESSAGES.DEFAULT when no error is provided', () => {
    expect(friendlyError(null)).toBe(MESSAGES.DEFAULT);
    expect(friendlyError(undefined)).toBe(MESSAGES.DEFAULT);
  });

  it('returns MESSAGES.DEFAULT when error has no code', () => {
    expect(friendlyError({})).toBe(MESSAGES.DEFAULT);
  });

  it('handles UNIQUE_VIOLATION', () => {
    const message = friendlyError({
      code: ERROR_CODES.UNIQUE_VIOLATION,
      table: 'tenant',
      column: 'name',
    });
    expect(message).toMatch(
      /A record with these details already exists in table "tenant" \(column "name"\)/,
    );
  });

  it('handles NOT_NULL_VIOLATION', () => {
    const message = friendlyError({
      code: ERROR_CODES.NOT_NULL_VIOLATION,
      table: 'tenant',
      column: 'name',
    });
    expect(message).toMatch(
      /A required field is missing in table "tenant" \(column "name"\)/,
    );
  });

  it('handles STRING_DATA_RIGHT_TRUNCATION', () => {
    const message = friendlyError({
      code: ERROR_CODES.STRING_DATA_RIGHT_TRUNCATION,
      table: 'tenant',
      column: 'name',
    });
    expect(message).toMatch(
      /The text you entered is too long in table "tenant" \(column "name"\)/,
    );
  });

  it('handles UNDEFINED_COLUMN', () => {
    const message = friendlyError({
      code: ERROR_CODES.UNDEFINED_COLUMN,
      table: 'tenant',
      column: 'non_existent_column',
    });
    expect(message).toMatch(
      /An unexpected database error occurred in table "tenant" \(column "non_existent_column"\)/,
    );
  });

  it('handles FOREIGN_KEY_VIOLATION (missing parent)', () => {
    const message = friendlyError({
      code: ERROR_CODES.FOREIGN_KEY_VIOLATION,
      table: 'producer',
      detail: 'Key (parent_id)=(123) is not present in table "producer".',
    });
    expect(message).toMatch(
      /You're trying to reference a record that doesn't exist in table "producer"/,
    );
  });

  it('handles FOREIGN_KEY_VIOLATION (still referenced)', () => {
    const message = friendlyError({
      code: ERROR_CODES.FOREIGN_KEY_VIOLATION,
      table: 'producer',
      detail: 'Key (id)=(123) is still referenced from table "producer".',
    });
    expect(message).toMatch(
      /This record cannot be changed or removed in table "producer" because it.s still referenced by other records/,
    );
  });

  it('handles FOREIGN_KEY_VIOLATION (generic)', () => {
    const message = friendlyError({
      code: ERROR_CODES.FOREIGN_KEY_VIOLATION,
      table: 'plants',
      detail: 'Some other foreign key issue without specific text',
    });
    expect(message).toMatch(
      /This operation violates a foreign key constraint in table "plants"/,
    );
  });

  it('handles RESTRICT_VIOLATION via the same path as FOREIGN_KEY_VIOLATION', () => {
    const message = friendlyError({
      code: ERROR_CODES.RESTRICT_VIOLATION,
      table: 'orders',
      detail: 'Key (customer_id)=(1) is still referenced from table "orders".',
    });
    expect(message).toMatch(/still referenced by other records/);
  });

  it('returns MESSAGES.DEFAULT for an unrecognized code', () => {
    expect(friendlyError({ code: '99999', table: 'random_table' })).toBe(
      MESSAGES.DEFAULT,
    );
  });

  it('omits table/column info when not provided', () => {
    const message = friendlyError({ code: ERROR_CODES.UNIQUE_VIOLATION });
    expect(message).toBe(
      'A record with these details already exists. Please use different values..',
    );
  });
});

describe('formatTableColumnInfo', () => {
  it('formats both table and column when provided', () => {
    expect(formatTableColumnInfo('users', 'email')).toEqual({
      tableInfo: ' in table "users"',
      columnInfo: ' (column "email")',
    });
  });

  it('returns empty strings for missing values', () => {
    expect(formatTableColumnInfo(undefined, undefined)).toEqual({
      tableInfo: '',
      columnInfo: '',
    });
  });
});
