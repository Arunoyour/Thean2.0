import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

export function BackButton({ to }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => (to ? navigate(to) : navigate(-1))}
      style={{
        display: "inline-flex", alignItems: "center", gap: "0.2rem",
        background: "none", border: "none", cursor: "pointer",
        color: "#6b7280", fontSize: "0.85rem", padding: "0.25rem 0",
        marginBottom: "0.5rem",
      }}
      onMouseEnter={e => e.currentTarget.style.color = "#111827"}
      onMouseLeave={e => e.currentTarget.style.color = "#6b7280"}
    >
      <ChevronLeft size={16} /> Back
    </button>
  );
}
