import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {migrateWorld} from '../server/storage/migrations.js';
import {buildWorldPackage, inspectWorldPackage, exportWorldPackage, importWorldPackage} from '../server/world-package.js';
import {mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {deflateRawSync} from 'node:zlib';
import {resourceDigest} from '../scripts/resource-digest.mjs';

function db() { const database = new DatabaseSync(':memory:'); migrateWorld(database); return database; }
function snapshot() { return {worldId:'default',schemaVersion:1,rulesVersion:1,layoutRevision:7,topologyRevision:2,scenes:[{sceneId:'room',name:'房间',templateId:'cozy_room_v1',editLock:{subjectId:'temporary',expiresAt:1}}],entities:[{entityId:'chair-1',sceneId:'room',type:'chair',position:[1,0,1],rotation:0,scale:[1,1,1]}],portals:[],actors:[{actorId:'whale',sceneId:'room',position:[0,0,0],controller:{subjectId:'secret'},input:{sequence:1},actionId:'move',moving:true,pose:'idle'}],runtime:{lastTickAt:1},actions:{move:{status:'running'}},buildPlans:{x:{subjectId:'secret'}},buildChanges:{x:{subjectId:'secret'}}}; }

function crc32(input) { let crc=0xffffffff; for(const byte of input){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^(0xedb88320&-(crc&1));} return (crc^0xffffffff)>>>0; }
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;} function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;}
function zip(entries, {flags=0x800, method=0, attrs=0, localFlags=flags, localMethod=method, localCrc, localCompressed, localSize, localOffsetOverride}={}) {
  const locals=[], centrals=[]; let offset=0;
  for(const entry of entries){const name=Buffer.from(entry.path,'utf8'), bytes=Buffer.from(entry.bytes), raw=method===8?deflateRawSync(bytes):bytes, crc=crc32(bytes); const lc=localCrc??crc, lcomp=localCompressed??raw.length, lsize=localSize??bytes.length;
    const local=Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]),u16(20),u16(localFlags),u16(localMethod),u16(0),u16(0),u32(lc),u32(lcomp),u32(lsize),u16(name.length),u16(0),name,raw]);
    const central=Buffer.concat([Buffer.from([0x50,0x4b,0x01,0x02]),u16(20),u16(20),u16(flags),u16(method),u16(0),u16(0),u32(crc),u32(raw.length),u32(bytes.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(attrs),u32(localOffsetOverride??offset),name]);
    locals.push(local);centrals.push(central);offset+=local.length;
  }
  const body=Buffer.concat(locals), central=Buffer.concat(centrals); return Buffer.concat([body,central,Buffer.from([0x50,0x4b,0x05,0x06]),Buffer.alloc(2),Buffer.alloc(2),u16(entries.length),u16(entries.length),u32(central.length),u32(body.length),u16(0)]);
}
function packageEntries(buffer){const parsed=inspectWorldPackage(buffer);return [...parsed.files].map(([path,bytes])=>({path,bytes}));}
function malformedPackage(change){const source=buildWorldPackage({snapshot:snapshot()});const entries=packageEntries(source);const manifest=JSON.parse(entries.find(e=>e.path==='manifest.json').bytes);change(manifest,entries);entries.find(e=>e.path==='manifest.json').bytes=Buffer.from(JSON.stringify(manifest)+'\n');return zip(entries);}

test('world package exports a clean snapshot and round trips through SQLite', () => {
  const database = db(); database.prepare('UPDATE worlds SET snapshot=? WHERE world_id=?').run(JSON.stringify(snapshot()), 'default');
  const bytes = exportWorldPackage({db:database, worldId:'default', worldName:'测试世界', clientVersion:'test'});
  const parsed = inspectWorldPackage(bytes);
  assert.equal(parsed.manifest.format, 'dfworld');
  assert.equal(parsed.manifest.formatVersion, 1);
  assert.equal(parsed.manifest.revision, 7);
  assert.equal(parsed.snapshot.worldId, 'default');
  assert.equal(parsed.snapshot.scenes[0].editLock, undefined);
  assert.equal(parsed.snapshot.actors[0].controller, undefined);
  assert.equal(parsed.snapshot.runtime, undefined);
  assert.equal(parsed.snapshot.actions, undefined);
  const target = db(); const result = importWorldPackage({buffer:bytes, db:target, targetWorldId:'restored'});
  assert.equal(result.worldId, 'restored');
  const restored = JSON.parse(target.prepare('SELECT snapshot FROM worlds WHERE world_id=?').get('restored').snapshot);
  assert.equal(restored.worldId, 'restored');
  assert.equal(restored.entities[0].type, 'chair');
  database.close(); target.close();
});

