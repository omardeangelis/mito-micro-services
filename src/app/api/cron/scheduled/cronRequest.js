// The app the cron scripts call, and the request of each call

const LOCAL_URL = "http://localhost:3000"
const LOCAL_HOSTS = ["localhost", "127.0.0.1"]

// Read on import, before the scripts load .env: whether a script may call a
// remote app depends only on the command that starts it. Which https app the
// allowed ones call is CRON_BASE_URL, wherever it is set, .env included
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
    // The token of a remote run never goes to an IP address (the URL parser
    // writes IPv4 as digits and dots, IPv6 in brackets) or a localhost name.
    // The check is on the name only: a name that resolves to this machine passes
    const isIp = /^[\d.]+$/.test(url.hostname) || url.hostname.startsWith("[")
    const isLocalName = /(^|\.)localhost\.*$/.test(url.hostname)
    if (url.protocol !== "https:" || isIp || isLocalName) {
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
 * VERCEL_AUTOMATION_BYPASS_SECRET is set. The staging project protects all its
 * deployments (deploy-staging.yaml stops otherwise), while the production one
 * leaves its domain out (Standard Protection, as its owner set it). A redirect
 * isn't followed: the script fails on it instead of taking the headers to
 * another host.
 *
 * @param {string} token
 * @returns {RequestInit}
 */
export function cronRequestInit(token) {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()
  // Printable ASCII without spaces. Unlike the error of an invalid header,
  // which prints the value, this one doesn't
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
