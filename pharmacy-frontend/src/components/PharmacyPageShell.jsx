import { useState } from "react";

import { PharmacyMenu } from "./PharmacyMenu.jsx";

export function PharmacyPageShell({ children }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <main className="page">
      <PharmacyMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onOpen={() => setIsMenuOpen(true)}
      />
      {children}
    </main>
  );
}
