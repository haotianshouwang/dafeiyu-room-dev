import {getCatalogEntry} from '../../shared/world/catalog.js';
import './world-map.css';

const keyFor=entry=>JSON.stringify([entry.id,entry.landmarkId||'']);
const labelFor=entry=>entry.landmarkLabel?entry.label+' · '+entry.landmarkLabel:entry.label;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function destinations(state){
 const scenes=state.scenes.filter(scene=>scene.status==='active');
 if(!scenes.some(scene=>scene.templateId==='forest_v1'))scenes.push({id:null,label:'森林',templateId:'forest_v1'});
 return scenes.flatMap(scene=>scene.templateId==='forest_v1'
  ?[{...scene,landmarkId:'entrance',landmarkLabel:'入口'},{...scene,landmarkId:'summit-lake',landmarkLabel:'湖泊'}]
  :[scene]);
}

// Overview anchors keep the regions readable. Images and routes come from
// the current world's scene geometry and portal graph.
function worldEntries(state){
 const seen=new Set();return destinations(state).filter(entry=>{const id=entry.id||entry.templateId;if(seen.has(id))return false;seen.add(id);return true;}).map(entry=>({...entry,landmarkLabel:null}));
}
function worldAtlasPoints(entries){
 const presets={forest_v1:[17,25],yard:[42,25],bedroom:[17,67],living:[42,67],street_corner_v1:[68,56],public_lobby_v1:[83,22]};
 if(entries.length>6){const columns=Math.min(4,Math.ceil(Math.sqrt(entries.length*1.56))),rows=Math.ceil(entries.length/columns);return new Map(entries.map((entry,index)=>[keyFor(entry),[(index%columns+.5)*100/columns,(Math.floor(index/columns)+.5)*84/rows]]));}
 const points=new Map();let extra=0;
 for(const entry of entries){const point=presets[entry.id]||presets[entry.templateId]||[76+(extra%2)*14,78+Math.floor(extra++/2)*14];points.set(keyFor(entry),point);}
 return points;
}
function worldRoutes(state,nodes){
 const keys=new Map(nodes.filter(node=>node.id).map(node=>[node.id,keyFor(node)])),routes=[],seen=new Set();
 for(const portal of state.portals||[]){const a=keys.get(portal.from?.sceneId),b=keys.get(portal.to?.sceneId);if(!a||!b||a===b)continue;const key=[a,b].sort().join('|');if(seen.has(key))continue;seen.add(key);routes.push([a,b]);}
 return routes;
}
function drawWorldTerrain(canvas,nodes,state,positions,thumbnails){
 const c=canvas.getContext('2d');if(!c)return;const w=canvas.width,h=canvas.height;
 c.fillStyle='#233f4d';c.fillRect(0,0,w,h);
 c.strokeStyle='#adc2c31a';c.lineWidth=1;
 for(let x=0;x<w;x+=40){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}
 for(let y=0;y<h;y+=40){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
 c.save();c.setLineDash([5,7]);c.strokeStyle='#bcd3ca';c.lineWidth=2;
 for(const [a,b]of worldRoutes(state,nodes)){const p=positions.get(a),q=positions.get(b);if(!p||!q)continue;c.beginPath();c.moveTo(p[0]*w/100,p[1]*h/100);c.lineTo(q[0]*w/100,q[1]*h/100);c.stroke();}
 c.restore();
 for(const entry of nodes){const p=positions.get(keyFor(entry)),thumbnail=thumbnails.get(keyFor(entry));if(!p)continue;const x=p[0]*w/100,y=p[1]*h/100;
  c.fillStyle='#16303e';c.fillRect(x-97,y-65,194,130);
  if(thumbnail)c.drawImage(thumbnail.canvas,x-93,y-61,186,122);
  else{c.fillStyle='#adc2c3';c.font='13px sans-serif';c.textAlign='center';c.fillText('读取实景…',x,y);c.textAlign='left';}
  c.lineWidth=entry.id===state.scene?.id?3:1;c.strokeStyle=entry.id===state.scene?.id?'#f4df9c':'#9ab3b7';c.strokeRect(x-96,y-64,192,128);
 }
}

function paintMinimap(canvas,state){
 const c=canvas.getContext('2d'),scene=state.scene;
 if(!c)return null;
 const w=canvas.width,h=canvas.height,b=scene?.bounds||{x0:-4,x1:4,z0:-4,z1:4};
 c.clearRect(0,0,w,h);c.fillStyle='#a4c8ca';c.fillRect(0,0,w,h);
 const s=Math.min((w-30)/(b.x1-b.x0||1),(h-30)/(b.z1-b.z0||1)),ox=(w-(b.x1-b.x0)*s)/2,oy=(h-(b.z1-b.z0)*s)/2;
 const x=v=>ox+(v-b.x0)*s,y=v=>oy+(v-b.z0)*s;
 c.fillStyle=scene?.kind==='indoor'?'#e5d9bf':scene?.templateId==='forest_v1'?'#91b187':scene?.socialArea==='public'?'#d6dfc1':'#b6c19c';
 c.beginPath();c.roundRect(ox,oy,(b.x1-b.x0)*s,(b.z1-b.z0)*s,Math.min(10,s*.3));c.fill();c.save();c.clip();
 c.strokeStyle='#4b5b451b';c.lineWidth=1;
 for(let xx=ox+s;xx<w;xx+=s){c.beginPath();c.moveTo(xx,oy);c.lineTo(xx,h-oy);c.stroke();}
 for(let yy=oy+s;yy<h;yy+=s){c.beginPath();c.moveTo(ox,yy);c.lineTo(w-ox,yy);c.stroke();}
 for(const col of scene?.template?.staticColliders||[]){
  if(![col.x0,col.x1,col.z0,col.z1].every(Number.isFinite))continue;
  c.fillStyle=scene.templateId==='forest_v1'?'#315e396b':'#5d534759';c.beginPath();c.rect(x(col.x0),y(col.z0),(col.x1-col.x0)*s,(col.z1-col.z0)*s);c.fill();
 }
 for(const entity of state.entities){
  if(entity.sceneId!==scene?.id)continue;
  const f=getCatalogEntry(entity.type)?.footprint;if(!f)continue;
  const width=Math.max(3,(f.width||f.radius*2||.65)*Math.abs(entity.scale?.[0]??1)*s),depth=Math.max(3,(f.depth||f.radius*2||.65)*Math.abs(entity.scale?.[2]??1)*s);
  c.save();c.translate(x(entity.position[0]),y(entity.position[2]));c.rotate(-(entity.rotation||0));
  c.fillStyle=scene.socialArea==='public'?'#377e7eb8':'#876143bd';c.strokeStyle='#fff8e0c9';c.lineWidth=1;c.beginPath();c.roundRect(-width/2,-depth/2,width,depth,Math.min(3,width/3,depth/3));c.fill();c.stroke();c.restore();
 }
 for(const landmark of scene?.template?.landmarks||[]){c.fillStyle='#e9ce8a';c.beginPath();c.arc(x(landmark.position[0]),y(landmark.position[2]),3,0,Math.PI*2);c.fill();}
 c.restore();return {x,y};
}

export function mountWorldMap({getState,onOpen=()=>{},onTeleport,onOnlineToggle=()=>{},sceneMap=null,embeddedScenes=[]}){
 const root=document.createElement('section');root.className='world-map-hud';root.setAttribute('aria-label','地图与传送');
 const trigger=document.createElement('button');trigger.type='button';trigger.className='world-map-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
 trigger.innerHTML='<span class="world-map-trigger-heading"><span class="world-map-live-dot" aria-hidden="true"></span><span class="world-map-place"></span><kbd>M</kbd></span><canvas class="world-map-mini" width="360" height="220" aria-hidden="true"></canvas><span class="world-map-trigger-footer"><span>地图 / 传送</span><span class="world-map-coordinates"></span></span>';
 const dialog=document.createElement('dialog');dialog.className='world-map-dialog';dialog.setAttribute('aria-labelledby','world-map-heading');
 dialog.innerHTML='<div class="world-map-shell"><header class="world-map-header"><div><p class="world-map-kicker">星港航海图</p><h2 id="world-map-heading">旅途地图</h2><p class="world-map-current"></p></div><button class="world-map-close" type="button" aria-label="关闭地图">×</button></header><div class="world-map-content"><div class="world-map-atlas" role="group" aria-label="地图目的地"><canvas class="world-map-terrain" width="1000" height="640" aria-hidden="true"></canvas><div class="world-map-points"></div><div class="world-map-atlas-compass" aria-hidden="true"><span>北</span><b>N</b></div><span class="world-map-atlas-caption">世界总览</span></div><aside class="world-map-destinations"><div class="world-map-list-heading"><span>目的地</span><span class="world-map-count"></span></div><div class="world-map-list" role="group" aria-label="可传送地点"></div><div class="world-map-choice"><p class="world-map-choice-kind"></p><h3 class="world-map-choice-name">选择一个地点</h3><p class="world-map-choice-description" role="status"></p><button class="world-map-travel" type="button" disabled>传送</button></div></aside></div></div>';
 const sessionButton=document.createElement('button');sessionButton.type='button';sessionButton.className='world-map-session';sessionButton.id='play-connection-toggle';
 sessionButton.innerHTML='<span class="world-map-session-label"></span><span class="world-map-session-action"></span>';
 sessionButton.addEventListener('click',async()=>{sessionButton.disabled=true;try{await onOnlineToggle();}finally{sessionButton.disabled=false;refresh();}});
 root.append(trigger,sessionButton,dialog);document.body.append(root);
 const mini=trigger.querySelector('canvas'),base=document.createElement('canvas');base.width=mini.width;base.height=mini.height;
 const ctx=mini.getContext('2d'),place=trigger.querySelector('.world-map-place'),coordinates=trigger.querySelector('.world-map-coordinates');
 const points=dialog.querySelector('.world-map-points'),list=dialog.querySelector('.world-map-list'),closeButton=dialog.querySelector('.world-map-close');
 const choiceKind=dialog.querySelector('.world-map-choice-kind'),choiceName=dialog.querySelector('.world-map-choice-name'),description=dialog.querySelector('.world-map-choice-description'),travel=dialog.querySelector('.world-map-travel');
 const terrain=dialog.querySelector('.world-map-terrain'),atlas=dialog.querySelector('.world-map-atlas');
 const embeddedButtons=[];
 if(embeddedScenes.length){
  const group=document.createElement('div');group.className='world-map-embedded-scenes';group.setAttribute('role','group');group.setAttribute('aria-label','独立场景');
  const heading=document.createElement('p');heading.className='world-map-list-heading';heading.textContent='独立场景';group.append(heading);
  for(const entry of embeddedScenes){
   const button=document.createElement('button');button.type='button';button.className='world-map-destination';
   button.innerHTML='<span class="world-map-destination-mark is-public" aria-hidden="true"></span><span class="world-map-destination-text"></span><span class="world-map-destination-status">进入</span>';
   button.querySelector('.world-map-destination-text').textContent=entry.label;
   button.addEventListener('click',()=>{
    const current=getState();
    if(pending||!current?.ready||current.busy||current.contextKey!==contextAtOpen||current.scene?.id!==sceneAtOpen)return;
    close();entry.onOpen();
   });
   embeddedButtons.push(button);group.append(button);
  }
  list.after(group);
 }
 if(sceneMap){dialog.classList.add('world-map-real');dialog.querySelector('#world-map-heading').textContent='实景地图';}

 const viewport=document.createElement('div');viewport.className='world-map-viewport';
 if(sceneMap){atlas.prepend(viewport);viewport.append(terrain,points);}
 const marker=document.createElement('span');marker.className='world-map-player';marker.setAttribute('aria-label','我的实时位置');marker.hidden=true;
 const mapTools=document.createElement('div');mapTools.className='world-map-tools';
 mapTools.innerHTML='<button type="button" data-map-world aria-label="打开世界总览">世界</button><button type="button" data-map-zoom="1" aria-label="放大地图">＋</button><button type="button" data-map-zoom="-1" aria-label="缩小地图">−</button><button type="button" data-map-locate aria-label="定位自己">定位</button><button type="button" data-map-reset aria-label="重置地图视图">复位</button>';
 if(sceneMap){viewport.append(marker);atlas.append(mapTools);}
 let state=null,entries=[],positions=new Map(),selected='',contextAtOpen='',sceneAtOpen='',sceneKey='',lastFrame=-Infinity,pending=false;
 let baseEntities=null,baseScene=null,baseContext='',baseTemplate=null,projection=null;
 let viewedScene='',atlasCapture=null,atlasImage=null,atlasEntry='',zoom=1,panX=0,panY=0,drag=null,captureError=false,mapLevel='scene',thumbnails=new Map(),thumbnailKey='';
 const isOpen=()=>dialog.open;
 function close(){if(dialog.open)dialog.close();trigger.setAttribute('aria-expanded','false');}
 function updateChoice(){
  const entry=entries.find(item=>keyFor(item)===selected),here=entry&&entry.id===state?.scene?.id&&!entry.landmarkId;
  choiceName.textContent=entry?labelFor(entry):'暂无可用地点';choiceKind.textContent=entry?(entry.templateId==='forest_v1'?'野外区域':entry.socialArea==='public'?'公共区域':state?.visiting?'好友私宅':'我的世界'):'';
  description.textContent=!state?.connected?'世界连接中，请稍后传送。':state.busy?'请先完成当前操作。':here?'你已经在这里。':entry?'前往'+labelFor(entry)+'。':'等待世界加载完成。';
  travel.disabled=!entry||pending||!state?.ready||!state.connected||state.busy||here;
  for(const button of embeddedButtons)button.disabled=pending||!state?.ready||state.busy;
  travel.textContent=pending?'传送中…':here?'当前位置':'传送到这里';
  for(const button of points.children){
   const item=entries.find(candidate=>keyFor(candidate)===button.dataset.entry);
    button.setAttribute('aria-pressed',String(button.dataset.entry===selected));button.classList.toggle('world-map-point-current',mapLevel==='world'?(item?.id===state?.scene?.id):item?.id===state?.scene?.id);
    if(mapLevel==='world'?(item?.id===state?.scene?.id):item?.id===state?.scene?.id&&!item.landmarkId)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');
  }
  for(const button of list.children){button.setAttribute('aria-pressed',String(button.dataset.entry===selected));const item=entries.find(candidate=>keyFor(candidate)===button.dataset.entry);button.querySelector('.world-map-destination-status').textContent=(mapLevel==='world'?item?.id===state?.scene?.id:item?.id===state?.scene?.id&&!item.landmarkId)?'当前':'';}
 }
 function rebuildLevel(nextLevel){
  dialog.dataset.level=nextLevel;
  mapLevel=nextLevel;atlasImage=null;atlasEntry='';zoom=1;panX=panY=0;
  entries=mapLevel==='world'?worldEntries(state):destinations(state);
  positions=worldAtlasPoints(entries);
  rebuild();
 }
 function openWorld(){
  if(!sceneMap||!state)return;
  const sceneEntries=destinations(state);
  const here=sceneEntries.find(item=>item.id===state.scene?.id&&!item.landmarkId)
   ||sceneEntries.find(item=>item.templateId===state.scene?.templateId&&!item.landmarkId)
   ||sceneEntries.find(item=>item.templateId===state.scene?.templateId);
  rebuildLevel('world');
  if(here){const root=entries.find(item=>item.id===here.id);if(root)selected=keyFor(root);}
  drawAtlas();updateChoice();
 }
 function openScene(entry){rebuildLevel('scene');selected=keyFor(entry);viewedScene=entry.id;drawAtlas();updateChoice();}
 function choose(entry){
  if(mapLevel==='world'){openScene(entry);return;}
  selected=keyFor(entry);if(sceneMap){if(viewedScene!==entry.id){zoom=1;panX=panY=0;}viewedScene=entry.id;drawAtlas();}updateChoice();
 }
 function rebuild(){
  atlasImage=null;
  points.replaceChildren();list.replaceChildren();positions=worldAtlasPoints(entries);
  dialog.querySelector('.world-map-count').textContent=entries.length+' 个落点';
  for(const entry of entries){
   const button=document.createElement('button'),position=positions.get(keyFor(entry));button.type='button';button.className='world-map-point';button.dataset.entry=keyFor(entry);button.style.left=position[0]+'%';button.style.top=position[1]+'%';button.setAttribute('aria-label',labelFor(entry));
   button.innerHTML='<span class="world-map-point-glyph" aria-hidden="true"></span><span class="world-map-point-label"></span>';button.querySelector('.world-map-point-label').textContent=labelFor(entry);button.addEventListener('click',()=>choose(entry));points.append(button);
   const row=document.createElement('button');row.type='button';row.className='world-map-destination';row.dataset.entry=keyFor(entry);
   row.innerHTML='<span class="world-map-destination-mark" aria-hidden="true"></span><span class="world-map-destination-text"></span><span class="world-map-destination-status"></span>';
   row.querySelector('.world-map-destination-mark').classList.add(entry.templateId==='forest_v1'?'is-forest':entry.socialArea==='public'?'is-public':'is-home');row.querySelector('.world-map-destination-text').textContent=labelFor(entry);row.addEventListener('click',()=>choose(entry));list.append(row);
  }
 }
 function drawMini(){
  if(!ctx||!state)return;
  const real=sceneMap&&state.scene?capture(state.scene,360,220):null;
  if(real){
   ctx.clearRect(0,0,mini.width,mini.height);ctx.drawImage(real.canvas,0,0,mini.width,mini.height);
   projection={x:x=>real.projection.point([x,0,0])[0]*mini.width/real.canvas.width,y:z=>real.projection.point([0,0,z])[1]*mini.height/real.canvas.height};
  }else{
  if(baseScene!==state.scene?.id||baseEntities!==state.entities||baseContext!==state.contextKey||baseTemplate!==state.scene?.template){
   projection=paintMinimap(base,state);baseScene=state.scene?.id;baseEntities=state.entities;baseContext=state.contextKey;baseTemplate=state.scene?.template;
  }
  ctx.clearRect(0,0,mini.width,mini.height);ctx.drawImage(base,0,0);
  }
  const actor=state.actor;if(!actor||actor.sceneId!==state.scene?.id||!projection){coordinates.textContent='';return;}
  ctx.save();ctx.translate(clamp(projection.x(actor.position[0]),8,mini.width-8),clamp(projection.y(actor.position[2]),8,mini.height-8));ctx.rotate(Math.PI-(actor.rotation||0));
  ctx.fillStyle='#fff7dd';ctx.strokeStyle='#355761';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#355761';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(4.5,3);ctx.lineTo(0,1);ctx.lineTo(-4.5,3);ctx.closePath();ctx.fill();ctx.restore();
  coordinates.textContent=Math.round(actor.position[0])+', '+Math.round(actor.position[2]);
 }
 function capture(entry,width=1000,height=640){try{return sceneMap.capture(entry,state,width,height);}catch(error){if(!captureError){console.warn('场景地图暂不可用',error);captureError=true;}return null;}}
 function applyView(){viewport.style.transform='translate('+panX+'px,'+panY+'px) scale('+zoom+')';}
 function setZoom(value){
  if(mapLevel==='scene'&&value<1){openWorld();return;}
  zoom=clamp(value,1,mapLevel==='world'?2.5:4);if(zoom===1)panX=panY=0;applyView();
 }
 function drawAtlas(){
  if(!sceneMap||!state)return;
  const entry=entries.find(item=>keyFor(item)===selected)||state.scene;if(!entry)return;
  if(mapLevel==='world'){
   const nextKey=JSON.stringify([state.contextKey,state.layoutRevision,state.topologyRevision,entries.map(keyFor)]);
   if(thumbnailKey!==nextKey){thumbnailKey=nextKey;thumbnails.clear();}
   const missing=entries.find(item=>!thumbnails.has(keyFor(item)));
   if(missing){const thumbnail=capture(missing,320,205);if(thumbnail)thumbnails.set(keyFor(missing),thumbnail);}
   const aging=entries.find(item=>{const thumbnail=thumbnails.get(keyFor(item));return thumbnail?.pending&&performance.now()-thumbnail.capturedAt>2500;});
   if(!missing&&aging){const thumbnail=capture(aging,320,205);if(thumbnail)thumbnails.set(keyFor(aging),thumbnail);}
   drawWorldTerrain(terrain,entries,state,positions,thumbnails);
   for(const button of points.querySelectorAll('.world-map-point')){
    const pointEntry=entries.find(item=>keyFor(item)===button.dataset.entry);button.hidden=false;
    const position=positions.get(keyFor(pointEntry));if(position){button.style.left=position[0]+'%';button.style.top=position[1]+'%';}
   }
   points.querySelectorAll('.world-map-exit').forEach(node=>node.remove());
   const current=entries.find(item=>item.id===state.scene?.id);
   marker.hidden=!current;
   if(current){const p=positions.get(keyFor(current));if(p){marker.style.left=p[0]+'%';marker.style.top=p[1]+'%';marker.style.rotate='0deg';}}
   dialog.querySelector('.world-map-atlas-caption').textContent='世界总览 · 点击区域查看实景';
   applyView();return;
  }
  atlasCapture=capture(entry);if(!atlasCapture)return;
  if(atlasImage!==atlasCapture.canvas||atlasEntry!==keyFor(entry)){
  atlasImage=atlasCapture.canvas;atlasEntry=keyFor(entry);
  terrain.getContext('2d').drawImage(atlasCapture.canvas,0,0,terrain.width,terrain.height);
  const template=atlasCapture.template;
  for(const button of points.querySelectorAll('.world-map-point')){
   const pointEntry=entries.find(item=>keyFor(item)===button.dataset.entry);button.hidden=pointEntry?.id!==entry.id;
   if(button.hidden)continue;
   const position=template?.landmarks?.find(point=>point.landmarkId===pointEntry.landmarkId)?.position||template?.spawn||[0,0,0];
   const [x,y]=atlasCapture.projection.point(position);button.style.left=x/terrain.width*100+'%';button.style.top=y/terrain.height*100+'%';
  }
  points.querySelectorAll('.world-map-exit').forEach(node=>node.remove());
  for(const portal of state.portals||[]){
   const from=portal.from?.sceneId===entry.id?portal.from:portal.bidirectional&&portal.to?.sceneId===entry.id?portal.to:null;if(!from)continue;
   const destination=from===portal.from?portal.to:portal.from,slot=template?.portalSlots?.find(item=>item.slotId===from.slotId),target=entries.find(item=>item.id===destination?.sceneId);if(!slot||!target)continue;
   const exit=document.createElement('button');exit.type='button';exit.className='world-map-exit';exit.textContent='通往'+target.label;exit.setAttribute('aria-label','查看通往'+target.label+'的出口');
   const [x,y]=atlasCapture.projection.point(slot.position);exit.style.left=x/terrain.width*100+'%';exit.style.top=y/terrain.height*100+'%';exit.onclick=()=>choose(target);points.append(exit);
  }
  }
  const sameScene=state.actor?.sceneId===entry.id;marker.hidden=!sameScene;
  if(sameScene){const [x,y]=atlasCapture.projection.point(state.actor.position);marker.style.left=x/terrain.width*100+'%';marker.style.top=y/terrain.height*100+'%';marker.style.rotate=(180-(state.actor.rotation||0)*180/Math.PI)+'deg';}
  dialog.querySelector('.world-map-atlas-caption').textContent=(entry.label||'森林')+' · 场景俯视';applyView();
 }
 if(sceneMap){
  mapTools.querySelector('[data-map-world]').onclick=()=>openWorld();
  mapTools.querySelectorAll('[data-map-zoom]').forEach(button=>button.onclick=()=>setZoom(zoom+Number(button.dataset.mapZoom)*.5));
  mapTools.querySelector('[data-map-reset]').onclick=()=>{zoom=1;panX=panY=0;applyView();};
  mapTools.querySelector('[data-map-locate]').onclick=()=>{
   if(mapLevel==='world'){openWorld();const here=entries.find(entry=>entry.id===state.scene?.id)||entries.find(entry=>entry.templateId===state.scene?.templateId);if(here){selected=keyFor(here);updateChoice();}return;}
   const here=entries.find(entry=>entry.id===state.scene?.id);if(!here||!state.actor)return;choose(here);zoom=Math.max(zoom,1.5);const [x,y]=atlasCapture.projection.point(state.actor.position),rect=atlas.getBoundingClientRect();panX=(.5-x/terrain.width)*rect.width*zoom;panY=(.5-y/terrain.height)*rect.height*zoom;applyView();
  };
  atlas.addEventListener('wheel',event=>{event.preventDefault();setZoom(zoom+(event.deltaY<0?.25:-.25));},{passive:false});
  atlas.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('button'))return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,panX,panY};atlas.setPointerCapture(event.pointerId);});
  atlas.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;panX=clamp(drag.panX+event.clientX-drag.x,-atlas.clientWidth*zoom,atlas.clientWidth*zoom);panY=clamp(drag.panY+event.clientY-drag.y,-atlas.clientHeight*zoom,atlas.clientHeight*zoom);applyView();});
  const stopDrag=()=>{drag=null;};for(const event of ['pointerup','pointercancel','lostpointercapture'])atlas.addEventListener(event,stopDrag);
 }
 function refresh(){
  const next=getState();if(!next)return;
  if(isOpen()&&(next.contextKey!==contextAtOpen||next.scene?.id!==sceneAtOpen||next.busy))close();
  const changedContext=state?.contextKey!==next.contextKey;state=next;
  if(changedContext){sceneMap?.clear();thumbnails.clear();thumbnailKey='';atlasCapture=atlasImage=null;zoom=1;panX=panY=0;}
  const nextKey=JSON.stringify([state.contextKey,state.layoutRevision,state.topologyRevision,state.scenes.map(scene=>[scene.id,scene.label,scene.templateId,scene.status])]);
   if(sceneKey!==nextKey){
    sceneKey=nextKey;entries=mapLevel==='world'?worldEntries(state):destinations(state);
    if(changedContext||!entries.some(entry=>keyFor(entry)===selected)){const here=entries.find(entry=>entry.id===state.scene?.id&&!entry.landmarkId)||entries.find(entry=>entry.id===state.scene?.id)||entries.find(entry=>entry.templateId===state.scene?.templateId);selected=here?keyFor(here):entries[0]?keyFor(entries[0]):'';}
   rebuild();
  }
  place.textContent=state.scene?.label||'世界加载中';trigger.setAttribute('aria-label','打开世界地图，当前在'+place.textContent);trigger.disabled=!state.ready||state.busy;
  dialog.querySelector('.world-map-current').textContent=place.textContent+' · '+(state.scene?.socialArea==='public'?'公共区域':state.visiting?'好友私宅':'我的世界');
  sessionButton.querySelector('.world-map-session-label').textContent=state.session?.label||'单人游玩';sessionButton.querySelector('.world-map-session-action').textContent=state.session?.action||'登录账号';sessionButton.setAttribute('aria-label',(state.session?.label||'单人游玩')+'，'+(state.session?.action||'登录账号'));
  drawMini();if(isOpen()){if(sceneMap)drawAtlas();updateChoice();}
 }
 function open(){
  refresh();if(!state?.ready||state.busy||pending||document.querySelector('dialog[open]'))return;
  const here=entries.find(entry=>entry.id===state.scene?.id&&!entry.landmarkId);
  if(here)selected=keyFor(here);else if(sceneMap){const current=entries.find(entry=>entry.id===state.scene?.id);if(current)selected=keyFor(current);}
   if(sceneMap){const current=destinations(state).find(entry=>entry.id===state.scene?.id);if(current)openScene(current);else openWorld();}
  contextAtOpen=state.contextKey;sceneAtOpen=state.scene?.id;onOpen();dialog.showModal();trigger.setAttribute('aria-expanded','true');updateChoice();closeButton.focus();
 }
 trigger.addEventListener('click',open);closeButton.addEventListener('click',close);
 dialog.addEventListener('close',()=>{trigger.setAttribute('aria-expanded','false');if(!trigger.disabled)trigger.focus();});
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)close();}});
 // Keep keyboard navigation inside the modal; gameplay listeners remain gated too.
 dialog.addEventListener('keydown',event=>{
  event.stopPropagation();if(event.key!=='Tab')return;
  const focusable=[...dialog.querySelectorAll('button:not(:disabled):not([hidden])')];
  if(!focusable.length){event.preventDefault();dialog.focus();return;}
  if(event.shiftKey&&document.activeElement===focusable[0]){event.preventDefault();focusable.at(-1).focus();}
  else if(!event.shiftKey&&document.activeElement===focusable.at(-1)){event.preventDefault();focusable[0].focus();}
 });
 dialog.addEventListener('keyup',event=>event.stopPropagation());
 travel.addEventListener('click',async()=>{
  const entry=entries.find(item=>keyFor(item)===selected),current=getState();
  if(!entry||pending||!current?.ready||!current.connected||current.busy||current.contextKey!==contextAtOpen||current.scene?.id!==sceneAtOpen)return;
  pending=true;close();
  try{await onTeleport(entry.id,entry.landmarkId,labelFor(entry));}finally{pending=false;refresh();}
 });
 const keydown=event=>{
  if(event.code!=='KeyM'||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)||document.querySelector('dialog[open]'))return;
  event.preventDefault();open();
 };
 window.addEventListener('keydown',keydown);refresh();
 return {refresh,update(time){if(time-lastFrame<125)return;lastFrame=time;refresh();},close,isOpen,dispose(){close();sceneMap?.dispose();window.removeEventListener('keydown',keydown);root.remove();}};
}
