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
 async ensure(){
  let initialError;
  try{return await this.read();}catch(error){initialError=error;}
  return new Promise(resolve=>{
   if(this.panel)this.panel.remove();
   const panel=document.createElement('section');this.panel=panel;
   panel.style.cssText='position:fixed;inset:0;z-index:150;background:#2c2929b8;display:grid;place-items:center;font:15px system-ui;color:#51454a';
   panel.innerHTML='<form style="background:#faf1e5;padding:28px;border-radius:22px;width:min(420px,85vw);box-shadow:0 15px 60px #0005"><h2>连接你的世界</h2><p>本机启动会自动进入。连接中断时可直接重试。远程访问请联系世界主人，使用已登录的浏览器；新安装可在本机使用启动终端中的一次性主人配对码。</p><label>主人配对码<input name="code" autocomplete="off" style="display:block;width:100%;box-sizing:border-box;margin:12px 0;padding:10px"></label><button type="submit" data-pair style="padding:10px 20px">配对并进入</button> <button type="button" data-retry style="padding:10px 20px">重新连接</button><p role="status"></p><small>本机进入不需要配对码。远程配对仅在本机完成。</small></form>';
   if(this.localEntryAvailable){panel.querySelector('label').remove();panel.querySelector('[data-pair]').hidden=true;}
   panel.querySelector('[role="status"]').textContent=initialError.message;
   document.body.append(panel);
   const connect=async code=>{
    const buttons=[panel.querySelector('[data-pair]'),panel.querySelector('[data-retry]')];
    for(const button of buttons)button.disabled=true;
    try{const session=code?await this.pair(code):await this.read();panel.remove();resolve(session);}
    catch(error){panel.querySelector('[role="status"]').textContent=error.message;}
    finally{for(const button of buttons)button.disabled=false;}
   };
   panel.querySelector('[data-retry]').onclick=()=>connect();
   panel.querySelector('form').onsubmit=e=>{e.preventDefault();return connect(this.localEntryAvailable?'':String(new FormData(e.target).get('code')||'').trim());};
  });
 }
}
export const ownerSession=new OwnerSession();
