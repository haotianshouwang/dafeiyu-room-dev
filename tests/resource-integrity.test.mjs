import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalResourceBytes, resourceDigest, RESOURCE_HASH_POLICY} from '../scripts/resource-digest.mjs';

test('manifest resources use the declared cross-platform digest policy', () => {
  const manifest = JSON.parse(fs.readFileSync('resources/character/manifest.json', 'utf8'));
  assert.deepEqual(manifest.hashPolicy, RESOURCE_HASH_POLICY);
  for (const entry of manifest.files) {
    const bytes = fs.readFileSync(entry.path);
    assert.equal(resourceDigest(bytes, entry.path), entry.sha256, entry.path);
    assert.equal(canonicalResourceBytes(bytes, entry.path).length, entry.bytes, entry.path);
  }
});

test('text resources have identical LF and CRLF digests while binary bytes stay exact', () => {
  const lf = Buffer.from('\uFEFF第一行\n第二行\n', 'utf8');
  const crlf = Buffer.from('\uFEFF第一行\r\n第二行\r\n', 'utf8');
  assert.deepEqual(canonicalResourceBytes(lf, 'notes/example.txt'), canonicalResourceBytes(crlf, 'notes/example.txt'));
  assert.equal(resourceDigest(lf, 'notes/example.txt'), resourceDigest(crlf, 'notes/example.txt'));
  assert.notEqual(resourceDigest(Buffer.from('第一行\n第二行\nX', 'utf8'), 'notes/example.txt'), resourceDigest(lf, 'notes/example.txt'));

  const actualPath = 'resources/polyfork/LICENSE.md';
  const actual = fs.readFileSync(actualPath).toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const actualLf = Buffer.from(actual, 'utf8');
  const actualCrlf = Buffer.from(actual.replaceAll('\n', '\r\n'), 'utf8');
  assert.equal(resourceDigest(actualLf, actualPath), resourceDigest(actualCrlf, actualPath));

  const binary = Buffer.from([0, 10, 13, 255, 1]);
  assert.deepEqual(canonicalResourceBytes(binary, 'models/example.glb'), binary);
  assert.notEqual(resourceDigest(Buffer.from([0, 10, 13, 255, 2]), 'models/example.glb'), resourceDigest(binary, 'models/example.glb'));
});
