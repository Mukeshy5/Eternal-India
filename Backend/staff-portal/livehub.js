const liveConnections = new Map(); // employee ID -> Set of open SSE responses

function removeConnection(staffId, res) {
  const connections = liveConnections.get(staffId);
  if (!connections) return;
  connections.delete(res);
  if (!connections.size) liveConnections.delete(staffId);
}

export function registerStaffLiveConnection(staffId, res) {
  const connections = liveConnections.get(staffId) || new Set();
  connections.add(res);
  liveConnections.set(staffId, connections);
  const remove = () => removeConnection(staffId, res);
  res.once("close", remove);
  res.once("error", remove);
}

export function unregisterStaffLiveConnection(staffId, res) {
  removeConnection(staffId, res);
}

export function broadcastToStaff(staffId, event, data) {
  const connections = liveConnections.get(staffId);
  if (!connections) return false;
  let delivered = false;
  for (const res of connections) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      res.flush?.();
      delivered = true;
    } catch {
      removeConnection(staffId, res);
    }
  }
  return delivered;
}

export function broadcastNotification(staffId, notification) {
  return broadcastToStaff(staffId, "notification:event", notification);
}

export function broadcastChanged(staffId) {
  return broadcastToStaff(staffId, "changed", { revision: Date.now() });
}

export function broadcastAll(event, data) {
  let count = 0;
  for (const [staffId, connections] of liveConnections) {
    for (const res of connections) {
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        res.flush?.();
        count++;
      } catch {
        removeConnection(staffId, res);
      }
    }
  }
  return count;
}

export function liveConnectionCount() {
  return [...liveConnections.values()].reduce((count, connections) => count + connections.size, 0);
}
