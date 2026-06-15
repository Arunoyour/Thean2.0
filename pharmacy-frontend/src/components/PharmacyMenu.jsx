import { NavLink, useNavigate } from "react-router-dom";
import { ClipboardList, CreditCard, Home, LogOut, Menu, MessageSquare, PackageCheck, PackagePlus, X } from "lucide-react";

import { logoutPharmacy } from "../lib/api.js";

const menuItems = [
  { label: "Home", path: "/home", icon: Home },
  { label: "Order Management", path: "/orders", icon: PackageCheck },
  { label: "Add Product", path: "/products/add", icon: PackagePlus },
  { label: "Listed Products", path: "/products", icon: ClipboardList },
  { label: "Settlement History", path: "/settlement", icon: CreditCard },
  { label: "My Disputes", path: "/disputes", icon: MessageSquare },
];

export function PharmacyMenu({ isOpen, onClose, onOpen }) {
  const navigate = useNavigate();

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
