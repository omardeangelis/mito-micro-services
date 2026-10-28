import {
  detailHref,
  parse,
  returnHref,
} from "@mito/client/contact/searchParams"

/**
 * The detail of `id` carrying the list state `da` (the `da` parameter of the
 * detail the reader is on). Whatever `da` holds, the address that comes out is
 * inside the app and carries the valid parameters only: it goes through
 * `returnHref` and `parse`, never through a hand-written URL.
 */
export const detailHrefFromDa = (
  id: number,
  da: string | string[] | undefined
): string => {
  const { searchParams } = new URL(returnHref(da), "http://x")

  return detailHref(id, parse(Object.fromEntries(searchParams)))
}
