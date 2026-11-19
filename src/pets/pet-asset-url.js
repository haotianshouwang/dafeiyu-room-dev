// Bundled files follow the game entry, including deployments below /game/.
export function petAssetUrl(url,base=globalThis.document?.baseURI||globalThis.location?.href||'http://127.0.0.1/'){
 return new URL(url.startsWith('/resources/')?url.slice(1):url,base).href;
}
