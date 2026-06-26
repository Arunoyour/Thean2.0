import { NavLink, useNavigate } from "react-router-dom";
import { CalendarClock, ClipboardList, CreditCard, Home, Info, LogOut, Menu, MessageSquare, PackageCheck, PackagePlus, X } from "lucide-react";

import { getPharmacyActive, logoutPharmacy } from "../lib/api.js";

const ALL_MENU_ITEMS = [
  { label: "Home", path: "/home", icon: Home, requiresActive: false },
  { label: "Schedule", path: "/schedule", icon: CalendarClock, requiresActive: true },
  { label: "Order Management", path: "/orders", icon: PackageCheck, requiresActive: true },
  { label: "Add Product", path: "/products/add", icon: PackagePlus, requiresActive: true },
  { label: "Listed Products", path: "/products", icon: ClipboardList, requiresActive: true },
  { label: "Settlement History", path: "/settlement", icon: CreditCard, requiresActive: true },
  { label: "My Disputes", path: "/disputes", icon: MessageSquare, requiresActive: true },
  { label: "About / Profile", path: "/about", icon: Info, requiresActive: false },
];

export function PharmacyMenu({ isOpen, onClose, onOpen }) {
  const navigate = useNavigate();
  const isActive = getPharmacyActive();
  const menuItems = ALL_MENU_ITEMS.filter(item => !item.requiresActive || isActive);

  function logout() {
    logoutPharmacy();
    navigate("/login");
  }

  return (
    <>
      <button className="product-menu-toggle" type="button" onClick={onOpen} aria-label="Open menu">
        <Menu size={22} aria-hidden="true" />
      </button>

      {isOpen ? (
        <button className="product-menu-backdrop" type="button" aria-label="Close menu" onClick={onClose} />
      ) : null}

      <aside className={`product-drawer nav-drawer ${isOpen ? "product-drawer-open" : ""}`}>
        <div className="product-drawer-header">
          <div>
            <p className="eyebrow">Thean Pharmacy</p>
            <h2>Menu</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close menu">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <nav className="pharmacy-nav-links" aria-label="Pharmacy portal">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink className="pharmacy-nav-link" key={item.path} to={item.path} onClick={onClose}>
                <Icon size={20} aria-hidden="true" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <button className="outline-button drawer-logout" type="button" onClick={logout}>
          <LogOut size={18} aria-hidden="true" />
          Logout
        </button>
      </aside>
    </>
  );
}
