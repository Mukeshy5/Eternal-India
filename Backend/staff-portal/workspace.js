// Business records are shared across the three workspaces. Personal staff
// records and account activity retain their separate access rules.
export const staffWorkspaceResources = ["enquiries", "journeys", "invoices", "hotels", "GST settings", "office addresses"];

export function staffActivityFilter(account) {
  return { $or: [
    { resource: { $in: staffWorkspaceResources } },
    { "actor.id": account._id.toString() },
    ...(account.canViewActivity ? [{ "actor.type": "staff" }] : []),
  ] };
}
