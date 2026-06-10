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
        <div className="dl-page dl-loading" style={{ flexDirection: "column", gap: "1rem", padding: "2rem" }}>
          <h2 style={{ margin: 0 }}>Something went wrong</h2>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <button
            className="dl-btn"
            type="button"
            onClick={() => {
              this.setState({ error: null });
              window.location.href = "/";
            }}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
