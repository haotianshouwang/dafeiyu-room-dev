import {ownerSession} from './owner-session.js';
const scopeNames={'world:read':'观察世界','actor:control':'角色行动','build:write':'场景建设','audio:play':'播放智能体提供的语音（无需麦克风）'};
export function connectionSummary(data){
 if(!data||data.health?.service!=='ready')return '世界服务离线，请确认游戏服务已启动。';
 if(data.health.protocol==='incompatible')return 'MCP 协议不兼容，请更新客户端或使用高级 stdio 适配器。';
 if(data.health.authorization==='owner_required')return '主人会话已失效，请打开本机游戏重新连接。';
 return '服务已启动 · 协议待客户端验证';
}
export async function copyEndpoint(data,clipboard=globalThis.navigator?.clipboard){
 let u;try{u=new URL(data.endpoint);}catch{throw Error('MCP 地址无效');}
 if(u.username||u.password||u.search||u.hash||u.pathname!=='/mcp'||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('MCP 地址必须是无凭证的服务地址');
 if(!clipboard?.writeText)throw Error('当前浏览器无法自动复制，请选中地址手动复制');
 await clipboard.writeText(u.href);
}
export class AgentConnect {
 constructor({document=globalThis.document,request=globalThis.fetch?.bind(globalThis),session=ownerSession,clipboard=globalThis.navigator?.clipboard}={}){
  Object.assign(this,{document,request,session,clipboard});
  const style=document.createElement('style');style.textContent=styles;document.head.append(style);this.style=style;
  const button=document.createElement('button');button.className='btn world-utility-button agent-connect-entry';button.textContent='连接智能体';button.onclick=()=>this.open();document.body.append(button);this.button=button;
 }
 async open(){
  if(this.panel){this.panel.querySelector('[data-close]').focus();return;}
  const d=this.document,panel=d.createElement('div');panel.className='agent-connect-backdrop';
  panel.innerHTML=`<section class="agent-connect-card" role="dialog" aria-modal="true" aria-labelledby="agent-connect-title" tabindex="-1"><header><div><span class="agent-eyebrow">让世界多一个伙伴</span><h2 id="agent-connect-title">连接智能体</h2></div><button class="agent-icon" data-close aria-label="关闭连接面板">×</button></header><p class="agent-intro">复制地址，添加到支持 MCP 的客户端，在打开的授权页确认一次，就能进入这个世界。</p><label class="agent-label" for="agent-endpoint">MCP 地址</label><div class="agent-address"><input id="agent-endpoint" readonly value="正在读取…" spellcheck="false"><button class="btn" data-copy disabled>复制地址</button></div><p class="agent-reach" data-reach></p><div class="agent-health" role="status" data-status>正在检查服务…</div><div class="agent-section-heading"><h3>已授权的伙伴</h3><button class="agent-link" data-refresh>刷新状态</button></div><p class="agent-muted">授权表示可以访问世界，不代表智能体此刻在线。</p><div data-agents></div><button class="btn" data-connect hidden>连接本机游戏</button><details><summary>接入说明与高级选项</summary><p>默认授权：观察世界、角色行动、场景建设。智能体从工具说明获取规则，无需额外填写游戏提示词。</p><p>仅支持 stdio 的客户端：使用本项目适配器 <code>npm run mcp:stdio -- --config &lt;凭证文件&gt;</code>。凭证文件由主人单独签发，权限设为 0600；不能把令牌放进 MCP 地址。详见仓库 <code>docs/MCP-QUICKSTART.md</code>。</p><p>关闭网页后，服务仍可完成已接受的动作；自主决策和唤醒由你的智能体客户端负责。</p></details></section>`;
  this.panel=panel;d.body.append(panel);const card=panel.querySelector('section');
  const close=()=>{panel.remove();this.panel=null;d.removeEventListener('keydown',this.onKey);this.button.focus();};
  panel.querySelector('[data-close]').onclick=close;panel.onclick=e=>{if(e.target===panel)close();};
  this.onKey=e=>{if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){const all=[...panel.querySelectorAll('button:not([hidden]):not(:disabled),input,summary')],first=all[0],last=all.at(-1);if(e.shiftKey&&d.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&d.activeElement===last){e.preventDefault();first.focus();}}};d.addEventListener('keydown',this.onKey);card.focus();
  panel.querySelector('[data-refresh]').onclick=()=>this.refresh();
  panel.querySelector('[data-connect]').onclick=async()=>{await this.session.ensure();if(this.panel)await this.refresh();};
  panel.querySelector('[data-copy]').onclick=async()=>{try{await copyEndpoint(this.data,this.clipboard);panel.querySelector('[data-status]').textContent='地址已复制 · 在客户端添加 MCP 连接后确认授权';}catch(e){panel.querySelector('[data-status]').textContent=e.message;panel.querySelector('input').select();}};
  await this.refresh();
 }
 async refresh(){
  const panel=this.panel;if(!panel)return;
  try{
   const r=await this.request('/api/integrations/mcp',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('offline');const data=await r.json();if(this.panel!==panel)return;this.data=data;
   panel.querySelector('input').value=data.endpoint;panel.querySelector('[data-copy]').disabled=false;panel.querySelector('[data-reach]').textContent=data.reachability.message;
   panel.querySelector('[data-status]').textContent=connectionSummary(data);panel.querySelector('[data-connect]').hidden=data.health.authorization==='owner';
   const agents=panel.querySelector('[data-agents]');agents.replaceChildren();
   if(!data.connectedAgents.length){const empty=this.document.createElement('p');empty.className='agent-empty';empty.textContent=data.health.authorization==='owner'?'还没有伙伴，复制上面的地址开始连接。':'连接本机游戏后，可查看和管理授权。';agents.append(empty);}
   for(const g of data.connectedAgents){
    const row=this.document.createElement('div');row.className='agent-grant';const info=this.document.createElement('div'),name=this.document.createElement('strong'),detail=this.document.createElement('p'),badge=this.document.createElement('span');
    name.textContent=g.clientName;badge.className='agent-badge';badge.textContent={authorized:'已授权',revoked:'已撤销',expired:'已过期'}[g.status]||'状态未知';detail.textContent=g.scopes.map(s=>scopeNames[s]||s).join(' · ');info.append(name,badge,detail);row.append(info);
    if(g.status==='authorized'){const revoke=this.document.createElement('button');revoke.className='agent-link';revoke.textContent='撤销授权';revoke.onclick=async()=>{revoke.disabled=true;try{const session=await this.session.read();const r=await this.request('/api/auth/grants/'+encodeURIComponent(g.grantId)+'/revoke',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},body:'{}'});if(!r.ok)throw Error(r.status===401?'主人会话已失效，请打开本机游戏重新连接。':'撤销失败，请刷新后重试。');await this.refresh();}catch(e){panel.querySelector('[data-status]').textContent=e.message;revoke.disabled=false;}};row.append(revoke);}agents.append(row);
   }
  }catch{if(this.panel===panel){panel.querySelector('[data-status]').textContent=connectionSummary(null);panel.querySelector('[data-copy]').disabled=true;}}
 }
 dispose(){this.panel?.remove();this.document.removeEventListener('keydown',this.onKey);this.button.remove();this.style.remove();}
}
const styles=`

.agent-connect-backdrop{position:fixed;inset:0;z-index:140;background:#39313b75;backdrop-filter:blur(7px);display:grid;place-items:center;padding:20px;box-sizing:border-box;color:#55464c;font:14px/1.65 system-ui}
.agent-connect-card{width:min(560px,100%);max-height:88dvh;overflow:auto;box-sizing:border-box;background:#fff8ec;border:1px solid #fff;border-radius:25px;padding:26px;box-shadow:0 24px 90px #36273540;outline:none}
.agent-connect-card header{display:flex;justify-content:space-between;align-items:center}.agent-eyebrow{font-size:11px;color:#a07869;letter-spacing:.13em}.agent-connect-card h2{font-size:24px;line-height:1.3;margin:4px 0 0;color:#4d4148;font-weight:650}.agent-icon{background:#f0e7db;border:0;border-radius:50%;width:32px;height:32px;font-size:23px;color:#806b72;cursor:pointer}.agent-intro{margin:18px 0;color:#806f73}.agent-label{font-size:12px;font-weight:600}.agent-address{display:flex;gap:8px;margin:7px 0}.agent-address input{min-width:0;flex:1;border:1px solid #dfd0c0;border-radius:11px;padding:11px;background:#fffdf8;color:#51444e;font:13px ui-monospace,monospace}.agent-address .btn{white-space:nowrap;padding:9px 13px}.agent-reach{font-size:12px;color:#987b68;margin:7px 0 14px}.agent-health{background:#eeeadd;border:1px solid #dedfca;border-radius:11px;padding:10px 13px;color:#68725d;font-size:12px}.agent-section-heading{display:flex;align-items:center;justify-content:space-between;margin-top:20px}.agent-connect-card h3{font-size:15px;margin:0}.agent-link{border:0;background:none;color:#987466;font:inherit;font-size:12px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:5px}.agent-muted{font-size:11px;color:#a18e87;margin:4px 0 10px}.agent-empty{border:1px dashed #dfd1c1;padding:18px;border-radius:12px;font-size:12px;text-align:center;color:#9b857b}.agent-grant{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #e9dfd0;padding:12px 0}.agent-grant strong{font-size:13px;overflow-wrap:anywhere}.agent-grant p{font-size:11px;color:#99847e;margin:4px 0}.agent-badge{margin-left:8px;font-size:10px;color:#748064;background:#e9eddd;border-radius:5px;padding:2px 5px}.agent-connect-card details{margin-top:20px;padding-top:14px;border-top:1px solid #e9dfd0;font-size:12px;color:#928078}.agent-connect-card summary{cursor:pointer;color:#78696d}.agent-connect-card code{font-size:11px;overflow-wrap:anywhere}.agent-connect-card button:focus-visible,.agent-connect-card summary:focus-visible{outline:2px solid #a88872;outline-offset:3px}
@media(max-width:600px){.agent-connect-card{padding:20px;border-radius:20px}.agent-address{flex-wrap:wrap}.agent-address input{flex-basis:100%}.agent-address .btn{width:100%}#actions{flex-wrap:wrap;justify-content:center;width:95%;bottom:10px!important;gap:5px!important}#actions .btn{font-size:11px;padding:8px 10px}}
`;
