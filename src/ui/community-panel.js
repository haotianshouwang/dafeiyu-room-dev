import {mountCommunityAuthForm,communityAuthCss} from './community-auth-form.js';


const css = `
.community-entry{min-width:68px;justify-content:center}
.community-backdrop{position:fixed;inset:0;z-index:160;background:#382f3d75;backdrop-filter:blur(7px);display:grid;place-items:center;padding:18px;color:#51444a;font:14px/1.55 system-ui}
.community-card{width:min(760px,100%);max-height:90dvh;overflow:auto;background:#fff9ef;border:1px solid #fff;border-radius:26px;padding:25px;box-shadow:0 24px 90px #36273540;box-sizing:border-box}
.community-card header{display:flex;justify-content:space-between;align-items:flex-start}.community-card h2{margin:3px 0 0;color:#4e4148;font-size:25px}.community-eyebrow{font-size:11px;color:#a07869;letter-spacing:.12em}.community-close{border:0;background:#f0e7db;border-radius:50%;width:32px;height:32px;font-size:21px;color:#806b72;cursor:pointer}
.community-tabs{overflow:auto;display:flex;gap:8px;margin:20px 0 14px;border-bottom:1px solid #eadfd1}.community-tab{border:0;background:none;padding:9px 12px;color:#92766c;cursor:pointer}.community-tab[aria-selected=true]{color:#4f4148;border-bottom:2px solid #bb927d;font-weight:650}
.community-form{display:grid;gap:10px;max-width:440px}.community-form label{display:grid;gap:5px;font-size:12px;color:#806e70}.community-form input,.community-form select{border:1px solid #dfd0c0;border-radius:11px;padding:11px;background:#fffdf8;color:#51444e;font:inherit}.community-form .community-check{display:flex;align-items:flex-start;gap:7px;line-height:1.55}.community-form .community-check input{margin-top:2px}.community-form a{color:#8b665b;text-underline-offset:3px}.community-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.community-card .btn{border:1px solid #d4bda9;background:#fff4e3;color:#665047;border-radius:12px;padding:9px 13px;cursor:pointer}.community-card .btn.primary{background:#b9816d;border-color:#b9816d;color:#fff}.community-card .btn:disabled{opacity:.55;cursor:wait}.community-status{min-height:22px;margin:10px 0;color:#8b665b}.community-user{padding:13px 15px;border:1px solid #eadfd1;border-radius:14px;background:#fffdf8}.community-list{display:grid;gap:9px;margin-top:12px}.community-row{flex-wrap:wrap;display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid #eadfd1;border-radius:14px;padding:12px 14px;background:#fffdf8}.community-row strong{display:block}.community-row small{color:#9a8580}.community-empty{padding:24px;text-align:center;border:1px dashed #decfc0;border-radius:14px;color:#9b857b}.community-meter{height:8px;background:#eadfd1;border-radius:99px;overflow:hidden}.community-meter i{display:block;height:100%;background:#b9816d}.community-note{overflow-wrap:anywhere;font-size:12px;color:#907d77}
`;

const extraCss = `
.community-online{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:10px;padding:12px 14px;border:1px solid #d9c8b6;border-radius:14px;background:#f8efe2}.community-online label{display:flex;align-items:center;gap:9px;font-weight:650}.community-online input{width:18px;height:18px;accent-color:#b9816d}.community-online small{display:block;font-weight:400;color:#8d7771}.community-chat-layout{display:grid;grid-template-columns:minmax(170px,.72fr) minmax(260px,1.4fr);gap:12px;margin-top:12px}.community-chat-sidebar,.community-chat-main{min-width:0;border:1px solid #eadfd1;border-radius:16px;background:#fffdf8;padding:12px}.community-conversation{width:100%;text-align:left;border:1px solid transparent;border-radius:12px;background:#f8efe5;padding:10px;margin-bottom:7px;color:#5e4d4a;cursor:pointer}.community-conversation[aria-selected=true]{border-color:#b9816d;background:#fff5e7}.community-conversation strong,.community-conversation small{display:block}.community-messages{height:300px;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:8px 3px;background:#fffaf2;border-radius:12px}.community-message{max-width:84%;padding:8px 11px;border-radius:14px 14px 14px 4px;background:#efe5d7;overflow-wrap:anywhere;font-size:13px}.community-message.mine{align-self:flex-end;border-radius:14px 14px 4px 14px;background:#c98d78;color:#fff}.community-message time{display:block;margin-top:4px;font-size:10px;opacity:.72}.community-chat-form{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px}.community-chat-form textarea{min-height:70px;resize:vertical;border:1px solid #dfd0c0;border-radius:12px;padding:10px;background:#fffdf8;color:#51444e;font:inherit;box-sizing:border-box}.community-nearby-messages{max-height:280px;overflow:auto;display:flex;flex-direction:column;gap:7px;margin-top:10px}.community-nearby-message{padding:9px 11px;border-radius:12px;background:#f5eadb}.community-nearby-message strong{font-size:12px;color:#806359}.community-nearby-message p{margin:3px 0 0;overflow-wrap:anywhere}.community-pill{display:inline-flex;align-items:center;border-radius:99px;padding:2px 8px;background:#eadfd1;color:#725f58;font-size:11px}.community-invite{border:1px solid #d9c8b6;border-radius:14px;background:#fff8ed;padding:12px}.community-invite header{display:flex;justify-content:space-between;gap:10px}.community-quota-breakdown{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:8px 0}.community-quota-breakdown div{border:1px solid #eadfd1;border-radius:12px;padding:9px;background:#fffdf8}.community-quota-breakdown strong{display:block}.community-quota-breakdown small{color:#907d77}@media(max-width:680px){.community-chat-layout{grid-template-columns:1fr}.community-messages{height:240px}}
`;

function el(document, tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('aria-') || key.startsWith('data-')) node.setAttribute(key, String(value));
    else node[key] = value;
  }
  node.append(...children);
  return node;
}
function text(document, value) { return document.createTextNode(value); }

