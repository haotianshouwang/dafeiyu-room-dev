const REALTIME_MESSAGE_TYPES = Object.freeze({
  CONNECT: 'connect',
  POSITION: 'position',
  SPELL_CAST: 'spell.cast',
  NEARBY_CHAT: 'nearby.chat',
  PRESENCE: 'presence',
  CONNECTED: 'connected',
  PLAYER_JOINED: 'player.joined',
  PLAYER_LEFT: 'player.left',
  PLAYER_PRESENCE: 'player.presence',
  PLAYER_POSITION: 'player.position',
  PLAYER_SPELL_CAST: 'player.spell.cast',
  NEARBY_MESSAGE: 'nearby.message',
  MESSAGE_NEW: 'message.new',
  MESSAGE_READ: 'message.read',
  NOTIFICATION_CREATED: 'notification.created',
  ERROR: 'error'
});

export function realtimeUrl(baseUrl = globalThis.location?.origin, path = '/ws/realtime') {
  const base = new URL(baseUrl || 'http://127.0.0.1',globalThis.location?.href || 'http://127.0.0.1');
  const prefix = base.pathname.endsWith('/') ? base.pathname.slice(0,-1) : base.pathname;
  const url = new URL(prefix.endsWith('/community-api') ? `${prefix}${path}` : path, base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

export class CommunityRealtimeClient {
  constructor({
    baseUrl = globalThis.location?.origin,
    roomId = 'community-lobby',
    WebSocketImpl = globalThis.WebSocket,
    onStatus = () => {},
    onPlayers = () => {},
    onNearby = () => {},
    onSpellCast = () => {},
    onAccountPosition = () => {},
    onMessage = () => {},
    onNotification = () => {}
  } = {}) {
    this.url = realtimeUrl(baseUrl);
    this.roomId = roomId;
    this.grantId = null;
    this.WebSocketImpl = WebSocketImpl;
    this.onStatus = onStatus;
    this.onPlayers = onPlayers;
    this.onNearby = onNearby;
    this.onSpellCast = onSpellCast;
    this.onAccountPosition = onAccountPosition;
    this.controlSequence = 0;
    this.acknowledgedControlSequence = 0;
    this.accountRevision = 0;
    this.accountSyncPending = false;
    this.onMessage = onMessage;
    this.onNotification = onNotification;
    this.players = new Map();
    this.socket = null;
    this.desired = false;
    this.roomReady = false;
    this.lastPositionAt = 0;
    this.lastPresence = null;
    this.pendingSpellCasts = [];
    this.retryTimer = null;
    this.retryDelay = 500;
  }

  setStatus(value, detail = {}) {
    this.status = value;
    this.onStatus(value, detail);
  }

  connect() {
    if (this.socket && (this.socket.readyState === 0 || this.socket.readyState === 1)) return;
    if (!this.WebSocketImpl) {
      this.setStatus('unsupported');
      return;
    }
    this.desired = true;
    clearTimeout(this.retryTimer);
    this.setStatus('connecting');
    const socket = new this.WebSocketImpl(this.url);
    this.socket = socket;
    this.controlSequence = 0;
    this.acknowledgedControlSequence = 0;
    this.lastSentControlSequence = null;
    this.accountRevision = 0;
    this.accountSyncPending = false;
    this.pendingAccountState = null;
    socket.addEventListener('open', () => {
      if (this.socket !== socket || !this.desired) return;
      this.retryDelay = 500;
      socket.send(JSON.stringify({ type: REALTIME_MESSAGE_TYPES.CONNECT, room_id: this.roomId, world_id: this.roomId, ...(this.grantId ? {grant_id: this.grantId} : {}) }));
    });
    socket.addEventListener('message', event => { if (this.socket === socket) this.#message(event.data); });
    socket.addEventListener('close', event => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.roomReady = false;
      this.players.clear();
      this.onPlayers(this.players);
      if (event.code === 4003) { this.desired = false; this.setStatus('error',{code:'ROOM_ACCESS_REVOKED'}); return; }
      if (event.code === 4001) { this.desired = false; this.setStatus('error',{code:'SESSION_EXPIRED'}); return; }
      this.setStatus('offline');
      this.#retry();
    });
    socket.addEventListener('error', () => { if (this.socket === socket) this.setStatus('offline'); });
  }

  #message(raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (message.type === REALTIME_MESSAGE_TYPES.PLAYER_POSITION && message.account_sync === true) {
      if (message.user_id === this.localUserId) this.#accountState(message);
      return;
    }
    const roomTypes = new Set(['connected','player.joined','player.left','player.position','player.presence','player.spell.cast','nearby.message']);
    if (roomTypes.has(message.type) && message.room_id !== this.roomId) return;
    if (message.type === REALTIME_MESSAGE_TYPES.CONNECTED) {
      this.players.clear();
      for (const player of message.players || []) if(player.user_id!==message.user_id)this.players.set(player.user_id, { ...player });
      this.localUserId = message.user_id;
      this.connectionId = message.connection_id;
      this.roomReady = true;
      this.setStatus('online', { roomId: message.room_id, count: this.players.size + 1 });
      this.onPlayers(this.players);
      if (message.account_state) this.#accountState(message.account_state);
      if (this.lastPresence && !this.accountSyncPending) this.#sendPosition(this.lastPresence, true);
      this.#flushPendingSpellCasts();
      return;
    }
    if (message.type === REALTIME_MESSAGE_TYPES.PLAYER_JOINED) {
      if (message.user_id === this.localUserId) return;
      this.players.set(message.user_id, { user_id: message.user_id, display_name: message.display_name });
      this.setStatus('online', { roomId: this.roomId, count: this.players.size + 1 });
      this.onPlayers(this.players);
      return;
    }
    if (message.type === REALTIME_MESSAGE_TYPES.PLAYER_LEFT) {
      this.players.delete(message.user_id);
      this.setStatus('online', { roomId: this.roomId, count: this.players.size + 1 });
      this.onPlayers(this.players);
      return;
    }
    if (message.type === REALTIME_MESSAGE_TYPES.PLAYER_POSITION ||
      message.type === REALTIME_MESSAGE_TYPES.PLAYER_PRESENCE) {
      if (message.user_id === this.localUserId) return;
      const player = this.players.get(message.user_id) || { user_id: message.user_id };
      const data = message.data || {};
      if (message.type === REALTIME_MESSAGE_TYPES.PLAYER_POSITION && data.animation_clip === undefined) {
        for (const key of ['animation_clip','animation_time','animation_speed','animation_loop','animation_paused','animation_revision','server_time_ms']) delete player[key];
      }
      if (message.type === REALTIME_MESSAGE_TYPES.PLAYER_POSITION && data.render_position === undefined) delete player.render_position;
      for (const key of ['position','render_position','scene_id','pose','rotation','status','moving','sprint','form','animation_clip','animation_time','animation_speed','animation_loop','animation_paused','animation_revision','server_time_ms']) if (data[key] !== undefined) player[key] = data[key];
      player.user_id = message.user_id;
      this.players.set(message.user_id, player);
      this.onPlayers(this.players);
      return;
    }
    if (message.type === REALTIME_MESSAGE_TYPES.PLAYER_SPELL_CAST) {
      if (message.user_id === this.localUserId) return;
      const data = message.data || {};
      if (!Number.isInteger(data.slot) || data.slot < 1 || data.slot > 8 ||
        ![data.start, data.end].every(value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite))) return;
      if(typeof data.scene_id!=='string')return;
      this.onSpellCast({ userId: message.user_id, sceneId:data.scene_id, slot: data.slot, start: [...data.start], end: [...data.end] });
      return;
    }
    if (message.type === REALTIME_MESSAGE_TYPES.MESSAGE_NEW || message.type === REALTIME_MESSAGE_TYPES.MESSAGE_READ) {
      this.onMessage(message);
      return;
    }
    if (message.type === REALTIME_MESSAGE_TYPES.NEARBY_MESSAGE) {
    this.onNearby(message.data || message);
      return;
    }
    if (message.type === REALTIME_MESSAGE_TYPES.NOTIFICATION_CREATED) {
      this.onNotification(message);
      return;
    }
    if (message.type === REALTIME_MESSAGE_TYPES.ERROR) {
      if (message.code === 'ROOM_ACCESS_FORBIDDEN' || message.code === 'ROOM_ACCESS_EXPIRED') {
        this.roomReady = false;
        this.pendingSpellCasts.length = 0;
      }
      this.setStatus('error', message);
    }
  }

  #retry() {
    if (!this.desired) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), this.retryDelay);
    this.retryDelay = Math.min(10_000, this.retryDelay * 2);
  }

  markActivity() {
    this.controlSequence += 1;
    this.pendingAccountState = null;
    return this.controlSequence;
  }

  get localControlPending() { return this.controlSequence > this.acknowledgedControlSequence; }

  #accountState(state) {
    if (!state || !Number.isSafeInteger(state.state_revision) || state.state_revision <= this.accountRevision ||
        !Array.isArray(state.data?.position) || state.data.position.length !== 3 || !state.data.position.every(Number.isFinite)) return;
    this.accountRevision = state.state_revision;
    if (state.controller_id === this.connectionId) {
      if (Number.isSafeInteger(state.control_sequence) && state.control_sequence <= this.controlSequence) {
        this.acknowledgedControlSequence = Math.max(this.acknowledgedControlSequence, state.control_sequence);
      }
      return;
    }
    // A position sent before the new local input must not cancel that input
    // while its control claim is still crossing the network.
    if (this.localControlPending) return;
    this.lastPresence = null;
    this.pendingAccountState = state;
    if (this.accountSyncPending) return;
    this.accountSyncPending = true;
    const socket = this.socket;
    const drain = async () => {
      try {
        while (this.pendingAccountState && this.socket === socket && this.desired) {
          const latest = this.pendingAccountState;
          this.pendingAccountState = null;
          await this.onAccountPosition(latest.data, latest);
        }
      } catch (error) {
        this.setStatus('error', {code:error.message || 'ACCOUNT_POSITION_FAILED'});
      } finally {
        if (this.socket === socket) this.accountSyncPending = false;
      }
    };
    void drain();
  }

  sendPosition({ position, renderPosition, sceneId, pose, rotation, moving = false, sprint = false, form = 'normal', animation = null, force = false, syncAccount = true }) {
    if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite) || typeof sceneId !== 'string') return false;
    const clip = typeof animation?.clip === 'string' && animation.clip.length <= 80 ? animation.clip : undefined;
    const animationState = clip ? {animation_clip:clip,animation_time:Number.isFinite(animation.time)?Math.max(0,Math.min(600,animation.time)):0,animation_speed:Number.isFinite(animation.speed)?Math.max(.05,Math.min(4,animation.speed)):1,animation_loop:animation.loop!==false,animation_revision:Number.isSafeInteger(animation.revision)&&animation.revision>=0?animation.revision:0} : {};
    if (clip) animationState.animation_paused = animation.paused === true;
    const displayPosition = Array.isArray(renderPosition) && renderPosition.length === 3 && renderPosition.every(Number.isFinite) ? {render_position:[...renderPosition]} : {};
    this.lastPresence = {position:[...position],...displayPosition,sceneId,pose,rotation,moving:Boolean(moving),sprint:Boolean(sprint),form:form==='swim'?'swim':'normal',sync_account:syncAccount,...animationState};
    if (!this.socket || this.socket.readyState !== 1 || !this.roomReady || (this.accountSyncPending && !this.localControlPending)) return false;
    const animationChanged = animationState.animation_revision !== this.lastSentAnimationRevision || clip !== this.lastSentAnimationClip;
    return this.#sendPosition(this.lastPresence, force || animationChanged || this.lastSentControlSequence !== this.controlSequence);
  }

  #sendPosition({ position, render_position, sceneId, pose, rotation, moving, sprint, form, sync_account, animation_clip, animation_time, animation_speed, animation_loop, animation_paused, animation_revision }, force = false) {
    const now = Date.now();
    const sceneChanged = sceneId !== this.lastSentSceneId;
    if (!force && !sceneChanged && now - this.lastPositionAt < 100) return false;
    this.lastPositionAt = now;
    this.lastSentSceneId = sceneId;
    this.lastSentAnimationRevision = animation_revision;
    this.lastSentAnimationClip = animation_clip;
    this.lastSentControlSequence = this.controlSequence;
    this.socket.send(JSON.stringify({
      type: REALTIME_MESSAGE_TYPES.POSITION,
      data: { position: [...position], ...(render_position ? {render_position:[...render_position]} : {}), scene_id: sceneId, pose, rotation, moving, sprint, form, control_sequence:this.controlSequence, sync_account, ...(animation_clip ? {animation_clip,animation_time,animation_speed,animation_loop,animation_paused,animation_revision} : {}) }
    }));
    return true;
  }

  sendPresence(status) {
    if (!this.socket || this.socket.readyState !== 1) return false;
    this.socket.send(JSON.stringify({ type: REALTIME_MESSAGE_TYPES.PRESENCE, data: { status } }));
    return true;
  }

  sendNearby(content) {
    if (!this.socket || this.socket.readyState !== 1 || !this.roomReady) return false;
    const value = String(content || '').trim();
    if (!value || value.length > 500) return false;
    this.socket.send(JSON.stringify({type:REALTIME_MESSAGE_TYPES.NEARBY_CHAT,data:{content:value}}));
    return true;
  }

  sendSpellCast({ slot, start, end, sceneId = this.lastPresence?.sceneId }) {
    if (!Number.isInteger(slot) || slot < 1 || slot > 8 ||
      ![start, end].every(value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) && value.every(item => Math.abs(item) <= 10_000))) return false;
    if (typeof sceneId !== 'string') return false;
    const data={slot,start:[...start],end:[...end],scene_id:sceneId};
    if (this.socket?.readyState === 1 && this.roomReady) { this.#sendSpellCast(data); return true; }
    if (!this.desired) return false;
    this.pendingSpellCasts.push({roomId:this.roomId,grantId:this.grantId,expiresAt:Date.now()+5000,data});
    if (this.pendingSpellCasts.length > 8) this.pendingSpellCasts.shift();
    return true;
  }

  #sendSpellCast(data) {
    if (!this.socket || this.socket.readyState !== 1 || !this.roomReady) return false;
    this.socket.send(JSON.stringify({type:REALTIME_MESSAGE_TYPES.SPELL_CAST,data}));
    return true;
  }

  #flushPendingSpellCasts() {
    const now=Date.now(),pending=this.pendingSpellCasts.splice(0);
    for(const item of pending)if(item.expiresAt>now&&item.roomId===this.roomId&&item.grantId===this.grantId)this.#sendSpellCast(item.data);
  }

  setRoom(roomId, {grantId = null} = {}) {
    const next = String(roomId || '').trim();
    if (!next) return false;
    if (this.roomId === next && this.grantId === grantId) return true;
    this.roomId = next;
    this.grantId = grantId;
    this.roomReady = false;
    this.pendingSpellCasts.length = 0;
    this.lastPresence = null;
    this.players.clear();this.onPlayers(this.players);this.lastPositionAt = 0;this.lastSentSceneId = null;this.lastSentAnimationRevision=null;
    if (this.socket?.readyState === 1) {
      this.socket.send(JSON.stringify({
        type: REALTIME_MESSAGE_TYPES.CONNECT,
        room_id: next,
        world_id: next,
        ...(grantId ? {grant_id:grantId} : {})
      }));
    }
    return true;
  }

  close() {
    this.desired = false;
    this.roomReady = false;
    this.pendingSpellCasts.length = 0;
    this.pendingAccountState = null;
    clearTimeout(this.retryTimer);
    this.socket?.close();
    this.socket = null;
    this.players.clear();
    this.lastSentSceneId = null;
    this.onPlayers(this.players);
    this.setStatus('offline');
  }
}
