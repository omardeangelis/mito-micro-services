import * as Sentry from "@sentry/react"
import { Component, type ReactNode } from "react"

type Props = {
  /** What a panel shows when its chart threw while drawing; `reset` draws it again */
  fallback: (reset: () => void) => ReactNode
  /** A new value draws the chart again: the data it draws changed */
  resetKey?: unknown
  children: ReactNode
}

/**
 * The boundary of a panel (D10, AC21): an exception while recharts draws
 * stays in the box of its chart, never the error page of the route. A class,
 * since React has no hook for it
 */
export class PanelBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  // The box hides the exception from the user, not from Sentry
  componentDidCatch(error: unknown) {
    Sentry.captureException(error)
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey)
      this.reset()
  }

  reset = () => this.setState({ failed: false })

  render() {
    return this.state.failed
      ? this.props.fallback(this.reset)
      : this.props.children
  }
}
