import {getSpecies} from './species.js';
import {PET_BOND_MAX} from './stats.js';

export const PET_LEVEL_MAX=50;
export const PET_SKILL_SLOT_MAX=4;

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const int=(value,fallback=0)=>Number.isFinite(Number(value))?Math.trunc(Number(value)):fallback;

export function defaultSkills(speciesId){
 return [...getSpecies(speciesId).defaultLoadout].slice(0,PET_SKILL_SLOT_MAX);
}

export function normalizeSkills(speciesId,learned,loadout){
 const pool=new Set(getSpecies(speciesId).skillPool);
 const learnedSkills=[...new Set((Array.isArray(learned)?learned:[]).filter(id=>pool.has(id)))];
 if(!learnedSkills.length)learnedSkills.push(...defaultSkills(speciesId));
 const loadoutSkills=[...new Set((Array.isArray(loadout)?loadout:[]).filter(id=>learnedSkills.includes(id)))].slice(0,PET_SKILL_SLOT_MAX);
 return {learnedSkills,skillLoadout:loadoutSkills.length?loadoutSkills:learnedSkills.slice(0,PET_SKILL_SLOT_MAX)};
}

export function createPetInstance({
 petId='pet-baize',ownerId='actor-1',speciesId='baize',nickname=null,
 level=1,exp=0,bond=0,evolved=false,homeSceneId='yard',homePosition=null,now=Date.now(),
 learnedSkills=null,skillLoadout=null,bondWindowStart=null,bondWindowPoints=0,
}={}){
 const species=getSpecies(speciesId);
 const skills=normalizeSkills(speciesId,learnedSkills,skillLoadout);
 return {
  petId,ownerId,speciesId,
  nickname:nickname||species.name,
  level:clamp(int(level,1),1,PET_LEVEL_MAX),
  exp:Math.max(0,int(exp,0)),
  bond:clamp(int(bond,0),0,PET_BOND_MAX),
  evolved:Boolean(evolved),
  learnedSkills:skills.learnedSkills,
  skillLoadout:skills.skillLoadout,
  homeSceneId:typeof homeSceneId==='string'&&homeSceneId?homeSceneId:'yard',
  homePosition:Array.isArray(homePosition)&&homePosition.length>=3&&homePosition.slice(0,3).every(Number.isFinite)
   ?homePosition.slice(0,3).map(value=>Math.round(value*1000)/1000):null,
  bondWindowStart:Number.isFinite(bondWindowStart)?bondWindowStart:(Number.isFinite(now)?now:Date.now()),
  bondWindowPoints:Math.max(0,int(bondWindowPoints,0)),
  createdAt:Number.isFinite(now)?now:Date.now(),
 };
}

export function normalizePetInstance(raw,ownerId){
 if(!raw||typeof raw!=='object')return null;
 const speciesId=typeof raw.speciesId==='string'&&getSpecies(raw.speciesId).id===raw.speciesId?raw.speciesId:null;
 if(!speciesId)return null;
 const petId=typeof raw.petId==='string'&&raw.petId?raw.petId:null;
 if(!petId)return null;
 return createPetInstance({
  petId,ownerId:raw.ownerId||ownerId,speciesId,
  nickname:typeof raw.nickname==='string'&&raw.nickname?raw.nickname.slice(0,24):null,
  level:int(raw.level,1),exp:int(raw.exp,0),bond:int(raw.bond,0),evolved:Boolean(raw.evolved),
  learnedSkills:raw.learnedSkills,skillLoadout:raw.skillLoadout,
  homeSceneId:raw.homeSceneId,homePosition:raw.homePosition,now:raw.createdAt,
  learnedSkills:raw.learnedSkills,skillLoadout:raw.skillLoadout,
  bondWindowStart:raw.bondWindowStart,bondWindowPoints:raw.bondWindowPoints,
 });
}

export function grantExp(instance,amount){
 const pet=instance;
 pet.exp=Math.max(0,pet.exp+Math.max(0,Math.floor(amount)));
 while(pet.level<PET_LEVEL_MAX&&pet.exp>=levelExp(pet.level)){
  pet.exp-=levelExp(pet.level);
  pet.level+=1;
 }
 return pet;
}

export function levelExp(level){return 20+Math.max(0,level-1)*15;}

export function canEvolve(instance){
 return instance.bond>=PET_BOND_MAX&&!instance.evolved;
}

export function evolveInstance(instance){
 if(!canEvolve(instance))return false;
 instance.evolved=true;
 return true;
}
