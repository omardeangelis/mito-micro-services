// The app the cron scripts call, and the request of each call

const LOCAL_URL = "http://localhost:3000"
const LOCAL_HOSTS = ["localhost", "127.0.0.1"]

// Read on import, before the scripts load .env: only the command that starts
// a script decides whether it may call a remote app, never a value in .env
const NODE_ENV = process.env.NODE_ENV
const IN_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === "true"

/**
 * The app the script calls, printed before the first call.
 *
 * The scripts without `:dev` (NODE_ENV=production), and every script in
 * GitHub Actions, call CRON_BASE_URL: it must be the https address of the app,
 * and without it they stop instead of guessing which deployment to call.
 * Elsewhere the `:dev` scripts call only the local server, CRON_BASE_URL or
 * `http://localhost:3000`.
 *
 * @returns {string}
 */
export function cronBaseUrl() {
  const remote = NODE_ENV === "production" || IN_GITHUB_ACTIONS
  const value = process.env.CRON_BASE_URL?.trim().replace(/\/+$/, "")
  if (!value) {
    if (remote) throw new Error("Missing CRON_BASE_URL environment variable")
    console.log(`Cron target: ${LOCAL_URL}`)
    return LOCAL_URL
  }
  /** @type {URL} */
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error("CRON_BASE_URL is not a URL")
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "CRON_BASE_URL must be only the address of the app, like https://crm.dbmito.it"
    )
  }
  const isLocal = LOCAL_HOSTS.includes(url.hostname)
  if (remote) {
    if (url.protocol !== "https:" || isLocal) {
      throw new Error("CRON_BASE_URL must be the https address of the app")
    }
  } else if (!isLocal || !["http:", "https:"].includes(url.protocol)) {
    throw new Error(
      "The :dev scripts call a remote CRON_BASE_URL only in GitHub Actions: unset it to call the local server"
    )
  }
  console.log(`Cron target: ${url.origin}`)
  return url.origin
}

/**
 * The cron token, and the bypass of Vercel's Deployment Protection when
 * VERCEL_AUTOMATION_BYPASS_SECRET is set: staging is protected, production
 * isn't. A redirect isn't followed: the script fails on it instead of taking
 * the headers to another host.
 *
 * @param {string} token
 * @returns {RequestInit}
 */
export function cronRequestInit(token) {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()
  // Printable ASCII only. The error doesn't print the value, as an invalid
  // header would
  if (bypass && !/^[\x21-\x7e]+$/.test(bypass)) {
    throw new Error(
      "VERCEL_AUTOMATION_BYPASS_SECRET is not a valid header value"
    )
  }
  return {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
    },
    redirect: "manual",
  }
}
