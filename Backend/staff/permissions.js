import { staffPermissions } from "../../shared/staff.js";

export function staffAccess(admin, config) {
  if (admin.email === config.adminEmail || admin.email === config.technicalEmail) return Object.keys(staffPermissions);
  const roles = Array.isArray(admin.roles) ? admin.roles : ["admin"];
  if (!roles.some((role) => ["admin", "technical"].includes(role))) return [];
  return Array.isArray(admin.staffPermissions)
    ? admin.staffPermissions.filter((key) => Object.hasOwn(staffPermissions, key))
    : Object.keys(staffPermissions);
}

export function staffGuard(requireAdmin, config, permission) {
  return [requireAdmin, (req, res, next) => {
    const permissions = staffAccess(req.admin, config);
    if (!permissions.includes("view") || !permissions.includes(permission)) return res.status(403).json({ message: "Your account does not have permission for this staff action." });
    next();
  }];
}
