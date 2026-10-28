// The frontends better-auth serves besides BETTER_AUTH_URL
// (brain/specs/crm/auth-due-frontend, AC2): read here, so the schema of the
// env and `authConfigFrom` refuse the same lists

const HOST =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*(:\d{1,5})?$/
const IPV6_LOOPBACK = /^\[::1\](:\d{1,5})?$/

/**
 * Whether `host` (with its port, if any) is this machine: such a host only
 * makes sense with an http BETTER_AUTH_URL, in development
 * @param {string} host
 */
export function isLoopbackHost(host) {
  if (IPV6_LOOPBACK.test(host)) return true
  const name = host.replace(/:\d+$/, "")
  return (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name)
  )
}

/**
 * The hosts of BETTER_AUTH_ALLOWED_HOSTS, lowercase, or undefined when it is
 * unset or blank. Only exact names, with an optional port: no pattern (`*`,
 * `?`), scheme or path, and loopback hosts only with an http
 * BETTER_AUTH_URL, the others only with an https one. Throws an Error that
 * names the variable otherwise
 * @param {string | undefined} value
 * @param {string | undefined} baseURL BETTER_AUTH_URL
 * @returns {string[] | undefined}
 */
export function parseAllowedHosts(value, baseURL) {
  if (value === undefined || value.trim() === "") return undefined
  const fail = (/** @type {string} */ why) => {
    throw new Error(`BETTER_AUTH_ALLOWED_HOSTS: ${why}`)
  }
  let scheme
  try {
    scheme = baseURL === undefined ? undefined : new URL(baseURL).protocol
  } catch {
    scheme = undefined
  }
  if (scheme !== "http:" && scheme !== "https:") {
    fail("needs an http or https BETTER_AUTH_URL")
  }
  const hosts = value.split(",").map((host) => host.trim().toLowerCase())
  for (const host of hosts) {
    if (!HOST.test(host) && !IPV6_LOOPBACK.test(host)) {
      fail(`"${host}" is not an exact host name (no scheme, path or pattern)`)
    }
    const loopback = isLoopbackHost(host)
    if (loopback && scheme === "https:") {
      fail(`"${host}" is this machine, and BETTER_AUTH_URL is https`)
    }
    if (!loopback && scheme === "http:") {
      fail(`"${host}" needs an https BETTER_AUTH_URL`)
    }
  }
  return hosts
}
