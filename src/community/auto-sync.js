export function installStructuredAutoSync({client, sync, api, target = globalThis}) {
  let timer, signature = '', retryDelay = 1000;
  const schedule = (delay = 800) => {
    clearTimeout(timer);
    if (!sync.lastStructuredOptions || !api.currentUserId) return;
    timer = setTimeout(() => {
      timer = null;
      if (client.readOnly) return;
      if (sync.lastStructuredOptions?.worldId !== client.snapshot?.worldId) return;
      if (sync.running || sync.structured.running) { schedule(300); return; }
      sync.syncStructured(sync.lastStructuredOptions).then(result => {
        retryDelay = 1000;
        if (result.pending) schedule(800);
      }).catch(error => {
        if (error.retryable) { schedule(retryDelay); retryDelay = Math.min(30_000, retryDelay * 2); }
      });
    }, delay);
  };
  const unsubscribe = client.onSnapshot(snapshot => {
    const next = JSON.stringify([snapshot.worldId, snapshot.layoutRevision, snapshot.topologyRevision]);
    if (signature === next) return;
    signature = next;
    schedule();
  });
  const online = () => schedule(0);
  target.addEventListener?.('online', online);
  // Bound devices also pull while idle; a remote edit does not require a local edit.
  const poll = setInterval(() => { if (!timer) schedule(0); }, 15_000);
  return () => { clearInterval(poll); clearTimeout(timer); unsubscribe?.(); target.removeEventListener?.('online', online); };
}