export class CommunityPanel {
  constructor({api, sync, document = globalThis.document, toolbar = document.getElementById('actions'), buttonLabel = '登录', localWorlds = () => [{worldId: 'default', worldName: '本地世界'}], localPackage, onAuthChange = () => {}, getOnlineState = () => true, onOnlineChange = () => {}, onJoinRoom = async () => {}, onLeaveRoom = () => {}, onInviteFriend = async () => {throw new Error('邀请功能不可用')}, onNearbySend = () => false} = {}) {
    this.api = api; this.sync = sync; this.document = document; this.toolbar = toolbar; this.buttonLabel = buttonLabel; this.localWorlds = localWorlds; this.localPackage = localPackage; this.onAuthChange = onAuthChange; this.getOnlineState = getOnlineState; this.onOnlineChange = onOnlineChange; this.onJoinRoom = onJoinRoom; this.onLeaveRoom = onLeaveRoom; this.onInviteFriend = onInviteFriend; this.onNearbySend = onNearbySend; this.onlineEnabled = Boolean(getOnlineState()); this.nearbyMessages = []; this.activeVisit = null; this.style = el(document, 'style'); this.style.textContent = css + extraCss + communityAuthCss; document.head.append(this.style);
    this.button = el(document, 'button', {className: 'btn world-utility-button community-entry', type: 'button'}); this.button.textContent = buttonLabel; this.button.setAttribute('aria-label', `${buttonLabel}或打开社区账号与布局存档`); this.button.onclick = () => this.open(); (toolbar || document.body).append(this.button);
  }
  setUser(user) {
    if(this.currentUserId!==(user?.id??null)){this.nearbyMessages=[];this.activeVisit=null;this.activeConversation=null;this.refreshChat=null;this.refreshFriends=null;this.close();}
    this.currentUserId = user?.id ?? null;
    const label = this.currentUserId ? '账号' : this.buttonLabel;
    this.button.textContent = label;
    this.button.setAttribute('aria-label', `${label}或打开社区账号与布局存档`);
  }
  setOnline(enabled) {
    this.onlineEnabled = Boolean(enabled);
    if(!this.onlineEnabled)this.nearbyMessages=[];
    if(this.panel?.querySelector('[data-tab="nearby"]')?.getAttribute('aria-selected')==='true')void this.renderNearby(this.panel.querySelector('[data-content]'));
  }
  open() { if (this.panel) return this.panel.querySelector('[data-close]')?.focus(); const d = this.document; const panel = el(d, 'div', {className: 'community-backdrop'}); panel.innerHTML = `<section class="community-card" role="dialog" aria-modal="true" aria-labelledby="community-title" tabindex="-1"><header><div><span class="community-eyebrow">本地游戏与社区身份分离</span><h2 id="community-title">社区账号、附近、好友与同步</h2></div><button class="community-close" data-close aria-label="关闭">×</button></header><div class="community-tabs"><button class="community-tab" data-tab="account" aria-selected="true">账号</button><button class="community-tab" data-tab="nearby" aria-selected="false">附近</button><button class="community-tab" data-tab="cloud" aria-selected="false">云同步</button><button class="community-tab" data-tab="friends" aria-selected="false">好友</button><button class="community-tab" data-tab="chat" aria-selected="false">好友聊天</button></div><div data-content></div></section>`; this.panel = panel; d.body.append(panel); panel.querySelector('[data-close]').onclick = () => this.close(); panel.onclick = event => { if (event.target === panel) this.close(); }; panel.querySelectorAll('[data-tab]').forEach(tab => tab.onclick = () => this.switchTab(tab.dataset.tab)); this.switchTab('account'); panel.querySelector('section').focus(); }
  close() { this.panel?.remove(); this.panel = null; this.refreshChat = null; this.refreshFriends = null; }
  async switchTab(tab) {
    if (!this.panel) return;
    this.panel.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === tab)));
    const content = el(this.document, 'div', {'data-content': ''});
    this.panel.querySelector('[data-content]').replaceWith(content);
    this.refreshChat = null; this.refreshFriends = null;
    if (tab === 'account') { await this.renderAccount(content); if (content.isConnected && this.currentUserId) this.decorateOnline(content); }
    else if (tab === 'nearby') await this.renderNearby(content);
    else if (tab === 'cloud') await this.renderCloud(content);
    else if (tab === 'friends') { await this.renderFriends(content); if (content.isConnected) await this.decorateFriendInvites(content); }
    else if (tab === 'chat') await this.renderChat(content);
  }
  status(content, message, error = false) { let node = content.querySelector('.community-status'); if (!node) { node = el(this.document, 'p', {className: 'community-status'}); content.prepend(node); } node.textContent = message || ''; node.style.color = error ? '#a34f4f' : ''; }
  async renderAccount(content) { content.replaceChildren(); let me; try { me = (await this.api.me()).data.user; } catch (error) { this.renderAuthForm(content); return; } this.currentUserId = me.id; this.button.textContent = '账号'; const box = el(this.document, 'div', {className: 'community-user'}, [el(this.document, 'strong', {}, [text(this.document, `${me.display_name || me.username}`)]), el(this.document, 'div', {className: 'community-note'}, [text(this.document, `@${me.username} · ${me.status || me.account_status || 'active'}`)])]); const actions = el(this.document, 'div', {className: 'community-actions'}); const sessions = el(this.document, 'button', {className: 'btn', type: 'button'}, [text(this.document, '设备管理')]); const password = el(this.document, 'button', {className: 'btn', type: 'button'}, [text(this.document, '修改密码')]); const logout = el(this.document, 'button', {className: 'btn', type: 'button'}, [text(this.document, '退出登录')]); actions.append(sessions, password, logout); content.append(box, actions); logout.onclick = async () => { logout.disabled = true; try { await this.api.logout(); await this.onAuthChange(false); this.renderAuthForm(content); } catch (error) { this.status(content, error.message, true); } finally { logout.disabled = false; } }; password.onclick = () => { const form = el(this.document, 'form', {className: 'community-form'}); const current = el(this.document, 'input', {type: 'password', required: true, placeholder: '当前密码'}); const next = el(this.document, 'input', {type: 'password', required: true, placeholder: '新密码'}); const submit = el(this.document, 'button', {className: 'btn primary', type: 'submit'}, [text(this.document, '保存新密码')]); form.append(el(this.document, 'label', {}, [text(this.document, '当前密码'), current]), el(this.document, 'label', {}, [text(this.document, '新密码'), next]), submit); content.append(form); form.onsubmit = async event => { event.preventDefault(); submit.disabled = true; try { await this.api.changePassword({current_password: current.value, new_password: next.value}); this.status(content, '密码已修改，其他设备已退出。'); form.remove(); } catch (error) { this.status(content, error.message, true); } finally { submit.disabled = false; } }; }; sessions.onclick = async () => { try { const result = await this.api.sessions(); const list = result.data.sessions || []; const rows = list.map(item => { const row = el(this.document, 'div', {className: 'community-row'}); row.append(el(this.document, 'div', {}, [el(this.document, 'strong', {}, [text(this.document, item.device?.name || '未知设备')]), el(this.document, 'small', {}, [text(this.document, item.current ? '当前设备' : '其他设备')])])); if (!item.current) { const revoke = el(this.document, 'button', {className: 'btn', type: 'button'}, [text(this.document, '撤销')]); revoke.onclick = async () => { await this.api.revokeSession(item.id); await sessions.onclick(); }; row.append(revoke); } return row; }); content.append(...rows); } catch (error) { this.status(content, error.message, true); } }; }
  renderAuthForm(content) {
    this.currentUserId = null;
    this.button.textContent = '登录';
    mountCommunityAuthForm({content,api:this.api,document:this.document,onAuthenticated:async user=>{
      await this.onAuthChange(true,user);
      if (!content.isConnected) return;
      await this.renderAccount(content);
      if (this.currentUserId) this.decorateOnline(content);
    }});
  }
  decorateOnline(content) {
    const d = this.document;
    const box = el(d, 'div', {className:'community-online'});
    const label = el(d, 'label');
    const toggle = el(d, 'input', {type:'checkbox', checked:this.onlineEnabled});
    const copy = el(d, 'span');
    copy.append(text(d, '联机与附近聊天'), el(d, 'small', {}, [text(d, '关闭后仍可使用云存档和好友聊天，但不会共享位置或收到附近消息。')]));
    label.append(toggle, copy);
    const state = el(d, 'span', {className:'community-pill'}, [text(d, this.onlineEnabled ? '已开启' : '已关闭')]);
    box.append(label, state);
    toggle.onchange = async () => {
      toggle.disabled = true;
      try {
        const result = await this.onOnlineChange(toggle.checked);
        this.onlineEnabled = result !== false;
        toggle.checked = this.onlineEnabled;
        state.textContent = this.onlineEnabled ? '已开启' : '已关闭';
      } catch (error) {
        toggle.checked = this.onlineEnabled;
        this.status(content, error.message || '切换联机状态失败', true);
      } finally {
        toggle.disabled = false;
      }
    };
    content.append(box);
  }

  setActiveVisit(visit) {
    this.activeVisit = visit || null;
    if (this.panel?.querySelector('[data-tab="nearby"]')?.getAttribute('aria-selected') === 'true') {
      this.renderNearby(this.panel.querySelector('[data-content]')).catch(() => {});
    }
  }

  pushNearbyMessage(chat) {
    if (!chat?.message_id) return;
    if (!this.nearbyMessages.some(item => item.message_id === chat.message_id)) this.nearbyMessages.push({...chat});
    this.nearbyMessages = this.nearbyMessages.slice(-200);
    if (this.panel?.querySelector('[data-tab="nearby"]')?.getAttribute('aria-selected') === 'true') {
      const list = this.panel.querySelector('[data-nearby-messages]');
      if (list) {
        list.querySelector('.community-empty')?.remove();
        list.append(this.#nearbyMessage(chat));
        list.scrollTop = list.scrollHeight;
      }
    }
  }

  #nearbyMessage(chat) {
    const d = this.document;
    const row = el(d, 'div', {className:'community-nearby-message'});
    row.append(el(d, 'strong', {}, [text(d, chat.display_name || chat.user_id || '附近玩家')]), el(d, 'p', {}, [text(d, chat.content || '')]));
    return row;
  }

  async renderNearby(content) {
    if (!this.currentUserId) {
      try { this.currentUserId = (await this.api.me()).data.user.id; }
      catch (error) { this.status(content, '登录后才能使用附近聊天和房间邀请。', true); return; }
    }
    content.replaceChildren();
    if (this.activeVisit) {
      const visit = el(this.document, 'div', {className:'community-invite'});
      const copy = el(this.document, 'div');
      copy.append(el(this.document, 'strong', {}, [text(this.document, `访客中：${this.activeVisit.ownerName || this.activeVisit.ownerId}`)]), el(this.document, 'small', {}, [text(this.document, '只有房主邀请的有效权限才能进入这个私宅。')]));
      const leave = el(this.document, 'button', {className:'btn', type:'button'}, [text(this.document, '离开并回到自己家')]);
      leave.onclick = async () => { leave.disabled = true; try { await this.onLeaveRoom(); this.activeVisit = null; await this.renderNearby(content); } catch (error) { this.status(content, error.message, true); } finally { leave.disabled = false; } };
      visit.append(copy, leave); content.append(visit);
    }
    let incoming = [];
    let outgoing = [];
    try {
      [incoming, outgoing] = await Promise.all([
        this.api.listRoomInvitations({direction:'incoming'}).then(result => result.data.invitations || []),
        this.api.listRoomInvitations({direction:'outgoing'}).then(result => result.data.invitations || [])
      ]);
    } catch (error) {
      this.status(content, `邀请读取失败：${error.message}`, true);
    }
    const profileNames = new Map();
    const profileIds = [...new Set([...incoming.map(item => item.inviter_id),...outgoing.map(item => item.invitee_id)].filter(Boolean))];
    await Promise.all(profileIds.map(async userId => {
      try {
        const profile=(await this.api.playerSearch({userId,limit:1})).data.profiles?.[0];
        if(profile?.user_id)profileNames.set(userId,profile.display_name||profile.username||userId);
      } catch {}
    }));
    const pending = incoming.filter(item => item.status === 'pending');
    content.append(el(this.document, 'h3', {}, [text(this.document, '房间邀请')]));
    if (!pending.length) content.append(el(this.document, 'div', {className:'community-empty'}, [text(this.document, '当前没有待处理邀请。私宅默认不对外开放。')]));
    for (const invitation of pending) {
      const card = el(this.document, 'div', {className:'community-invite'});
      const header = el(this.document, 'header');
      header.append(el(this.document, 'strong', {}, [text(this.document, `来自 ${profileNames.get(invitation.inviter_id)||invitation.inviter_id}`)]), el(this.document, 'span', {className:'community-pill'}, [text(this.document, new Date(invitation.expires_at_ms).toLocaleString())]));
      const actions = el(this.document, 'div', {className:'community-actions'});
      const accept = el(this.document, 'button', {className:'btn primary', type:'button'}, [text(this.document, '接受并前往')]);
      const reject = el(this.document, 'button', {className:'btn', type:'button'}, [text(this.document, '拒绝')]);
      accept.onclick = async () => {
        accept.disabled = true; reject.disabled = true;
        try {
          const grant = (await this.api.acceptRoomInvitation(invitation.invitation_id)).data.grant;
          await this.onJoinRoom({grant, invitation});
          await this.renderNearby(content);
        } catch (error) { this.status(content, error.message, true); accept.disabled = false; reject.disabled = false; }
      };
      reject.onclick = async () => {
        accept.disabled = true; reject.disabled = true;
        try { await this.api.rejectRoomInvitation(invitation.invitation_id); await this.renderNearby(content); }
        catch (error) { this.status(content, error.message, true); accept.disabled = false; reject.disabled = false; }
      };
      actions.append(accept, reject);
      card.append(header, el(this.document, 'p', {className:'community-note'}, [text(this.document, '接受后才会加载房主的当前私宅布局并加入私宅实时房间。')]), actions);
      content.append(card);
    }
    if (outgoing.some(item => item.status === 'pending')) {
      content.append(el(this.document, 'h3', {}, [text(this.document, '我发出的邀请')]));
      for (const invitation of outgoing.filter(item => item.status === 'pending')) {
        const row = el(this.document, 'div', {className:'community-row'});
        const revoke = el(this.document, 'button', {className:'btn', type:'button'}, [text(this.document, '撤回邀请')]);
        revoke.onclick = async () => { revoke.disabled = true; try { await this.api.revokeRoomInvitation(invitation.invitation_id); await this.renderNearby(content); } catch (error) { this.status(content, error.message, true); revoke.disabled = false; } };
        row.append(el(this.document, 'span', {}, [text(this.document, `等待 ${profileNames.get(invitation.invitee_id)||invitation.invitee_id} 接受`)]), revoke);
        content.append(row);
      }
    }
    content.append(el(this.document, 'h3', {}, [text(this.document, '附近聊天（无需好友）')]));
    const list = el(this.document, 'div', {className:'community-nearby-messages'});
    list.dataset.nearbyMessages = 'true';
    for (const chat of this.nearbyMessages) list.append(this.#nearbyMessage(chat));
    if (!this.nearbyMessages.length) list.append(el(this.document, 'div', {className:'community-empty'}, [text(this.document, '公共大厅或获准进入的私宅内，附近消息会显示在这里。')]));
    const form = el(this.document, 'form', {className:'community-chat-form'});
    const input = el(this.document, 'textarea', {maxLength:500, disabled:!this.onlineEnabled, placeholder:this.onlineEnabled?'对附近的人说点什么…':'开启联机后可发送附近消息'});
    const send = el(this.document, 'button', {className:'btn primary', type:'submit', disabled:!this.onlineEnabled}, [text(this.document, '发送')]);
    form.append(input, send);
    form.onsubmit = event => {
      event.preventDefault();
      if (!this.onlineEnabled) return this.status(content, '联机已关闭；开启后可收发附近消息。', true);
      const value = input.value.trim();
      if (!value) return;
      if (!this.onNearbySend(value)) return this.status(content, '附近聊天未连接；请确认已登录并开启联机。', true);
      input.value = '';
    };
    content.append(list, form);
  }

  async renderCloud(content) {
    content.replaceChildren();
    if(!this.currentUserId){
      this.status(content,'游客可以游玩全部本地场景；云存档需要先登录账号。');
      const login=el(this.document,'button',{className:'btn',type:'button'},[text(this.document,'登录账号')]);
      login.onclick=()=>this.switchTab('account');content.append(login);return;
    }
    try {
      const list = (await this.api.listSaves()).data;
      const quota = await this.api.quota().then(result => result.data.quota).catch(() => null);
      if (quota) {
        const breakdown = el(this.document, 'div', {className:'community-quota-breakdown'});
        const structured = el(this.document, 'div');
        structured.append(el(this.document, 'strong', {}, [text(this.document, `${(Number(quota.structured_bytes || 0) / 1024).toFixed(1)} KiB`)]), el(this.document, 'small', {}, [text(this.document, '当前结构化家具与历史变更')]));
        const legacy = el(this.document, 'div');
        legacy.append(el(this.document, 'strong', {}, [text(this.document, `${(Number(quota.legacy_bytes || 0) / 1024).toFixed(1)} KiB`)]), el(this.document, 'small', {}, [text(this.document, '旧版整包备份')]));
        breakdown.append(structured, legacy);
        content.append(el(this.document, 'p', {className: 'community-note'}, [text(this.document, `云数据总占用 ${(quota.used_bytes / 1048576).toFixed(2)} MiB / ${(quota.quota_bytes / 1048576).toFixed(1)} MiB。存档只含房间、家具类型与位置/旋转/缩放，不含 GLB、贴图、角色资源和登录凭据。`)]), breakdown);
      }
      const create = el(this.document, 'button', {className: 'btn primary', type: 'button'}, [text(this.document, '同步当前家具布局')]);
      create.disabled = !this.localWorlds().length;
      create.onclick = () => this.upload();
      content.append(create, el(this.document, 'p', {className: 'community-note'}, [text(this.document, '只同步家具、房间和装修数据。另一设备首次使用时请选择“读取云端布局”；后续修改会自动重试同步。')]));
      const rows = el(this.document, 'div', {className: 'community-list'});
      const saves = list.saves || list.items || [];
      if (!saves.length) rows.append(el(this.document, 'div', {className: 'community-empty'}, [text(this.document, '还没有同步空间。')]));
      for (const save of saves) {
        const row = el(this.document, 'div', {className: 'community-row'});
        const actions = el(this.document, 'div', {className: 'community-actions'});
        const action = (label, handler) => { const button = el(this.document, 'button', {className: 'btn', type: 'button'}, [text(this.document, label)]); button.onclick = async () => { button.disabled = true; try { await handler(); } catch (error) { this.status(content, error.message, true); } finally { button.disabled = false; } }; actions.append(button); };
        action('同步当前布局', () => this.upload(save));
        action('读取云端布局', () => this.pullLayout(save));
        action('同步历史与冲突', () => this.structuredHistory(save, content));
        if (save.latest_version_id) { action('读取旧备份', () => this.download(save)); action('旧备份历史', () => this.history(save, content)); }
        action('删除空间', async () => { if (!globalThis.confirm?.('确认删除此同步空间？历史会按服务器策略保留。')) return; await this.api.deleteSave(save.save_id); await this.renderCloud(content); });
        row.append(el(this.document, 'div', {}, [el(this.document, 'strong', {}, [text(this.document, save.world_name)]), el(this.document, 'small', {}, [text(this.document, '家具数据 · 不包含模型和贴图')])]), actions);
        rows.append(row);
      }
      content.append(rows);
    } catch (error) { this.status(content, error.message, true); }
  }
  syncWorld(save) {
    return this.localWorlds().find(item => item.worldId === save?.world_id) || this.localWorlds()[0];
  }
  async pullLayout(save, {refreshOnly = false} = {}) {
    const world = this.syncWorld(save);
    if (!world) throw new Error('请先打开一个本地世界');
    const result = await this.sync.syncStructured({saveId: save.save_id, worldId: world.worldId, worldName: save.world_name, pullOnly: true, refreshOnly});
    const content = this.panel?.querySelector('[data-content]');
    if (content) this.status(content, `已恢复云端布局，游标 ${result.cursor}`);
    return result;
  }
  async structuredHistory(save, content) {
    content.querySelector('[data-structured-history]')?.remove();
    const box = el(this.document, 'div', {className: 'community-list'}); box.dataset.structuredHistory = save.save_id;
    content.append(box);
    const scope = {scopeId: save.save_id, domain: 'building'};
    const [versions, conflicts, latest] = await Promise.all([this.api.structuredSnapshots(scope), this.api.structuredSyncConflicts(scope), this.api.pullStructuredSync({...scope, limit: 1})]);
    box.append(el(this.document, 'h3', {}, [text(this.document, '结构化历史与冲突')]));
    const checkpoint = el(this.document, 'button', {className: 'btn', type: 'button'}, [text(this.document, '创建布局快照')]);
    checkpoint.onclick = async () => { checkpoint.disabled = true; try { await this.api.createStructuredSnapshot({domain: 'building', scope_id: save.save_id, expected_cursor: latest.data.server_cursor}); await this.structuredHistory(save, content); } catch (error) { this.status(content, error.message, true); } finally { checkpoint.disabled = false; } }; box.append(checkpoint);
    for (const snapshot of versions.data.snapshots || []) {
      const row = el(this.document, 'div', {className: 'community-row'}), restore = el(this.document, 'button', {className: 'btn', type: 'button'}, [text(this.document, '恢复此快照')]);
      restore.onclick = async () => { restore.disabled = true; try { await this.api.restoreStructuredSnapshot(snapshot.snapshot_id, {expected_cursor: latest.data.server_cursor}); await this.pullLayout(save); await this.structuredHistory(save, content); } catch (error) { this.status(content, error.message, true); } finally { restore.disabled = false; } };
      row.append(text(this.document, `快照 ${snapshot.snapshot_version} · ${snapshot.object_count} 个对象 · ${new Date(snapshot.created_at_ms).toLocaleString()}`), restore); box.append(row);
    }
    for (const conflict of conflicts.data.conflicts || []) {
      const row = el(this.document, 'div', {className: 'community-user'});
      row.append(el(this.document, 'strong', {}, [text(this.document, `冲突：${conflict.object_type} / ${conflict.object_id}`)]), el(this.document, 'p', {className: 'community-note'}, [text(this.document, `本机基于版本 ${conflict.base_version}；云端版本 ${conflict.remote_version}。两份修改均已保留。`)]));
      const actions = el(this.document, 'div', {className: 'community-actions'});
      for (const [resolution, label] of [['keep_remote', '使用云端'], ['keep_local', '保留本机'], ['save_as_new', '另存为新对象']]) {
        const button = el(this.document, 'button', {className: 'btn', type: 'button'}, [text(this.document, label)]);
        button.onclick = async () => { button.disabled = true; try {
          const world = this.syncWorld(save);
          // Pull without capturing local edits first, so another device's conflict is also visible.
          await this.sync.syncStructured({saveId: save.save_id, worldId: world.worldId, worldName: save.world_name, refreshOnly: true});
          await this.sync.structured.resolveConflict({...scope, worldId: world.worldId, conflictId: conflict.conflict_id, resolution});
          await this.pullLayout(save, {refreshOnly: true}); await this.structuredHistory(save, content);
        } catch (error) { this.status(content, error.message, true); } finally { button.disabled = false; } }; actions.append(button);
      }
      row.append(actions); box.append(row);
    }
  }
  async history(save, content) { try { const result = await this.api.versions(save.save_id); const versions = result.data.versions || result.data.items || []; const box = el(this.document, 'div', {className: 'community-list'}); for (const version of versions) { const row = el(this.document, 'div', {className: 'community-row'}); const info = el(this.document, 'div', {}, [el(this.document, 'strong', {}, [text(this.document, `revision ${version.revision}`)]), el(this.document, 'small', {}, [text(this.document, version.created_at_ms ? new Date(version.created_at_ms).toLocaleString() : version.version_id)])]); const actions = el(this.document, 'div', {className: 'community-actions'}); const action = el(this.document, 'button', {className: 'btn', type: 'button'}, [text(this.document, '下载此版本')]); const restore = el(this.document, 'button', {className: 'btn', type: 'button'}, [text(this.document, '恢复为新版本')]); action.onclick = async () => { const copy = {...save, latest_version_id: version.version_id}; await this.download(copy); }; restore.onclick = async () => { restore.disabled = true; try { await this.api.restore(save.save_id, version.version_id, {expected_current_version_id: save.latest_version_id, expected_current_revision: save.revision}); await this.switchTab('cloud'); } catch (error) { this.status(content, error.message, true); } finally { restore.disabled = false; } }; actions.append(action, restore); row.append(info, actions); box.append(row); } content.append(el(this.document, 'h3', {}, [text(this.document, '历史版本')]), box); } catch (error) { this.status(content, error.message, true); } }
  async upload(save) {
    const world = this.syncWorld(save); if (!world || !this.sync) return;
    const content = this.panel?.querySelector('[data-content]');
    try {
      const result = await this.sync.syncStructured({saveId: save?.save_id, worldId: world.worldId, worldName: save?.world_name || world.worldName});
      await this.switchTab('cloud');
      const target = this.panel?.querySelector('[data-content]');
      if (target) { this.status(target, result.conflicts.length ? `${result.conflicts.length} 个对象存在冲突，请选择处理方式。` : '家具布局已同步，其他设备可以读取。', Boolean(result.conflicts.length)); if (result.conflicts.length) await this.structuredHistory({...save, save_id: result.saveId, world_id: world.worldId}, target); }
    } catch (error) { if (content?.isConnected) this.status(content, error.message, true); }
  }
  async download(save) {
    if (!this.sync) return;
    try {
      if (!save.latest_version_id) return this.pullLayout(save);
      const result = await this.sync.downloadWorld({saveId: save.save_id, versionId: save.latest_version_id});
      const legacy = result.bytes[0] === 80 && result.bytes[1] === 75;
      if (legacy && !this.localPackage?.canImportLegacy) {
        const url = URL.createObjectURL(new Blob([result.bytes], {type: 'application/x-dfworld'}));
        const link = el(this.document, 'a', {href: url, download: `${save.world_name || 'world'}.dfworld`}); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.status(this.panel.querySelector('[data-content]'), '旧 .dfworld 已下载。可在本地客户端导入，再将家具布局迁移到结构化同步。'); return;
      }
      const targetWorldId = `${save.world_id || 'world'}-cloud-${Date.now()}`.replace(/[^\w.-]/g, '_');
      await this.localPackage?.import?.({bytes: result.bytes, targetWorldId});
      this.status(this.panel.querySelector('[data-content]'), `已读取旧备份并导入本地世界 ${targetWorldId}`);
    } catch (error) { if (this.panel) this.status(this.panel.querySelector('[data-content]'), error.message, true); }
  }

  async renderFriends(content) {
    content.replaceChildren();
    const search = el(this.document, 'form', {className: 'community-form'});
    const query = el(this.document, 'input', {placeholder: '搜索用户名或玩家 ID', required: true});
    const submit = el(this.document, 'button', {className: 'btn primary', type: 'submit'}, [text(this.document, '搜索玩家')]);
    const results = el(this.document, 'div', {className: 'community-list'});
    search.append(el(this.document, 'label', {}, [text(this.document, '添加好友'), query]), submit);
    content.append(search, results);
    search.onsubmit = async event => { event.preventDefault(); submit.disabled = true; results.replaceChildren(); try { const data = (await this.api.playerSearch({query: query.value})).data; for (const profile of data.profiles || data.players || []) { const row = el(this.document, 'div', {className: 'community-row'}); const add = el(this.document, 'button', {className: 'btn', type: 'button'}, [text(this.document, '加好友')]); add.onclick = async () => { add.disabled = true; try { await this.api.sendFriendRequest(profile.user_id); add.textContent = '已发送'; } catch (error) { this.status(content, error.message, true); add.disabled = false; } }; row.append(el(this.document, 'div', {}, [el(this.document, 'strong', {}, [text(this.document, profile.display_name || profile.username || profile.user_id)]), el(this.document, 'small', {}, [text(this.document, profile.user_id)])]), add); results.append(row); } if (!results.children.length) results.append(el(this.document, 'div', {className: 'community-empty'}, [text(this.document, '没有找到玩家。')])); } catch (error) { this.status(content, error.message, true); } finally { submit.disabled = false; } };
    try {
      const [friends, requests] = await Promise.all([this.api.listFriends(), this.api.friendRequests({direction: 'incoming'})]);
      const statusLabels = {online: '在线', offline: '离线', away: '离开', busy: '忙碌', invisible: '离线'};
      const statuses = new Map();
      const friendRows = (friends.data.friends || []).map(friend => {
        const status = el(this.document, 'span', {className: 'community-note'}, [text(this.document, statusLabels[friend.online_status] || '离线')]);
        statuses.set(friend.user_id, status);
        const chat = el(this.document, 'button', {className: 'btn', type: 'button'}, [text(this.document, '发消息')]);
        chat.onclick = () => { this.chatRecipient = friend.user_id; this.chatConversationId = null; return this.switchTab('chat'); };
        const remove = el(this.document, 'button', {className: 'btn', type: 'button'}, [text(this.document, '删除好友')]);
        remove.onclick = async () => { if (!globalThis.confirm?.('确认删除这位好友？')) return; remove.disabled = true; try { await this.api.removeFriend(friend.user_id); await this.renderFriends(content); } catch (error) { this.status(content, error.message, true); } finally { remove.disabled = false; } };
        return el(this.document, 'div', {className: 'community-row'}, [el(this.document, 'div', {}, [el(this.document, 'strong', {}, [text(this.document, friend.display_name || friend.user_id)]), el(this.document, 'small', {}, [text(this.document, friend.user_id)])]), status, el(this.document, 'div', {className: 'community-actions'}, [chat, remove])]);
      });
      this.refreshFriends = async () => {
        // Friend requests and accepted relations change the rows below, so
        // rebuild the tab instead of only refreshing presence labels.
        await this.renderFriends(content);
        await this.decorateFriendInvites(content);
      };
      const requestRows = (requests.data.requests || []).filter(item=>item.status==='pending').map(item => { const row = el(this.document, 'div', {className: 'community-row'}); const accept = el(this.document, 'button', {className: 'btn primary', type: 'button'}, [text(this.document, '接受')]); accept.onclick = async () => { await this.api.acceptFriendRequest(item.request_id); await this.renderFriends(content); }; const reject = el(this.document, 'button', {className: 'btn', type: 'button'}, [text(this.document, '拒绝')]); reject.onclick = async () => { await this.api.rejectFriendRequest(item.request_id); await this.renderFriends(content); }; row.append(el(this.document, 'strong', {}, [text(this.document, `来自 ${item.from_user_id}`)]), accept, reject); return row; });
      content.append(el(this.document, 'h3', {}, [text(this.document, '好友列表')]), ...(friendRows.length ? friendRows : [el(this.document, 'div', {className: 'community-empty'}, [text(this.document, '还没有好友。')])]), ...(requestRows.length ? [el(this.document, 'h3', {}, [text(this.document, '好友申请')]), ...requestRows] : []));
    } catch (error) { this.status(content, error.message, true); }
  }

  async decorateFriendInvites(content) {
    let friends = [];
    try { friends = (await this.api.listFriends()).data.friends || []; }
    catch { return; }
    if (!friends.length) return;
    const section = el(this.document, 'section', {className:'community-invite'});
    section.append(el(this.document, 'h3', {}, [text(this.document, '邀请好友进入我的私宅')]));
    const form = el(this.document, 'form', {className:'community-form'});
    const select = el(this.document, 'select');
    for (const friend of friends) {
      const option = el(this.document, 'option', {value:friend.user_id}, [text(this.document, friend.display_name || friend.user_id)]);
      select.append(option);
    }
    const submit = el(this.document, 'button', {className:'btn primary', type:'submit'}, [text(this.document, '发送 1 小时私宅邀请')]);
    form.append(el(this.document, 'label', {}, [text(this.document, '好友'), select]), submit);
    form.onsubmit = async event => {
      event.preventDefault(); submit.disabled = true;
      try {
        const friend = friends.find(item => item.user_id === select.value);
        const invitation = await this.onInviteFriend(friend);
        this.status(content, `已邀请 ${friend.display_name || friend.user_id}，等待对方接受。`);
        section.dataset.invitationId = invitation?.invitation_id || '';
      } catch (error) { this.status(content, error.message, true); }
      finally { submit.disabled = false; }
    };
    section.append(form, el(this.document, 'p', {className:'community-note'}, [text(this.document, '私宅邀请会共享房主当前家具布局，不代表公开房间。好友或玩家只有在接受有效邀请后才能进入。')]));
    content.append(section);
  }

  async renderChat(content) {
    content.replaceChildren();
    if (!this.currentUserId) { try { this.currentUserId = (await this.api.me()).data.user.id; } catch (error) { this.status(content, error.message, true); return; } }
    const d = this.document;
    const intro = el(d, 'p', {className:'community-note'}, [text(d, '好友聊天会持久保存；附近聊天无需好友，只在同一公共区域或获准进入的私宅内有效。')]);
    const layout = el(d, 'div', {className:'community-chat-layout'});
    const sidebar = el(d, 'aside', {className:'community-chat-sidebar'});
    const main = el(d, 'section', {className:'community-chat-main'});
    const conversationList = el(d, 'div');
    const heading = el(d, 'h3', {}, [text(d, '选择会话')]);
    const messages = el(d, 'div', {className:'community-messages'});
    const form = el(d, 'form', {className:'community-chat-form'});
    const recipient = el(d, 'input', {placeholder:'好友用户名或玩家 ID', required:true, value:this.chatRecipient || ''});
    const input = el(d, 'textarea', {placeholder:'输入消息；Enter 发送，Shift+Enter 换行', required:true, maxLength:4096});
    const send = el(d, 'button', {className:'btn primary', type:'submit'}, [text(d, '发送')]);
    form.append(input, send);
    main.append(heading, messages, el(d, 'label', {className:'community-note'}, [text(d, '接收玩家'), recipient]), form);
    layout.append(sidebar, main); content.append(intro, layout);
    let selected = this.chatConversationId || null;
    let currentConversation = null;
    let messageGeneration = 0;
    let refreshing = null;
    const participantName = conversation => {
      const other = conversation.participant_ids?.find(id => id !== this.currentUserId) || conversation.conversation_id;
      return conversation.participants?.find(item => item.user_id === other)?.display_name || other;
    };
    const messageRow = message => {
      const mine = message.sender_id === this.currentUserId;
      const row = el(d, 'div', {className:`community-message${mine ? ' mine' : ''}`});
      row.append(text(d, message.content), el(d, 'time', {}, [text(d, `${new Date(message.created_at_ms).toLocaleString()}${mine ? ` · ${message.read_state === 'read' ? '已读' : '已送达'}` : ''}`)]));
      return row;
    };
    const openConversation = async (conversation, {scrollToEnd = true} = {}) => {
      const generation = ++messageGeneration;
      selected = this.chatConversationId = conversation.conversation_id;
      currentConversation = conversation;
      for (const button of conversationList.querySelectorAll('.community-conversation')) {
        button.setAttribute('aria-selected', String(button.dataset.conversationId === selected));
      }
      const other = conversation.participant_ids?.find(id => id !== this.currentUserId);
      if (other) recipient.value = this.chatRecipient = other;
      heading.textContent = participantName(conversation);
      const page = (await this.api.listMessages(selected, {latest:true})).data;
      if (generation !== messageGeneration || !content.isConnected) return;
      messages.replaceChildren(...(page.messages || []).map(messageRow));
      if (page.next_cursor) {
        const older = el(d, 'button', {className:'btn', type:'button'}, [text(d, '读取更早消息')]);
        let before = page.next_cursor;
        older.onclick = async () => {
          older.disabled = true;
          try {
            const previous = (await this.api.listMessages(selected, {before})).data;
            if (generation !== messageGeneration || !content.isConnected) return;
            older.after(...(previous.messages || []).map(messageRow));
            before = previous.next_cursor;
            if (!before) older.remove();
          } catch (error) { this.status(content, error.message, true); }
          finally { older.disabled = false; }
        };
        messages.prepend(older);
      }
      if (scrollToEnd) messages.scrollTop = messages.scrollHeight;
      const last = page.messages?.at(-1);
      if (last && conversation.unread_count) {
        const read = (await this.api.markConversationRead(conversation.conversation_id,last.message_id)).data.conversation;
        if (generation !== messageGeneration || !content.isConnected) return;
        Object.assign(conversation,read);
        const unreadLabel=conversationList.querySelector('[aria-selected=true] small');
        if(unreadLabel)unreadLabel.textContent='已读';
      }
    };
    const refresh = async () => {
      if (!content.isConnected) return;
      if (refreshing) return refreshing;
      refreshing = (async () => {
        try {
          const data = (await this.api.listConversations()).data;
          if (!content.isConnected) return;
          conversationList.replaceChildren();
          for (const conversation of data.conversations || []) {
            const button = el(d, 'button', {className:'community-conversation', type:'button', 'data-conversation-id':conversation.conversation_id, 'aria-selected':String(conversation.conversation_id === selected)});
            button.append(el(d, 'strong', {}, [text(d, participantName(conversation))]), el(d, 'small', {}, [text(d, conversation.unread_count ? `${conversation.unread_count} 条未读` : '已读')]));
            button.onclick = () => openConversation(conversation).catch(error => this.status(content,error.message,true));
            conversationList.append(button);
            if (conversation.conversation_id === selected) {
              currentConversation = conversation;
              if (!messages.childElementCount) await openConversation(conversation);
            }
          }
          if (!conversationList.children.length) conversationList.append(el(d, 'div', {className:'community-empty'}, [text(d, '还没有好友会话。可以从好友页发起聊天。')]));
        } catch (error) { this.status(content,error.message,true); }
      })();
      try { await refreshing; } finally { refreshing = null; }
    };
    this.refreshChat = async () => {
      await refresh();
      if (selected && currentConversation) await openConversation(currentConversation,{scrollToEnd:true});
    };
    form.onsubmit = async event => {
      event.preventDefault();
      if (send.disabled) return;
      let target = recipient.value.trim();
      const message = input.value.trim();
      if (!target || !message) return this.status(content,'请选择或填写玩家，并输入消息。',true);
      send.disabled = true;
      try {
        const profile=(await this.api.playerSearch({query:target,limit:1})).data.profiles?.[0];
        if(profile?.user_id)target=profile.user_id;
      } catch { /* Sending still reports a precise server error if the ID is valid. */ }
      const intent = {recipient_id:target,message_type:'text',content:message};
      if (!this.pendingMessage || JSON.stringify(intent) !== JSON.stringify(this.pendingMessage.intent)) this.pendingMessage = {intent,id:globalThis.crypto.randomUUID()};
      try {
        const result = await this.api.sendMessage({...intent,client_message_id:this.pendingMessage.id});
        this.chatRecipient = target;
        this.chatConversationId = result.data.message.conversation_id;
        this.pendingMessage = null;
        input.value = '';
        selected = this.chatConversationId;
        await refresh();
        const conversation = conversationList.querySelector('[aria-selected=true]');
        if (conversation) conversation.click();
      } catch (error) { this.status(content,error.message,true); }
      finally { send.disabled = false; }
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    sidebar.append(conversationList);
    await refresh();
    if (selected) {
      const data = (await this.api.listConversations()).data.conversations || [];
      const conversation = data.find(item => item.conversation_id === selected);
      if (conversation) await openConversation(conversation);
    }
  }
  handleRealtimeNotification(message) {
    const isFriendNotification = message?.data?.notification?.type?.startsWith('friend.');
    const tab = isFriendNotification ? 'friends' : 'nearby';
    if (this.panel?.querySelector('[data-tab="' + tab + '"]')?.getAttribute('aria-selected') === 'true') {
      const content = this.panel.querySelector('[data-content]');
      const refresh = isFriendNotification ? this.refreshFriends?.() : this.renderNearby(content);
      Promise.resolve(refresh).catch(() => {});
    }
  }

  handleRealtimeMessage(message) {
    if (message?.type === 'nearby.message') { this.pushNearbyMessage(message.data); return; }
    if (!['message.new', 'message.read'].includes(message?.type)) return;
    this.lastRealtimeMessage = message.data?.message || message.data;
    if (this.panel?.querySelector('[data-tab="chat"]')?.getAttribute('aria-selected') === 'true') this.refreshChat?.();
  }
  handleRealtimePlayers(players) {
    const signature = JSON.stringify([...players].map(([id, player]) => [id, player.status || 'online']).sort());
    if (signature === this.presenceSignature) return;
    this.presenceSignature = signature;
    if (this.panel?.querySelector('[data-tab="friends"]')?.getAttribute('aria-selected') === 'true') this.refreshFriends?.();
  }
  dispose() { this.close(); this.button.remove(); this.style.remove(); }
}
