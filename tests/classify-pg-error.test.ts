import { describe, expect, it } from 'vitest';
import {
  classifyPgError,
  ERROR_CODES,
  friendlyError,
  MESSAGES,
} from '../src/index.js';

describe('classifyPgError', () => {
  it('classifies a unique violation as 409 with raw fields and no baked copy', () => {
    const result = classifyPgError({
      code: ERROR_CODES.UNIQUE_VIOLATION,
      table: 'users',
      column: 'email',
      constraint: 'users_email_key',
    });
    expect(result).toEqual({
      code: '23505',
      category: 'unique_violation',
      httpStatus: 409,
      constraint: 'users_email_key',
      table: 'users',
      column: 'email',
    });
    // The classification carries no human-facing message — the app owns copy.
    expect(result).not.toHaveProperty('message');
  });

  it('maps foreign-key, restrict, not-null and truncation', () => {
    expect(
      classifyPgError({ code: ERROR_CODES.FOREIGN_KEY_VIOLATION }),
    ).toMatchObject({ category: 'foreign_key_violation', httpStatus: 400 });
    expect(
      classifyPgError({ code: ERROR_CODES.RESTRICT_VIOLATION }),
    ).toMatchObject({ category: 'foreign_key_violation', httpStatus: 400 });
    expect(
      classifyPgError({ code: ERROR_CODES.NOT_NULL_VIOLATION }),
    ).toMatchObject({ category: 'not_null_violation', httpStatus: 400 });
    expect(
      classifyPgError({ code: ERROR_CODES.STRING_DATA_RIGHT_TRUNCATION }),
    ).toMatchObject({ category: 'string_truncation', httpStatus: 400 });
  });

  it('maps connection-failure codes to category connection / 503', () => {
    for (const code of [
      ERROR_CODES.CONNECTION_EXCEPTION,
      ERROR_CODES.CONNECTION_FAILURE,
      ERROR_CODES.SQLCLIENT_UNABLE_TO_ESTABLISH,
      ERROR_CODES.ADMIN_SHUTDOWN,
    ]) {
      expect(classifyPgError({ code })).toMatchObject({
        category: 'connection',
        httpStatus: 503,
      });
    }
  });

  it('defaults unknown or missing codes to unknown / 500', () => {
    expect(classifyPgError({ code: '99999' })).toMatchObject({
      category: 'unknown',
      httpStatus: 500,
    });
    const none = classifyPgError(null);
    expect(none.code).toBeUndefined();
    expect(none.category).toBe('unknown');
    expect(none.httpStatus).toBe(500);
  });
});

describe('friendlyError — logs-only convenience', () => {
  it('still maps recognized codes to a message for logs', () => {
    expect(friendlyError({ code: ERROR_CODES.UNIQUE_VIOLATION })).toContain(
      'already exists',
    );
  });

  it('returns the service-unavailable message for connection failures', () => {
    expect(friendlyError({ code: ERROR_CODES.CONNECTION_FAILURE })).toBe(
      MESSAGES.SERVICE_UNAVAILABLE,
    );
  });
});
