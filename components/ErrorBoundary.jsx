'use client'
import React from 'react'

// Reusable React error boundary. Prevents a render exception in any child
// (e.g. an old-format campaign report) from white-screening the whole admin
// app with "Application error: a client-side exception". Shows a friendly card
// with a Retry + optional onClose instead.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    // Best-effort log; never throws.
    try { console.error('[ErrorBoundary]', this.props.label || '', error, info?.componentStack) } catch (_) {}
  }
  reset = () => this.setState({ hasError: false, error: null })
  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') return this.props.fallback(this.state.error, this.reset)
      return (
        <div className="rounded-2xl border-2 border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-4 text-center">
          <div className="text-3xl">⚠️</div>
          <p className="font-extrabold text-sm mt-2">{this.props.title || 'Something went wrong displaying this.'}</p>
          <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-1 break-words">
            {String(this.state.error?.message || this.state.error || 'Unexpected error').slice(0, 300)}
          </p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <button onClick={this.reset} className="text-xs px-3 py-1.5 rounded-full border bg-background font-semibold">Retry</button>
            {this.props.onClose && (
              <button onClick={this.props.onClose} className="text-xs px-3 py-1.5 rounded-full border bg-background font-semibold">Close</button>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
