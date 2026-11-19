// Optional protocol boundary. The local game does not require the protocol
// package or a community server to start; callers may inject the package when
// running an online adapter.
const idPattern = /^[\w.-]{1,128}$/;
const fallback = {
  protocolVersion: '1.0.0',
  isId: value => typeof value === 'string' && idPattern.test(value),
  projectSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const privateKeys = new Set(['buildPlans', 'buildChanges', 'editLock', 'runtime', 'commandResults', 'db']);
    const output = structuredClone(snapshot);
    for (const key of privateKeys) delete output[key];
    return output;
  }
};

export async function loadProtocolAdapter() {
  try {
    const protocol = await import('@dafeiyu/community-protocol');
    return { ...fallback, protocolVersion: protocol.PROTOCOL_VERSION, isId: protocol.isId };
  } catch {
    return fallback;
  }
}

export function projectPublicSnapshot(snapshot) {
  return fallback.projectSnapshot(snapshot);
}
