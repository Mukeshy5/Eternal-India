// A request finishing after another request logged out may touch a deleted session.
// Treat that as expiry, without recreating it or hiding actual storage failures.
export function sessionLifecycle(store) {
  const pending = new Set(), touch = store.touch.bind(store);
  store.touch = (id, session, callback = () => {}) => {
    let resolve;
    const operation = new Promise((done) => { resolve = done; });
    pending.add(operation);
    const finish = (error) => {
      pending.delete(operation); resolve();
      callback(error?.message === "Unable to find the session to touch" ? null : error);
    };
    try { touch(id, session, finish); } catch (error) { finish(error); }
  };
  return async function drainSessions() {
    while (pending.size) await Promise.all([...pending]);
  };
}
