import { Link } from "react-router-dom";
import { Home } from "lucide-react";

export function NotFoundPage() {
  const isAuthenticated = Boolean(window.localStorage.getItem("thean_access_token"));

  return (
    <section className="not-found-page">
      <p className="eyebrow">Error 404</p>
      <h1>Page not found</h1>
      <p>The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.</p>
      <Link className="button" to={isAuthenticated ? "/home" : "/"}>
        <Home size={18} aria-hidden="true" />
        {isAuthenticated ? "Go to Home" : "Go to Landing page"}
      </Link>
    </section>
  );
}
