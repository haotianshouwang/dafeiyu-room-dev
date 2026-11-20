import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import {registerStaticFiles} from '../server/static-files.js';

test('built game static files are bounded to the dist directory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafeiyu-static-'));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'index.html'), '<main>game</main>');
  fs.writeFileSync(path.join(root, 'assets', 'app.js'), 'globalThis.game=true;');
  const app = Fastify();
  try {
    await registerStaticFiles(app, root);
    assert.equal((await app.inject('/')).body, '<main>game</main>');
    const asset = await app.inject('/assets/app.js');
    assert.equal(asset.statusCode, 200);
    assert.match(asset.headers['content-type'], /javascript/);
    assert.match(asset.headers['cache-control'], /immutable/);
    const head = await app.inject({ method: 'HEAD', url: '/assets/app.js' });
    assert.equal(head.statusCode, 200);
    assert.equal(head.body, '');
    for (const url of ['/assets/', '/assets/%2e%2e/package.json', '/%2e%2e/package.json']) {
      assert.equal((await app.inject(url)).statusCode, 404, url);
    }
  } finally {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
