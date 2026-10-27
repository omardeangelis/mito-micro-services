import { cookies } from "next/headers"
import { type UserPreference } from "@mito/domain/schemas"
import { parsePreferenceCookies } from "@mito/client/preferences/cookies"

/** The layout preferences in the cookies of the request, for the first render. */
export function readRequestPreferences(): Partial<UserPreference> {
  const store = cookies()
  // Next gives the cookie decoded; the parser decodes the raw value
  return parsePreferenceCookies((name) => {
    const value = store.get(name)?.value
    return value === undefined ? undefined : encodeURIComponent(value)
  })
}
