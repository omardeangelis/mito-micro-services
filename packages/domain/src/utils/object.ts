/** The object without its null, undefined and empty-string values. */
export function cleanObject<T extends Record<string, unknown>>(obj: T) {
  return Object.entries(obj)
    .filter(([_, v]) => v !== null && v !== undefined && v !== "")
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {} as T)
}
