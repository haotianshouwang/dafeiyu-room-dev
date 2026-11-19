export const COMMUNITY_SERVER_ORIGINS = Object.freeze({
  local: 'http://127.0.0.1:4311',
  production: 'https://dsh.xn--n6qv0quslfsn.top'
});
export const COMMUNITY_API_PROXY_PATH = '/community-api';

const BUILD_API_BASE = typeof __DAFEIYU_COMMUNITY_API_BASE_DEFAULT__ === 'string'
  ? __DAFEIYU_COMMUNITY_API_BASE_DEFAULT__
  : '';

export function resolveCommunityApiBase({
  explicitBase = '',
  runtimeBase = globalThis.__DAFEIYU_COMMUNITY_API_BASE__ ?? '',
  location = globalThis.location,
  desktop = globalThis.dafeiyuDesktop?.desktop === true,
  buildBase = BUILD_API_BASE
} = {}) {
  const selected = String(explicitBase || runtimeBase || '').trim();
  if (selected === 'same-origin') return '';
  if (selected) return selected;
  if (desktop) return COMMUNITY_API_PROXY_PATH;
  const built = String(buildBase || '').trim();
  if (built === 'same-origin') return '';
  if (built) return built;
  const hostname = String(location?.hostname || '').toLowerCase();
  if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]') return COMMUNITY_API_PROXY_PATH;
  if (hostname === 'dsh.xn--n6qv0quslfsn.top') return COMMUNITY_SERVER_ORIGINS.production;
  return import.meta.env?.PROD ? COMMUNITY_SERVER_ORIGINS.production : COMMUNITY_API_PROXY_PATH;
}
