import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import characterConfig from './character-config.js';

const templates = new Map();
export const WEB_CHARACTER_FILE = 'Dafeiyu-web-v1.glb';

export function characterModelUrl(file = 'Dafeiyu.glb') {
  const name = file === 'Dafeiyu.glb' ? WEB_CHARACTER_FILE : file;
  return new URL(characterConfig.modelBase + encodeURIComponent(name),
    globalThis.document?.baseURI || globalThis.location?.href || 'http://127.0.0.1/').href;
}

export function loadCharacterTemplate(file = 'Dafeiyu.glb', load = url => new GLTFLoader().loadAsync(url)) {
  const url = characterModelUrl(file);
  if (!templates.has(url)) {
    const promise = Promise.resolve().then(() => load(url)).catch(error => {
      if (templates.get(url) === promise) templates.delete(url);
      throw error;
    });
    templates.set(url, promise);
  }
  return templates.get(url);
}

export async function loadCharacterInstance(file = 'Dafeiyu.glb') {
  const asset = await loadCharacterTemplate(file);
  const scene = clone(asset.scene);
  const materials = new Map();
  scene.traverse(node => {
    if (!node.isMesh) return;
    const owned = material => {
      if (!materials.has(material)) materials.set(material, material.clone());
      return materials.get(material);
    };
    if (Array.isArray(node.material)) node.material = node.material.map(owned);
    else if (node.material) node.material = owned(node.material);
  });
  return { ...asset, scene, animations: asset.animations.map(clip => clip.clone()) };
}