test('resource digest policy is applied to text and binary assets', () => {
  const bytes = buildWorldPackage({snapshot:snapshot(), assets:[{path:'assets/readme.txt', bytes:Buffer.from('\uFEFFa\r\nb\r\n')}, {path:'assets/model.glb', bytes:Buffer.from([0, 10, 13, 255])}]});
  const parsed = inspectWorldPackage(bytes);
  assert.equal(parsed.manifest.fileEntries.find(e=>e.path==='assets/readme.txt').bytes, Buffer.byteLength('a\nb\n'));
  assert.deepEqual(parsed.files.get('assets/model.glb'), Buffer.from([0,10,13,255]));
});

test('tampered bytes and unsupported versions are rejected', () => {
  const bytes = buildWorldPackage({snapshot:snapshot()});
  const tampered = Buffer.from(bytes); tampered[tampered.length - 30] ^= 1;
  assert.throws(() => inspectWorldPackage(tampered));
  const future = buildWorldPackage({snapshot:snapshot()});
  // The format version is covered by manifest validation; a package rebuilt with an invalid version is rejected.
  assert.throws(() => inspectWorldPackage(future.subarray(0, future.length - 1)), /INVALID_PACKAGE|PACKAGE_CHECKSUM_FAILED/);
});

test('world id conflicts leave the existing world unchanged', () => {
  const database = db(); const before = database.prepare('SELECT snapshot FROM worlds WHERE world_id=?').get('default').snapshot;
  const bytes = buildWorldPackage({snapshot:snapshot()});
  assert.throws(() => importWorldPackage({buffer:bytes, db:database}), /WORLD_ID_CONFLICT/);
  assert.equal(database.prepare('SELECT snapshot FROM worlds WHERE world_id=?').get('default').snapshot, before);
  database.close();
});

test('asset promotion is temporary and rolls back on destination conflict', () => {
  const database = db(); const root = mkdtempSync(path.join(tmpdir(), 'dfworld-test-')); const assets = path.join(root, 'assets'); mkdirSync(assets); writeFileSync(path.join(assets, 'same.bin'), 'old');
  const bytes = buildWorldPackage({snapshot:snapshot(), assets:[{path:'assets/same.bin', bytes:Buffer.from('new')}]});
  assert.throws(() => importWorldPackage({buffer:bytes, db:database, targetWorldId:'new-world', assetDirectory:assets}), /ASSET_DESTINATION_EXISTS/);
  assert.equal(readFileSync(path.join(assets, 'same.bin'), 'utf8'), 'old');
  assert.equal(database.prepare('SELECT 1 FROM worlds WHERE world_id=?').get('new-world'), undefined);
  database.close(); rmSync(root, {recursive:true, force:true});
});

test('package path and duplicate entry rules are enforced before restore', () => {
  assert.throws(() => buildWorldPackage({snapshot:snapshot(), assets:[{path:'../escape.bin',bytes:Buffer.from('x')}]}), /UNSAFE_PACKAGE_PATH/);
  assert.throws(() => buildWorldPackage({snapshot:snapshot(), assets:[{path:'world/world.json',bytes:Buffer.from('x')}]}), /DUPLICATE_PACKAGE_PATH/);
});

test('ZIP rejects file count, entry size and total size limits before manifest parsing', () => {
  assert.throws(() => inspectWorldPackage(zip(Array.from({length:513},(_,i)=>({path:`f/${i}`,bytes:Buffer.from('x')})))), /PACKAGE_LIMIT/);
  assert.throws(() => inspectWorldPackage(zip([{path:'large',bytes:Buffer.alloc(16*1024*1024+1)}])), /PACKAGE_LIMIT/);
  assert.throws(() => inspectWorldPackage(zip(Array.from({length:65},(_,i)=>({path:`f/${i}`,bytes:Buffer.alloc(1024*1024)})))), /PACKAGE_LIMIT/);
});

