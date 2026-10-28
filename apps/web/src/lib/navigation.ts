import { useCallback, useMemo } from "react"
import {
  useLocation,
  useNavigate,
  useSearchParams as useRouterSearchParams,
} from "react-router"

// The hooks of next/navigation that the components of the Next.js app use,
// on React Router (F5): the components keep their code and change only the
// import. `refresh` has no equivalent: after a write, the queries of the page
// are invalidated (§6 of brain/chore/migrazione-frontend-react.md)

/** An href of the same origin, absolute or not, as the path React Router takes */
export const toPath = (href: string) => {
  const url = new URL(href, window.location.href)
  return url.origin === window.location.origin
    ? `${url.pathname}${url.search}${url.hash}`
    : href
}

type NavigateOptions = { scroll?: boolean }

export const useRouter = () => {
  const navigate = useNavigate()
  const push = useCallback(
    (href: string, options?: NavigateOptions) =>
      void navigate(toPath(href), {
        preventScrollReset: options?.scroll === false,
      }),
    [navigate]
  )
  const replace = useCallback(
    (href: string, options?: NavigateOptions) =>
      void navigate(toPath(href), {
        replace: true,
        preventScrollReset: options?.scroll === false,
      }),
    [navigate]
  )
  const back = useCallback(() => void navigate(-1), [navigate])
  return useMemo(() => ({ push, replace, back }), [push, replace, back])
}

/** The search params of the URL, read-only as in Next.js */
export const useSearchParams = (): URLSearchParams => useRouterSearchParams()[0]

export const usePathname = () => useLocation().pathname
