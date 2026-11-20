import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, renameSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {canonicalResourceBytes, resourceDigest, RESOURCE_HASH_POLICY} from '../scripts/resource-digest.mjs';

export const WORLD_PACKAGE_FORMAT = 'dfworld';
export const WORLD_PACKAGE_VERSION = 1;
export const WORLD_PACKAGE_LIMITS = Object.freeze({maxFiles: 512, maxEntryBytes: 16 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024});
const TEMP_MARKER = '.dfworld-temp.json';
const TEMP_MARKER_VERSION = 1;
const TEMP_PHASES = new Set(['staging','promoting','committed']);

const transientActorFields = new Set(['controller','input','actionId','moving','speed','verticalVelocity','airHeight','grounded','supportHeight','resting','pose','form']);
const transientSnapshotFields = new Set(['runtime','actions','buildPlans','buildChanges','paused']);
const sensitiveKey = /(?:token|secret|password|credential|authorization|cookie|session|refresh)/i;
const text = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');

function faultPoint(name) {
  if (process.env.NODE_ENV !== 'test' || process.env.DAFEIYU_WORLD_PACKAGE_FAULT !== name) return;
  const signal = process.env.DAFEIYU_WORLD_PACKAGE_FAULT_SIGNAL;
  if (signal) writeFileSync(signal, JSON.stringify({name, pid:process.pid, at:Date.now()}));
  const gate = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(gate, 0, 0);
}

function writeTempMarker(directory, state) {
  writeFileSync(path.join(directory, TEMP_MARKER), JSON.stringify(state));
}

function safeWorldId(value) { return typeof value === 'string' && /^[\w.-]{1,128}$/.test(value); }

function crc32(input) {
  let crc = 0xffffffff;
  for (const byte of input) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; }
function u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); return b; }
function hasExtraField(extra, wanted) { let offset = 0; for (; offset + 4 <= extra.length;) { const id = extra.readUInt16LE(offset), length = extra.readUInt16LE(offset + 2); if (offset + 4 + length > extra.length) throw Error('INVALID_PACKAGE'); if (id === wanted) return true; offset += 4 + length; } if (offset !== extra.length) throw Error('INVALID_PACKAGE'); return false; }
function validPath(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw Error('UNSAFE_PACKAGE_PATH');
  const normalized = path.posix.normalize(name);
  if (normalized !== name || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || name.endsWith('/')) throw Error('UNSAFE_PACKAGE_PATH');
  return normalized;
}

function zipStore(entries) {
  const locals = [], centrals = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(validPath(entry.path), 'utf8'), bytes = Buffer.from(entry.bytes), crc = crc32(bytes);
    const local = Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]), u16(20), u16(0x800), u16(0), u16(0), u16(0), u32(crc), u32(bytes.length), u32(bytes.length), u16(name.length), u16(0), name, bytes]);
    const central = Buffer.concat([Buffer.from([0x50,0x4b,0x01,0x02]), u16(20), u16(20), u16(0x800), u16(0), u16(0), u16(0), u32(crc), u32(bytes.length), u32(bytes.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]);
    locals.push(local); centrals.push(central); offset += local.length;
  }
  const central = Buffer.concat(centrals), body = Buffer.concat(locals), end = Buffer.concat([Buffer.from([0x50,0x4b,0x05,0x06]), Buffer.alloc(2), Buffer.alloc(2), u16(entries.length), u16(entries.length), u32(central.length), u32(body.length), u16(0)]);
  return Buffer.concat([body, central, end]);
}

