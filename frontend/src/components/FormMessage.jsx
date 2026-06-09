export function FormMessage({ kind = "info", children }) {
  if (!children) {
    return null;
  }

  return (
    <div className={`form-message form-message-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

