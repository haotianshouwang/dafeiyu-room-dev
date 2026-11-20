import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Fastify from 'fastify';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { installCommunityApiProxy } from '../server/community-api-proxy.js';
import { buildServer } from '../server/app.js';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

function upstreamFixture() {
  const sockets = new WebSocketServer({ noServer: true });
  const server = http.createServer((request, response) => {
    if (request.url === '/api/auth/login' && request.method === 'POST') {
      response.writeHead(200, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'set-cookie': ['dafeiyu_session=secret; Path=/; Secure; HttpOnly', 'dafeiyu_csrf=token; Domain=dsh.example.test; Path=/; Secure']
      });
      response.end(JSON.stringify({ success: true }));
      return;
    }
    if (request.url === '/api/health/ready') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ready' }));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'NOT_FOUND' }));
  });
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/ws/realtime') {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    if (request.headers.cookie !== 'dafeiyu_session=secret') {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(request, socket, head, client => {
      sockets.emit('connection', client, request);
    });
  });
  sockets.on('connection', socket => {
    socket.on('message', raw => {
      const message = JSON.parse(String(raw));
      socket.send(JSON.stringify({ type: 'connected', user_id: message.user_id || 'proxy-user' }));
    });
  });
  return { server, sockets };
}

test('local community proxy carries an authenticated WebSocket and rejects anonymous upgrades', async () => {
  const upstream = upstreamFixture();
  const upstreamPort = await listen(upstream.server);
  const app = Fastify();
  installCommunityApiProxy(app, { origin: `http://127.0.0.1:${upstreamPort}` });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const localPort = app.server.address().port;
  let socket;
  try {
    const url = `ws://127.0.0.1:${localPort}/community-api/ws/realtime`;
    socket = new WebSocket(url, { headers: { cookie: 'dafeiyu_session=secret' } });
    await once(socket, 'open');
    const reply = once(socket, 'message');
    socket.send(JSON.stringify({ type: 'connect', user_id: 'proxy-user' }));
    const [raw] = await reply;
    assert.deepEqual(JSON.parse(raw), { type: 'connected', user_id: 'proxy-user' });

    const anonymous = new WebSocket(url);
    const [error] = await once(anonymous, 'error');
    assert.match(error.message, /401/);
  } finally {
    socket?.terminate();
    await app.close();
    upstream.sockets.close();
    await close(upstream.server);
  }
});

test('same-origin community proxy forwards credentials without CORS coupling', async () => {
  const received = [];
  const upstream = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({
      method: request.method,
      url: request.url,
      origin: request.headers.origin,
      host: request.headers.host,
      body: Buffer.concat(chunks).toString('utf8')
    });
    response.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'set-cookie': ['dafeiyu_session=secret; Path=/; Secure; HttpOnly', 'dafeiyu_csrf=token; Domain=dsh.example.test; Path=/; Secure']
    });
    response.end(JSON.stringify({ success: true }));
  });
  const upstreamPort = await listen(upstream);
  const app = Fastify();
  installCommunityApiProxy(app, { origin: `http://127.0.0.1:${upstreamPort}` });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const localPort = app.server.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${localPort}/community-api/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${localPort}`, 'x-request-id': 'request-1' },
      body: JSON.stringify({ identifier: 'player@example.test', password: 'not-a-real-password' })
    });
    const payload = await response.text();
    assert.equal(response.status, 200, payload);
    assert.deepEqual(JSON.parse(payload), { success: true });
    assert.equal(received[0].method, 'POST');
    assert.equal(received[0].url, '/api/auth/login');
    assert.equal(received[0].origin, `http://127.0.0.1:${upstreamPort}`);
    assert.equal(received[0].host, `127.0.0.1:${upstreamPort}`);
    assert.equal(JSON.parse(received[0].body).identifier, 'player@example.test');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    const cookies = response.headers.get('set-cookie');
    assert.doesNotMatch(cookies, /;\s*Secure/i);
    assert.doesNotMatch(cookies, /Domain=/i);
    assert.equal((await fetch(`http://127.0.0.1:${localPort}/community-api/private`)).status, 404);
  } finally {
    await app.close();
    await close(upstream);
  }
});

test('local game server mounts a configured community account proxy', async () => {
  let receivedPath = '';
  const upstream = http.createServer((request, response) => {
    receivedPath = request.url;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ready' }));
  });
  const upstreamPort = await listen(upstream);
  const app = await buildServer({
    databasePath: ':memory:',
    worldMode: true,
    startRuntime: false,
    auth: { localAccess: true },
    communityApiOrigin: `http://127.0.0.1:${upstreamPort}`
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const localPort = app.server.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${localPort}/community-api/api/health/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ready' });
    assert.equal(receivedPath, '/api/health/ready');
    assert.equal((await fetch(`http://127.0.0.1:${localPort}/community-api/private`)).status, 404);
  } finally {
    await app.close();
    await close(upstream);
  }
});
