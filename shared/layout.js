// The historical browser name is an alias, never a second persistent scene.
export const normalizeSceneId = id => id === 'room' ? 'bedroom' : id;
export const furnitureTypes = ['bed','desk','chair','shelf','lamp','bean','table','plant','smallPlant','nightstand','rug','livingSofa','livingTable','livingChair','livingShelf','livingLamp','livingPlant','livingRug','yardPool','yardFarm','yardTree','yardBench','yardLantern','yardFlowers','yardCan','yardSwing','yardPicnicTable','yardUmbrella','yardFlowerBox','yardRoseArch','yardBirdBath','shopBuilding','shopVending','shopLamp','shopCar'];
export function validLayout(data, scene='bedroom') {
  scene=normalizeSceneId(scene);
  const limit=['yard','convenience-store'].includes(scene)?9:3.6;
  return Array.isArray(data) && data.length<=100 && data.every(o =>
    o && furnitureTypes.includes(o.type) && Array.isArray(o.position) && o.position.length===3 &&
    o.position.every(Number.isFinite) && Math.abs(o.position[0])<=limit && Math.abs(o.position[2])<=limit && Math.abs(o.position[1])<=4 &&
    Number.isFinite(o.rotation) && Array.isArray(o.scale) && o.scale.length===3 &&
    o.scale.every(v=>Number.isFinite(v)&&v>0&&v<=4));
}
