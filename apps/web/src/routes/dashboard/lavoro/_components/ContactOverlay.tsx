import * as Sentry from "@sentry/react"
import { useQueryClient } from "@tanstack/react-query"
import { Component, type ReactNode, useEffect } from "react"
import { isApiFailure } from "@/api/errors"
import { forgetFailedQueries } from "@/api/queryClient"
import { ContactsErrorView } from "../../contatti/ContactsError"
import { ContactDetail } from "../../contatti/detail/_components/ContactDetail"
import {
  type ContactDetailLinks,
  ContactSheet,
} from "../../contatti/detail/_components/ContactSheet"
import {
  ContactOverlayContext,
  useContactOverlay,
} from "../_hooks/useContactOverlay"

/**
 * A detail that failed, in the same sheet with the same way out: the error
 * stays here and the view under it doesn't change. What failed is forgotten
 * at once, as `ContactsError` does, or «Riprova» and the next opening would
 * find it in the cache
 */
function ContactOverlayError({
  id,
  links,
  error,
  onRetry,
}: {
  id: string
  links: ContactDetailLinks
  error: unknown
  onRetry: () => void
}) {
  const queryClient = useQueryClient()
  useEffect(() => {
    Sentry.captureException(error)
    forgetFailedQueries(queryClient)
  }, [error, queryClient])

  const retry = () => {
    // Not of the backend, as a chunk that didn't load: the app loads again
    if (isApiFailure(error)) onRetry()
    else window.location.reload()
  }

  return (
    <ContactSheet id={id} links={links}>
      <ContactsErrorView onRetry={retry} />
    </ContactSheet>
  )
}

type Props = { id: string; links: ContactDetailLinks; children: ReactNode }

type State = { failed: boolean; error: unknown }

/**
 * Around the whole detail, since the query that throws is read outside its
 * sheet: its error doesn't reach the route, which would take the rows of this
 * visit away. Another contact in the address starts again
 */
class ContactOverlayBoundary extends Component<Props, State> {
  override state: State = { failed: false, error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, error }
  }

  override componentDidUpdate({ id }: Props) {
    if (id !== this.props.id && this.state.failed) this.retry()
  }

  retry = () => this.setState({ failed: false, error: null })

  override render() {
    const { id, links, children } = this.props
    if (!this.state.failed) return children
    return (
      <ContactOverlayError
        id={id}
        links={links}
        error={this.state.error}
        onRetry={this.retry}
      />
    )
  }
}

/**
 * The view with the detail of `?contatto=<id>` over it, the sheet of Contatti
 * with links that stay on the address of the view (AC53, D21). The view is
 * `children`, so what the address changes here doesn't draw it.
 */
export function ContactOverlay({ children }: { children: ReactNode }) {
  const { contactId, open, links } = useContactOverlay()
  const id = contactId === undefined ? null : String(contactId)
  return (
    <ContactOverlayContext value={open}>
      {children}
      {id === null ? null : (
        <ContactOverlayBoundary id={id} links={links}>
          <ContactDetail id={id} links={links} />
        </ContactOverlayBoundary>
      )}
    </ContactOverlayContext>
  )
}
