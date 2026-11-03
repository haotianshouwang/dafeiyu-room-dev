import {validLayout} from '../../shared/layout.js';
const PENDING='dafeiyu-bedroom-pending-v1';
export class LayoutSync {
  constructor({restore,notify,sceneId='bedroom',storage=globalThis.localStorage,request=globalThis.fetch?.bind(globalThis)}) {
    Object.assign(this,{restore,notify,storage,request,sceneId});this.pendingKey=sceneId==='bedroom'?PENDING:`dafeiyu-${sceneId}-pending-v1`;this.revision=null;this.pending=null;this.busy=false;this.conflict=false;
  }
  async api(method,body) {
    const response=await this.request(`/api/layout/${this.sceneId}`,{method,headers:body?{'Content-Type':'application/json'}:undefined,
      body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(4000)});
    if(!response.ok){const error=new Error('Save request failed');error.status=response.status;throw error;}
    return response.json();
  }
  remember() {try {if(this.pending)this.storage.setItem(this.pendingKey,JSON.stringify(this.pending));else this.storage.removeItem(this.pendingKey);}catch{}}
  async init(local) {
    try {const pending=JSON.parse(this.storage.getItem(this.pendingKey));if(pending&&validLayout(pending.layout,this.sceneId))this.pending=pending;}catch{}
    try {
      const remote=await this.api('GET');
      if(!Number.isSafeInteger(remote.revision)||remote.revision<0 || (remote.layout!==null&&!validLayout(remote.layout,this.sceneId)))throw new Error('Invalid server save');
      this.revision=remote.revision;
      if(this.pending) {
        this.restore(this.pending.layout);
        if(this.pending.revision!==this.revision && this.revision!==0){this.conflict=true;this.notify('存档冲突：保留本机布局，请先导出备份，再点读取数据库');return;}
        this.pending.revision=this.revision;await this.flush();
      } else if(remote.layout!==null){this.restore(remote.layout);this.notify('已读取数据库存档');}
      else if(local!==null&&validLayout(local,this.sceneId)){this.enqueue(local);await this.flush();}
      else this.notify('数据库已连接，修改布局后自动保存');
    } catch {this.notify('数据库未连接 · 当前使用浏览器备份，可点重试');}
  }
  enqueue(layout) {
    this.pending={layout:JSON.parse(JSON.stringify(layout)),revision:this.pending?.revision??this.revision};this.remember();
    this.notify('正在保存到数据库…');clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),250);
  }
  async useDatabaseVersion() {
    if(this.busy)return;
    try {
      const remote=await this.api('GET');
      if(remote.layout===null||!validLayout(remote.layout,this.sceneId))throw new Error('No valid save');
      if(this.pending)this.storage.setItem(`dafeiyu-${this.sceneId}-conflict-backup-v1`,JSON.stringify(this.pending));
      this.pending=null;this.conflict=false;this.revision=remote.revision;this.remember();
      this.restore(remote.layout);this.notify('已读取数据库版本 · 上一步本机布局可用撤销恢复');
    } catch {this.notify('读取数据库失败，本机布局未更改');}
  }
  async flush() {
    if(this.busy||!this.pending)return;
    if(this.conflict){this.notify('存档冲突：本机已备份，请先导出布局，再点读取数据库');return;}
    this.busy=true;
    try {
      if(this.revision===null){
        const remote=await this.api('GET');
        this.revision=remote.revision;
        if(remote.layout!==null&&this.pending.revision!==remote.revision){this.conflict=true;throw Object.assign(new Error('Conflict'),{status:409});}
      }
      while(this.pending) {
        const saving=this.pending;
        const result=await this.api('PUT',{layout:saving.layout,revision:this.revision});
        this.revision=result.revision;
        if(this.pending===saving)this.pending=null;
        else this.pending.revision=this.revision;
        this.remember();
      }
      this.notify('已保存到数据库 ✓');
    } catch(error){
      if(error.status===409){this.conflict=true;this.notify('存档冲突：本机已备份，请先导出布局，再点读取数据库');}
      else this.notify('数据库保存失败 · 已留浏览器备份，点重试');
    } finally {this.busy=false;}
  }
}
