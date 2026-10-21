import { isValidElement, type ReactElement } from "react"

/**
 * The address of the link the last toast of `toast` (a mock of `useToast`)
 * offers as its action: the `Link` inside `<ToastAction asChild>`. `undefined`
 * when the toast has no action.
 */
export const lastToastActionHref = (toast: {
  mock: { calls: unknown[][] }
}): string | undefined => {
  const options = toast.mock.calls.at(-1)?.[0] as
    { action?: unknown } | undefined
  const action = options?.action
  if (!isValidElement(action)) return undefined
  const { children } = (action as ReactElement<{ children?: unknown }>).props
  return isValidElement(children)
    ? (children as ReactElement<{ href?: string }>).props.href
    : undefined
}