function readZip(buffer, limits = WORLD_PACKAGE_LIMITS) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw Error('INVALID_PACKAGE');
  let eocd = -1; for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw Error('INVALID_PACKAGE');
  const disk = buffer.readUInt16LE(eocd + 4), centralDisk = buffer.readUInt16LE(eocd + 6), entriesOnDisk = buffer.readUInt16LE(eocd + 8), count = buffer.readUInt16LE(eocd + 10), centralSize = buffer.readUInt32LE(eocd + 12), centralOffset = buffer.readUInt32LE(eocd + 16), commentLength = buffer.readUInt16LE(eocd + 20);
  if (eocd + 22 + commentLength !== buffer.length || disk !== 0 || centralDisk !== 0 || entriesOnDisk !== count || count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw Error('UNSUPPORTED_ZIP_FORMAT');
  if (eocd >= 20 && buffer.readUInt32LE(eocd - 20) === 0x07064b50) throw Error('UNSUPPORTED_ZIP_FORMAT');
  if (count > limits.maxFiles || centralOffset + centralSize > eocd || centralOffset < 0) throw Error('PACKAGE_LIMIT');
  const files = new Map(), pathKeys = new Set(), intervals = []; let cursor = centralOffset, total = 0, compressedTotal = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > centralOffset + centralSize) throw Error('INVALID_PACKAGE');
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw Error('INVALID_PACKAGE');
    const flags = buffer.readUInt16LE(cursor + 8), method = buffer.readUInt16LE(cursor + 10), crc = buffer.readUInt32LE(cursor + 16);
    const compressed = buffer.readUInt32LE(cursor + 20), size = buffer.readUInt32LE(cursor + 24), nameLength = buffer.readUInt16LE(cursor + 28), extraLength = buffer.readUInt16LE(cursor + 30), commentLength = buffer.readUInt16LE(cursor + 32), attrs = buffer.readUInt32LE(cursor + 38), localOffset = buffer.readUInt32LE(cursor + 42);
    if ((flags & ~0x800) !== 0 || (compressed === 0xffffffff) || (size === 0xffffffff) || (localOffset === 0xffffffff) || method !== 0 && method !== 8) throw Error('UNSUPPORTED_ZIP_FORMAT');
    if (cursor + 46 + nameLength + extraLength + commentLength > centralOffset + centralSize) throw Error('INVALID_PACKAGE');
    const centralExtra = buffer.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength); if (hasExtraField(centralExtra, 0x0001)) throw Error('UNSUPPORTED_ZIP_FORMAT');
    let name; try { name = (flags & 0x800) ? new TextDecoder('utf-8', {fatal:true}).decode(buffer.subarray(cursor + 46, cursor + 46 + nameLength)) : buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('latin1'); } catch { throw Error('INVALID_PACKAGE'); }
    validPath(name); const pathKey = name.toLowerCase(); if (pathKeys.has(pathKey)) throw Error('DUPLICATE_PACKAGE_PATH'); pathKeys.add(pathKey);
    const unixType = attrs >>> 16; if ((unixType && unixType !== 0x8000) || (attrs & 0x10)) throw Error('SPECIAL_PACKAGE_FILE');
    if (size > limits.maxEntryBytes || compressed > limits.maxEntryBytes || (total += size) > limits.maxTotalBytes || (compressedTotal += compressed) > limits.maxTotalBytes) throw Error('PACKAGE_LIMIT');
    if (localOffset + 30 > centralOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw Error('INVALID_PACKAGE');
    const localFlags = buffer.readUInt16LE(localOffset + 6), localMethod = buffer.readUInt16LE(localOffset + 8), localCrc = buffer.readUInt32LE(localOffset + 14), localCompressed = buffer.readUInt32LE(localOffset + 18), localSize = buffer.readUInt32LE(localOffset + 22), localNameLength = buffer.readUInt16LE(localOffset + 26), localExtraLength = buffer.readUInt16LE(localOffset + 28), localExtra = buffer.subarray(localOffset + 30 + localNameLength, localOffset + 30 + localNameLength + localExtraLength), localEnd = localOffset + 30 + localNameLength + localExtraLength + compressed;
    if (hasExtraField(localExtra, 0x0001)) throw Error('UNSUPPORTED_ZIP_FORMAT');
    if ((localFlags & ~0x800) !== 0 || localFlags !== flags || localMethod !== method || localCrc !== crc || localCompressed !== compressed || localSize !== size || localEnd > centralOffset) throw Error('INVALID_PACKAGE');
    let localName; try { localName = (localFlags & 0x800) ? new TextDecoder('utf-8', {fatal:true}).decode(buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength)) : buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('latin1'); } catch { throw Error('INVALID_PACKAGE'); }
    if (localName !== name) throw Error('INVALID_PACKAGE');
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + compressed); if (raw.length !== compressed) throw Error('INVALID_PACKAGE');
    let bytes; try { bytes = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw, {maxOutputLength: limits.maxEntryBytes}) : null; } catch { throw Error('INVALID_PACKAGE'); }
    if (!bytes || bytes.length !== size || crc32(bytes) !== crc) throw Error('PACKAGE_CHECKSUM_FAILED');
    intervals.push([localOffset, localEnd]); files.set(name, bytes); cursor += 46 + nameLength + extraLength + commentLength;
  }
  intervals.sort((a,b)=>a[0]-b[0]); for (let i = 1; i < intervals.length; i++) if (intervals[i][0] < intervals[i - 1][1]) throw Error('OVERLAPPING_PACKAGE_DATA');
  return files;
}

