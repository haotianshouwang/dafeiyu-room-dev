import fs from 'node:fs';
import path from 'node:path';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp'
};

function notFound(reply) {
  return reply.code(404).send({ error: 'NOT_FOUND' });
}

export async function registerStaticFiles(app, root) {
  const canonicalRoot = await fs.promises.realpath(root);
  const index = path.join(canonicalRoot, 'index.html');

  app.get('/', async (_request, reply) => {
    const body = await fs.promises.readFile(index);
    return reply.type(contentTypes['.html']).header('cache-control', 'no-cache').send(body);
  });

  app.route({
    method: ['GET', 'HEAD'],
    url: '/*',
    handler: async (request, reply) => {
      let relative;
      try {
        relative = decodeURIComponent(String(request.params['*'] || '')).replaceAll('\\', '/');
      } catch {
        return notFound(reply);
      }
      const segments = relative.split('/');
      if (!relative || segments.some(segment => !segment || segment === '.' || segment === '..')) {
        return notFound(reply);
      }
      try {
        const candidate = path.resolve(canonicalRoot, relative);
        if (!candidate.startsWith(`${canonicalRoot}${path.sep}`)) return notFound(reply);
        const target = await fs.promises.realpath(candidate);
        if (!target.startsWith(`${canonicalRoot}${path.sep}`)) return notFound(reply);
        const info = await fs.promises.stat(target);
        if (!info.isFile()) return notFound(reply);
        let content = target, size = info.size;
        if (relative.endsWith('/Dafeiyu-web-v1.glb')) {
          reply.header('vary','Accept-Encoding');
          const acceptsGzip = String(request.headers['accept-encoding'] || '').split(',').some(entry => {
            const [name, ...parameters] = entry.trim().split(';');
            const quality = parameters.find(value => value.trim().startsWith('q='));
            return name.toLowerCase() === 'gzip' && (!quality || Number(quality.trim().slice(2)) > 0);
          });
          if (acceptsGzip) {
            const compressed = await fs.promises.realpath(target + '.gz').catch(() => null);
            if (compressed?.startsWith(canonicalRoot + path.sep)) {
              const compressedInfo = await fs.promises.stat(compressed);
              if (compressedInfo.isFile()) { content = compressed; size = compressedInfo.size; reply.header('content-encoding','gzip'); }
            }
          }
        }
        reply
          .type(contentTypes[path.extname(target).toLowerCase()] || 'application/octet-stream')
          .header('content-length', String(size))
          .header('cache-control', relative.startsWith('assets/') ? 'public,max-age=31536000,immutable' : 'public,max-age=3600');
        if (request.method === 'HEAD') return reply.code(200).send();
        return reply.send(fs.createReadStream(content));
      } catch {
        return notFound(reply);
      }
    }
  });
}
