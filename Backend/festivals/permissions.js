import { decorationPermissions } from "../../shared/decorationCatalog.js";

export function technicalAccess(admin, config) {
  // The configured owner already operated the Technical Panel before this module.
  // Other accounts must be explicitly assigned the technical role in MongoDB.
  const ownerEmail = config.technicalEmail || config.adminEmail;
  const technical = (Array.isArray(admin.roles) && admin.roles.includes("technical")) || admin.email === ownerEmail;
  const permissions = technical
    ? (admin.email === ownerEmail || !Array.isArray(admin.technicalPermissions)
      ? Object.keys(decorationPermissions)
      : admin.technicalPermissions.filter((key) => Object.hasOwn(decorationPermissions, key)))
    : [];
  return { technical, permissions, roles: [...new Set([...(Array.isArray(admin.roles) ? admin.roles : ["admin"]), ...(technical ? ["technical"] : [])])] };
}

export function technicalGuard(requireAdmin, config, permission) {
  return [requireAdmin, (req, res, next) => {
    const access = technicalAccess(req.admin, config);
    if (!access.technical || (permission && !(Array.isArray(permission) ? permission.some((key) => access.permissions.includes(key)) : access.permissions.includes(permission)))) return res.status(403).json({ message: "Your technical account does not have permission for this action." });
    next();
  }];
}
