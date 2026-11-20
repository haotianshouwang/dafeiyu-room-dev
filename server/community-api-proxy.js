import http from 'node:http';
import https from 'node:https';

const PROXY_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const PUBLIC_PATHS = new Set(['/terms', '/privacy', '/auth/legal.css']);

function upstreamPath(originalUrl, prefix) {
  const value = String(originalUrl || '/');
  const path = value.startsWith(prefix) ? value.slice(prefix.length) || '/' : value;
  return path.startsWith('/') ? path : `/${path}`;
}

function allowedPath(pathname) {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith('/api/');
}

function rewriteCookie(cookie) {
  return String(cookie)
    .replace(/;\s*Secure(?=;|$)/gi, '')
    .replace(/;\s*Domain=[^;]*/gi, '');
}

function responseHeaders(headers, {target, prefix, localOrigin}) {
  const rewritten = {...headers};
  for (const name of Object.keys(rewritten)) {
    if (name.startsWith('access-control-')) delete rewritten[name];
  }
  if (rewritten['set-cookie']) {
    const cookies = Array.isArray(rewritten['set-cookie']) ? rewritten['set-cookie'] : [rewritten['set-cookie']];
    rewritten['set-cookie'] = cookies.map(rewriteCookie);
  }
  if (rewritten.location) {
    try {
      const location = new URL(rewritten.location, target);
      if (location.origin === target.origin) rewritten.location = `${localOrigin}${prefix}${location.pathname}${location.search}${location.hash}`;
    } catch {
      // Preserve relative or malformed upstream locations; the browser resolves them against this origin.
    }
  }
  return rewritten;
}

function requestHeaders(raw, target) {
  const headers = {...raw.headers};
  delete headers.connection;
  headers.host = target.host;
  if (headers.origin) headers.origin = target.origin;
  if (headers.referer) headers.referer = `${target.origin}/`;
  return headers;
}

function requestBody(body) {
  if (body === undefined || body === null) return undefined;
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === 'string') return Buffer.from(body);
  return Buffer.from(JSON.stringify(body));
}

export function installCommunityApiProxy(app, {
  origin,
  prefix = '/community-api',
  timeoutMs = 30_000
} = {}) {
  if (!origin) return false;
  const target = new URL(origin);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.hash) {
    throw new Error('社区 API 代理地址无效');
  }
  const transport = target.protocol === 'https:' ? https : http;
  const localOrigin = `http://127.0.0.1:${process.env.DAFEIYU_PORT || 5200}`;
  const sockets = new Set();
  const onUpgrade = (request,socket,head) => {
    if (new URL(request.url,'http://proxy.local').pathname !== `${prefix}/ws/realtime`) return;
    const newline=String.fromCharCode(13,10);
    const headers = {...requestHeaders(request,target),connection:'Upgrade',upgrade:'websocket'};
    const upstream = transport.request({protocol:target.protocol,hostname:target.hostname,port:target.port || (target.protocol==='https:'?443:80),path:'/ws/realtime',headers,method:'GET'});
    sockets.add(socket);socket.once('close',()=>{sockets.delete(socket);upstream.destroy();});
    upstream.setTimeout(timeoutMs,()=>{upstream.destroy();socket.destroy();});
    upstream.on('error',()=>socket.destroy());
    upstream.on('response',response=>{socket.end(`HTTP/1.1 ${response.statusCode || 502} Rejected${newline}Connection: close${newline}${newline}`);response.resume();});
    upstream.on('upgrade',(response,remote,remoteHead)=>{
      upstream.setTimeout(0);sockets.add(remote);remote.once('close',()=>{sockets.delete(remote);socket.destroy();});
      remote.on('error',()=>socket.destroy());socket.on('error',()=>remote.destroy());socket.once('close',()=>remote.destroy());
      let handshake='HTTP/1.1 101 Switching Protocols'+newline;
      for(const [name,value]of Object.entries(response.headers))for(const item of Array.isArray(value)?value:[value])if(item!==undefined)handshake+=`${name}: ${item}${newline}`;
      socket.write(handshake+newline);if(remoteHead.length)socket.write(remoteHead);if(head.length)remote.write(head);
      socket.pipe(remote);remote.pipe(socket);socket.resume();
    });
    upstream.end();
  };
  app.server.on('upgrade',onUpgrade);
  app.addHook('onClose',async()=>{app.server.off('upgrade',onUpgrade);for(const socket of sockets)socket.destroy();sockets.clear();});

  app.register(async function communityApiProxy(scope) {
    scope.addContentTypeParser('*', {parseAs: 'buffer'}, (_request, body, done) => done(null, body));
    scope.route({
      method: PROXY_METHODS,
      url: '/*',
      async handler(request, reply) {
        const requestPath = upstreamPath(request.raw.url, prefix);
        const pathname = new URL(requestPath, 'http://proxy.local').pathname;
        if (!allowedPath(pathname)) return reply.code(404).send({error: 'NOT_FOUND'});

        const headers = requestHeaders(request.raw, target);
        const body = requestBody(request.body);
        if (body) headers['content-length'] = String(body.length);
        else delete headers['content-length'];
        if (!body) delete headers['transfer-encoding'];

        await new Promise(resolve => {
          const upstream = transport.request({
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port || (target.protocol === 'https:' ? 443 : 80),
            method: request.method,
            path: requestPath,
            headers
          }, upstreamResponse => {
            reply.hijack();
            const response = reply.raw;
            response.writeHead(
              upstreamResponse.statusCode || 502,
              responseHeaders(upstreamResponse.headers, {target, prefix, localOrigin})
            );
            upstreamResponse.pipe(response);
            upstreamResponse.once('end', resolve);
            upstreamResponse.once('error', resolve);
          });
          upstream.setTimeout(timeoutMs, () => upstream.destroy(new Error('COMMUNITY_API_PROXY_TIMEOUT')));
          upstream.once('error', error => {
            if (!reply.raw.headersSent) reply.code(502).send({
              success: false,
              error: {code: 'COMMUNITY_API_UNAVAILABLE', message: error.message, retryable: true}
            });
            resolve();
          });
          request.raw.once('aborted', () => upstream.destroy());
          if (body) upstream.end(body);
          else upstream.end();
        });
      }
    });
  }, {prefix});
  return true;
}
