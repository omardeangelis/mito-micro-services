import { useEffect } from "react"
import { useContactSheet } from "./ContactSheet"

/**
 * Rendered by the header of a contact that can't be edited, where there is no
 * state selector to take the focus. If the shell has the focus flag raised
 * ("Vai al contatto attivo" lands here), the title takes it instead, so the
 * focus never ends on `body`.
 */
export function ReadOnlyFocusFlag() {
  const { consumeStateTriggerFocus, focusTitle } = useContactSheet()

  useEffect(() => {
    if (consumeStateTriggerFocus()) focusTitle()
    // Once, when the contact mounts: the flag is taken, not watched
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
