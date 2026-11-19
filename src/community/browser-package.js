import { sha256Hex } from './sync.js';

export const BROWSER_WORLD_PACKAGE_LIMITS = Object.freeze({
  maxFiles: 512,
  maxEntryBytes: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024
});

const HASH_POLICY = Object.freeze({
  algorithm: 'sha256',
  textEncoding: 'utf-8',
  textLineEndings: 'lf',
  textBom: 'strip-leading-utf8-bom',
  textTrailingNewline: 'preserve'
});
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const transientSnapshotFields = ['runtime', 'actions', 'buildPlans', 'buildChanges', 'paused'];
const transientActorFields = ['controller', 'input', 'actionId', 'moving', 'speed', 'verticalVelocity', 'airHeight', 'grounded', 'supportHeight', 'resting', 'pose', 'form'];

function textBytes(value) {
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function join(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function zipStore(entries) {
  const sorted = [...entries].sort((left, right) => left.path.localeCompare(right.path));
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of sorted) {
    const name = encoder.encode(entry.path);
    const bytes = entry.bytes instanceof Uint8Array ? entry.bytes : encoder.encode(String(entry.bytes));
    const crc = crc32(bytes);
    const local = join([
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
      u16(20), u16(0x800), u16(0), u16(0), u16(0),
      u32(crc), u32(bytes.length), u32(bytes.length),
      u16(name.length), u16(0), name, bytes
    ]);
    const central = join([
      Uint8Array.from([0x50, 0x4b, 0x01, 0x02]),
      u16(20), u16(20), u16(0x800), u16(0), u16(0), u16(0),
      u32(crc), u32(bytes.length), u32(bytes.length),
      u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), name
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const body = join(locals);
  const central = join(centrals);
  return join([
    body,
    central,
    Uint8Array.from([0x50, 0x4b, 0x05, 0x06]),
    u16(0), u16(0), u16(sorted.length), u16(sorted.length),
    u32(central.length), u32(body.length), u16(0)
  ]);
}

function cleanSnapshot(snapshot) {
  const copy = structuredClone(snapshot);
  for (const key of transientSnapshotFields) delete copy[key];
  copy.scenes = copy.scenes.map(scene => {
    const next = { ...scene };
    delete next.editLock;
    return next;
  });
  copy.actors = copy.actors.map(actor => Object.fromEntries(
    Object.entries(actor).filter(([key]) => !transientActorFields.includes(key))
  ));
  return copy;
}

function assertSafe(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:token|secret|password|credential|authorization|cookie|session|refresh)/i.test(key)) {
      throw new Error('SENSITIVE_DATA_FORBIDDEN');
    }
    assertSafe(child);
  }
}

export async function buildBrowserWorldPackage(snapshot, {
  worldName = snapshot.worldId,
  clientVersion = 'dafeiyu-room@community-web',
  now = new Date().toISOString()
} = {}) {
  const clean = cleanSnapshot(snapshot);
  const metadata = {};
  assertSafe(clean);
  assertSafe(metadata);
  const files = [
    { path: 'world/metadata.json', bytes: textBytes(metadata), type: 'json' },
    { path: 'world/world.json', bytes: textBytes(clean), type: 'json' }
  ];
  const entries = [];
  for (const file of files) {
    entries.push({ ...file, sha256: await sha256Hex(file.bytes), required: true });
  }
  const manifest = {
    format: 'dfworld',
    formatVersion: 1,
    worldId: clean.worldId,
    worldName,
    schemaVersion: clean.schemaVersion,
    rulesVersion: clean.rulesVersion ?? 1,
    clientVersion,
    revision: clean.layoutRevision ?? 0,
    createdAt: now,
    exportedAt: now,
    scenes: clean.scenes.map(({ sceneId, name, templateId }) => ({ sceneId, name, templateId })),
    assets: [],
    fileEntries: entries.map(({ path, type, bytes, sha256, required }) => ({ path, type, bytes: bytes.length, sha256, required })),
    totalSize: entries.reduce((total, entry) => total + entry.bytes.length, 0),
    hashAlgorithm: 'sha256',
    hashPolicy: HASH_POLICY
  };
  const archive = zipStore([
    { path: 'manifest.json', bytes: textBytes(manifest) },
    ...entries
  ]);
  return { bytes: archive, sha256: await sha256Hex(archive), manifest, snapshot: clean };
}

function readZip(bytes, limits = BROWSER_WORLD_PACKAGE_LIMITS) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let eocd = -1;
  for (let index = input.length - 22; index >= Math.max(0, input.length - 65557); index--) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error('INVALID_PACKAGE');
  const count = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (!count || count > limits.maxFiles || centralOffset + centralSize > eocd) throw new Error('PACKAGE_LIMIT');
  const files = new Map();
  let cursor = centralOffset;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('INVALID_PACKAGE');
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressed = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (method !== 0 || compressed !== size || size > limits.maxEntryBytes ||
      (total += size) > limits.maxTotalBytes) throw new Error('UNSUPPORTED_ZIP_FORMAT');
    const name = decoder.decode(input.subarray(cursor + 46, cursor + 46 + nameLength));
    if (!name || name.includes('..') || name.startsWith('/') || name.includes('\\')) throw new Error('UNSAFE_PACKAGE_PATH');
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('INVALID_PACKAGE');
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const content = input.slice(start, start + size);
    if (content.length !== size || crc32(content) !== crc) throw new Error('PACKAGE_CHECKSUM_FAILED');
    files.set(name, content);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

export async function inspectBrowserWorldPackage(bytes) {
  const files = readZip(bytes);
  const manifestBytes = files.get('manifest.json');
  const worldBytes = files.get('world/world.json');
  if (!manifestBytes || !worldBytes) throw new Error('PACKAGE_REQUIRED_FILE_MISSING');
  const manifest = JSON.parse(decoder.decode(manifestBytes));
  if (manifest.format !== 'dfworld' || manifest.formatVersion !== 1 || !Array.isArray(manifest.fileEntries)) {
    throw new Error('MANIFEST_INVALID');
  }
  for (const entry of manifest.fileEntries) {
    const content = files.get(entry.path);
    if (!content || content.length !== entry.bytes || await sha256Hex(content) !== entry.sha256) {
      throw new Error('PACKAGE_CHECKSUM_FAILED');
    }
  }
  const snapshot = JSON.parse(decoder.decode(worldBytes));
  if (snapshot.worldId !== manifest.worldId || !Array.isArray(snapshot.scenes)) throw new Error('INVALID_WORLD_SCHEMA');
  assertSafe(snapshot);
  return { manifest, snapshot };
}
