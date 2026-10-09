// The app the cron scripts call, and the request of each call

const LOCAL_URL = "http://localhost:3000"

/**
 * The app the script calls, printed before the first call: CRON_BASE_URL, or
 * the local server with the `:dev` scripts. Without either the script stops
 * instead of guessing which deployment to call.
 *
 * CRON_BASE_URL must be https, except on localhost. The `:dev` scripts take a
 * remote one only in GitHub Actions, where the staging workflows set it:
 * locally a value in .env or in the shell would send them anywhere,
 * production included.
 *
 * @returns {string}
 */
export function cronBaseUrl() {
  const value = process.env.CRON_BASE_URL?.trim().replace(/\/+$/, "")
  if (!value) {
    if (process.env.NODE_ENV !== "development") {
      throw new Error("Missing CRON_BASE_URL environment variable")
    }
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
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname)
  if (url.protocol !== "https:" && !isLocal) {
    throw new Error("CRON_BASE_URL must be https")
  }
  if (
    process.env.NODE_ENV === "development" &&
    !isLocal &&
    process.env.GITHUB_ACTIONS !== "true"
  ) {
    throw new Error(
      "The :dev scripts call a remote CRON_BASE_URL only in GitHub Actions: unset it to call the local server"
    )
  }
  console.log(`Cron target: ${url.origin}`)
  return value
}

/**
 * The cron token, and the bypass of Vercel's Deployment Protection when
 * VERCEL_AUTOMATION_BYPASS_SECRET is set: staging is protected, production
 * isn't. A redirect fails the call instead of taking the headers to another
 * host.
 *
 * @param {string} token
 * @returns {RequestInit}
 */
export function cronRequestInit(token) {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  return {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
    },
    redirect: "error",
  }
}