function sanitizeSnapshot(input) {
  const snapshot = structuredClone(input);
  for (const key of transientSnapshotFields) delete snapshot[key];
  snapshot.scenes = (snapshot.scenes || []).map(scene => { const copy = {...scene}; delete copy.editLock; return copy; });
  snapshot.actors = (snapshot.actors || []).map(actor => Object.fromEntries(Object.entries(actor).filter(([key]) => !transientActorFields.has(key))));
  return snapshot;
}

function assertNoSensitiveData(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (sensitiveKey.test(key)) throw Error('SENSITIVE_DATA_FORBIDDEN');
    assertNoSensitiveData(child, seen);
  }
}

function validateSnapshot(snapshot, manifest) {
  if (!snapshot || typeof snapshot !== 'object' || snapshot.schemaVersion !== manifest.schemaVersion || snapshot.worldId !== manifest.worldId) throw Error('INVALID_WORLD_SCHEMA');
  if (snapshot.layoutRevision !== manifest.revision || snapshot.rulesVersion !== manifest.rulesVersion) throw Error('INVALID_WORLD_SCHEMA');
  if (!Array.isArray(snapshot.scenes) || !Array.isArray(snapshot.entities) || !Array.isArray(snapshot.portals) || !Array.isArray(snapshot.actors)) throw Error('INVALID_WORLD_SCHEMA');
  const scenes = new Set(snapshot.scenes.map(s => s.sceneId));
  if (!scenes.size || [...scenes].some(id => typeof id !== 'string' || !id)) throw Error('INVALID_WORLD_SCHEMA');
  if (scenes.size !== snapshot.scenes.length || new Set(snapshot.entities.map(e => e.entityId)).size !== snapshot.entities.length || new Set(snapshot.actors.map(a => a.actorId)).size !== snapshot.actors.length) throw Error('INVALID_WORLD_SCHEMA');
  if (manifest.scenes.length !== snapshot.scenes.length || manifest.scenes.some(scene => { const actual = snapshot.scenes.find(item => item.sceneId === scene.sceneId); return !actual || actual.templateId !== scene.templateId; })) throw Error('INVALID_WORLD_SCHEMA');
  for (const entity of snapshot.entities) if (!scenes.has(entity.sceneId) || typeof entity.entityId !== 'string' || typeof entity.type !== 'string') throw Error('INVALID_WORLD_SCHEMA');
  for (const actor of snapshot.actors) if (!scenes.has(actor.sceneId) || typeof actor.actorId !== 'string') throw Error('INVALID_WORLD_SCHEMA');
  for (const portal of snapshot.portals) for (const end of [portal.from, portal.to]) if (end?.sceneId && !scenes.has(end.sceneId)) throw Error('INVALID_WORLD_SCHEMA');
  for (const portal of snapshot.portals) for (const sceneId of [portal.fromSceneId, portal.toSceneId]) if (sceneId && !scenes.has(sceneId)) throw Error('INVALID_WORLD_SCHEMA');
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw Error('MANIFEST_INVALID');
  if (manifest.format !== WORLD_PACKAGE_FORMAT || manifest.formatVersion !== WORLD_PACKAGE_VERSION) throw Error('UNSUPPORTED_FORMAT_VERSION');
  if (manifest.schemaVersion !== 1) throw Error('UNSUPPORTED_SCHEMA_VERSION');
  if (!/^[\w.-]{1,128}$/.test(manifest.worldId || '') || typeof manifest.worldName !== 'string' || manifest.worldName.length > 200 || !Number.isSafeInteger(manifest.revision) || manifest.revision < 0 || typeof manifest.rulesVersion !== 'number' || !Number.isSafeInteger(manifest.rulesVersion) || manifest.rulesVersion < 0 || typeof manifest.clientVersion !== 'string' || typeof manifest.createdAt !== 'string' || typeof manifest.exportedAt !== 'string' || !Array.isArray(manifest.scenes) || !Array.isArray(manifest.assets) || !Array.isArray(manifest.fileEntries) || !Number.isSafeInteger(manifest.totalSize) || manifest.totalSize < 0 || manifest.hashAlgorithm !== 'sha256') throw Error('MANIFEST_INVALID');
  if (!manifest.hashPolicy || typeof manifest.hashPolicy !== 'object' || Array.isArray(manifest.hashPolicy)) throw Error('MANIFEST_INVALID');
  for (const scene of manifest.scenes) if (!scene || typeof scene !== 'object' || typeof scene.sceneId !== 'string' || typeof scene.templateId !== 'string') throw Error('MANIFEST_INVALID');
  for (const asset of manifest.assets) if (!asset || typeof asset !== 'object' || typeof asset.path !== 'string') throw Error('MANIFEST_INVALID');
}

