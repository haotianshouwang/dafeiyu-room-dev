import { decodeCloudLayout } from '../../shared/world/cloud-layout.js';
import { StructuredCloudSyncManager } from './structured-sync.js';
export { StructuredCloudSyncManager } from './structured-sync.js';

export const SYNC_STATES = Object.freeze(['LOCAL_ONLY','CLOUD_ONLY','IN_SYNC','LOCAL_AHEAD','REMOTE_AHEAD','DIVERGED','UPLOADING','DOWNLOADING','VERIFYING','CONFLICT','ERROR','PULLING','PUSHING','RETRYING','PENDING','OFFLINE']);

export function classifySync({localRevision, localHash, remoteRevision, remoteHash} = {}) {
  if (remoteRevision == null && localRevision == null) return 'LOCAL_ONLY';
  if (remoteRevision == null) return 'LOCAL_ONLY';
  if (localRevision == null) return 'CLOUD_ONLY';
  if (localRevision === remoteRevision && localHash === remoteHash) return 'IN_SYNC';
  if (localRevision > remoteRevision && localHash !== remoteHash) return 'LOCAL_AHEAD';
  if (remoteRevision > localRevision && localHash !== remoteHash) return 'REMOTE_AHEAD';
  return 'DIVERGED';
}

export async function sha256Hex(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('当前环境不支持 SHA-256');
}

function asBytes(value) { return value instanceof Uint8Array ? value : new Uint8Array(value); }
function responseValue(result, key) { return result?.data?.[key] ?? result?.data; }

export class CloudSyncManager {
  constructor({api, localPackage, chunkSize = 1024 * 1024, onState = () => {}, onProgress = () => {}, structuredStorage = globalThis.localStorage, onConflict = () => {}} = {}) {
    if (!api || !localPackage) throw new Error('云同步需要 API 和本地存档适配器');
    this.structuredStorage = structuredStorage; this.api = api; this.localPackage = localPackage; this.chunkSize = chunkSize; this.onState = onState; this.onProgress = onProgress; this.state = 'LOCAL_ONLY';
    this.running = false;
    this.structured = new StructuredCloudSyncManager({api, storage: structuredStorage, onState, onConflict});
  }
  setState(state, details = {}) { if (!SYNC_STATES.includes(state)) throw new Error(`未知同步状态：${state}`); this.state = state; this.onState(state, details); }
  async contextGuard() {
    this.localPackage.assertWritable?.();
    const contextKey=this.localPackage.contextKey,server=this.api.baseUrl,identityVersion=this.api.identityVersion;
    let userId=this.api.currentUserId;
    const check=()=>{
      this.localPackage.assertWritable?.();
      if(contextKey!==this.localPackage.contextKey)throw new Error('同步房间已改变，请重新打开云同步');
      if(server!==this.api.baseUrl||identityVersion!==this.api.identityVersion||(userId&&userId!==this.api.currentUserId))throw new Error('同步账号已改变，请重新打开云同步');
    };
    if(this.api.me){const result=await this.api.me();check();userId=result.data.user.id;}
    return check;
  }

  async uploadWorld({saveId, worldId = 'default', worldName = worldId, schemaVersion = 1, clientVersion = 'dafeiyu-room@0.1.0', baseRevision, expectedCurrentVersionId, signal} = {}) {
    try {
      const check=await this.contextGuard();
      const exported = await this.localPackage.export({worldId,worldName});
      check();
      const bytes = asBytes(exported.bytes ?? exported);
      const hash = exported.sha256 || await sha256Hex(bytes);
      check();
      const size = bytes.byteLength;
      let target = saveId;
      if (!target) {
        const created = await this.api.createSave({world_id: worldId, world_name: worldName, schema_version: schemaVersion, client_version: clientVersion});
        check();
        target = responseValue(created, 'save')?.save_id ?? responseValue(created)?.save_id;
      }
      const uploadInput = {save_id: target, world_id: worldId, world_name: worldName, schema_version: schemaVersion, client_version: clientVersion, format_version: 1, expected_size: size, expected_hash: hash, chunk_size: this.chunkSize, total_chunks: Math.ceil(size / this.chunkSize)};
      if ((baseRevision !== undefined) !== (expectedCurrentVersionId !== undefined)) throw new Error('上传更新必须同时提供 revision 和 version_id');
      if (baseRevision !== undefined) Object.assign(uploadInput, {base_revision: baseRevision, expected_current_version_id: expectedCurrentVersionId});
      const createdUpload = await this.api.createUpload(uploadInput);
      check();
      const upload = responseValue(createdUpload, 'upload');
      this.setState('UPLOADING', {uploadId: upload.upload_id, totalBytes: size, uploadedBytes: 0});
      for (let index = 0; index < upload.total_chunks; index++) {
        if (signal?.aborted) throw new DOMException('上传已取消', 'AbortError');
        const offset = index * upload.chunk_size;
        const chunk = bytes.slice(offset, Math.min(size, offset + upload.chunk_size));
        const chunkHash=await sha256Hex(chunk);check();
        await this.api.uploadChunk(upload.upload_id, index, chunk, offset, chunkHash);
        check();
        this.onProgress({direction: 'upload', done: offset + chunk.byteLength, total: size, fraction: (offset + chunk.byteLength) / size});
      }
      const completed = await this.api.completeUpload(upload.upload_id);
      check();
      this.setState('IN_SYNC', {save: responseValue(completed, 'version')});
      return {saveId: target, version: responseValue(completed, 'version'), bytes, hash, size};
    } catch (error) { this.setState('ERROR', {error}); throw error; }
  }

