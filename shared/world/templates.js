// All geometry is in scene-local coordinates. Slots drive BOTH visual and navigation openings.
const rect=(x0,x1,z0,z1)=>({x0,x1,z0,z1});
function template(id,kind,r){
 const slots=[['north',0,-r,0,1],['south',0,r,0,-1],['west',-r,0,1,0],['east',r,0,-1,0]].map(([slotId,x,z,nx,nz])=>({slotId,side:slotId,position:[x,0,z],inwardNormal:[nx,0,nz],width:1.2,landing:[x+nx*1.4,0,z+nz*1.4],trigger:rect(x-.45,x+.45,z-.45,z+.45),clearance:rect(x+(nx?Math.min(0,nx*1.8):-.8),x+(nx?Math.max(0,nx*1.8):.8),z+(nz?Math.min(0,nz*1.8):-.8),z+(nz?Math.max(0,nz*1.8):.8))}));
 return {templateId:id,version:1,kind,groundY:0,bounds:rect(-r,r,-r,r),buildBounds:rect(-r+.2,r-.2,-r+.2,r-.2),maxEntities:100,spawn:[1,0,1],spawnClearance:rect(.5,1.5,.5,1.5),portalAppearance:kind==='indoor'?'door':'gate',portalSlots:slots,regions:[{zoneId:'activity',purpose:'activity',bounds:rect(-r/2,r/2,-r/2,r/2)},{zoneId:'wall',purpose:'wall',bounds:rect(-r+.2,-r+.9,-r+.2,r-.2)},{zoneId:'decoration',purpose:'decoration',bounds:rect(r-.9,r-.2,-r+.2,r-.2)},...slots.map(s=>({zoneId:`entry-${s.slotId}`,purpose:'entry-clearance',bounds:s.clearance})),{zoneId:'passage',purpose:'passage',bounds:rect(-.6,.6,-r,r)}],allowedStyles:['cozy','natural'],protectedRegions:[]};
}
const templates={cozy_room_v1:template('cozy_room_v1','indoor',3.6),courtyard_v1:template('courtyard_v1','outdoor',8.5),street_corner_v1:template('street_corner_v1','outdoor',6.5)};
templates.street_corner_v1.spawn=[0,0,2.4];templates.street_corner_v1.spawnClearance=rect(-.5,.5,1.9,2.9);
export const TEMPLATE_IDS=Object.freeze(Object.keys(templates));
export function getTemplate(id){if(!Object.hasOwn(templates,id))throw new RangeError(`Unknown template: ${id}`);return structuredClone(templates[id]);}
export function listTemplates(){return TEMPLATE_IDS.map(getTemplate);}
