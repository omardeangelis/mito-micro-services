import type { MouseEvent } from "react"

/**
 * The click handler of a link of the list. A plain left click goes through the
 * shared transition (`navigate` of `useContactsNavigation`); with a modifier the
 * browser keeps the link (new tab, new window, download), and a click somebody
 * already handled is left alone.
 */
export const navigateOnPlainClick =
  (navigate: (href: string) => void, href: string) =>
  (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }
    event.preventDefault()
    navigate(href)
  }