function fileEntry(filePath, bytes, required = true, type = 'binary') {
  const canonical = canonicalResourceBytes(bytes, filePath);
  return {path: filePath.replaceAll('\\','/'), type, bytes: canonical.length, sha256: resourceDigest(canonical, filePath), required};
}

function collectAssets(assetDirectory, snapshot, supplied) {
  const entries = [...supplied];
  if (!assetDirectory || !existsSync(path.join(assetDirectory, 'manifest.json'))) return entries;
  const manifest = JSON.parse(readFileSync(path.join(assetDirectory, 'manifest.json'), 'utf8'));
  const used = new Set(snapshot.entities.map(entity => entity.type));
  for (const item of manifest.assets || []) {
    if (!used.has(item.type)) continue;
    for (const relative of [item.file, item.thumbnail].filter(Boolean)) {
      const source = path.join(assetDirectory, relative);
      if (!existsSync(source) || !statSync(source).isFile()) throw Error(`WORLD_ASSET_MISSING:${relative}`);
      entries.push({path: `assets/${relative}`, bytes: readFileSync(source), type: relative.endsWith('.json') ? 'text' : 'binary', required: true});
    }
  }
  return entries;
}

export function buildWorldPackage({snapshot, assets = [], worldName = snapshot?.worldId || 'world', clientVersion = 'unknown', createdAt = new Date().toISOString(), exportedAt = new Date().toISOString(), worldMetadata = {}} = {}) {
  const clean = sanitizeSnapshot(snapshot);
  if (!clean?.worldId || !Number.isInteger(clean.schemaVersion)) throw Error('INVALID_WORLD_SCHEMA');
  assertNoSensitiveData(clean); assertNoSensitiveData(worldMetadata);
  const files = [{path:'world/world.json', bytes:text(clean), type:'json', required:true}, {path:'world/metadata.json', bytes:text(worldMetadata), type:'json', required:true}];
  for (const asset of assets) files.push({path: validPath(asset.path), bytes: Buffer.from(asset.bytes), type: asset.type || 'binary', required: asset.required !== false});
  const unique = new Map(); for (const file of files) { if (unique.has(file.path)) throw Error('DUPLICATE_PACKAGE_PATH'); unique.set(file.path, file); }
  const ordered = [...unique.values()].sort((a,b)=>a.path.localeCompare(b.path)).map(file => ({...file, bytes:canonicalResourceBytes(file.bytes, file.path)}));
  const entries = ordered.map(file => fileEntry(file.path, file.bytes, file.required, file.type));
  const manifest = {format:WORLD_PACKAGE_FORMAT,formatVersion:WORLD_PACKAGE_VERSION,worldId:clean.worldId,worldName,schemaVersion:clean.schemaVersion,rulesVersion:clean.rulesVersion ?? 1,clientVersion,revision:clean.layoutRevision ?? 0,createdAt,exportedAt,scenes:clean.scenes.map(({sceneId,name,templateId})=>({sceneId,name,templateId})),assets:entries.filter(e=>e.path.startsWith('assets/')),fileEntries:entries,totalSize:entries.reduce((n,e)=>n+e.bytes,0),hashAlgorithm:'sha256',hashPolicy:RESOURCE_HASH_POLICY};
  const manifestFile = {path:'manifest.json', bytes:text(manifest), type:'json', required:true};
  return zipStore([{...manifestFile}, ...ordered]);
}

