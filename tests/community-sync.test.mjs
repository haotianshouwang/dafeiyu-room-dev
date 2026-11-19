import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudSyncManager, classifySync, sha256Hex} from '../src/community/sync.js';

const bytes = new TextEncoder().encode('dfworld-test-content');
const hash = await sha256Hex(bytes);

test('sync state classification distinguishes local, remote and divergent worlds', () => {
  assert.equal(classifySync({localRevision: 1, localHash: 'a', remoteRevision: 1, remoteHash: 'a'}), 'IN_SYNC');
  assert.equal(classifySync({localRevision: 2, localHash: 'b', remoteRevision: 1, remoteHash: 'a'}), 'LOCAL_AHEAD');
  assert.equal(classifySync({localRevision: 1, localHash: 'a', remoteRevision: 2, remoteHash: 'b'}), 'REMOTE_AHEAD');
  assert.equal(classifySync({localRevision: 1, localHash: 'a', remoteRevision: 1, remoteHash: 'b'}), 'DIVERGED');
});

test('cloud sync uploads real chunks and reports measured progress', async () => {
  const chunks = [];
  const api = {
    createSave: async () => ({data: {save: {save_id: 'save-1'}}}),
    createUpload: async input => ({data: {upload: {upload_id: 'upload-1', chunk_size: 5, total_chunks: Math.ceil(input.expected_size / 5)}}}),
    uploadChunk: async (_id, index, data, offset, chunkHash) => { chunks.push({index, data: [...data], offset, chunkHash}); return {data: {receipt: {chunk_index: index}}}; },
    completeUpload: async () => ({data: {version: {version_id: 'version-1', revision: 1}}})
  };
  const states = [], progress = [];
  const manager = new CloudSyncManager({api, localPackage: {export: async () => ({bytes})}, onState: state => states.push(state), onProgress: value => progress.push(value)});
  const result = await manager.uploadWorld({worldId: 'default', worldName: '测试世界'});
  assert.equal(result.version.version_id, 'version-1');
  assert.equal(chunks.length, 4);
  assert.deepEqual(chunks.flatMap(chunk => chunk.data), [...bytes]);
  assert.equal(progress.at(-1).fraction, 1);
  assert.deepEqual(states, ['UPLOADING', 'IN_SYNC']);
});

test('cloud sync downloads a fixed version, verifies each chunk and whole hash before import', async () => {
  const chunkSize = 5;
  const api = {
    createDownload: async () => ({data: {download: {download_id: 'download-1', version_id: 'version-fixed', expected_size: bytes.length, expected_hash: hash, chunk_size: chunkSize, total_chunks: Math.ceil(bytes.length / chunkSize)}}}),
    downloadChunk: async (_id, index) => { const offset = index * chunkSize; const part = bytes.slice(offset, offset + chunkSize); return {data: {chunk: {download_id: 'download-1', version_id: 'version-fixed', chunk_index: index, offset, length: part.length, chunk_hash: await sha256Hex(part), bytes_base64: Buffer.from(part).toString('base64')}}}; },
    completeDownload: async () => ({data: {verified: true}})
  };
  let imported;
  const manager = new CloudSyncManager({api, localPackage: {import: async input => { imported = input; }, inspect: async data => ({size: data.byteLength})}});
  const result = await manager.downloadWorld({saveId: 'save-1', versionId: 'version-fixed'});
  assert.deepEqual([...result.bytes], [...bytes]);
  assert.equal(imported, undefined);
  await manager.downloadWorld({saveId: 'save-1', versionId: 'version-fixed', targetWorldId: 'copy', importAfterVerify: true});
  assert.equal(imported.targetWorldId, 'copy');
});

test('upload stops before sending furniture when the local account context changes during export',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});let uploads=0;
  const localPackage={contextKey:'alice',export:async()=>{await gate;return {bytes};}};
  const manager=new CloudSyncManager({api:{createSave:async()=>{uploads++;return {data:{save:{save_id:'wrong-account'}}};}},localPackage});
  const pending=manager.uploadWorld({worldId:'alice-home'});
  await Promise.resolve();localPackage.contextKey='bob';release();
  await assert.rejects(pending,/同步房间已改变/);assert.equal(uploads,0);
});

test('a delayed download cannot import the former house into a different account or visited room',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});let imported=false;
  const localPackage={contextKey:'alice-home',import:async()=>{imported=true;}};
  const api={createDownload:async()=>{await gate;return {data:{download:{download_id:'old-download'}}};}};
  const manager=new CloudSyncManager({api,localPackage});
  const pending=manager.downloadWorld({saveId:'alice-save',importAfterVerify:true});
  await Promise.resolve();localPackage.contextKey='visitor-home';release();
  await assert.rejects(pending,/同步房间已改变/);assert.equal(imported,false);
});
