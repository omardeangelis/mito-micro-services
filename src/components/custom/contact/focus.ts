/** The trigger of `ContactStateSelect` carries this attribute. */
export const STATE_TRIGGER_SELECTOR = "[data-contact-state-trigger]"

/** The focus is on nothing (a control unmounted or was disabled). */
export const focusIsLost = () =>
  document.activeElement === null || document.activeElement === document.body
