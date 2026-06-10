/**
 * RoleGate — conditionally renders children based on the current admin's role.
 *
 * Usage:
 *   <RoleGate allow={["SUPER", "SUPERVISOR"]}>
 *     <button>Danger action</button>
 *   </RoleGate>
 *
 *   <RoleGate allow={["SUPER"]} fallback={<span>Read-only</span>}>
 *     <button>Edit</button>
 *   </RoleGate>
 */

import { hasRole } from "../lib/role.js";

export function RoleGate({ allow = [], fallback = null, children }) {
  if (hasRole(...allow)) return children;
  return fallback;
}
