/** The hosts a local database may be on: Docker's published port. */
const LOCAL_HOSTS = ["localhost", "127.0.0.1"]

/** What postgres.js needs to connect, taken from the DSN only. */
export type LocalConnection = {
  host: string
  port: number
  user: string
  password: string
  database: string
}

/**
 * The connection to a Postgres on this machine, from `dsn`, or an error before
 * anything connects. The tests on a real database and the local database
 * scripts connect with it, so they never reach the development or the
 * production database:
 * - the host must be written in the DSN (without one postgres.js takes
 *   `PGHOST`), be one, and be `localhost` or `127.0.0.1`;
 * - no query string: postgres.js reads options from it;
 * - with `database`, the DSN must name that database.
 *
 * Pass the result to `postgres()` as options, never the DSN: the environment
 * (`PGHOST`, `PGDATABASE`, ...) then can't change where it connects.
 */
export function localConnection(
  dsn: string,
  { database }: { database?: string } = {}
): LocalConnection {
  const stop = (reason: string) => new Error(`Not a local database: ${reason}`)
  if (!/^postgres(ql)?:\/\//.test(dsn)) throw stop("not a postgres:// DSN")
  // The authority as postgres.js reads it: everything before the path or the
  // query, after the credentials. A comma there is a list of hosts
  const authority = dsn.slice(dsn.indexOf("://") + 3).split(/[/?#]/)[0]!
  const hosts = authority.slice(authority.lastIndexOf("@") + 1)
  if (hosts.includes(",")) throw stop("more than one host")
  if (!hosts.split(":")[0]) throw stop("no host in the DSN")

  let url: URL
  try {
    url = new URL(dsn)
  } catch {
    throw stop("the DSN doesn't parse")
  }
  if (!url.hostname) throw stop("no host in the DSN")
  if (!LOCAL_HOSTS.includes(url.hostname)) {
    throw stop(`the host is ${url.hostname}, not localhost or 127.0.0.1`)
  }
  if (url.search) throw stop("the DSN has a query string")
  const name = decodeURIComponent(url.pathname.slice(1))
  if (!name) throw stop("no database in the DSN")
  if (database && name !== database) {
    throw stop(`the database is ${name}, not ${database}`)
  }
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username) || "postgres",
    password: decodeURIComponent(url.password),
    database: name,
  }
}
