import './harbor-preview.css';

const icons={
 pet:'<path d="M8 14c-3 0-5 5-2 6 2 1 4-1 6-1s4 2 6 1c3-1 1-6-2-6-2-4-6-4-8 0Z"/><ellipse cx="5" cy="9" rx="2" ry="3"/><ellipse cx="10" cy="5" rx="2" ry="3"/><ellipse cx="16" cy="5" rx="2" ry="3"/><ellipse cx="21" cy="9" rx="2" ry="3"/>',
 bag:'<path d="M5 8h16v14H5zM9 8V5a4 4 0 0 1 8 0v3M9 12v2m8-2v2M9 18h8"/>',
 account:'<circle cx="13" cy="8" r="4"/><path d="M5 23v-3a8 8 0 0 1 16 0v3"/>',
 settings:'<path d="m10 2 6 0 1 4 4 2 3 5-3 5-4 2-1 4h-6l-1-4-4-2-3-5 3-5 4-2Z"/><circle cx="13" cy="13" r="4"/>',
 view:'<path d="M2 13c5-10 17-10 22 0-5 10-17 10-22 0Z"/><circle cx="13" cy="13" r="4"/>',
 build:'<path d="M3 12 13 3l10 9M6 10v13h14V10M11 23v-8h5v8"/>',
 more:'<circle cx="5" cy="13" r="1.5"/><circle cx="13" cy="13" r="1.5"/><circle cx="21" cy="13" r="1.5"/>',
 help:'<circle cx="13" cy="13" r="10"/><path d="M9 9c0-6 11-5 8 1-1 2-4 2-4 5m0 3v1"/>',
 chat:'<path d="M3 4h20v14H11l-7 5v-5H3ZM7 9h12M7 13h8"/>',
 action:'<circle cx="14" cy="4" r="2"/><path d="m5 10 7-3 5 5 6-3M12 7l-2 8-6 7m6-7 8 2 3 6"/>',
 send:'<path d="m3 3 20 10-20 10 4-10-4-10Zm4 10h16"/>',
};
const svg=name=>'<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';

