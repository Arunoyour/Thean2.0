import { useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  AlertTriangle, Bike, BookOpen, ChevronDown, ChevronRight,
  ClipboardList, CreditCard, GitMerge, LayoutDashboard, LogOut,
  MessageSquare, Percent, Pill, Scissors, ScrollText, ShieldCheck,
  Users, Zap,
} from "lucide-react";
import { getCurrentAdmin, getAdminAttention, logoutAdmin } from "../lib/api.js";
import { canManageAdmins, canSeeAuditLog, canApprove } from "../lib/role.js";

const NAV = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard",        label: "Dashboard",   icon: LayoutDashboard, exact: true },
      { to: "/dashboard/attention", label: "Attention", icon: AlertTriangle, badge: "attention" },
    ],
  },
  {
    label: "Customers",
    items: [
      { to: "/dashboard/customers", label: "Customers", icon: Users },
    ],
  },
  {
    label: "Pharmacy",
    items: [
      { to: "/dashboard/pharmacy",                      label: "Overview",          icon: Pill },
      { to: "/dashboard/pharmacy/products",             label: "Product Review",    icon: Pill },
      { to: "/dashboard/pharmacy/orders",               label: "Order Management",  icon: ClipboardList },
      { to: "/dashboard/pharmacy/order-status",         label: "Live Order Status", icon: Zap },
      { to: "/dashboard/pharmacy/substitution-audit",   label: "Substitution Audit", icon: ScrollText },
    ],
  },
  {
    label: "Delivery",
    items: [
      { to: "/dashboard/delivery",            label: "Live Map",      icon: Bike },
      { to: "/dashboard/delivery/boys",       label: "Drivers",       icon: Users },
      { to: "/dashboard/delivery/orders",     label: "Orders",        icon: ClipboardList },
      { to: "/dashboard/delivery/cod",        label: "COD & Cash",    icon: CreditCard },
      { to: "/dashboard/delivery/rate",       label: "Rate Config",   icon: Percent },
      { to: "/dashboard/delivery/auto-assign",label: "Auto-Assign",   icon: Zap },
    ],
  },
  {
    label: "Haircut",
    items: [
      { to: "/haircut/shops", label: "Shops & Approvals", icon: Scissors },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/dashboard/settlement",    label: "Settlement",         icon: CreditCard },
      { to: "/dashboard/ledger",        label: "Stakeholder Ledger", icon: BookOpen },
      { to: "/dashboard/reconciliation",label: "Reconciliation",     icon: GitMerge },
    ],
  },
  {
    label: "Disputes",
    items: [
      { to: "/dashboard/disputes", label: "Dispute Management", icon: MessageSquare },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/dashboard/fee-config", label: "Fee & Tax Config", icon: Percent },
      { to: "/dashboard/approvals",  label: "Approval Queue",   icon: ClipboardList, roleCheck: canApprove },
      { to: "/dashboard/audit-log",  label: "Audit Log",        icon: ScrollText,    roleCheck: canSeeAuditLog },
      { to: "/dashboard/admins",     label: "Manage Admins",    icon: ShieldCheck,   roleCheck: canManageAdmins },
    ],
  },
];

function NavSection({ group, attentionCount, collapsed, onToggle }) {
  const location = useLocation();
  const isActive = group.items.some(item => location.pathname.startsWith(item.to));

  return (
    <div style={{ marginBottom: 2 }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 16px", border: "none", background: "none", cursor: "pointer",
          color: "#94a3a0", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.09em",
          textTransform: "uppercase",
        }}
      >
        <span>{group.label}</span>
        {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
      </button>

      {!collapsed && (
        <div>
          {group.items.map(item => {
            if (item.roleCheck && !item.roleCheck()) return null;
            const badgeNum = item.badge === "attention" ? attentionCount : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                style={({ isActive }) => ({
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "7px 16px 7px 20px",
                  textDecoration: "none", fontSize: "0.83rem", fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#0f766e" : "#52625f",
                  background: isActive ? "rgba(15,118,110,0.08)" : "transparent",
                  borderLeft: isActive ? "2px solid #0f766e" : "2px solid transparent",
                  borderRadius: "0 6px 6px 0",
                  transition: "all 0.12s",
                })}
              >
                <item.icon size={14} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {badgeNum > 0 && (
                  <span style={{
                    background: "#ef4444", color: "#fff", borderRadius: 99,
                    fontSize: "0.65rem", fontWeight: 800, padding: "1px 6px",
                    minWidth: 18, textAlign: "center",
                  }}>{badgeNum}</span>
                )}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AppLayout({ children }) {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [attentionCount, setAttentionCount] = useState(0);
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    getCurrentAdmin().then(setAdmin).catch(() => {});
    getAdminAttention().then(d => setAttentionCount(d?.count || 0)).catch(() => {});
    const interval = setInterval(() => {
      getAdminAttention().then(d => setAttentionCount(d?.count || 0)).catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  function logout() {
    logoutAdmin();
    navigate("/login");
  }

  function toggleSection(label) {
    setCollapsed(c => ({ ...c, [label]: !c[label] }));
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f6f8f7" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, flexShrink: 0,
        background: "#ffffff",
        borderRight: "1px solid #dce6e3",
        display: "flex", flexDirection: "column",
        position: "fixed", top: 0, left: 0, bottom: 0,
        overflowY: "auto", zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid #eef3f1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 7, background: "#0f766e",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: "0.8rem", fontWeight: 900,
            }}>T</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: "1rem", color: "#13201e", letterSpacing: "-0.02em" }}>Thean</div>
              <div style={{ fontSize: "0.65rem", color: "#94a3a0", marginTop: -1 }}>Super Admin</div>
            </div>
          </div>
        </div>

        {/* Admin info */}
        {admin && (
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #eef3f1" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#13201e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {admin.full_name}
            </div>
            <div style={{ fontSize: "0.68rem", color: "#94a3a0", marginTop: 1, fontWeight: 600 }}>{admin.role}</div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 0" }}>
          {NAV.map(group => (
            <NavSection
              key={group.label}
              group={group}
              attentionCount={attentionCount}
              collapsed={!!collapsed[group.label]}
              onToggle={() => toggleSection(group.label)}
            />
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid #eef3f1" }}>
          <button
            onClick={logout}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", border: "1px solid #dce6e3", borderRadius: 8,
              background: "transparent", color: "#52625f", cursor: "pointer",
              fontSize: "0.82rem", fontWeight: 600,
            }}
          >
            <LogOut size={14} /> Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, marginLeft: 220, minHeight: "100vh", background: "#f6f8f7" }}>
        {children}
      </main>
    </div>
  );
}
