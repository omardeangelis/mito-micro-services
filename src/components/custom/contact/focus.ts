/** The trigger of `ContactStateSelect` carries this attribute. */
export const STATE_TRIGGER_SELECTOR = "[data-contact-state-trigger]"

/**
 * The focus is on nothing (a control unmounted or was disabled). Inside a
 * Radix dialog, such as the Sheet of the customer sheet, the focus of a
 * removed control goes to the dialog itself instead of `body`.
 */
export const focusIsLost = () => {
  const active = document.activeElement
  return (
    active === null ||
    active === document.body ||
    active.getAttribute("role") === "dialog"
  )
}
