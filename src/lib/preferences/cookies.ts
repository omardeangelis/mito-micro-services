import { type UserPreference } from "@mito/domain/schemas"

// The layout preferences live in browser cookies, one per key, written by the
// client: no layout choice goes to the server. No Next.js in this file: the
// server components read the same cookies through `parsePreferenceCookies`.

export type PreferenceKey =
  | "dashboardCollapsed"
  | "customerTableVisibleColumns"
  | "practicesTableVisibleColumns"
  | "contactTableVisibleColumns"

export const PREFERENCE_COOKIES: Record<PreferenceKey, string> = {
  dashboardCollapsed: "mito-pref-ds",
  customerTableVisibleColumns: "mito-pref-ct",
  practicesTableVisibleColumns: "mito-pref-pt",
  contactTableVisibleColumns: "mito-pref-cot",
}

const PREFERENCE_KEYS = Object.keys(PREFERENCE_COOKIES) as PreferenceKey[]

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

/** Whether `value` has the type the preference `key` holds. */
export function isPreferenceValue(key: PreferenceKey, value: unknown) {
  return key === "dashboardCollapsed"
    ? typeof value === "boolean"
    : isStringArray(value)
}

/** The value of a cookie, or `undefined` when it is unreadable. Never throws. */
function parseValue(key: PreferenceKey, raw: string | undefined) {
  if (raw === undefined) return undefined
  try {
    const value: unknown = JSON.parse(decodeURIComponent(raw))
    return isPreferenceValue(key, value) ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * The preferences the cookies hold. `get` gives the raw (URI encoded) value of
 * a cookie by name. A cookie that is missing, or unreadable (bad encoding, bad
 * JSON, wrong type), leaves its key out.
 */
export function parsePreferenceCookies(
  get: (name: string) => string | undefined
): Partial<UserPreference> {
  const preferences: Partial<UserPreference> = {}
  for (const key of PREFERENCE_KEYS) {
    const value = parseValue(key, get(PREFERENCE_COOKIES[key]))
    if (value !== undefined)
      (preferences as Record<PreferenceKey, unknown>)[key] = value
  }
  return preferences
}

function getBrowserCookie(name: string) {
  const entry = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`))
  return entry?.slice(name.length + 1)
}

/** The preferences in the cookies of this browser; none outside a browser. */
export function readBrowserPreferences(): Partial<UserPreference> {
  if (typeof document === "undefined") return {}
  return parsePreferenceCookies(getBrowserCookie)
}

export function writePreferenceCookie<K extends PreferenceKey>(
  key: K,
  value: UserPreference[K]
) {
  if (typeof document === "undefined") return
  const encoded = encodeURIComponent(JSON.stringify(value))
  document.cookie = `${PREFERENCE_COOKIES[key]}=${encoded}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`
}

export function clearPreferenceCookies() {
  if (typeof document === "undefined") return
  for (const key of PREFERENCE_KEYS)
    document.cookie = `${PREFERENCE_COOKIES[key]}=; path=/; max-age=0; samesite=lax`
}