// The game HUD is the default entry, including the persistent nearby composer.
export function mountHarborPreview({communityPanel,onView,getState,getSpeechAnchor,onNearbySend=()=>false,onChatFocus=()=>{},onFeed=()=>{}}){
 document.body.classList.add('harbor-ui');
 const title=document.querySelector('#title h1');if(title)title.textContent='大肥鱼的小世界';
 const subtitle=document.querySelector('#title p');if(subtitle){const loc=document.getElementById('loc');subtitle.replaceChildren();if(loc)subtitle.append(loc);}
 const actions=document.getElementById('actions');
 const dock=document.createElement('nav');dock.className='harbor-dock';dock.setAttribute('aria-label','常用功能');document.body.append(dock);
 function decorate(button,name,label){
  if(!button)return;const badge=button.querySelector('.pet-count,.bag-count');
  button.replaceChildren();button.insertAdjacentHTML('beforeend',svg(name));if(badge)button.append(badge);
  const text=document.createElement('span');text.className='harbor-tool-label';text.textContent=label;button.append(text);
  button.classList.add('harbor-tool');button.title=label;button.setAttribute('aria-label',label);
 }
 for(const [selector,icon,label]of [['#pet-entry','pet','宠物'],['#bag-entry','bag','背包'],['.community-entry','account','账号'],['#settings-entry','settings','设置']]){
  const button=document.querySelector(selector);decorate(button,icon,label);if(button)dock.append(button);
 }
 const view=document.createElement('button');view.type='button';view.onclick=onView;decorate(view,'view','视角');dock.append(view);
 const build=document.querySelector('.room-edit-toggle');decorate(build,'build','布置');if(build)dock.append(build);
 // Secondary actions share one small drawer, leaving the view unobstructed.
 const more=document.createElement('details');more.className='harbor-more';
 const summary=document.createElement('summary');summary.innerHTML=svg('more')+'<span>更多</span>';summary.setAttribute('aria-label','更多操作');more.append(summary);
 const drawer=document.createElement('div');drawer.className='harbor-more-body';
 if(actions){for(const child of [...actions.children])drawer.append(child);actions.hidden=true;}
 // The secondary action buttons are moved out of #actions above. Bind feed directly after moving it.
 drawer.querySelector('[data-act="feed"]')?.addEventListener('click',event=>{event.stopPropagation();onFeed();});
 const rail=document.getElementById('left-rail');if(rail)drawer.append(rail);
 const actionButton=document.createElement('button');actionButton.type='button';decorate(actionButton,'action','动作');
 actionButton.onclick=()=>{more.open=!more.open;const panel=document.getElementById('action-panel');if(panel?.classList.contains('collapsed'))document.getElementById('action-panel-head')?.click();};dock.append(actionButton);
 const authorButton=[...document.body.children].find(node=>node.tagName==='BUTTON'&&node.textContent==='作者样例');if(authorButton){authorButton.removeAttribute('style');drawer.append(authorButton);}
 const help=document.createElement('button');help.type='button';help.className='harbor-help-button';help.innerHTML=svg('help')+' 操作指南';drawer.append(help);
 more.append(drawer);dock.append(more);
 const helpDialog=document.createElement('dialog');helpDialog.className='harbor-help settings-dialog';
 helpDialog.innerHTML='<div class="settings-card"><header class="settings-header"><h2>操作指南</h2><button class="settings-close" type="button" aria-label="关闭操作指南">×</button></header><dl><dt>移动与镜头</dt><dd>WASD 移动 · 空格跳跃 · Shift 切换冲刺<br>按住右键环视 · V 切换视角 · Esc 返回</dd><dt>探索世界</dt><dd>M 打开地图，选择地点传送。缩小实景地图可以查看世界总览。</dd><dt>与世界互动</dt><dd>点击角色摸头，点击床睡觉。院子树下可以领取宠物蛋。</dd><dt>角色动作</dt><dd>Q 踢腿 · E 拳击 · F 翻滚<br>X 坐下 · G 跳舞 · Ctrl / C 匍匐<br>水中按 C 下潜或上浮</dd></dl></div>';
 document.body.append(helpDialog);help.onclick=()=>{more.open=false;helpDialog.showModal();};helpDialog.querySelector('button').onclick=()=>helpDialog.close();
 const outside=event=>{if(!more.contains(event.target)&&!actionButton.contains(event.target))more.open=false;};document.addEventListener('pointerdown',outside);
 const chat=document.createElement('section');chat.className='harbor-chat';chat.setAttribute('aria-label','附近聊天');
 chat.innerHTML='<header class="harbor-chat-head"><span class="harbor-chat-channel">'+svg('chat')+' 附近</span><button class="harbor-chat-friends" type="button">好友</button><span class="harbor-chat-presence"></span><button class="harbor-chat-collapse" type="button" aria-label="收起聊天" aria-expanded="true">−</button></header><div class="harbor-chat-log" role="log" aria-live="polite" aria-relevant="additions"></div><form class="harbor-chat-form"><input aria-label="附近聊天消息" maxlength="500" autocomplete="off" placeholder="按 Enter 开始聊天"><button type="submit" aria-label="发送附近消息">'+svg('send')+'</button></form><p class="harbor-chat-feedback" role="status" hidden></p>';
 const chatLog=chat.querySelector('.harbor-chat-log'),chatInput=chat.querySelector('input'),chatForm=chat.querySelector('form'),chatFeedback=chat.querySelector('.harbor-chat-feedback'),chatPresence=chat.querySelector('.harbor-chat-presence'),collapse=chat.querySelector('.harbor-chat-collapse');document.body.append(chat);
 chat.querySelector('.harbor-chat-friends').onclick=()=>{more.open=false;communityPanel.open();void communityPanel.switchTab(getState().user?'chat':'account');};
 collapse.onclick=()=>{const collapsed=chat.classList.toggle('collapsed');collapse.setAttribute('aria-expanded',String(!collapsed));collapse.setAttribute('aria-label',collapsed?'展开聊天':'收起聊天');collapse.textContent=collapsed?'+':'−';};
 chatInput.addEventListener('focus',onChatFocus);
 chat.addEventListener('keydown',event=>{
  event.stopPropagation();
  if(event.key==='Escape'&&!event.isComposing){event.preventDefault();chatInput.blur();}
 });
 chatForm.onsubmit=event=>{
  event.preventDefault();const content=chatInput.value.trim();if(!content)return;
  if(!onNearbySend(content)){chatFeedback.textContent='消息未发送，请确认联机已连接。';chatFeedback.hidden=false;return;}
  chatInput.value='';chatFeedback.hidden=true;chatInput.focus();
 };
 const bubbles=document.createElement('div');bubbles.className='harbor-bubbles';bubbles.setAttribute('aria-hidden','true');document.body.append(bubbles);
 let contextKey=null,lastOnline=null,lastConnected=null,lastUserId=null,lastUpdate=0;const messages=[],speech=new Map(),seen=new Set();
 function emptyLog(state){chatLog.replaceChildren();const note=document.createElement('p');note.className='harbor-chat-empty';note.textContent=state.connected?'向附近的玩家打个招呼吧。':state.online?'正在连接附近聊天…':state.user?'开启联机后，即可与附近玩家聊天。':'登录账号，和附近的玩家一起探索。';chatLog.append(note);}
 function clear(state){messages.length=0;seen.clear();chatInput.value='';chatFeedback.hidden=true;for(const bubble of speech.values())bubble.node.remove();speech.clear();emptyLog(state);}
 function syncContext(){const state=getState();if(contextKey!==state.contextKey){contextKey=state.contextKey;clear(state);}return state;}
 const keydown=event=>{if(event.code!=='Enter'||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target?.tagName)||document.querySelector('dialog[open],.community-backdrop,.community-auth-gate'))return;event.preventDefault();if(chat.classList.contains('collapsed'))collapse.click();chatInput.focus();};
 window.addEventListener('keydown',keydown);
 syncContext();
 return {
  pushChat(message){
   const state=syncContext();if(!state.online||!message?.message_id||seen.has(message.message_id)||message.scene_id&&message.scene_id!==state.sceneId)return;
   seen.add(message.message_id);messages.push(message);if(messages.length>100)seen.delete(messages.shift().message_id);
   chatLog.querySelector('.harbor-chat-empty')?.remove();
   const line=document.createElement('p'),name=document.createElement('strong');name.textContent=(message.display_name||'玩家')+'：';line.append(name,document.createTextNode(String(message.content||'')));chatLog.append(line);
   while(chatLog.children.length>50)chatLog.firstElementChild.remove();chatLog.scrollTop=chatLog.scrollHeight;
   const userId=message.user_id;if(!userId)return;
   speech.get(userId)?.node.remove();const node=document.createElement('span');node.className='harbor-speech';node.textContent=String(message.content||'');bubbles.append(node);speech.set(userId,{node,expires:performance.now()+7000});
  },
  update(camera){
   const now=performance.now();if(now-lastUpdate<33)return;lastUpdate=now;
   const state=syncContext();
   const playerName=document.querySelector('.st-name'),name=state.user?.display_name||state.user?.username||'大肥鱼';if(playerName&&playerName.textContent!==name)playerName.textContent=name;
   if(lastOnline!==state.online||lastConnected!==state.connected||lastUserId!==state.user?.id){lastOnline=state.online;lastConnected=state.connected;lastUserId=state.user?.id;if(!messages.length)emptyLog(state);}
   const connected=Boolean(state.connected);chatInput.disabled=!connected;chatForm.querySelector('button').disabled=!connected;
   chatInput.placeholder=connected?'按 Enter 聊天，Esc 返回游戏':state.online?'正在连接…':'开启联机后聊天';
   chatPresence.textContent=connected?`${state.playerCount||1} 人在线`:state.online?'连接中':'单人游玩';chatPresence.dataset.online=String(connected);
   const account=dock.querySelector('.community-entry');if(account){const label=state.user?'账号':'登录';if(!account.querySelector('.harbor-tool-label'))decorate(account,'account',label);account.setAttribute('aria-label',state.user?'账号':'登录社区账号');account.querySelector('.harbor-tool-label').textContent=label;}
   for(const [id,bubble]of speech){
    if(now>=bubble.expires){bubble.node.remove();speech.delete(id);continue;}
    const anchor=getSpeechAnchor(id);if(!anchor||!camera){bubble.node.hidden=true;continue;}
    anchor.project(camera);bubble.node.hidden=anchor.z<-1||anchor.z>1||Math.abs(anchor.x)>1.1||Math.abs(anchor.y)>1.1;
    bubble.node.style.left=(anchor.x+1)/2*innerWidth+'px';bubble.node.style.top=(1-anchor.y)/2*innerHeight+'px';
   }
  },
  dispose(){document.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',keydown);chat.remove();bubbles.remove();helpDialog.remove();dock.remove();}
 };
}
