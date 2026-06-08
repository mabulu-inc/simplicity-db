import { afterEach, describe, expect, it } from 'vitest';
import { resolveDatabaseUrl } from '../src/index.js';

// resolveDatabaseUrl reads process.env, so snapshot and restore it
// around every test to keep them independent (vitest's global-setup
// sets DATABASE_URL for the whole process).
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('resolveDatabaseUrl', () => {
  it('prefers the URL var when it is set', () => {
    process.env['DATABASE_URL'] = 'postgresql://u:p@h:5432/db';
    process.env['DB_SECRET'] = JSON.stringify({
      host: 'other',
      username: 'x',
      password: 'y',
    });
    expect(resolveDatabaseUrl()).toBe('postgresql://u:p@h:5432/db');
  });

  it('parses a secret JSON into a connection string when the URL var is unset', () => {
    delete process.env['DATABASE_URL'];
    process.env['DB_SECRET'] = JSON.stringify({
      host: 'db.internal',
      port: 5433,
      dbname: 'app',
      username: 'svc',
      password: 'secret',
    });
    expect(resolveDatabaseUrl()).toBe(
      'postgresql://svc:secret@db.internal:5433/app',
    );
  });

  it('defaults the port to 5432 and the database to postgres', () => {
    delete process.env['DATABASE_URL'];
    process.env['DB_SECRET'] = JSON.stringify({
      host: 'h',
      username: 'u',
      password: 'p',
    });
    expect(resolveDatabaseUrl()).toBe('postgresql://u:p@h:5432/postgres');
  });

  it('percent-encodes reserved characters in the username and password', () => {
    delete process.env['DATABASE_URL'];
    process.env['DB_SECRET'] = JSON.stringify({
      host: 'h',
      username: 'a b',
      password: 'p@ss:w/rd?',
    });
    expect(resolveDatabaseUrl()).toBe(
      'postgresql://a%20b:p%40ss%3Aw%2Frd%3F@h:5432/postgres',
    );
  });

  it('honors custom env var names', () => {
    delete process.env['DATABASE_URL'];
    process.env['REPLICA_URL'] = 'postgresql://r/db';
    expect(resolveDatabaseUrl('REPLICA_URL', 'REPLICA_SECRET')).toBe(
      'postgresql://r/db',
    );
  });

  it('throws when neither the URL nor the secret var is set', () => {
    delete process.env['DATABASE_URL'];
    delete process.env['DB_SECRET'];
    expect(() => resolveDatabaseUrl()).toThrow(
      /neither DATABASE_URL nor DB_SECRET/,
    );
  });

  it('throws when the secret is not valid JSON', () => {
    delete process.env['DATABASE_URL'];
    process.env['DB_SECRET'] = 'not json';
    expect(() => resolveDatabaseUrl()).toThrow(/not valid JSON/);
  });

  it('throws when the secret is missing host or username', () => {
    delete process.env['DATABASE_URL'];
    process.env['DB_SECRET'] = JSON.stringify({ host: 'h' });
    expect(() => resolveDatabaseUrl()).toThrow(/missing/);
  });
});
