// src/components/ErrorBoundary.tsx
import { Button } from "@/components/ui/button"
import React, { Component, type ReactNode } from "react"

interface ErrorBoundaryProps {
  children: ReactNode
  handleError: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
    }
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return {
      hasError: true,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4">
          <h1>Something went wrong.</h1>
          <Button onClick={() => this.props.handleError}>Retry</Button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
