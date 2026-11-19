const DEFAULT_TIMEOUT_MS = 15000;

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readCookie(name, cookie = globalThis.document?.cookie ?? '') {
  const prefix = `${name}=`;
  for (const part of cookie.split(';')) {
    const item = part.trim();
    if (!item.startsWith(prefix)) continue;
    try { return decodeURIComponent(item.slice(prefix.length)); } catch { return item.slice(prefix.length); }
  }
  return null;
}

function messageCursor(createdAt, messageId) {
  const value = `${createdAt}:${messageId}`;
  if (typeof Buffer !== 'undefined') return Buffer.from(value, 'utf8').toString('base64url');
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class CommunityApiError extends Error {
  constructor(message, {status = 0, code = 'NETWORK_ERROR', details, retryable = status === 0 || status >= 500} = {}) {
    super(message);
    this.name = 'CommunityApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

export function normaliseApiBase(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try { url = new URL(raw, globalThis.location?.href ?? 'http://127.0.0.1/'); } catch { throw new Error('社区服务地址无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('社区服务地址无效');
  return url.href.replace(/\/$/, '');
}

export class CommunityApiClient {
  constructor({baseUrl = globalThis.__DAFEIYU_COMMUNITY_API_BASE__ ?? '', request = globalThis.fetch?.bind(globalThis), csrfCookieName = 'dafeiyu_csrf', csrfToken = null, timeoutMs = DEFAULT_TIMEOUT_MS, onSessionExpired} = {}) {
    if (typeof request !== 'function') throw new Error('当前环境不支持网络请求');
    this.baseUrl = normaliseApiBase(baseUrl);
    this.request = request;
    this.csrfCookieName = csrfCookieName;
    this.timeoutMs = timeoutMs;
    this.csrfToken = csrfToken || null;
    this.onSessionExpired = onSessionExpired;
    this.identityVersion = 0;
    this.currentUserId = null;
    this.authenticationVersion = null;
  }
  get authenticationPending() { return this.authenticationVersion !== null; }

  configure({baseUrl, csrfToken} = {}) {
    if (baseUrl !== undefined && normaliseApiBase(baseUrl) !== this.baseUrl) { this.baseUrl = normaliseApiBase(baseUrl); this.currentUserId = null; this.csrfToken = null; this.identityVersion++; }
    if (csrfToken !== undefined) this.csrfToken = csrfToken || null;
  }

  _url(path) {
    const value = String(path);
    return this.baseUrl ? new URL(value.replace(/^\//, ''), `${this.baseUrl}/`).href : value;
  }

  _csrf() { return this.csrfToken || readCookie(this.csrfCookieName); }

  async call(path, {method = 'GET', body, headers = {}, signal, binary = false, requestId} = {}) {
    const identityVersion = this.identityVersion;
    const checkIdentity = () => { if (this.identityVersion !== identityVersion) throw new CommunityApiError('社区账号已改变，请重试', {status: 409, code: 'SESSION_CHANGED', retryable: false}); };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    if (signal) signal.addEventListener('abort', () => controller.abort(), {once: true});
    const outgoing = new Headers(headers);
    outgoing.set('accept', binary ? 'application/octet-stream, application/json' : 'application/json');
    outgoing.set('x-request-id', requestId || randomId());
    let payload = body;
    if (body !== undefined && body !== null && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && !(body instanceof Uint8Array) && !(body instanceof URLSearchParams)) {
      outgoing.set('content-type', 'application/json');
      payload = JSON.stringify(body);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
      const csrf = this._csrf();
      if (csrf) outgoing.set('x-csrf-token', csrf);
    }
    let response;
    try {
      response = await this.request(this._url(path), {method, body: payload, headers: outgoing, credentials: 'include', signal: controller.signal});
    } catch (error) {
      throw new CommunityApiError(error.name === 'AbortError' ? '社区服务请求超时' : '社区服务不可用', {code: error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR'});
    } finally { clearTimeout(timer); }
    checkIdentity();
    if (response.headers?.get?.('x-csrf-token')) this.csrfToken = response.headers.get('x-csrf-token');
    if (response.status === 401) {
      this.currentUserId = null;
      this.csrfToken = null;
      this.identityVersion++;
      this.onSessionExpired?.();
      throw new CommunityApiError('社区登录已失效，请重新登录', {status: 401, code: 'UNAUTHORIZED', retryable: false});
    }
    let data;
    try { data = binary ? await response.arrayBuffer() : await response.json(); }
    catch { data = null; }
    checkIdentity();
    if (!response.ok) {
      const envelope = data?.error;
      const error = (typeof envelope === 'object' ? envelope?.code : envelope) ?? data?.code ?? `HTTP_${response.status}`;
      const message = (typeof envelope === 'object' ? envelope?.message : null) || data?.message || error;
      throw new CommunityApiError(message, {status: response.status, code: error, details: envelope?.details ?? data?.details, retryable: envelope?.retryable === true || data?.retryable === true || response.status >= 500});
    }
    return {response, data};
  }

  async #authenticate(path, input) {
    const version = ++this.identityVersion;
    this.authenticationVersion = version;
    this.currentUserId = null;
    try {
      const result = await this.call(path, {method: 'POST', body: input});
      if (this.identityVersion !== version) throw new CommunityApiError('社区账号已改变，请重试', {status: 409, code: 'SESSION_CHANGED', retryable: false});
      this.currentUserId = result.data.user.id;
      return result;
    } finally { if(this.authenticationVersion === version)this.authenticationVersion = null; }
  }
  register(input) { return this.call('/api/auth/register', {method:'POST',body:input}); }
  verifyRegistration(input) { return this.#authenticate('/api/auth/register/verify', input); }
  resendVerification(input) { return this.call('/api/auth/register/resend', {method:'POST',body:input}); }
  login(input) { return this.#authenticate('/api/auth/login', input); }
  async logout(all = false) {
    const version = ++this.identityVersion;
    this.authenticationVersion = version;
    this.currentUserId = null;
    try {
      const result = await this.call(`/api/auth/${all ? 'logout-all' : 'logout'}`, {method: 'POST', body: {}});
      if (this.identityVersion === version) this.csrfToken = null;
      return result;
    } finally { if(this.authenticationVersion === version)this.authenticationVersion = null; }
  }
  async me() {
    if(this.authenticationPending)throw new CommunityApiError('正在切换社区账号，请稍后再试', {status:409,code:'SESSION_CHANGED',retryable:false});
    const version = this.identityVersion, result = await this.call('/api/auth/me');
    if (version !== this.identityVersion) throw new CommunityApiError('社区账号已改变，请重试', {status: 409, code: 'SESSION_CHANGED', retryable: false});
    if (this.currentUserId && this.currentUserId !== result.data.user.id) {
      this.currentUserId = result.data.user.id;this.csrfToken = null;this.identityVersion++;
      this.onIdentityChanged?.(result.data.user);
      throw new CommunityApiError('社区账号已改变，请重试', {status:409,code:'SESSION_CHANGED',retryable:false});
    }
    this.currentUserId = result.data.user.id;
    return result;
  }
  sessions() { return this.call('/api/auth/sessions'); }
  revokeSession(id) { return this.call(`/api/auth/sessions/${encodeURIComponent(id)}`, {method: 'DELETE', body: {}}); }
  changePassword(input) { return this.call('/api/auth/password', {method: 'POST', body: input}); }

  listSaves() { return this.call('/api/cloud/saves'); }
  getSave(saveId) { return this.call(`/api/cloud/saves/${encodeURIComponent(saveId)}`); }
  createSave(input) { return this.call('/api/cloud/saves', {method: 'POST', body: {...input, request_id: input.request_id || randomId()}}); }
  renameSave(saveId, worldName) { return this.call(`/api/cloud/saves/${encodeURIComponent(saveId)}`, {method: 'PATCH', body: {world_name: worldName, request_id: randomId()}}); }
  deleteSave(saveId) { return this.call(`/api/cloud/saves/${encodeURIComponent(saveId)}`, {method: 'DELETE', body: {request_id: randomId()}}); }
  quota() { return this.call('/api/cloud/quota'); }
  syncStatus(saveId) { return this.call(`/api/cloud/saves/${encodeURIComponent(saveId)}/sync-status`); }
  versions(saveId) { return this.call(`/api/cloud/saves/${encodeURIComponent(saveId)}/versions`); }
  restore(saveId, versionId, expected) { return this.call(`/api/cloud/saves/${encodeURIComponent(saveId)}/versions/${encodeURIComponent(versionId)}/restore`, {method: 'POST', body: {...expected, request_id: randomId()}}); }
  createUpload(input) { return this.call('/api/cloud/uploads', {method: 'POST', body: {...input, request_id: input.request_id || randomId()}}); }
  uploadStatus(uploadId) { return this.call(`/api/cloud/uploads/${encodeURIComponent(uploadId)}`); }
  uploadChunk(uploadId, index, bytes, offset, chunkHash) { return this.call(`/api/cloud/uploads/${encodeURIComponent(uploadId)}/chunks/${index}`, {method: 'PUT', body: bytes, headers: {'content-type': 'application/octet-stream', 'x-chunk-offset': String(offset), 'x-chunk-hash': chunkHash}}); }
  pauseUpload(uploadId) { return this.call(`/api/cloud/uploads/${encodeURIComponent(uploadId)}/pause`, {method: 'POST', body: {}}); }
  resumeUpload(uploadId) { return this.call(`/api/cloud/uploads/${encodeURIComponent(uploadId)}/resume`, {method: 'POST', body: {}}); }
  cancelUpload(uploadId) { return this.call(`/api/cloud/uploads/${encodeURIComponent(uploadId)}/cancel`, {method: 'POST', body: {}}); }
  completeUpload(uploadId) { return this.call(`/api/cloud/uploads/${encodeURIComponent(uploadId)}/complete`, {method: 'POST', body: {request_id: randomId()}}); }
  createDownload(input) { return this.call('/api/cloud/downloads', {method: 'POST', body: {...input, request_id: input.request_id || randomId()}}); }
  downloadStatus(downloadId) { return this.call(`/api/cloud/downloads/${encodeURIComponent(downloadId)}`); }
  downloadChunk(downloadId, index) { return this.call(`/api/cloud/downloads/${encodeURIComponent(downloadId)}/chunks/${index}`); }
  completeDownload(downloadId) { return this.call(`/api/cloud/downloads/${encodeURIComponent(downloadId)}/complete`, {method: 'POST', body: {request_id: randomId()}}); }
  cancelDownload(downloadId) { return this.call(`/api/cloud/downloads/${encodeURIComponent(downloadId)}/cancel`, {method: 'POST', body: {}}); }

  pullStructuredSync({scopeId, domain, afterCursor = 0, limit = 100, signal} = {}) {
    const query = new URLSearchParams({domain, after_cursor: String(afterCursor), limit: String(limit)});
    if (scopeId) query.set('scope_id', scopeId);
    return this.call(`/api/cloud/structured-sync?${query.toString()}`, {signal});
  }
  structuredSyncBatch(input = {}, {signal} = {}) {
    return this.call('/api/cloud/structured-sync/batch', {method: 'POST', body: {...input, request_id: input.request_id || randomId()}, signal});
  }
  structuredSyncHistory({scopeId, domain, objectType, objectId, limit = 100} = {}) {
    const query = new URLSearchParams({domain, limit: String(limit)});
    if (scopeId) query.set('scope_id', scopeId);
    return this.call(`/api/cloud/structured-sync/objects/${encodeURIComponent(objectType)}/${encodeURIComponent(objectId)}/history?${query.toString()}`);
  }
  resolveStructuredConflict(conflictId, input = {}) {
    return this.call(`/api/cloud/structured-sync/conflicts/${encodeURIComponent(conflictId)}/resolve`, {method: 'POST', body: {...input, request_id: input.request_id || randomId()}});
  }

  structuredSyncConflicts({scopeId, domain, signal} = {}) {
    const query = new URLSearchParams({domain});
    if (scopeId) query.set('scope_id', scopeId);
    return this.call(`/api/cloud/structured-sync/conflicts?${query}`, {signal});
  }
  structuredSnapshots({scopeId, domain = 'building', limit = 50} = {}) {
    const query = new URLSearchParams({domain, limit: String(limit)});
    if (scopeId) query.set('scope_id', scopeId);
    return this.call(`/api/cloud/structured-sync/snapshots?${query}`);
  }
  createStructuredSnapshot(input) { return this.call('/api/cloud/structured-sync/snapshots', {method: 'POST', body: {...input, request_id: input.request_id || randomId()}}); }
  structuredSnapshot(id) { return this.call(`/api/cloud/structured-sync/snapshots/${encodeURIComponent(id)}`); }
  restoreStructuredSnapshot(id, input) { return this.call(`/api/cloud/structured-sync/snapshots/${encodeURIComponent(id)}/restore`, {method: 'POST', body: {...input, request_id: input.request_id || randomId()}}); }

  listConversations({cursor, limit = 50} = {}) {
    const query = new URLSearchParams({limit: String(limit)});
    if (cursor) query.set('cursor', cursor);
    return this.call(`/api/community/conversations?${query.toString()}`);
  }
  listMessages(conversationId, {before, after, limit = 50, latest = false} = {}) {
    if (latest && !before && !after) before = messageCursor(Number.MAX_SAFE_INTEGER, 'end');
    const query = new URLSearchParams({limit: String(limit)});
    if (before) query.set('before', before);
    if (after) query.set('after', after);
    return this.call(`/api/community/conversations/${encodeURIComponent(conversationId)}/messages?${query.toString()}`);
  }
  sendMessage(input) { return this.call('/api/community/messages', {method: 'POST', body: input}); }
  markConversationRead(conversationId, readThroughMessageId) {
    return this.call(`/api/community/conversations/${encodeURIComponent(conversationId)}/read`, {method: 'POST', body: {read_through_message_id: readThroughMessageId, request_id: randomId()}});
  }
  unreadMessages() { return this.call('/api/community/messages/unread-count'); }
  hideConversation(conversationId) { return this.call(`/api/community/conversations/${encodeURIComponent(conversationId)}/hide`, {method: 'POST', body: {request_id: randomId()}}); }
  listNotifications({limit = 50, unreadOnly = false, cursor} = {}) {
    const query = new URLSearchParams({limit:String(limit)});
    if (unreadOnly) query.set('unread_only','true');
    if (cursor) query.set('cursor',cursor);
    return this.call(`/api/community/notifications?${query}`);
  }
  createRoomInvitation(input) {
    return this.call('/api/community/room-access/invitations',{method:'POST',body:input});
  }
  listRoomInvitations({direction = 'all'} = {}) {
    return this.call(`/api/community/room-access/invitations?direction=${encodeURIComponent(direction)}`);
  }
  acceptRoomInvitation(invitationId) {
    return this.call(`/api/community/room-access/invitations/${encodeURIComponent(invitationId)}/accept`,{method:'POST',body:{}});
  }
  rejectRoomInvitation(invitationId) {
    return this.call(`/api/community/room-access/invitations/${encodeURIComponent(invitationId)}/reject`,{method:'POST',body:{}});
  }
  revokeRoomInvitation(invitationId) {
    return this.call(`/api/community/room-access/invitations/${encodeURIComponent(invitationId)}/revoke`,{method:'POST',body:{}});
  }
  listRoomGrants({roomId} = {}) {
    const query = roomId ? `?room_id=${encodeURIComponent(roomId)}` : '';
    return this.call(`/api/community/room-access/grants${query}`);
  }
  revokeRoomGrant(grantId) {
    return this.call(`/api/community/room-access/grants/${encodeURIComponent(grantId)}/revoke`,{method:'POST',body:{}});
  }
  sharedRoomLayout({roomId,resourceId}) {
    return this.call(`/api/community/room-access/resources/${encodeURIComponent(resourceId)}?room_id=${encodeURIComponent(roomId)}`);
  }

  playerSearch({query, userId, cursor, limit = 50, sort = 'relevance'} = {}) {
    const params = new URLSearchParams({limit: String(limit), sort});
    if (query) params.set('query', query);
    if (userId) params.set('user_id', userId);
    if (cursor) params.set('cursor', cursor);
    return this.call(`/api/community/players?${params.toString()}`);
  }
  listFriends({cursor, limit = 50} = {}) {
    const params = new URLSearchParams({limit: String(limit)});
    if (cursor) params.set('cursor', cursor);
    return this.call(`/api/community/friends?${params.toString()}`);
  }
  removeFriend(userId) { return this.call(`/api/community/friends/${encodeURIComponent(userId)}`, {method:'DELETE', body:{}}); }
  friendRequests({direction = 'incoming', limit = 50} = {}) { return this.call(`/api/community/friends/requests?direction=${encodeURIComponent(direction)}&limit=${encodeURIComponent(limit)}`); }
  sendFriendRequest(toUserId) { return this.call('/api/community/friends/requests', {method: 'POST', body: {to_user_id: toUserId}}); }
  acceptFriendRequest(requestId) { return this.call(`/api/community/friends/requests/${encodeURIComponent(requestId)}/accept`, {method: 'POST', body: {request_id: randomId()}}); }
  rejectFriendRequest(requestId) { return this.call(`/api/community/friends/requests/${encodeURIComponent(requestId)}/reject`, {method: 'POST', body: {request_id: randomId()}}); }
}
