export type FilterType = Record<string, string[]>

/** The values of each key of `filter_by`, split on "-", over `initialFilters` */
export function generateFilter<T extends FilterType>(
  map: Map<string, string>,
  initialFilters: T
) {
  const filters = Array.from(map.entries()).reduce(
    (acc, curr) => {
      if (acc[curr[0] as keyof typeof filters]) {
        // @ts-expect-error we know that curr[0] is a key of filters
        acc[curr[0] as keyof typeof filters].push(curr[1].split("-"))
      } else {
        // @ts-expect-error we know that curr[0] is a key of filters
        acc[curr[0] as keyof typeof filters] = [curr[1].split("-")].flat()
      }
      return acc
    },
    JSON.parse(JSON.stringify(initialFilters)) as T
  )
  return filters satisfies T
}