export function inspectWorldPackage(buffer, {limits = WORLD_PACKAGE_LIMITS} = {}) {
  const files = readZip(buffer, limits), rawManifest = files.get('manifest.json');
  if (!rawManifest) throw Error('MANIFEST_MISSING');
  let manifest; try { manifest = JSON.parse(rawManifest.toString('utf8')); } catch { throw Error('MANIFEST_INVALID'); }
  validateManifest(manifest);
  if (manifest.hashAlgorithm !== 'sha256' || JSON.stringify(manifest.hashPolicy) !== JSON.stringify(RESOURCE_HASH_POLICY) || !Array.isArray(manifest.fileEntries)) throw Error('MANIFEST_INVALID');
  const listed = new Set();
  for (const entry of manifest.fileEntries) {
    if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' || !['string','json','binary'].includes(entry.type) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || typeof entry.required !== 'boolean') throw Error('MANIFEST_INVALID');
    validPath(entry.path); const key = entry.path.toLowerCase(); if (listed.has(key) || key === 'manifest.json') throw Error('MANIFEST_INVALID'); listed.add(key);
    const bytes = files.get(entry.path); if (!bytes || bytes.length !== entry.bytes || resourceDigest(bytes, entry.path) !== entry.sha256) throw Error('PACKAGE_CHECKSUM_FAILED');
  }
  for (const name of files.keys()) if (name !== 'manifest.json' && !listed.has(name.toLowerCase())) throw Error('MANIFEST_INVALID');
  if (manifest.totalSize !== manifest.fileEntries.reduce((total, entry) => total + entry.bytes, 0)) throw Error('MANIFEST_INVALID');
  for (const entry of manifest.fileEntries) if (entry.required && !files.has(entry.path)) throw Error('PACKAGE_REQUIRED_FILE_MISSING');
  for (const asset of manifest.assets) if (!asset.path.toLowerCase().startsWith('assets/') || !listed.has(asset.path.toLowerCase())) throw Error('MANIFEST_INVALID');
  for (const required of ['world/world.json', 'world/metadata.json']) if (!listed.has(required)) throw Error('PACKAGE_REQUIRED_FILE_MISSING');
  if (!files.has('world/world.json') || !files.has('world/metadata.json')) throw Error('PACKAGE_REQUIRED_FILE_MISSING');
  let snapshot, metadata; try { snapshot = JSON.parse(files.get('world/world.json').toString('utf8')); metadata = JSON.parse(files.get('world/metadata.json').toString('utf8')); } catch { throw Error('INVALID_WORLD_SCHEMA'); }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || (metadata.worldId !== undefined && metadata.worldId !== manifest.worldId) || (metadata.schemaVersion !== undefined && metadata.schemaVersion !== manifest.schemaVersion)) throw Error('INVALID_WORLD_SCHEMA');
  assertNoSensitiveData(snapshot); assertNoSensitiveData(metadata);
  validateSnapshot(snapshot, manifest);
  const referenced = new Set((snapshot.entities || []).map(entity => entity.type));
  for (const asset of manifest.assets || []) if (!asset.path.startsWith('assets/')) throw Error('MANIFEST_INVALID');
  for (const type of referenced) if (/^town-[a-z0-9-]+$/.test(type) && !files.has(`assets/models/${type}.glb`)) throw Error(`WORLD_ASSET_MISSING:${type}`);
  return {manifest, snapshot, files};
}

