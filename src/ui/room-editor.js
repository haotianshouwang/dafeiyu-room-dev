import * as THREE from 'three';
import { validLayout } from '../../shared/layout.js';
import { LayoutSync, WorldLayoutSync } from './layout-sync.js';
import { FURNITURE, createFurniture } from '../world/props.js';

export const FURNITURE_CATEGORIES = {
  '全部': Object.keys(FURNITURE),
  '睡眠': ['bed','nightstand'],
  '桌椅': ['desk','chair','table'],
  '收纳': ['shelf'],
  '休闲': ['bean','rug'],
  '灯饰绿植': ['lamp','plant','smallPlant'],
  '客厅家具': ['livingSofa','livingTable','livingChair','livingShelf','livingLamp','livingPlant','livingRug'],
  '户外': ['yardPool','yardFarm','yardTree','yardBench','yardLantern','yardFlowers','yardCan','yardSwing','yardPicnicTable','yardUmbrella','yardFlowerBox','yardRoseArch','yardBirdBath'],
};

const STORAGE = 'dafeiyu-bedroom-layout-v1';
export class RoomEditor {
  constructor({ group, scene, camera, canvas, getScene, onToggle, onChange, contexts, worldClient, registry }) {
    Object.assign(this, { group, scene, camera, canvas, getScene, onToggle, onChange });
    this.worldClient=worldClient;this.registry=registry;
    this.active = false; this.history = []; this.selected = null;
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0,1,0),0);
    this.offset = new THREE.Vector3(); this.defaults = this.snapshot();
    this.outline = new THREE.BoxHelper(new THREE.Object3D(), 0xffd47f);
    this.outline.visible = false; scene.add(this.outline);
    this.contexts=contexts || {room:{group,label:'卧室',sceneId:'bedroom'}};
    for(const ctx of Object.values(this.contexts)) {
      ctx.defaults=ctx.group.children.filter(o=>o.userData.furnitureType).map(o=>({type:o.userData.furnitureType,position:o.position.toArray(),rotation:o.rotation.y,scale:o.scale.toArray()}));
      ctx.history=[];ctx.loading=true;ctx.storageKey=ctx.sceneId==='bedroom'?STORAGE:`dafeiyu-${ctx.sceneId}-layout-v1`;
    }
    this.buildUI();this.bind();this.setContext(Object.keys(this.contexts)[0]);
    if(worldClient){this.updateWorldContexts();this.onChange?.();return;}
    for(const ctx of Object.values(this.contexts)) {
      let saved=null;
      try{saved=JSON.parse(localStorage.getItem(ctx.storageKey));if(saved!==null)this.restore(saved,ctx);}catch{saved=null;}
      ctx.sync=new LayoutSync({sceneId:ctx.sceneId,
        restore:layout=>{this.restore(layout,ctx);try{localStorage.setItem(ctx.storageKey,JSON.stringify(layout));}catch{}},
        notify:message=>{ctx.message=message;if(this.context===ctx){this.syncMessage=message;this.refreshState();}},
      });
      if(this.context===ctx)this.sync=ctx.sync;
      ctx.sync.init(saved).finally(()=>{ctx.loading=false;if(this.context===ctx)this.toggle.disabled=false;});
    }
    this.onChange?.();
    window.addEventListener('online',()=>Object.values(this.contexts).forEach(ctx=>ctx.sync.flush()));
  }
  updateWorldContexts() {
    for(const ctx of Object.values(this.contexts))if(!ctx.sync){ctx.defaults=ctx.group.children.filter(o=>o.userData.furnitureType).map(o=>({entityId:o.userData.entityId,type:o.userData.furnitureType,position:o.position.toArray(),rotation:o.rotation.y,scale:o.scale.toArray()}));ctx.history=[];ctx.loading=false;ctx.sync=new WorldLayoutSync({client:this.worldClient,registry:this.registry,sceneId:ctx.sceneId,notify:message=>{ctx.message=message;if(this.context===ctx){this.syncMessage=message;this.refreshState();}},onRollback:()=>this.select(null),onIdentities:ids=>{for(const object of ctx.group.children){const id=ids[object.userData.draftId];if(id)object.userData.entityId=id;}}});try{if(localStorage.getItem(ctx.sync.key)||localStorage.getItem(ctx.sceneId==='bedroom'?STORAGE:`dafeiyu-${ctx.sceneId}-layout-v1`))ctx.message='发现本机旧布局/草稿 · 仅备份，未覆盖世界';}catch{}}
    if(this.context)this.setContext(this.context.sceneId);
  }
  setContext(key) {
    const ctx=this.contexts[key];if(!ctx)return;
    this.context=ctx;this.group=ctx.group;this.defaults=ctx.defaults;this.history=ctx.history;
    this.sync=ctx.sync;this.syncMessage=ctx.message;this.selected=null;this.outline.visible=false;
    this.toggle.disabled=ctx.loading;
    this.allowedTypes=Object.keys(FURNITURE).filter(type=>(ctx.templateId==='courtyard_v1'||ctx.sceneId==='yard')
      ? type.startsWith('yard') || ['plant','smallPlant','lamp','chair','table'].includes(type)
      : !type.startsWith('yard') && (!!this.worldClient || ctx.sceneId==='living' || !type.startsWith('living')));
    this.panel.querySelector('strong').textContent=`布置${ctx.label}`;
    for(const button of this.panel.querySelector('.room-edit-categories').children)button.hidden=button.textContent!=='全部' && !FURNITURE_CATEGORIES[button.textContent].some(type=>this.allowedTypes.includes(type));
    this.showCategory?.('全部');this.refreshState();
  }

  items() { return this.group.children.filter(o => o.userData.furnitureType); }
  snapshot() { return this.items().map(o => ({ type:o.userData.furnitureType,
    position:o.position.toArray(), rotation:o.rotation.y, scale:o.scale.toArray(),...(this.worldClient?{entityId:o.userData.entityId,draftId:o.userData.draftId??(o.userData.draftId=`draft-${crypto.randomUUID()}`)}:{} ) })); }
  validate(data) {
    return validLayout(data,this.context?.templateId==='courtyard_v1'?'yard':this.context?.sceneId || 'bedroom');
  }
  restore(data, ctx=this.context) {
    if (!validLayout(data,ctx?.templateId==='courtyard_v1'?'yard':ctx?.sceneId || 'bedroom')) throw new Error('Invalid layout');
    const target=ctx?.group || this.group;
    if(!ctx || ctx===this.context)this.select(null);
    for(const o of target.children.filter(o=>o.userData.furnitureType))target.remove(o);
    for (const entry of data) {
      const o=createFurniture(entry.type); o.position.fromArray(entry.position);
      o.userData.entityId=entry.entityId;o.userData.draftId=entry.draftId;o.rotation.y=entry.rotation; o.scale.fromArray(entry.scale); target.add(o);
    }
    this.onChange?.();
  }
  checkpoint() { if(this.worldClient)this.registry.scenes.get(this.context.sceneId).draft=true;this.history.push(this.snapshot()); if(this.history.length>30)this.history.shift(); }
  save() {
    this.onChange?.();
    this.sync?.enqueue(this.snapshot());
    try { localStorage.setItem(this.context?.storageKey || STORAGE,JSON.stringify(this.snapshot())); this.status.textContent=this.worldClient?'编辑草稿已备份 · 正在提交世界校验':'布局已保存在本机 · 拖动移动，滚轮旋转家具 · 右键打开菜单'; }
    catch { this.status.textContent='浏览器无法保存，请导出布局备份。'; }
  }
  buildUI() {
    const style=document.createElement('style');
    style.textContent=`
      .room-edit-state{position:fixed;left:50%;bottom:94px;transform:translateX(-50%);z-index:38;width:max-content;max-width:90vw;box-sizing:border-box;padding:10px 16px;border-radius:14px;background:#faf1e5f2;color:#51454a;box-shadow:0 6px 24px #0004;font:13px system-ui;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
      .room-edit-state button{cursor:pointer;border:1px solid #bfae9d;border-radius:9px;padding:7px 10px;background:#fff9ee;color:#51454a}.room-edit-state small{display:block;margin-top:4px}
      .room-edit-toggle{position:fixed;right:24px;top:24px;z-index:35}
      .room-edit-panel{position:fixed;top:78px;left:50%;transform:translateX(-50%);width:min(820px,94vw);z-index:36;background:#faf1e5f5;color:#453b40;border:1px solid #fff9;border-radius:20px;padding:14px;box-shadow:0 12px 40px #0004;font:14px system-ui}
      .room-edit-state[hidden],.room-edit-panel[hidden],.room-edit-menu[hidden]{display:none}
      .room-edit-panel header{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.room-edit-panel strong{margin-right:auto}
      .room-edit-categories{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
      .room-edit-categories button[aria-pressed="true"]{background:#d8b790;border-color:#9c744e}
      .room-edit-catalog{display:grid;grid-template-columns:repeat(auto-fill,minmax(94px,1fr));gap:8px;max-height:155px;overflow-y:scroll;overscroll-behavior:contain;scrollbar-gutter:stable;padding:4px 10px 8px 0;scrollbar-width:auto;scrollbar-color:#a17c56 #e8d9c6}
      .room-edit-catalog::-webkit-scrollbar{width:10px}.room-edit-catalog::-webkit-scrollbar-track{background:#e8d9c6;border-radius:8px}.room-edit-catalog::-webkit-scrollbar-thumb{background:#a17c56;border-radius:8px}
      .room-edit-scroll-hint{font-size:12px;color:#776a68;margin:4px 0}
      .room-edit-panel button,.room-edit-menu button,.room-edit-toggle{border:1px solid #bfae9d;background:#fff9ee;color:#51454a;padding:9px 13px;border-radius:12px;cursor:pointer;font:inherit}
      .room-edit-catalog button{flex:0 0 76px;display:grid;gap:5px;justify-items:center}.room-edit-catalog span{font-size:25px}
      .room-edit-panel footer{font-size:12px;color:#776a68;margin-top:8px}.room-edit-menu{position:fixed;z-index:50;padding:6px;display:grid;gap:4px;border-radius:14px;background:#faf1e5;box-shadow:0 8px 28px #0005}.room-edit-menu button{text-align:left}
      .room-edit-panel button:hover,.room-edit-menu button:hover{background:#f3dcc0}.room-edit-panel button:focus-visible,.room-edit-toggle:focus-visible{outline:3px solid #b1834a}
    `; document.head.append(style);
    this.toggle=document.createElement('button');this.toggle.className='room-edit-toggle';this.toggle.textContent='🪑 布置房间';this.toggle.onclick=()=>this.setActive(!this.active);document.body.append(this.toggle);
    this.stateBar=document.createElement('div');this.stateBar.className='room-edit-state';this.stateBar.hidden=true;
    this.stateText=document.createElement('div');this.stateText.setAttribute('role','status');
    this.panelToggle=document.createElement('button');
    this.panelToggle.onclick=()=>{
      if(this.panel.hidden){this.select(null);this.panelCollapsed=false;}
      else this.panelCollapsed=true;
      this.refreshState();
    };
    this.retrySave=document.createElement('button');this.retrySave.textContent='重试保存';
    this.retrySave.onclick=()=>this.sync?.flush();
    this.loadDatabase=document.createElement('button');this.loadDatabase.textContent='读取数据库';this.loadDatabase.hidden=true;
    this.loadDatabase.onclick=()=>{this.checkpoint();this.sync?.useDatabaseVersion();};
    this.stateBar.append(this.stateText,this.panelToggle,this.retrySave,this.loadDatabase);document.body.append(this.stateBar);
    this.panel=document.createElement('section');this.panel.className='room-edit-panel';this.panel.hidden=true;
    this.panel.innerHTML='<header><strong>布置卧室</strong><button data-action="undo">撤销</button><button data-action="reset">恢复默认</button><button data-action="export">导出布局</button><button data-action="done">完成</button></header><nav class="room-edit-categories" aria-label="家具分类"></nav><div class="room-edit-scroll-hint">家具目录 · 在此滚轮上下浏览 ↓</div><div class="room-edit-catalog" tabindex="0" aria-label="可滚动家具目录"></div><footer role="status"></footer>';
    document.body.append(this.panel);this.status=this.panel.querySelector('footer');
    const catalog=this.panel.querySelector('.room-edit-catalog');
    const categories=this.panel.querySelector('.room-edit-categories');
    const showCategory=(name)=>{
      catalog.replaceChildren();catalog.scrollTop=0;
      for(const button of categories.children) button.setAttribute('aria-pressed',String(button.textContent===name));
      for(const type of (name==='全部'?Object.keys(FURNITURE):FURNITURE_CATEGORIES[name]).filter(type=>(this.allowedTypes || Object.keys(FURNITURE)).includes(type))) {
        const meta=FURNITURE[type],button=document.createElement('button');
        button.innerHTML=`<span>${meta.icon}</span>${meta.label}`;
        button.onclick=()=>this.add(type);catalog.append(button);
      }
    };
    for(const name of Object.keys(FURNITURE_CATEGORIES)) {
      const button=document.createElement('button');button.textContent=name;
      button.onclick=()=>showCategory(name);categories.append(button);
    }
    this.showCategory=showCategory;showCategory('全部');
    this.panel.querySelector('[data-action="done"]').onclick=()=>this.setActive(false);
    this.panel.querySelector('[data-action="undo"]').onclick=()=>this.undo();
    this.panel.querySelector('[data-action="reset"]').onclick=()=>{this.checkpoint();this.restore(this.defaults);this.save();};
    this.panel.querySelector('[data-action="export"]').onclick=()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(this.snapshot(),null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=`大肥鱼${this.context?.label || '卧室'}布局.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    this.menu=document.createElement('div');this.menu.className='room-edit-menu';this.menu.hidden=true;
    for(const [label,action] of [['↻ 旋转 90°',()=>this.rotate()],['⧉ 复制',()=>this.duplicate()],['删除家具',()=>this.remove()]]) {
      const button=document.createElement('button');button.textContent=label;button.onclick=()=>{action();this.menu.hidden=true;};this.menu.append(button);
    }document.body.append(this.menu);
  }
  async setActive(value) {
    if(this.worldClient){try{await this.worldClient.dispatch({kind:'build.editLock',payload:{sceneId:this.context.sceneId,locked:value}});if(value){await this.worldClient.dispatch({kind:'control.takeover',payload:{actorId:this.worldClient.snapshot.actors[0].actorId}});this.lockTimer=setInterval(()=>this.worldClient.dispatch({kind:'build.editLock',payload:{sceneId:this.context.sceneId,locked:true}}).catch(()=>this.setActive(false)),30000);}else{clearInterval(this.lockTimer);await this.sync.flush();}}catch(error){this.status.textContent=`无法切换编辑：${error.message}`;return;}}
    this.active=value;this.panelCollapsed=false;this.panel.hidden=!value || !!this.selected;this.menu.hidden=true;
    this.toggle.textContent=value?'✓ 完成布置':'🪑 布置房间';
    this.toggle.setAttribute('aria-pressed',String(value));this.canvas.style.cursor=value?'grab':'';
    if(!value){this.finishDrag();this.select(null);this.save();}
    this.refreshState();
    this.onToggle?.(value);this.status.textContent='点选家具后拖动 · 滚轮每格旋转 15° · 右键菜单 · R 旋转 · Ctrl/Cmd+Z 撤销';
  }
  select(object) {
    this.selected=object;
    this.outline.visible=!!object;
    if(object)this.outline.setFromObject(object);
    this.refreshState();
  }
  refreshState() {
    if(this.panel)this.panel.hidden=!this.active || !!this.selected || !!this.panelCollapsed;
    if(!this.stateBar)return;
    this.stateBar.hidden=!this.active;
    if(this.retrySave){this.retrySave.hidden=this.worldClient?!(this.sync?.pending&&this.sync?.error):!/失败|未连接/.test(this.syncMessage || '');this.retrySave.disabled=!!this.sync?.busy;}
    if(this.loadDatabase)this.loadDatabase.hidden=!this.sync?.conflict;
    const label=this.selected ? FURNITURE[this.selected.userData.furnitureType].label : '未选中家具';
    this.stateText.replaceChildren();
    const title=document.createElement('strong');title.textContent=`${this.context?.label || '卧室'}编辑 · ${label}`;
    const help=document.createElement('small');help.textContent=this.selected
      ? 'WASD 平移镜头 · 拖动摆放 · 滚轮旋转 · 右键菜单 · 点空白取消选中'
      : 'WASD 平移镜头 · 左键拖空白旋转镜头 · 角色已暂停 · Esc 完成';
    const saved=document.createElement('small');saved.textContent=this.syncMessage||'正在连接数据库…';
    this.stateText.append(title,help,saved);
    this.panelToggle.textContent=this.panel.hidden?'展开家具栏':'收起家具栏';
    this.panelToggle.setAttribute('aria-expanded',String(!this.panel.hidden));
  }
  ground(e) {
    const rect=this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),this.camera);
    return this.ray.ray.intersectPlane(this.plane,new THREE.Vector3());
  }
  pick(e) {
    this.ground(e);this.group.updateMatrixWorld(true);
    const hits=this.ray.intersectObjects(this.items(),true);
    for(const hit of hits){let o=hit.object;while(o&&o.parent!==this.group)o=o.parent;if(o?.userData.furnitureType&&!o.userData.protected)return o;}
    return null;
  }
  constrain(o) {
    const bounds=this.context?.bounds || {x0:-3.38,x1:3.38,z0:-3.38,z1:3.38};
    o.position.x=THREE.MathUtils.clamp(o.position.x,bounds.x0,bounds.x1);
    o.position.z=THREE.MathUtils.clamp(o.position.z,bounds.z0,bounds.z1);
    o.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(o);
    for(const axis of ['x','z']) {
      if(b.min[axis]<bounds[axis+'0'])o.position[axis]+=bounds[axis+'0']-b.min[axis];
      if(b.max[axis]>bounds[axis+'1'])o.position[axis]-=b.max[axis]-bounds[axis+'1'];
    }
    this.outline.setFromObject(o);
  }
  add(type) {
    if(this.items().length>=100){this.status.textContent='家具数量已达 100 件';return;}
    this.checkpoint();const o=createFurniture(type);o.position.set(0,0,.3);this.group.add(o);this.select(o);this.constrain(o);this.save();
  }
  rotate(angle=Math.PI/2, checkpoint=true){if(!this.selected)return;if(checkpoint)this.checkpoint();this.selected.rotation.y+=angle;this.constrain(this.selected);this.save();}
  duplicate(){if(!this.selected||this.items().length>=100)return;const source=this.selected;this.add(source.userData.furnitureType);this.selected.position.copy(source.position).add(new THREE.Vector3(.4,0,.4));this.selected.rotation.copy(source.rotation);this.selected.scale.copy(source.scale);this.constrain(this.selected);this.save();}
  remove(){if(!this.selected)return;this.checkpoint();this.group.remove(this.selected);this.select(null);this.save();}
  undo(){if(this.worldClient){this.sync.undo();return;}const previous=this.history.pop();if(previous){this.restore(previous);this.save();}}
  finishDrag(){if(this.dragging){this.dragging=false;this.save();}this.canvas.style.cursor=this.active?'grab':'';}
  bind() {
    const consume=e=>{e.preventDefault();e.stopImmediatePropagation();};
    this.canvas.addEventListener('wheel',e=>{
      if(!this.active || !this.selected || !e.deltaY)return;
      consume(e);
      const now=performance.now();
      const newGesture=!this.lastWheelAt || now-this.lastWheelAt>300 || this.wheelObject!==this.selected;
      if(newGesture){this.wheelDelta=0;this.checkpoint();}
      this.wheelObject=this.selected;this.lastWheelAt=now;
      const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?400:1);
      this.wheelDelta=(this.wheelDelta||0)+delta;
      const steps=Math.trunc(this.wheelDelta/40);
      if(steps){this.wheelDelta-=steps*40;this.rotate(steps*Math.PI/12,false);}
    },{passive:false});
    this.canvas.addEventListener('pointerdown',e=>{
      if(!this.active)return;
      const object=this.pick(e);this.menu.hidden=true;
      if(e.button===2){consume(e);this.select(object);return;}
      if(e.button!==0)return;
      if(object){consume(e);this.checkpoint();this.select(object);this.dragging=true;this.pointerId=e.pointerId;
        this.offset.copy(object.position).sub(this.ground(e));this.canvas.setPointerCapture(e.pointerId);this.canvas.style.cursor='grabbing';}
      else this.select(null);
    },true);
    this.canvas.addEventListener('pointermove',e=>{
      if(!this.active||!this.dragging)return;consume(e);const point=this.ground(e);if(!point)return;
      const y=this.selected.position.y;this.selected.position.copy(point.add(this.offset));this.selected.position.y=y;this.constrain(this.selected);
    },true);
    this.canvas.addEventListener('pointerup',e=>{if(this.active&&this.dragging){consume(e);this.finishDrag();}},true);
    this.canvas.addEventListener('pointercancel',()=>this.finishDrag(),true);
    this.canvas.addEventListener('lostpointercapture',()=>this.finishDrag(),true);
    this.canvas.addEventListener('contextmenu',e=>{
      if(!this.active)return;consume(e);this.select(this.pick(e));if(!this.selected)return;
      this.menu.hidden=false;this.menu.style.left=`${Math.min(e.clientX,innerWidth-170)}px`;this.menu.style.top=`${Math.min(e.clientY,innerHeight-150)}px`;
    });
    window.addEventListener('keydown',e=>{
      if(!this.active||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
      if(e.code==='Escape'){e.preventDefault();this.setActive(false);}
      if(e.code==='KeyR'){consume(e);this.rotate();}
      if(e.code==='Delete'||e.code==='Backspace'){consume(e);this.remove();}
      if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){consume(e);this.undo();}
    },true);
  }
}
