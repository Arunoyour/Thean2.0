import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FileText,
  Leaf,
  LogOut,
  MapPin,
  Menu,
  Pill,
  Plus,
  RefreshCw,
  WalletCards,
} from "lucide-react";

import { FormMessage } from "../components/FormMessage.jsx";
import { getCurrentUser, listCustomerAddresses, logoutCustomer } from "../lib/api.js";

const sectors = [
  {
    title: "Pharmacy",
    description: "Upload prescriptions, approve substitutions, and track medicine delivery.",
    icon: Pill,
    status: "View products",
    path: "/home/pharmacy",
  },
  {
    title: "Vegetables",
    description: "Order fresh produce from nearby active stores.",
    icon: Leaf,
    status: "Store catalog next",
  },
  {
    title: "Print Shop",
    description: "Send PDFs and documents to local print and photostat shops.",
    icon: FileText,
    status: "File upload next",
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [addresses, setAddresses] = useState([]);

  const firstName = useMemo(() => {
    if (!user?.full_name) {
      return "Customer";
    }
    return user.full_name.split(" ")[0];
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const profile = await getCurrentUser();
        const savedAddresses = await listCustomerAddresses();
        if (isMounted) {
          setUser(profile);
          setAddresses(savedAddresses);
          setError("");
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  function logout() {
    logoutCustomer();
    navigate("/login");
  }

  const defaultAddress = addresses.find((address) => address.is_default) || addresses[0];

  if (isLoading) {
    return (
      <section className="home-layout">
        <div className="home-loading">
          <RefreshCw size={20} aria-hidden="true" />
          Loading your home
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="home-layout">
        <div className="home-empty">
          <FormMessage kind="error">{error}</FormMessage>
          <Link className="button" to="/login">
            Login again
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="home-layout">
      <div className="home-shell">
        <aside className={`side-menu ${isMenuOpen ? "side-menu-open" : ""}`}>
          <button
            className="menu-toggle"
            type="button"
            onClick={() => setIsMenuOpen((current) => !current)}
            aria-expanded={isMenuOpen}
            aria-label="Toggle account menu"
          >
            <Menu size={20} aria-hidden="true" />
          </button>

          <div className="side-menu-content">
            <div className="menu-section">
              <span className="service-icon">
                <WalletCards size={22} aria-hidden="true" />
              </span>
              <div>
                <p>Wallet balance</p>
                <strong>₹{user.wallet_balance}</strong>
              </div>
            </div>

            <div className="menu-section">
              <span className="service-icon">
                <MapPin size={22} aria-hidden="true" />
              </span>
              <div>
                <p>Default address</p>
                <strong>{defaultAddress ? defaultAddress.label : "Not added"}</strong>
              </div>
            </div>

            <div className="menu-section">
              <span className="service-icon">
                <RefreshCw size={22} aria-hidden="true" />
              </span>
              <div>
                <p>Active orders</p>
                <strong>0</strong>
              </div>
            </div>

            <Link className="button button-secondary menu-action" to="/home/addresses">
              <Plus size={18} aria-hidden="true" />
              Manage addresses
            </Link>

            <button className="icon-text-button menu-logout" type="button" onClick={logout}>
              <LogOut size={18} aria-hidden="true" />
              Logout
            </button>
          </div>
        </aside>

        <div className="home-main">
          <div className="home-hero">
            <div>
              <p className="eyebrow">Unified customer core</p>
              <h1>Hi, {firstName}</h1>
              <p>
                Your Thean account connects wallet, addresses, and local services across every
                customer app experience.
              </p>
            </div>
          </div>

          <div className="home-section-header">
            <div>
              <p className="eyebrow">Sectors</p>
              <h2>Choose a service</h2>
            </div>
          </div>

          <div className="sector-grid">
            {sectors.map((sector) => {
              const Icon = sector.icon;

              return (
                <article className="sector-card" key={sector.title}>
                  <span className="service-icon">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{sector.title}</h3>
                    <p>{sector.description}</p>
                    {sector.path ? (
                      <Link className="sector-status sector-link" to={sector.path}>
                        {sector.status}
                      </Link>
                    ) : (
                      <span className="sector-status">{sector.status}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
