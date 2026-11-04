// Shared owner bootstrap for the world view and the agent connection panel.
// The session credential stays in an HttpOnly cookie; only CSRF is held in memory.
export class OwnerSession {
 constructor({request=globalThis.fetch?.bind(globalThis)}={}){this.request=request;}
 async read(){
  let r=await this.request('/api/auth/session',{credentials:'same-origin'});
  if(r.status===401){
   const status=await this.request('/api/auth/status',{credentials:'same-origin'});
   this.localEntryAvailable=status.ok&&(await status.json()).localEntryAvailable===true;
   if(this.localEntryAvailable){
    const entry=await this.request('/api/auth/local-session',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});
    if(entry.ok)r=await this.request('/api/auth/session',{credentials:'same-origin'});
   }
  }
  if(!r.ok)throw Object.assign(Error(this.localEntryAvailable?'本机连接失败，请使用启动时的游戏地址刷新页面。':'请联系世界主人，在已登录的浏览器中打开游戏；新安装可使用本机启动终端中的一次性配对码。'),{status:r.status});
  return this.session=await r.json();
 }
 async pair(code){const r=await this.request('/api/auth/pair',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({code})});const result=await r.json();if(!r.ok)throw Error(result.error||'配对失败，请检查本机终端中的一次性配对码');return this.read();}
 async ensure(){try{return await this.read();}catch{}return new Promise(resolve=>{if(this.panel)this.panel.remove();const panel=document.createElement('section');this.panel=panel;panel.style.cssText='position:fixed;inset:0;z-index:150;background:#2c2929b8;display:grid;place-items:center;font:15px system-ui;color:#51454a';panel.innerHTML='<form style="background:#faf1e5;padding:28px;border-radius:22px;width:min(420px,85vw);box-shadow:0 15px 60px #0005"><h2>连接你的世界</h2><p>本机启动会自动进入。远程访问请联系世界主人，使用已登录的浏览器；新安装可在本机使用启动终端中的一次性主人配对码。</p><label>主人配对码<input name="code" autocomplete="off" required style="display:block;width:100%;box-sizing:border-box;margin:12px 0;padding:10px"></label><button style="padding:10px 20px">配对并进入</button><p role="status"></p><small>配对只在本机进行。更换浏览器时，本机游戏会自动连接。</small></form>';if(this.localEntryAvailable){panel.querySelector('p').textContent='本机连接暂时失败，请确认使用启动时的游戏地址，然后重试。';panel.querySelector('label').remove();panel.querySelector('button').textContent='重新连接';panel.querySelector('small').textContent='本机进入不需要配对码。';}document.body.append(panel);panel.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=panel.querySelector('button');button.disabled=true;try{const session=this.localEntryAvailable?await this.read():await this.pair(new FormData(e.target).get('code').trim());panel.remove();resolve(session);}catch(error){panel.querySelector('[role="status"]').textContent=error.message;}finally{button.disabled=false;}};});}
}
export const ownerSession=new OwnerSession();
