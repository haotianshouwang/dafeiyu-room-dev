import * as THREE from 'three';
import {SceneRegistry} from '../world/registry.js';
import {buildRoom} from '../world/room.js';
import {buildProps,createFurniture} from '../world/props.js';
import {buildLiving} from '../world/living.js';
import {buildYard} from '../world/yard.js';
import {getTemplate} from '../../shared/world/templates.js';

export function mapProjection(bounds,width,height,padding=1.08) {
  const cx=(bounds.x0+bounds.x1)/2,cz=(bounds.z0+bounds.z1)/2;
  const scale=Math.min(width/((bounds.x1-bounds.x0)*padding),height/((bounds.z1-bounds.z0)*padding));
  return {cx,cz,spanX:width/scale,spanZ:height/scale,
    point(position){return [width/2+(position[0]-cx)*scale,height/2+(position[2]-cz)*scale];}};
}

// One cached orthographic render; live player markers never trigger a 3D render.
export function createSceneMapRenderer({renderer,registry,getSnapshot}) {
  const mapScene=new THREE.Scene(),cache=new Map();
  mapScene.add(new THREE.HemisphereLight(0xffffff,0x7c8c77,2.1));
  const sun=new THREE.DirectionalLight(0xfff6dc,2.6);sun.position.set(-20,60,-30);mapScene.add(sun);
  const camera=new THREE.OrthographicCamera();camera.up.set(0,0,-1);
  let context='',scratch=null,scratchKey='',disposed=false;
  const clearScratch=()=>{if(scratch){for(const [id,cfg] of scratch.scenes){cfg.draft=false;scratch.unload(id);}scratch=null;}scratchKey='';};
  const clear=()=>{cache.clear();clearScratch();};
  function fallbackRoot(entry,state) {
    const id=entry.id||'map-forest-preview',key=JSON.stringify([state.contextKey,id,state.layoutRevision,state.topologyRevision]);
    if(scratchKey!==key){
      clearScratch();
      scratch=new SceneRegistry({scene:mapScene,createFurniture,lazy:true,legacy:{
        bedroom:()=>{const room=buildRoom(),props=buildProps(),root=new THREE.Group();root.add(room.group,props.group);return {root,furniture:props.group};},
        living:()=>{const living=buildLiving();return {root:living.group,furniture:living.group};},
        yard:()=>{const yard=buildYard();return {root:yard.group,furniture:yard.group,refreshLandscape:yard.refreshLandscape};}
      }});
      const original=getSnapshot(),hasScene=original.scenes?.some(scene=>scene.sceneId===id),snapshot={...original,_contextKey:key,
        scenes:hasScene?original.scenes:[...original.scenes,{sceneId:id,name:'森林',templateId:'forest_v1',status:'active'}],
        actors:[{...(original.actors?.[0]||{}),sceneId:id,position:getTemplate(entry.templateId).spawn}]};
      scratch.applySnapshot(snapshot);scratch.show(id);scratchKey=key;
    }
    return scratch.scenes.get(id)?.root;
  }
  return {
    capture(entry,state,width=1000,height=640) {
      if(disposed||!entry)return null;
      if(context!==state.contextKey){clear();context=state.contextKey;}
      const template=entry.template||getTemplate(entry.templateId),bounds=entry.bounds||template.bounds;
      const live=registry.scenes.get(entry.id),isResident=live?.loaded||live?.shell;
      const key=JSON.stringify([context,entry.id,entry.templateId,state.layoutRevision,state.topologyRevision,width,height]);
      const previous=cache.get(key);
      const signature=source=>{let ready=0,pending=0;source?.traverse(object=>{if(object.userData.assetState==='ready')ready++;if(object.userData.assetState==='loading')pending++;});return [ready,pending].join(':');};
      if(previous){
        if(isResident&&previous.sourceId===live.root.uuid&&previous.signature===signature(live.root))return previous;
        if(!isResident&&(!previous.pending||performance.now()-previous.capturedAt<2000))return previous;
      }
      const source=isResident?live.root:fallbackRoot(entry,state);
      if(!source)return null;
      let ready=0,pending=0;source.traverse(object=>{if(object.userData.assetState==='ready')ready++;if(object.userData.assetState==='loading')pending++;});
      const projection=mapProjection(bounds,width,height),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      camera.left=-projection.spanX/2;camera.right=projection.spanX/2;camera.top=projection.spanZ/2;camera.bottom=-projection.spanZ/2;
      camera.near=.1;camera.far=1000;camera.position.set(projection.cx,400,projection.cz);camera.lookAt(projection.cx,0,projection.cz);camera.updateProjectionMatrix();
      mapScene.background=new THREE.Color(template.kind==='indoor'?0xbec5b6:template.templateId==='forest_v1'?0x739877:0x9bb8a4);
      // Clone only the object graph. The live scene retains ownership of its GPU assets.
      const copy=source.clone(true);copy.visible=true;mapScene.add(copy);
      const hidden=[];for(const child of mapScene.children)if(child!==copy&&!child.isLight){hidden.push([child,child.visible]);child.visible=false;}
      if(template.kind==='indoor')copy.traverse(object=>{if(/roof|ceiling/i.test(object.name)||object.userData.mapHidden)object.visible=false;});
      const target=new THREE.WebGLRenderTarget(width,height,{depthBuffer:true});
      target.texture.colorSpace=THREE.SRGBColorSpace;
      const oldTarget=renderer.getRenderTarget(),oldViewport=renderer.getViewport(new THREE.Vector4()),oldScissor=renderer.getScissor(new THREE.Vector4()),oldScissorTest=renderer.getScissorTest(),oldAutoClear=renderer.autoClear,oldShadows=renderer.shadowMap.enabled;
      try{
        renderer.autoClear=true;renderer.shadowMap.enabled=false;renderer.setRenderTarget(target);renderer.setViewport(0,0,width,height);renderer.setScissorTest(false);
        renderer.render(mapScene,camera);
        const pixels=new Uint8Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
        const ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height),stride=width*4;
        for(let y=0;y<height;y++)image.data.set(pixels.subarray((height-1-y)*stride,(height-y)*stride),y*stride);ctx.putImageData(image,0,0);
      }finally{
        renderer.setRenderTarget(oldTarget);renderer.setViewport(oldViewport);renderer.setScissor(oldScissor);renderer.setScissorTest(oldScissorTest);renderer.autoClear=oldAutoClear;renderer.shadowMap.enabled=oldShadows;
        copy.removeFromParent();for(const [child,visible]of hidden)child.visible=visible;target.dispose();
      }
      const value={canvas,projection,bounds,template,sourceId:isResident?source.uuid:null,signature:ready+':'+pending,pending,capturedAt:performance.now()};cache.set(key,value);while(cache.size>32)cache.delete(cache.keys().next().value);return value;
    },
    clear,dispose(){disposed=true;clear();}
  };
}
