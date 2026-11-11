export function adminPanelAccess(account, config) {
  if (Array.isArray(account.roles)) return account.roles.includes("admin");
  return !config.technicalEmail || config.technicalEmail === config.adminEmail || account.email !== config.technicalEmail;
}
