/** The trigger of `ContactStateSelect` carries this attribute. */
export const STATE_TRIGGER_SELECTOR = "[data-contact-state-trigger]"

/**
 * The "Gestisci contatto" link of the customer sheet carries this attribute:
 * it is where the focus goes once "Crea contatto" has made the contact.
 */
export const MANAGE_LINK_SELECTOR = "[data-contact-manage-link]"

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
