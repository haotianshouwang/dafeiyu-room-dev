import {furnitureTypes} from '../layout.js';
// Conservative full base footprints in metres, before scale and Y rotation.
const sizes={shopBuilding:[6.45,5.2],shopVending:[1.02,1.1],shopLamp:[1.55,.5],shopCar:[2.4,1.2],bed:[2.5,3.8],desk:[2,.9],chair:[.65,.65],shelf:[1.2,.5],lamp:[.5,.5],bean:[1.2,1.2],table:[1.1,1.1],plant:[.7,1.1],smallPlant:[.4,.4],nightstand:[.65,.65],rug:[3.7,3],livingSofa:[2.6,1.3],livingTable:[1.8,1],livingChair:[.9,.9],livingShelf:[1.6,.5],livingLamp:[.6,.6],livingPlant:[.8,.8],livingRug:[4.2,3.2],yardPool:[8.2,4.2],yardFarm:[4.35,4.35],yardTree:[1.9,1.6],yardBench:[2,.8],yardLantern:[1.1,1.1],yardFlowers:[6.1,.6],yardCan:[.6,.4],yardSwing:[2.9,2.6],yardPicnicTable:[2.3,2.2],yardUmbrella:[2.8,2.8],yardFlowerBox:[1.5,.8],yardRoseArch:[2.2,1],yardBirdBath:[1,1]};
// Heights are actual top faces (centre Y + half thickness). Bounds are conservative
// free rectangles on the top face, excluding built-in laptop/books/cups/lamp/fishbowl.
// Bounds use asset-local X/Z, not offsets from the support anchor. A child must fit fully.
const labels={shopBuilding:'便利店',shopVending:'自动售货机',shopLamp:'街道路灯',shopCar:'小汽车',yardSwing:'秋千',yardPicnicTable:'野餐桌',yardUmbrella:'遮阳伞',yardFlowerBox:'花箱',yardRoseArch:'花拱门',yardBirdBath:'鸟浴盆'};
const surfaces={
 yardPicnicTable:{y:.805,bounds:{x0:-.8,x1:.8,z0:-.35,z1:.35}},
 desk:{y:.79,bounds:{x0:.15,x1:.5,z0:-.25,z1:.25}},
 nightstand:{y:.52,bounds:{x0:-.20,x1:.20,z0:.12,z1:.18}},
 table:{y:.545,bounds:{x0:-.12,x1:.12,z0:-.25,z1:-.22}},
 livingTable:{y:.455,bounds:{x0:-.80,x1:.80,z0:-.40,z1:-.25}},
};
function entry(type){
 const [width,depth]=sizes[type];const rug=/rug/i.test(type);const seat=/chair|sofa|bench|bean/i.test(type)||type==='yardSwing';const surface=surfaces[type];const actions=seat?['sit']:type==='bed'?['sleep']:type==='yardPool'?['swim','slide']:[];
 return {type,...(labels[type]?{label:labels[type]}:{}),version:1,sceneKinds:(type.startsWith('yard')||type.startsWith('shop'))?['outdoor']:['indoor','outdoor'],footprint:{shape:'rectangle',width,depth,blocking:!rug},scale:{min:.5,max:2,uniform:true},placement:type==='smallPlant'?'ground-or-support':'ground',supportRequired:false,actions,anchors:[{anchorId:'approach',kind:'approach',position:[0,0,depth/2+.5]},...(actions.length?[{anchorId:'interaction',kind:actions[0],position:type==='bed'?[.1,.84,.8]:[0,type==='yardSwing'?.64:type==='chair'?.54:seat?.45:0,0]}]:[]),...(surface?[{anchorId:'surface',kind:'support',position:[0,surface.y,0],bounds:surface.bounds,capacity:1}]:[])],protected:type==='yardFarm',source:{kind:'procedural',license:'MIT'}};
}
const catalog=Object.fromEntries(furnitureTypes.map(t=>[t,entry(t)]));
export const ASSET_TYPES=Object.freeze([...furnitureTypes]);
export function getCatalogEntry(type){if(!Object.hasOwn(catalog,type))throw new RangeError(`Unknown asset: ${type}`);return structuredClone(catalog[type]);}
export function listCatalog(){return ASSET_TYPES.map(getCatalogEntry);}