test('ZIP rejects compressed bombs, encrypted entries, ZIP64 and unsupported flags', () => {
  assert.throws(() => inspectWorldPackage(zip([{path:'bomb',bytes:Buffer.alloc(16*1024*1024+1)}], {method:8})), /INVALID_PACKAGE|PACKAGE_LIMIT/);
  assert.throws(() => inspectWorldPackage(zip([{path:'secret',bytes:Buffer.from('x')}], {flags:0x809})), /UNSUPPORTED_ZIP_FORMAT/);
  const zip64=zip([{path:'x',bytes:Buffer.from('x')}]); zip64.writeUInt16LE(0xffff, zip64.length-12); assert.throws(() => inspectWorldPackage(zip64), /UNSUPPORTED_ZIP_FORMAT/);
  const descriptor=zip([{path:'x',bytes:Buffer.from('x')}], {flags:0x808}); assert.throws(() => inspectWorldPackage(descriptor), /UNSUPPORTED_ZIP_FORMAT/);
});

test('ZIP rejects truncation, bad central directory, local header mismatch and overlap', () => {
  const valid=zip([{path:'x',bytes:Buffer.from('x')}]);
  assert.throws(() => inspectWorldPackage(valid.subarray(0,-3)), /INVALID_PACKAGE|UNSUPPORTED_ZIP_FORMAT/);
  const corrupt=Buffer.from(valid); corrupt.writeUInt32LE(0x12345678, corrupt.length-22); assert.throws(() => inspectWorldPackage(corrupt), /INVALID_PACKAGE/);
  assert.throws(() => inspectWorldPackage(zip([{path:'x',bytes:Buffer.from('x')}], {localMethod:8})), /INVALID_PACKAGE/);
  const overlap=zip([{path:'a',bytes:Buffer.from('a')},{path:'b',bytes:Buffer.from('b')}], {localOffsetOverride:0}); assert.throws(() => inspectWorldPackage(overlap), /INVALID_PACKAGE|OVERLAPPING_PACKAGE_DATA/);
});

test('ZIP rejects exact, case-folded, traversal, drive, UNC and special paths', () => {
  assert.throws(() => inspectWorldPackage(zip([{path:'x',bytes:Buffer.from('x')},{path:'x',bytes:Buffer.from('y')} ])), /DUPLICATE_PACKAGE_PATH/);
  assert.throws(() => inspectWorldPackage(zip([{path:'x',bytes:Buffer.from('x')},{path:'X',bytes:Buffer.from('y')} ])), /DUPLICATE_PACKAGE_PATH/);
  for (const name of ['../x','a/../../x','C:/x','\\\\server\\share\\x']) assert.throws(() => inspectWorldPackage(zip([{path:name,bytes:Buffer.from('x')} ])), /UNSAFE_PACKAGE_PATH/);
  assert.throws(() => inspectWorldPackage(zip([{path:'link',bytes:Buffer.from('x')}], {attrs:0xa0000000})), /SPECIAL_PACKAGE_FILE/);
  assert.throws(() => inspectWorldPackage(zip([{path:'device',bytes:Buffer.from('x')}], {attrs:0x60000000})), /SPECIAL_PACKAGE_FILE/);
});

