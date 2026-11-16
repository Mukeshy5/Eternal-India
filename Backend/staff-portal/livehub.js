const liveConnections = new Map(); // staffId (string) -> { res, closed }

export function registerStaffLiveConnection(staffId, res) {
  liveConnections.set(staffId, { res, closed: false });
  res.on("close", () => { liveConnections.delete(staffId); });
  res.on("error", () => { liveConnections.delete(staffId); });
}

export function unregisterStaffLiveConnection(staffId) {
  liveConnections.delete(staffId);
}

export function broadcastToStaff(staffId, event, data) {
  const conn = liveConnections.get(staffId);
  if (!conn || conn.closed) return false;
  try {
    conn.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    conn.res.flush?.();
    return true;
  } catch {
    liveConnections.delete(staffId);
    return false;
  }
}

export function broadcastNotification(staffId, notification) {
  return broadcastToStaff(staffId, "notification:event", notification);
}

export function broadcastChanged(staffId) {
  return broadcastToStaff(staffId, "changed", { revision: Date.now() });
}

export function broadcastAll(event, data) {
  let count = 0;
  for (const [staffId, conn] of liveConnections) {
    if (conn.closed) continue;
    try {
      conn.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      conn.res.flush?.();
      count++;
    } catch {
      liveConnections.delete(staffId);
    }
  }
  return count;
}

export function liveConnectionCount() {
  return liveConnections.size;
}
