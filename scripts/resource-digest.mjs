import {createHash} from 'node:crypto';

export const RESOURCE_HASH_POLICY = Object.freeze({
  algorithm: 'sha256',
  textEncoding: 'utf-8',
  textLineEndings: 'lf',
  textBom: 'strip-leading-utf8-bom',
  textTrailingNewline: 'preserve'
});

const TEXT_EXTENSIONS = new Set(['.css', '.csv', '.html', '.js', '.json', '.md', '.mjs', '.svg', '.txt', '.ts', '.yaml', '.yml']);

export function isTextResource(resourcePath) {
  const normalized = resourcePath.replaceAll('\\', '/').toLowerCase();
  const dot = normalized.lastIndexOf('.');
  return dot >= 0 && TEXT_EXTENSIONS.has(normalized.slice(dot));
}

export function canonicalResourceBytes(input, resourcePath) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (!isTextResource(resourcePath)) return Buffer.from(bytes);
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return Buffer.from(text, 'utf8');
}

export function resourceDigest(input, resourcePath) {
  return createHash(RESOURCE_HASH_POLICY.algorithm).update(canonicalResourceBytes(input, resourcePath)).digest('hex');
}
