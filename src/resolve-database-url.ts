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
 * The port defaults to `5432`. There is **no** default database name — a
 * wrong one connects you somewhere you didn't mean to — so `dbname` must
 * come from the secret or the explicit `opts.dbname`, else this throws.
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
 * // dbname comes from the secret JSON, or pass a fixed one explicitly:
 * const pool = connect(undefined, {
 *   connectionString: resolveDatabaseUrl('DATABASE_URL', 'DB_SECRET', { dbname: 'salez1' }),
 *   statement_timeout: 30_000,
 * });
 * ```
 *
 * @throws if neither var is set, the secret is not valid JSON, the secret
 *   is missing `host`/`username`, or no `dbname` is available.
 */
export function resolveDatabaseUrl(
  urlVar = 'DATABASE_URL',
  secretVar = 'DB_SECRET',
  opts: { dbname?: string } = {},
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

  const { host, port = 5432, dbname, username, password } = secret;
  if (!host || !username) {
    throw new Error(
      `resolveDatabaseUrl: ${secretVar} is missing required "host" and/or "username"`,
    );
  }

  // No silent default: a wrong database name connects you somewhere you
  // didn't mean to. Take it from the secret, else an explicit option, else fail.
  const database = dbname ?? opts.dbname;
  if (!database) {
    throw new Error(
      `resolveDatabaseUrl: ${secretVar} has no "dbname" and no fallback dbname option was given`,
    );
  }

  const user = encodeURIComponent(username);
  const pass = encodeURIComponent(password ?? '');
  return `postgresql://${user}:${pass}@${host}:${port}/${database}`;
}
