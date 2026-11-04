import * as THREE from 'three';
import {getTemplate} from '../../shared/world/templates.js';
import {portalEnds} from '../../shared/world/navigation.js';

const box=(w,h,d,color)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.85}));
function shell(template,openSlots){
 const root=new THREE.Group(),b=template.bounds;root.userData.openSlots=[...openSlots];
 const floor=box(b.x1-b.x0,.16,b.z1-b.z0,template.kind==='indoor'?0xd6b799:0x9caf7b);floor.position.y=-.09;floor.receiveShadow=true;root.add(floor);
 for(const slot of template.portalSlots){const alongX=slot.side==='north'||slot.side==='south',length=alongX?b.x1-b.x0:b.z1-b.z0;const height=template.kind==='indoor'?2.7:.48;const opening=openSlots.includes(slot.slotId),width=slot.width;
  const add=(span,center,h=height,y=height/2)=>{const wall=box(alongX?span:.16,h,alongX?.16:span,template.kind==='indoor'?0xe8d8c4:0xd6c7ab);wall.position.fromArray(slot.position);wall.position[alongX?'x':'z']=center;wall.position.y=y;wall.castShadow=true;root.add(wall);};
  // Front walls remain low so the fixed isometric camera can see the room.
  const visibleHeight=template.kind==='indoor'&&['south','east'].includes(slot.side)?.24:height;
  if(opening){const span=(length-width)/2;add(span,-(width+span)/2,visibleHeight,visibleHeight/2);add(span,(width+span)/2,visibleHeight,visibleHeight/2);if(visibleHeight>2.1)add(width,height-2.1,height-(height-2.1)/2);}else add(length,0,visibleHeight,visibleHeight/2);
 }
 return root;
}
export class SceneRegistry {
 constructor({scene,createFurniture,legacy={}}){Object.assign(this,{scene,createFurniture,legacy});this.scenes=new Map();this.entities=new Map();this.contexts={};}
 applySnapshot(snapshot){this.snapshot=snapshot;const present=new Set(snapshot.scenes.map(s=>s.sceneId));for(const [id,cfg] of this.scenes)if(!present.has(id)){this.scene.remove(cfg.root);this.scenes.delete(id);delete this.contexts[id];}
  for(const data of snapshot.scenes){let cfg=this.scenes.get(data.sceneId);const template=getTemplate(data.templateId);if(!cfg){const old=this.legacy[data.sceneId];const root=old?.root||new THREE.Group(),furniture=old?.furniture||new THREE.Group(),portals=new THREE.Group();if(!old)root.add(furniture);root.add(portals);this.scene.add(root);root.visible=false;cfg={...old,root,furniture,portals,bounds:template.bounds,view:old?.view||{target:new THREE.Vector3(0,1,0),zoom:template.kind==='outdoor'?.7:1},spawn:new THREE.Vector3(...template.spawn)};this.scenes.set(data.sceneId,cfg);
   // Keep scenery and animation objects, adopt furniture roots by occurrence below.
   cfg.unclaimed=furniture.children.filter(o=>o.userData.furnitureType);this.contexts[data.sceneId]={group:furniture,sceneId:data.sceneId,label:data.name,bounds:template.buildBounds,templateId:data.templateId};
  }Object.assign(cfg,{data,template,label:data.name});const ends=[];for(const portal of snapshot.portals){for(const end of (()=>{const base=portalEnds(snapshot,portal);return [{...base,portalId:portal.portalId||portal.id},...(portal.bidirectional?[{fromSceneId:base.toSceneId,toSceneId:base.fromSceneId,departure:base.landing,landing:base.departure,portalId:portal.portalId||portal.id}]:[])];})())if(end.fromSceneId===data.sceneId)ends.push(end);}
  const linkedSlots=snapshot.portals.flatMap(p=>[p.from,p.to]).filter(e=>e?.sceneId===data.sceneId).map(e=>e.slotId);const signature=JSON.stringify(ends);if(cfg.portalSignature!==signature){cfg.portalSignature=signature;cfg.portals.clear();for(const end of ends){const slot=template.portalSlots.find(s=>s.slotId===(snapshot.portals.find(p=>(p.id||p.portalId)===end.portalId)?.from?.sceneId===data.sceneId?snapshot.portals.find(p=>(p.id||p.portalId)===end.portalId)?.from.slotId:snapshot.portals.find(p=>(p.id||p.portalId)===end.portalId)?.to?.slotId));const door=new THREE.Group();door.position.fromArray(slot?.position||end.departure);door.userData={portalId:end.portalId,walkPortal:end.toSceneId,landing:slot?.landing||end.landing,departure:end.departure};const mat=box(slot?.width||1.2,.025,.8,0xa5b6c1);mat.position.y=.015;door.add(mat);cfg.portals.add(door);}if(!this.legacy[data.sceneId]){if(cfg.shell)cfg.root.remove(cfg.shell);cfg.shell=shell(template,linkedSlots);cfg.root.add(cfg.shell);}else{
   // Newly connected slots also cut actual legacy shell meshes, never opaque doors.
   this.cutLegacyOpenings(cfg,linkedSlots);
  }}
 }
 const ids=new Set(snapshot.entities.map(e=>e.entityId));for(const [id,o]of this.entities)if(!ids.has(id)&&!this.scenes.get(o.userData.worldEntity?.sceneId)?.draft){o.removeFromParent();this.entities.delete(id);}
 for(const entity of snapshot.entities){let object=this.entities.get(entity.entityId);const cfg=this.scenes.get(entity.sceneId);if(!cfg||cfg.draft)continue;const adopted=cfg.furniture.children.find(o=>o.userData.entityId===entity.entityId);if(adopted){object=adopted;this.entities.set(entity.entityId,object);}if(!object){const index=cfg.unclaimed.findIndex(o=>o.userData.furnitureType===entity.type);object=index>=0?cfg.unclaimed.splice(index,1)[0]:this.createFurniture(entity.type);cfg.furniture.add(object);this.entities.set(entity.entityId,object);}if(object.parent!==cfg.furniture)cfg.furniture.add(object);object.userData.entityId=entity.entityId;object.userData.protected=!!entity.protected;object.userData.worldEntity=entity;if(!object.userData.editPreview){object.position.fromArray(entity.position);object.rotation.y=entity.rotation;object.scale.fromArray(entity.scale);}}
 for(const cfg of this.scenes.values()){if(!cfg.draft)for(const object of cfg.furniture.children.filter(o=>o.userData.furnitureType&&!snapshot.entities.some(e=>e.entityId===o.userData.entityId)))object.removeFromParent();for(const object of cfg.unclaimed.splice(0))object.removeFromParent();cfg.refreshLandscape?.();}return this;
 }
 cutLegacyOpenings(cfg,slots){
  for(const object of cfg.cutOriginals||[])object.visible=true;
  for(const object of cfg.cutReplacements||[])object.removeFromParent();
  cfg.cutOriginals=[];cfg.cutReplacements=[];
  cfg.root.updateMatrixWorld(true);
  for(const slotId of slots){
   const slot=cfg.template.portalSlots.find(s=>s.slotId===slotId),alongX=['north','south'].includes(slot.side);
   const along=alongX?'x':'z',across=alongX?'z':'x',boundary=slot.position[alongX?2:0],half=slot.width/2;
   const candidates=[];
   cfg.root.traverse(object=>{
    if(!object.isMesh||!object.visible||object.userData.portalReplacement)return;
    let ancestor=object;while(ancestor&&ancestor!==cfg.root){if(ancestor.userData.furnitureType||ancestor===cfg.portals)return;ancestor=ancestor.parent;}
    const b=new THREE.Box3().setFromObject(object);
    if(b.max.y>.03&&b.min.y<2.1&&b.max.y-b.min.y>.015&&b.min[across]<boundary+.6&&b.max[across]>boundary-.6&&b.min[along]<half&&b.max[along]>-half)candidates.push({object,b});
   });
   for(const {object,b} of candidates){
    object.visible=false;cfg.cutOriginals.push(object);
    const add=(lo,hi,y0,y1)=>{if(hi-lo<.001||y1-y0<.001)return;const size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());size[along]=hi-lo;size.y=y1-y0;center[along]=(lo+hi)/2;center.y=(y0+y1)/2;const replacement=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z),object.material);replacement.position.copy(center);replacement.castShadow=object.castShadow;replacement.receiveShadow=object.receiveShadow;replacement.userData.portalReplacement=true;cfg.root.add(replacement);cfg.cutReplacements.push(replacement);};
    add(b.min[along],Math.min(-half,b.max[along]),b.min.y,b.max.y);
    add(Math.max(half,b.min[along]),b.max[along],b.min.y,b.max.y);
    if(b.max.y>2.1)add(Math.max(-half,b.min[along]),Math.min(half,b.max[along]),2.1,b.max.y);
   }
  }
 }
 applyChanges(events){for(const event of events)if(event.snapshot)this.applySnapshot(event.snapshot);}
 show(sceneId){for(const[id,cfg]of this.scenes)cfg.root.visible=id===sceneId;}
 update(dt,t){for(const cfg of this.scenes.values())if(cfg.root.visible)cfg.update?.(dt,t);}
}
