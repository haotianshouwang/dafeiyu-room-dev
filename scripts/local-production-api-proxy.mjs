import http from 'node:http';
import https from 'node:https';

const listenPort = Number(process.env.DAFEIYU_COMMUNITY_PROXY_PORT || 4312);
const listenOrigin = `http://127.0.0.1:${listenPort}`;
const clientOrigin = process.env.DAFEIYU_CLIENT_ORIGIN || 'http://127.0.0.1:5200';
const target = new URL(process.env.DAFEIYU_COMMUNITY_TARGET || 'https://dsh.xn--n6qv0quslfsn.top');
if (!['https:', 'http:'].includes(target.protocol)) throw new Error('DAFEIYU_COMMUNITY_TARGET must be HTTP(S)');

function upstreamHeaders(request) {
  const headers = { ...request.headers };
  headers.host = target.host;
  if (headers.origin) headers.origin = target.origin;
  if (headers.referer) headers.referer = `${target.origin}/`;
  return headers;
}

function rewriteResponseHeaders(headers) {
  const rewritten = { ...headers };
  for (const name of Object.keys(rewritten)) if (name.startsWith('access-control-')) delete rewritten[name];
  if (rewritten['set-cookie']) {
    rewritten['set-cookie'] = rewritten['set-cookie'].map(cookie => cookie.replace(/;\s*Secure/gi, ''));
  }
  rewritten['access-control-allow-origin'] = clientOrigin;
  rewritten['access-control-allow-credentials'] = 'true';
  rewritten['access-control-expose-headers'] = 'x-csrf-token,x-request-id';
  rewritten.vary = rewritten.vary ? `${rewritten.vary}, Origin` : 'Origin';
  return rewritten;
}

const server = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    const requestedHeaders = request.headers['access-control-request-headers'] || 'accept,content-type,x-csrf-token,x-request-id,x-chunk-hash,x-chunk-offset';
    response.writeHead(204, {
      'access-control-allow-origin':clientOrigin,
      'access-control-allow-credentials':'true',
      'access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers':requestedHeaders,
      'access-control-max-age':'600',
      vary:'Origin'
    });
    response.end();
    return;
  }
  const upstream = (target.protocol === 'https:' ? https : http).request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    method: request.method,
    path: request.url,
    headers: upstreamHeaders(request)
  }, upstreamResponse => {
    response.writeHead(upstreamResponse.statusCode || 502, rewriteResponseHeaders(upstreamResponse.headers));
    upstreamResponse.pipe(response);
  });
  upstream.on('error', error => {
    if (!response.headersSent) response.writeHead(502, { 'content-type':'application/json; charset=utf-8' });
    response.end(JSON.stringify({ success:false, error:{ code:'GATEWAY_ERROR', message:error.message, retryable:true } }));
  });
  request.pipe(upstream);
});

server.on('upgrade', (request, clientSocket, clientHead) => {
  const upstream = (target.protocol === 'https:' ? https : http).request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    method: 'GET',
    path: request.url,
    headers: upstreamHeaders(request)
  });
  upstream.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
    const lines = [`HTTP/1.1 ${upstreamResponse.statusCode} ${upstreamResponse.statusMessage || 'Switching Protocols'}`];
    for (let index = 0; index < upstreamResponse.rawHeaders.length; index += 2) {
      lines.push(`${upstreamResponse.rawHeaders[index]}: ${upstreamResponse.rawHeaders[index + 1]}`);
    }
    clientSocket.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (upstreamHead.length) clientSocket.write(upstreamHead);
    if (clientHead.length) upstreamSocket.write(clientHead);
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });
  upstream.on('response', upstreamResponse => {
    clientSocket.write(`HTTP/1.1 ${upstreamResponse.statusCode} ${upstreamResponse.statusMessage || 'Bad Gateway'}\r\n\r\n`);
    clientSocket.destroy();
  });
  upstream.on('error', () => clientSocket.destroy());
  upstream.end();
});

server.listen(listenPort, '127.0.0.1', () => {
  console.log(`LOCAL_PRODUCTION_API_PROXY_READY ${listenOrigin} -> ${target.origin}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
