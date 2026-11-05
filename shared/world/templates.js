import {COASTAL_ZONES,COASTAL_LANDMARKS} from './coastal.js';
import {STREET_HOME} from './street-home.js';
// All geometry is in scene-local coordinates. Slots drive BOTH visual and navigation openings.
const rect=(x0,x1,z0,z1)=>({x0,x1,z0,z1});
function template(id,kind,r){
 const slots=[['north',0,-r,0,1],['south',0,r,0,-1],['west',-r,0,1,0],['east',r,0,-1,0]].map(([slotId,x,z,nx,nz])=>({slotId,side:slotId,position:[x,0,z],inwardNormal:[nx,0,nz],width:1.2,landing:[x+nx*1.4,0,z+nz*1.4],trigger:rect(x-.45,x+.45,z-.45,z+.45),clearance:rect(x+(nx?Math.min(0,nx*1.8):-.8),x+(nx?Math.max(0,nx*1.8):.8),z+(nz?Math.min(0,nz*1.8):-.8),z+(nz?Math.max(0,nz*1.8):.8))}));
 return {templateId:id,version:1,kind,groundY:0,bounds:rect(-r,r,-r,r),buildBounds:rect(-r+.2,r-.2,-r+.2,r-.2),maxEntities:100,spawn:[1,0,1],spawnClearance:rect(.5,1.5,.5,1.5),portalAppearance:kind==='indoor'?'door':'gate',portalSlots:slots,regions:[{zoneId:'activity',purpose:'activity',bounds:rect(-r/2,r/2,-r/2,r/2)},{zoneId:'wall',purpose:'wall',bounds:rect(-r+.2,-r+.9,-r+.2,r-.2)},{zoneId:'decoration',purpose:'decoration',bounds:rect(r-.9,r-.2,-r+.2,r-.2)},...slots.map(s=>({zoneId:`entry-${s.slotId}`,purpose:'entry-clearance',bounds:s.clearance})),{zoneId:'passage',purpose:'passage',bounds:rect(-.6,.6,-r,r)}],allowedStyles:['cozy','natural'],protectedRegions:[]};
}
const templates={cozy_room_v1:template('cozy_room_v1','indoor',3.6),courtyard_v1:template('courtyard_v1','outdoor',8.5),street_corner_v1:template('street_corner_v1','outdoor',6.5)};
templates.street_corner_v1.staticColliders=STREET_HOME.colliders;templates.street_corner_v1.legacyDoorNormal=STREET_HOME.inwardNormal;
for(const slot of templates.street_corner_v1.portalSlots){
 if(slot.slotId==='north')Object.assign(slot,{position:[5.2,0,-6.5],landing:[5.2,0,-5.55],width:1.4,trigger:rect(4.5,5.9,-6.5,-5.1),clearance:rect(4.5,5.9,-6.5,-5.2)});
 if(slot.slotId==='east')Object.assign(slot,{position:[6.5,0,3],landing:[5.55,0,3],width:1.4,trigger:rect(5.1,6.5,2.3,3.7),clearance:rect(5.2,6.5,2.45,3.7)});
}
templates.street_corner_v1.spawn=[0,0,2.4];templates.street_corner_v1.spawnClearance=rect(-.5,.5,1.9,2.9);
templates.coastal_town_v1=template('coastal_town_v1','outdoor',12);
Object.assign(templates.coastal_town_v1,{spawn:[-10,2,-2],spawnClearance:rect(-10.5,-9.5,-2.5,-1.5),regions:COASTAL_ZONES,landmarks:COASTAL_LANDMARKS});
templates.coastal_town_v1.portalSlots=[{slotId:'west',side:'west',position:[-12,2,-2],inwardNormal:[1,0,0],width:3,landing:[-10,2,-2],trigger:rect(-12,-10,-3.5,-.5),clearance:rect(-12,-9,-3.5,-.5)}];
export const TEMPLATE_IDS=Object.keys(templates);
export function getTemplate(id){if(!Object.hasOwn(templates,id))throw new RangeError(`Unknown template: ${id}`);return structuredClone(templates[id]);}
export function listTemplates(){return TEMPLATE_IDS.map(getTemplate);}
export function checkpointTemplates(){const saved={...templates},ids=[...TEMPLATE_IDS];return()=>{for(const key of Object.keys(templates))delete templates[key];Object.assign(templates,saved);TEMPLATE_IDS.splice(0,TEMPLATE_IDS.length,...ids);};}

export function registerLocalTemplate(definition){
 if(!/^local_[a-z0-9_]+$/.test(definition.templateId)||definition.kind!=='outdoor')throw Error('INVALID_LOCAL_TEMPLATE');
 templates[definition.templateId]=structuredClone(definition);if(!TEMPLATE_IDS.includes(definition.templateId))TEMPLATE_IDS.push(definition.templateId);
}
