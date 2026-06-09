import { Component } from "react";

/**
 * Catches unhandled render errors in the React tree and shows a recovery screen
 * instead of crashing the entire app silently.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Unhandled render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="page auth-layout">
          <section className="panel" style={{ maxWidth: "480px", textAlign: "center" }}>
            <h2 style={{ marginBottom: "0.5rem" }}>Something went wrong</h2>
            <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
              {this.state.error.message || "An unexpected error occurred."}
            </p>
            <button
              className="button"
              type="button"
              onClick={() => {
                this.setState({ error: null });
                window.location.href = "/";
              }}
            >
              Reload app
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
