import { type UseQueryResult } from "@tanstack/react-query"

type PartState = "loading" | "error" | "data"

/** The fields of a query that say what its part shows */
export type PartQuery = Pick<
  UseQueryResult,
  "isError" | "isPending" | "errorUpdatedAt"
>

/**
 * What a part of the admin's home shows. A read of a query with no data puts it
 * back to pending without its error, so only `errorUpdatedAt` still says it
 * failed; «Riprova» resets the query, which takes that to 0 and brings the
 * skeleton back. A read with data on screen keeps showing them, and if it fails
 * it has `isError`
 */
export const partState = ({
  isError,
  isPending,
  errorUpdatedAt,
}: PartQuery): PartState => {
  if (isError || (isPending && errorUpdatedAt > 0)) return "error"
  return isPending ? "loading" : "data"
}
