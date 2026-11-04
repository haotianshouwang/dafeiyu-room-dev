import {furnitureTypes} from '../layout.js';
// Conservative full base footprints in metres, before scale and Y rotation.
const sizes={bed:[2.5,3.8],desk:[2,.9],chair:[.65,.65],shelf:[1.2,.5],lamp:[.5,.5],bean:[1.2,1.2],table:[1.1,1.1],plant:[.7,1.1],smallPlant:[.4,.4],nightstand:[.65,.65],rug:[3.7,3],livingSofa:[2.6,1.3],livingTable:[1.8,1],livingChair:[.9,.9],livingShelf:[1.6,.5],livingLamp:[.6,.6],livingPlant:[.8,.8],livingRug:[4.2,3.2],yardPool:[8.2,4.2],yardFarm:[4.35,4.35],yardTree:[1.9,1.6],yardBench:[2,.8],yardLantern:[1.1,1.1],yardFlowers:[6.1,.6],yardCan:[.6,.4]};
// Heights are actual top faces (centre Y + half thickness). Bounds are conservative
// free rectangles on the top face, excluding built-in laptop/books/cups/lamp/fishbowl.
// Bounds use asset-local X/Z, not offsets from the support anchor. A child must fit fully.
const surfaces={
 desk:{y:.79,bounds:{x0:.15,x1:.5,z0:-.25,z1:.25}},
 nightstand:{y:.52,bounds:{x0:-.20,x1:.20,z0:.12,z1:.18}},
 table:{y:.545,bounds:{x0:-.12,x1:.12,z0:-.25,z1:-.22}},
 livingTable:{y:.455,bounds:{x0:-.80,x1:.80,z0:-.40,z1:-.25}},
};
function entry(type){
 const [width,depth]=sizes[type];const rug=/rug/i.test(type);const seat=/chair|sofa|bench|bean/i.test(type);const surface=surfaces[type];const actions=seat?['sit']:type==='bed'?['sleep']:type==='yardPool'?['swim','slide']:[];
 return {type,version:1,sceneKinds:type.startsWith('yard')?['outdoor']:['indoor','outdoor'],footprint:{shape:'rectangle',width,depth,blocking:!rug},scale:{min:.5,max:2,uniform:true},placement:type==='smallPlant'?'ground-or-support':'ground',supportRequired:false,actions,anchors:[{anchorId:'approach',kind:'approach',position:[0,0,depth/2+.5]},...(actions.length?[{anchorId:'interaction',kind:actions[0],position:type==='bed'?[.21,.84,.24]:[0,seat?.45:0,0]}]:[]),...(surface?[{anchorId:'surface',kind:'support',position:[0,surface.y,0],bounds:surface.bounds,capacity:1}]:[])],protected:type==='yardFarm',source:{kind:'procedural',license:'MIT'}};
}
const catalog=Object.fromEntries(furnitureTypes.map(t=>[t,entry(t)]));
export const ASSET_TYPES=Object.freeze([...furnitureTypes]);
export function getCatalogEntry(type){if(!Object.hasOwn(catalog,type))throw new RangeError(`Unknown asset: ${type}`);return structuredClone(catalog[type]);}
export function listCatalog(){return ASSET_TYPES.map(getCatalogEntry);}
