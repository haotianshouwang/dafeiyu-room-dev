export function legalDocumentUrl(documentName, {baseUrl = '', location = globalThis.location} = {}) {
  if (!['terms','privacy'].includes(documentName)) throw new Error('未知的协议文档');
  const origin = new URL(location?.href || 'http://127.0.0.1/');
  const base = baseUrl ? new URL(baseUrl, origin) : new URL('/', origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('社区服务地址无效');
  base.pathname = base.pathname.replace(/\/$/, '') + '/';
  return new URL(documentName, base).href;
}