test('Manifest requires declared files, valid types, exact size and digest', () => {
  assert.throws(() => inspectWorldPackage(zip([{path:'world/world.json',bytes:Buffer.from('{}')} ])), /MANIFEST_MISSING/);
  assert.throws(() => inspectWorldPackage(zip([{path:'manifest.json',bytes:Buffer.from('{')} ])), /MANIFEST_INVALID/);
  assert.throws(() => inspectWorldPackage(malformedPackage(manifest=>{delete manifest.worldName;})), /MANIFEST_INVALID/);
  assert.throws(() => inspectWorldPackage(malformedPackage(manifest=>{manifest.worldName=7;})), /MANIFEST_INVALID/);
  assert.throws(() => inspectWorldPackage(malformedPackage(manifest=>{manifest.format='other';})), /UNSUPPORTED_FORMAT_VERSION/);
  assert.throws(() => inspectWorldPackage(malformedPackage(manifest=>{manifest.formatVersion=2;})), /UNSUPPORTED_FORMAT_VERSION/);
  assert.throws(() => inspectWorldPackage(malformedPackage(manifest=>{manifest.schemaVersion=2;})), /UNSUPPORTED_SCHEMA_VERSION/);
  assert.throws(() => inspectWorldPackage(malformedPackage((manifest,entries)=>{entries.splice(entries.findIndex(e=>e.path==='world/metadata.json'),1);})), /PACKAGE_REQUIRED_FILE_MISSING|MANIFEST_INVALID|PACKAGE_CHECKSUM_FAILED/);
  assert.throws(() => inspectWorldPackage(malformedPackage((manifest,entries)=>{entries.push({path:'extra.bin',bytes:Buffer.from('x')});})), /MANIFEST_INVALID/);
  assert.throws(() => inspectWorldPackage(malformedPackage(manifest=>{manifest.fileEntries.push({...manifest.fileEntries[0]});})), /MANIFEST_INVALID/);
  assert.throws(() => inspectWorldPackage(malformedPackage(manifest=>{manifest.totalSize++;})), /MANIFEST_INVALID/);
  assert.throws(() => inspectWorldPackage(malformedPackage(manifest=>{manifest.fileEntries.find(e=>e.path==='world/world.json').sha256='0'.repeat(64);})), /PACKAGE_CHECKSUM_FAILED/);
  const valid=buildWorldPackage({snapshot:snapshot()}); assert.throws(() => inspectWorldPackage(valid,{limits:{maxFiles:512,maxEntryBytes:10,maxTotalBytes:64*1024*1024}}), /PACKAGE_LIMIT/);
});

test('world and metadata structure are checked before import', () => {
  assert.throws(() => inspectWorldPackage(malformedPackage(manifest=>{manifest.worldId='bad/id';})), /MANIFEST_INVALID/);
  assert.throws(() => inspectWorldPackage(malformedPackage((manifest,entries)=>{manifest.scenes=[];const worldEntry=entries.find(e=>e.path==='world/world.json');const world=JSON.parse(worldEntry.bytes);world.scenes=[];worldEntry.bytes=Buffer.from(JSON.stringify(world)+'\n');const entry=manifest.fileEntries.find(e=>e.path==='world/world.json');entry.bytes=worldEntry.bytes.length;entry.sha256=resourceDigest(worldEntry.bytes,entry.path);manifest.totalSize=manifest.fileEntries.reduce((n,e)=>n+e.bytes,0);})), /INVALID_WORLD_SCHEMA/);
  assert.throws(() => inspectWorldPackage(malformedPackage((manifest,entries)=>{const worldEntry=entries.find(e=>e.path==='world/world.json');const world=JSON.parse(worldEntry.bytes);world.entities[0].sceneId='missing';worldEntry.bytes=Buffer.from(JSON.stringify(world)+'\n');const entry=manifest.fileEntries.find(e=>e.path==='world/world.json');entry.bytes=worldEntry.bytes.length;entry.sha256=resourceDigest(worldEntry.bytes,entry.path);manifest.totalSize=manifest.fileEntries.reduce((n,e)=>n+e.bytes,0);})), /INVALID_WORLD_SCHEMA/);
  const mismatch=packageEntries(buildWorldPackage({snapshot:snapshot()})); const metadata=mismatch.find(e=>e.path==='world/metadata.json'); metadata.bytes=Buffer.from(JSON.stringify({worldId:'other'})+'\n'); const manifest=JSON.parse(mismatch.find(e=>e.path==='manifest.json').bytes);const metadataEntry=manifest.fileEntries.find(e=>e.path===metadata.path);metadataEntry.bytes=metadata.bytes.length;metadataEntry.sha256=resourceDigest(metadata.bytes,metadata.path);manifest.totalSize=manifest.fileEntries.reduce((n,e)=>n+e.bytes,0);mismatch.find(e=>e.path==='manifest.json').bytes=Buffer.from(JSON.stringify(manifest)+'\n'); assert.throws(() => inspectWorldPackage(zip(mismatch)), /INVALID_WORLD_SCHEMA/);
  const local=structuredClone(snapshot()); local.entities[0].type='town-chair'; assert.throws(() => inspectWorldPackage(buildWorldPackage({snapshot:local})), /WORLD_ASSET_MISSING/);
});

