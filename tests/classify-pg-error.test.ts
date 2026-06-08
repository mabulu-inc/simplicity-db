import { describe, expect, it } from 'vitest';
import {
  classifyPgError,
  ERROR_CODES,
  friendlyError,
  MESSAGES,
} from '../src/index.js';

describe('classifyPgError', () => {
  it('maps a unique violation to HTTP 409', () => {
    const result = classifyPgError({
      code: ERROR_CODES.UNIQUE_VIOLATION,
      table: 't',
      column: 'c',
    });
    expect(result.code).toBe('23505');
    expect(result.httpStatus).toBe(409);
    // message must be identical to the string friendlyError returns
    expect(result.message).toBe(
      friendlyError({
        code: ERROR_CODES.UNIQUE_VIOLATION,
        table: 't',
        column: 'c',
      }),
    );
  });

  it('maps foreign-key, not-null and truncation to HTTP 400', () => {
    expect(
      classifyPgError({ code: ERROR_CODES.FOREIGN_KEY_VIOLATION }).httpStatus,
    ).toBe(400);
    expect(
      classifyPgError({ code: ERROR_CODES.RESTRICT_VIOLATION }).httpStatus,
    ).toBe(400);
    expect(
      classifyPgError({ code: ERROR_CODES.NOT_NULL_VIOLATION }).httpStatus,
    ).toBe(400);
    expect(
      classifyPgError({ code: ERROR_CODES.STRING_DATA_RIGHT_TRUNCATION })
        .httpStatus,
    ).toBe(400);
  });

  it('maps connection-failure codes to HTTP 503', () => {
    for (const code of [
      ERROR_CODES.CONNECTION_EXCEPTION,
      ERROR_CODES.CONNECTION_FAILURE,
      ERROR_CODES.SQLCLIENT_UNABLE_TO_ESTABLISH,
      ERROR_CODES.ADMIN_SHUTDOWN,
    ]) {
      expect(classifyPgError({ code }).httpStatus).toBe(503);
    }
  });

  it('defaults to HTTP 500 for unknown or missing codes', () => {
    expect(classifyPgError({ code: '99999' }).httpStatus).toBe(500);
    expect(classifyPgError(null).httpStatus).toBe(500);
    expect(classifyPgError(undefined).code).toBeUndefined();
  });
});

describe('friendlyError — connection-failure codes', () => {
  it('returns the service-unavailable message for connection failures', () => {
    expect(friendlyError({ code: ERROR_CODES.CONNECTION_FAILURE })).toBe(
      MESSAGES.SERVICE_UNAVAILABLE,
    );
    expect(friendlyError({ code: ERROR_CODES.ADMIN_SHUTDOWN })).toBe(
      MESSAGES.SERVICE_UNAVAILABLE,
    );
  });
});
