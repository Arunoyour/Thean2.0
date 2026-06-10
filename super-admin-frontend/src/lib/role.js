/**
 * Role utilities for the super-admin portal.
 *
 * The admin's role is stored in localStorage on login alongside the token.
 * All helpers read from localStorage so they work outside React components too.
 */

const ROLE_KEY = "thean_super_admin_role";

export const ROLES = {
  SUPER:      "SUPER",
  SUPERVISOR: "SUPERVISOR",
  CHECKER:    "CHECKER",
  AUDITOR:    "AUDITOR",
  TEAM_LEAD:  "TEAM_LEAD",
};

/** Save role to localStorage after a successful login. */
export function saveRole(role) {
  window.localStorage.setItem(ROLE_KEY, role ?? "");
}

/** Read the current admin's role from localStorage. */
export function getRole() {
  return window.localStorage.getItem(ROLE_KEY) || "";
}

/** Remove role on logout. */
export function clearRole() {
  window.localStorage.removeItem(ROLE_KEY);
}

/** Returns true if the current admin has one of the supplied roles. */
export function hasRole(...roles) {
  const current = getRole();
  return roles.includes(current);
}

// Convenience helpers used in nav/button visibility checks
export const isSuperOnly     = () => hasRole(ROLES.SUPER);
export const canManageAdmins = () => hasRole(ROLES.SUPER);
export const canApprove      = () => hasRole(ROLES.SUPER, ROLES.SUPERVISOR, ROLES.CHECKER);
export const canWriteConfig  = () => hasRole(ROLES.SUPER, ROLES.SUPERVISOR);
export const canSeeAuditLog  = () => hasRole(ROLES.SUPER, ROLES.SUPERVISOR);
export const isAuditOnly     = () => hasRole(ROLES.AUDITOR);
export const isTeamLead      = () => hasRole(ROLES.TEAM_LEAD);