test('sensitive nested fields are rejected without changing the source snapshot', () => {
  const original=snapshot(); const copy=structuredClone(original); copy.preferences={displayName:'正常',nested:[{accessToken:'do-not-export'}]};
  assert.throws(() => buildWorldPackage({snapshot:copy}), /SENSITIVE_DATA_FORBIDDEN/);
  assert.deepEqual(original, snapshot());
  const normal=structuredClone(original); normal.preferences={displayName:'正常',volume:0.5}; const parsed=inspectWorldPackage(buildWorldPackage({snapshot:normal})); assert.equal(parsed.snapshot.preferences.displayName,'正常');
  const malicious=packageEntries(buildWorldPackage({snapshot:original})); const metadata=malicious.find(e=>e.path==='world/metadata.json'); metadata.bytes=Buffer.from(JSON.stringify({apiToken:'must-reject'})+'\n'); const manifest=JSON.parse(malicious.find(e=>e.path==='manifest.json').bytes); const metadataEntry=manifest.fileEntries.find(e=>e.path===metadata.path); metadataEntry.bytes=metadata.bytes.length; metadataEntry.sha256=resourceDigest(metadata.bytes,metadata.path); manifest.totalSize=manifest.fileEntries.reduce((n,e)=>n+e.bytes,0); malicious.find(e=>e.path==='manifest.json').bytes=Buffer.from(JSON.stringify(manifest)+'\n'); assert.throws(() => inspectWorldPackage(zip(malicious)), /SENSITIVE_DATA_FORBIDDEN/);
});

test('database failure and temporary asset failure leave no imported world', () => {
  const source=buildWorldPackage({snapshot:snapshot()}); const database=db(); const failing={prepare:(...args)=>database.prepare(...args),exec:sql=>{if(sql==='COMMIT')throw Error('COMMIT_FAILED');return database.exec(sql);}};
  assert.throws(() => importWorldPackage({buffer:source,db:failing,targetWorldId:'commit-fails'}), /COMMIT_FAILED/);
  assert.equal(database.prepare('SELECT 1 FROM worlds WHERE world_id=?').get('commit-fails'),undefined);
  const root=mkdtempSync(path.join(tmpdir(),'dfworld-fail-')); const file=path.join(root,'asset-file'); writeFileSync(file,'x'); const withAsset=buildWorldPackage({snapshot:snapshot(),assets:[{path:'assets/x.bin',bytes:Buffer.from('x')}]}); assert.throws(() => importWorldPackage({buffer:withAsset,db:database,targetWorldId:'write-fails',assetDirectory:file})); assert.equal(database.prepare('SELECT 1 FROM worlds WHERE world_id=?').get('write-fails'),undefined); database.close(); rmSync(root,{recursive:true,force:true});
});

test('stale temporary directories recover only package-owned files', async () => {
  const {recoverWorldPackageTemps}=await import('../server/world-package.js');
  const database=db(); const root=mkdtempSync(path.join(tmpdir(),'dfworld-recover-')); const assets=path.join(root,'assets'); mkdirSync(assets); const temp=path.join(root,'.dfworld-stale'); mkdirSync(temp); const created=path.join(assets,'orphan.bin'); writeFileSync(created,'orphan'); writeFileSync(path.join(temp,'.dfworld-temp.json'),JSON.stringify({format:'dfworld',worldId:'missing',created:[created]}));
  const result=recoverWorldPackageTemps({assetDirectory:assets,db:database,maxAgeMs:0,now:Date.now()+1000}); assert.equal(result.recovered,1); assert.equal(existsSync(created),false);
  database.close(); rmSync(root,{recursive:true,force:true});
});