export function exportWorldPackage({db, worldId = 'default', assets = [], assetDirectory, ...options} = {}) {
  if (!db?.prepare) throw Error('DATABASE_REQUIRED');
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare('SELECT snapshot FROM worlds WHERE world_id=?').get(worldId); if (!row) throw Error('WORLD_NOT_FOUND');
    const snapshot = JSON.parse(row.snapshot); const bytes = buildWorldPackage({snapshot, assets:collectAssets(assetDirectory, snapshot, assets), ...options});
    db.exec('COMMIT'); return bytes;
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}

export function importWorldPackage({buffer, db, targetWorldId, assetDirectory, limits = WORLD_PACKAGE_LIMITS} = {}) {
  if (!db?.prepare) throw Error('DATABASE_REQUIRED');
  const parsed = inspectWorldPackage(buffer, {limits});
  const sourceId = parsed.manifest.worldId, worldId = targetWorldId || sourceId;
  if (!safeWorldId(worldId)) throw Error('INVALID_WORLD_ID');
  const snapshot = structuredClone(parsed.snapshot); snapshot.worldId = worldId;
  let temp = null, created = [], markerState = null;
  try {
    const hasAssets = [...parsed.files.keys()].some(entryPath => entryPath.startsWith('assets/'));
    if (assetDirectory && hasAssets) {
      mkdirSync(assetDirectory, {recursive:true}); temp = mkdtempSync(path.join(path.dirname(assetDirectory), '.dfworld-'));
      markerState = {version:TEMP_MARKER_VERSION,taskId:path.basename(temp),format:WORLD_PACKAGE_FORMAT,worldId,created:[],phase:'staging',createdAt:Date.now()};
      faultPoint('AFTER_TEMP_DIR_CREATED'); writeTempMarker(temp, markerState); faultPoint('AFTER_TEMP_MARKER_WRITTEN');
      for (const [entryPath, bytes] of parsed.files) if (entryPath.startsWith('assets/')) { const relative = entryPath.slice('assets/'.length); const target = path.join(temp, relative); const resolved = path.resolve(target); if (!resolved.startsWith(path.resolve(temp) + path.sep)) throw Error('UNSAFE_PACKAGE_PATH'); mkdirSync(path.dirname(target), {recursive:true}); writeFileSync(target, bytes); }
      faultPoint('AFTER_ASSET_WRITTEN'); faultPoint('AFTER_ASSET_VALIDATED');
    }
    db.exec('BEGIN IMMEDIATE');
    if (db.prepare('SELECT 1 FROM worlds WHERE world_id=?').get(worldId)) throw Error('WORLD_ID_CONFLICT');
    if (temp) {
      markerState.phase = 'promoting';
      for (const entry of walkFiles(temp)) {
        const rel = path.relative(temp, entry), dest = path.join(assetDirectory, rel), resolved = path.resolve(dest);
        if (!resolved.startsWith(path.resolve(assetDirectory) + path.sep)) throw Error('UNSAFE_PACKAGE_PATH');
        if (existsSync(dest)) throw Error('ASSET_DESTINATION_EXISTS');
        faultPoint('BEFORE_RESOURCE_MOVE');
        mkdirSync(path.dirname(dest), {recursive:true}); renameSync(entry, dest); created.push(dest);
        markerState.created.push(path.relative(assetDirectory, dest).replaceAll('\\','/')); writeTempMarker(temp, markerState);
        faultPoint('AFTER_RESOURCE_MOVE');
      }
    }
    db.prepare('INSERT INTO worlds(world_id,schema_version,layout_revision,snapshot) VALUES(?,?,?,?)').run(worldId, snapshot.schemaVersion, snapshot.layoutRevision ?? 0, JSON.stringify(snapshot));
    faultPoint('BEFORE_DATABASE_COMMIT'); db.exec('COMMIT'); faultPoint('AFTER_DATABASE_COMMIT');
    if (temp) { faultPoint('BEFORE_COMPLETION_MARKER'); markerState.phase = 'committed'; writeTempMarker(temp, markerState); faultPoint('AFTER_COMPLETION_MARKER'); faultPoint('BEFORE_TEMP_CLEANUP'); rmSync(temp, {recursive:true,force:true}); temp = null; faultPoint('AFTER_TEMP_CLEANUP'); }
    return {worldId,revision:snapshot.layoutRevision ?? 0,scenes:snapshot.scenes.length,assets:parsed.manifest.assets.length};
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} for (const file of created) try { rmSync(file, {force:true}); } catch {} if (temp) try { rmSync(temp, {recursive:true,force:true}); } catch {} throw error; }
}

