export function managementAccess(account, config) {
  if ([config.adminEmail, config.technicalEmail].filter(Boolean).includes(account.email)) return true;
  const roles = account.roles === undefined ? ["admin"] : Array.isArray(account.roles) ? account.roles : [];
  return roles.some((role) => role === "admin" || role === "technical");
}
