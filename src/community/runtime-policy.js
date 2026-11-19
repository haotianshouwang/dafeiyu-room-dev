export function resolveGameRuntime({
  pathname = globalThis.location?.pathname ?? '/',
  search = globalThis.location?.search ?? '',
  communityWeb = globalThis.__DAFEIYU_COMMUNITY_WEB__ === true,
  communityBuild = typeof __DAFEIYU_COMMUNITY_BUILD__!=='undefined'&&__DAFEIYU_COMMUNITY_BUILD__===true
} = {}) {
  const query = new URLSearchParams(search);
  const communityWorld = communityBuild === true || communityWeb === true ||
    pathname === '/game' ||
    pathname.startsWith('/game/') ||
    query.get('runtime') === 'community';
  return Object.freeze({
    kind: communityWorld ? 'community' : 'local',
    communityWorld,
    accountRequired: communityWorld,
    gameTransport: communityWorld ? 'browser' : 'local'
  });
}