  async downloadWorld({saveId, versionId, signal, targetWorldId, importAfterVerify = false} = {}) {
    try {
      const check=await this.contextGuard();
      const created = await this.api.createDownload({save_id: saveId, version_id: versionId, chunk_size: this.chunkSize});
      check();
      const download = responseValue(created, 'download');
      this.setState('DOWNLOADING', {downloadId: download.download_id, versionId: download.version_id, totalBytes: download.expected_size, downloadedBytes: 0});
      const result = new Uint8Array(download.expected_size);
      for (let index = 0; index < download.total_chunks; index++) {
        if (signal?.aborted) throw new DOMException('下载已取消', 'AbortError');
        const chunkResult = await this.api.downloadChunk(download.download_id, index);
        check();
        const chunk = responseValue(chunkResult, 'chunk');
        const bytes = Uint8Array.from(atob(chunk.bytes_base64), char => char.charCodeAt(0));
        if (chunk.version_id !== download.version_id || chunk.chunk_index !== index || chunk.offset !== index * download.chunk_size || bytes.byteLength !== chunk.length || await sha256Hex(bytes) !== chunk.chunk_hash) throw new Error('下载分块完整性校验失败');
        check();
        result.set(bytes, chunk.offset);
        this.onProgress({direction: 'download', done: chunk.offset + bytes.byteLength, total: result.byteLength, fraction: (chunk.offset + bytes.byteLength) / result.byteLength});
      }
      this.setState('VERIFYING', {downloadId: download.download_id, versionId: download.version_id});
      if (await sha256Hex(result) !== download.expected_hash) throw new Error('下载存档摘要不匹配');
      check();
      const metadata = await this.localPackage.inspect?.(result);
      check();
      await this.api.completeDownload(download.download_id);
      check();
      if (importAfterVerify) await this.localPackage.import({bytes: result, targetWorldId});
      this.setState('IN_SYNC', {versionId: download.version_id});
      return {bytes: result, metadata, download};
    } catch (error) { this.setState('ERROR', {error}); throw error; }
  }

  async keepLocalAsNewSave(options = {}) { return this.uploadWorld({...options, saveId: undefined, baseRevision: undefined, expectedCurrentVersionId: undefined}); }
  async remoteStatus(saveId, local = {}) { const result = await this.api.syncStatus(saveId); const save = responseValue(result, 'save') || result.data; const state = classifySync({localRevision: local.revision, localHash: local.hash, remoteRevision: save.remote_revision ?? save.revision, remoteHash: save.remote_content_hash ?? save.content_hash}); this.setState(state, {save}); return {state, save}; }
  async syncStructured({saveId, worldId = 'default', worldName = worldId, schemaVersion = 1, domain = 'building', snapshot, layout, signal, pullOnly = false, refreshOnly = false} = {}) {
    if (this.running || this.structured.running) throw new Error('正在同步，请等待当前同步完成');
    this.localPackage.assertWritable?.();
    const contextKey = this.localPackage.contextKey;
    this.running = true;
    let accountKey, target;
    try {
    let me;
    try { me = await this.api.me(); } catch(error) { if(!error.retryable || !this.api.currentUserId)throw error; me={data:{user:{id:this.api.currentUserId}}}; }
    const userId = me.data.user.id, server = this.api.baseUrl, identityVersion = this.api.identityVersion;
    const checkIdentity = () => {
      this.localPackage.assertWritable?.();
      if (this.localPackage.contextKey !== contextKey) throw new Error('同步房间已改变，请重新打开云同步');
      if (this.api.baseUrl !== server || this.api.identityVersion !== identityVersion || (this.api.currentUserId !== undefined && this.api.currentUserId !== userId)) throw new Error('同步账号已改变，请重新打开云同步');
    };
    accountKey = 'dafeiyu-sync-space-v2:' + [server || globalThis.location?.origin || 'same-origin', userId, worldId].map(encodeURIComponent).join(':');
    target = saveId || this.structuredStorage?.getItem(accountKey);
    if (!target && domain === 'building') {
      checkIdentity();
      const created = await this.api.createSave({world_id: worldId, world_name: worldName, schema_version: schemaVersion, client_version: 'dafeiyu-room@structured-sync'});
      target = responseValue(created, 'save')?.save_id ?? responseValue(created)?.save_id;
      checkIdentity();
      if (target) this.structuredStorage?.setItem(accountKey, target);
    }
    if (!target && domain === 'building') throw new Error('结构化同步需要云存档空间');
    const source = layout || snapshot || await this.localPackage.export({worldId, worldName});
    const normalized = source.layout || (source.format === 'dafeiyu-layout' ? source : decodeCloudLayout(source.bytes ?? source));
    checkIdentity();
    const result = await this.structured.sync({scopeId: target, domain, layout: normalized, signal, pullOnly, refreshOnly, expectedUserId: userId, apply: this.localPackage.applyLayout ? merged => { checkIdentity(); return this.localPackage.applyLayout({layout: merged, worldId, expectedLayout: normalized || source}); } : undefined});
    checkIdentity();
    if (domain === 'building') {
      this.structuredStorage?.setItem(accountKey, target);
      this.lastStructuredOptions = {saveId: target, worldId, worldName, schemaVersion, domain};
    }
    return {...result, saveId: target};
    } catch (error) {
      if ([403, 404, 410].includes(error.status)) {
        if (accountKey && this.structuredStorage?.getItem(accountKey) === target) this.structuredStorage.removeItem(accountKey);
        if (this.lastStructuredOptions?.saveId === target) this.lastStructuredOptions = null;
      }
      throw error;
    } finally { this.running = false; }
  }
}
