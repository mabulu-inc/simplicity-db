/**
 * The shape of a Secrets-Manager-style database secret. All fields are
 * optional on the wire so we can validate them and throw a useful error
 * rather than producing a malformed connection string.
 */
interface DbSecret {
  host?: string;
  port?: number | string;
  dbname?: string;
  username?: string;
  password?: string;
}

/**
 * Resolve a Postgres connection string from either a plain URL env var
 * or a JSON secret env var.
 *
 * Precedence: if `${urlVar}` is set and non-empty it wins. Otherwise
 * `${secretVar}` is parsed as JSON of shape
 * `{ host, port?, dbname?, username, password }` and assembled into a
 * `postgresql://` URL with the username and password percent-encoded.
 * The port defaults to `5432` and the database to `postgres`.
 *
 * This reads an env string that is **already present in the process** —
 * it does NOT reach out to AWS or any secrets backend. Fetch the secret
 * at the edge of your application and expose it as an env var, the same
 * way you would a `DATABASE_URL`.
 *
 * @example
 * ```ts
 * import connect, { resolveDatabaseUrl } from '@smplcty/db';
 *
 * const pool = connect(undefined, {
 *   connectionString: resolveDatabaseUrl('DATABASE_URL', 'DB_SECRET'),
 *   statement_timeout: 30_000,
 * });
 * ```
 *
 * @throws if neither var is set, the secret is not valid JSON, or the
 *   secret is missing `host`/`username`.
 */
export function resolveDatabaseUrl(
  urlVar = 'DATABASE_URL',
  secretVar = 'DB_SECRET',
): string {
  const url = process.env[urlVar];
  if (url) return url;

  const raw = process.env[secretVar];
  if (!raw) {
    throw new Error(
      `resolveDatabaseUrl: neither ${urlVar} nor ${secretVar} is set`,
    );
  }

  let secret: DbSecret;
  try {
    secret = JSON.parse(raw) as DbSecret;
  } catch {
    throw new Error(`resolveDatabaseUrl: ${secretVar} is not valid JSON`);
  }

  const { host, port = 5432, dbname = 'postgres', username, password } = secret;
  if (!host || !username) {
    throw new Error(
      `resolveDatabaseUrl: ${secretVar} is missing required "host" and/or "username"`,
    );
  }

  const user = encodeURIComponent(username);
  const pass = encodeURIComponent(password ?? '');
  return `postgresql://${user}:${pass}@${host}:${port}/${dbname}`;
}
