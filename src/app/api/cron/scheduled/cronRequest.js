// The app the cron scripts call, and the headers of each call

/**
 * CRON_BASE_URL, or the local server with the `:dev` scripts. Without either
 * the script stops instead of guessing which deployment to call.
 *
 * @returns {string}
 */
export function cronBaseUrl() {
  const baseUrl = process.env.CRON_BASE_URL
  if (baseUrl) return baseUrl.replace(/\/+$/, "")
  if (process.env.NODE_ENV === "development") return "http://localhost:3000"
  throw new Error("Missing CRON_BASE_URL environment variable")
}

/**
 * The cron token, and the bypass of Vercel's Deployment Protection when
 * VERCEL_AUTOMATION_BYPASS_SECRET is set: staging is protected, production
 * isn't.
 *
 * @param {string} token
 * @returns {Record<string, string>}
 */
export function cronHeaders(token) {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
  }
}