function *walkFiles(directory) {
  for (const name of readdirSync(directory)) { if (name === TEMP_MARKER) continue; const full = path.join(directory, name); if (statSync(full).isDirectory()) yield* walkFiles(full); else yield full; }
}

export function recoverWorldPackageTemps({assetDirectory, db, maxAgeMs = 24 * 60 * 60 * 1000, now = Date.now()} = {}) {
  if (!assetDirectory || !existsSync(path.dirname(assetDirectory))) return {recovered:0, preserved:0};
  let recovered = 0, preserved = 0;
  for (const name of readdirSync(path.dirname(assetDirectory))) {
    if (!name.startsWith('.dfworld-')) continue;
    const directory = path.join(path.dirname(assetDirectory), name), marker = path.join(directory, TEMP_MARKER);
    let directoryStat; try { directoryStat = statSync(directory); } catch { continue; }
    if (!directoryStat.isDirectory() || !existsSync(marker)) continue;
    let state; try { state = JSON.parse(readFileSync(marker, 'utf8')); } catch { preserved++; continue; }
    const age = now - directoryStat.mtimeMs;
    if (age < maxAgeMs || state.format !== WORLD_PACKAGE_FORMAT || !safeWorldId(state.worldId) || (state.version !== undefined && state.version !== TEMP_MARKER_VERSION) || (state.taskId !== undefined && state.taskId !== name) || (state.phase !== undefined && !TEMP_PHASES.has(state.phase)) || !Array.isArray(state.created)) { preserved++; continue; }
    const targets = [];
    let valid = true;
    for (const claimed of state.created) {
      if (typeof claimed !== 'string' || !claimed) { valid = false; break; }
      const resolved = state.version === undefined && path.isAbsolute(claimed) ? path.resolve(claimed) : path.resolve(assetDirectory, claimed);
      if (!resolved.startsWith(path.resolve(assetDirectory) + path.sep) || resolved === path.resolve(assetDirectory)) { valid = false; break; }
      targets.push(resolved);
    }
    if (!valid) { preserved++; continue; }
    const committed = Boolean(db?.prepare('SELECT 1 FROM worlds WHERE world_id=?').get(state.worldId));
    if (!committed) for (const target of targets) try { rmSync(target, {force:true}); } catch {}
    else preserved++;
    try { rmSync(directory, {recursive:true,force:true}); recovered++; } catch { preserved++; }
  }
  return {recovered,preserved};
}
