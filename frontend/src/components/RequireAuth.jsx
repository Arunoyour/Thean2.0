import { Navigate, useLocation } from "react-router-dom";

/**
 * Client-side token validity check.
 * - Returns false (and clears localStorage) if the JWT exp claim has passed.
 * - Returns true for malformed tokens so the server can issue the 401 instead.
 */
function isTokenValid(token) {
  if (!token) return false;
  try {
    const payloadBase64 = token.split(".")[1];
    const decoded = JSON.parse(
      atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      window.localStorage.removeItem("thean_access_token");
      return false;
    }
  } catch {
    // Malformed token — let the server reject it
  }
  return true;
}

/**
 * Wraps protected routes.  Unauthenticated visitors are redirected to
 * /login?next=<intended-path> so the login page can send them straight
 * back after a successful sign-in.
 */
export function RequireAuth({ children }) {
  const location = useLocation();
  const token = window.localStorage.getItem("thean_access_token");

  if (!isTokenValid(token)) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return children;
}
