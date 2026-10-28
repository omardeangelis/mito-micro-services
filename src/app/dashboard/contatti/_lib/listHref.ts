import {
  returnHref,
  serialize,
  type ContactsListState,
} from "@mito/client/contact/searchParams"

// The list address of a state, built only through the PR5a module (no
// hand-written URL): `returnHref` re-parses it and prefixes the list path
export const listHref = (state: ContactsListState) =>
  returnHref(serialize(state))
