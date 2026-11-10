import {PET_BOND_MAX, PET_BOND_HOURLY_CAP} from '../../shared/creatures/stats.js';
import {normalizePetInstance} from '../../shared/creatures/instance.js';
import {normalizeRoster, setFollowPet, setBattlePet} from '../../shared/creatures/roster.js';

const PET_LIMIT=20;
const HOUR_MS=60*60*1000;

function ensurePets(snapshot){
 if(!snapshot.pets||typeof snapshot.pets!=='object'||snapshot.pets.version!==1||!snapshot.pets.owners){
  snapshot.pets={version:1,owners:{}};
 }
 return snapshot.pets;
}

function actorOf(snapshot,actorId){
 const actor=snapshot.actors?.find(entry=>entry.actorId===actorId);
 if(!actor)throw Error('ACTOR_NOT_FOUND');
 return actor;
}

function bucketOf(snapshot,actorId,create=false){
 const pets=ensurePets(snapshot);
 let bucket=pets.owners[actorId];
 if(!bucket&&create){
  bucket={instances:{},roster:{followPetId:null,battlePetId:null},migration:{localVersion:null,importedAt:null}};
  pets.owners[actorId]=bucket;
 }
 return bucket;
}

function ownedPet(snapshot,actorId,petId){
 const bucket=bucketOf(snapshot,actorId,false);
 const pet=bucket?.instances?.[petId];
 if(!pet||pet.ownerId!==actorId)throw Error('PET_NOT_FOUND');
 return pet;
}

export function projectPets(snapshot,actorIds){
 const owners={};
 for(const actorId of actorIds??[]){
  const bucket=snapshot.pets?.owners?.[actorId];
  if(bucket)owners[actorId]=structuredClone(bucket);
 }
 return {version:1,owners};
}

export function hasServerPets(snapshot,actorId){
 return Boolean(snapshot.pets?.owners?.[actorId]?.instances&&Object.keys(snapshot.pets.owners[actorId].instances).length);
}

function bondWindow(pet,now){
 if(!Number.isFinite(pet.bondWindowStart)||now-pet.bondWindowStart>=HOUR_MS){
  pet.bondWindowStart=now;
  pet.bondWindowPoints=0;
 }
}

export const petHandlers={
 'pet.import':({snapshot,command,principal,now,emit})=>{
  if(principal.role!=='owner')throw Error('UNAUTHORIZED');
  const {actorId}=command.payload;
  actorOf(snapshot,actorId);
  const bucket=bucketOf(snapshot,actorId,true);
  if(Object.keys(bucket.instances).length)return {status:'skipped',reason:'already-has-pets'};
  const instances={};
  for(const raw of command.payload.pets.slice(0,PET_LIMIT)){
   const pet=normalizePetInstance({...raw,ownerId:actorId},actorId);
   if(!pet)continue;
   if(instances[pet.petId])continue;
   instances[pet.petId]=pet;
  }
  if(!Object.keys(instances).length)throw Error('NO_VALID_PETS');
  bucket.instances=instances;
  bucket.roster=normalizeRoster({followPetId:command.payload.followPetId??null,battlePetId:command.payload.battlePetId??null},instances,actorId);
  bucket.migration={localVersion:Number.isFinite(command.payload.localVersion)?command.payload.localVersion:3,importedAt:now};
  emit('pets.imported',{actorId,count:Object.keys(instances).length});
  return {status:'imported',count:Object.keys(instances).length,roster:{...bucket.roster}};
 },

 'pet.setMode':({snapshot,command,principal,now,emit})=>{
  if(principal.role!=='owner')throw Error('UNAUTHORIZED');
  const {actorId,petId,mode}=command.payload;
  actorOf(snapshot,actorId);
  const bucket=bucketOf(snapshot,actorId,true);
  const pet=ownedPet(snapshot,actorId,petId);
  if(mode==='follow'){
   bucket.roster=setFollowPet(bucket.roster,petId,bucket.instances,actorId);
  }else{
   if(pet.homeSceneId&&command.payload.homeSceneId)pet.homeSceneId=command.payload.homeSceneId;
   if(Array.isArray(command.payload.homePosition)&&command.payload.homePosition.length===3&&command.payload.homePosition.every(Number.isFinite))pet.homePosition=command.payload.homePosition.slice(0,3);
   if(bucket.roster.followPetId===petId)bucket.roster.followPetId=null;
  }
  emit('pets.mode_changed',{actorId,petId,mode});
  return {petId,mode,roster:{...bucket.roster},homeSceneId:pet.homeSceneId,homePosition:pet.homePosition};
 },

 'pet.setBattle':({snapshot,command,principal,now,emit})=>{
  if(principal.role!=='owner')throw Error('UNAUTHORIZED');
  const {actorId,petId}=command.payload;
  actorOf(snapshot,actorId);
  const bucket=bucketOf(snapshot,actorId,true);
  if(petId)ownedPet(snapshot,actorId,petId);
  bucket.roster=setBattlePet(bucket.roster,petId??null,bucket.instances,actorId);
  emit('pets.battle_changed',{actorId,petId:bucket.roster.battlePetId});
  return {petId:bucket.roster.battlePetId,roster:{...bucket.roster}};
 },

 'pet.pet':({snapshot,command,principal,now,emit})=>{
  if(principal.role!=='owner')throw Error('UNAUTHORIZED');
  const {actorId,petId}=command.payload;
  actorOf(snapshot,actorId);
  const pet=ownedPet(snapshot,actorId,petId);
  if(pet.bond>=PET_BOND_MAX)return {ok:false,reason:'max',bond:pet.bond,evolved:pet.evolved};
  bondWindow(pet,now);
  if(pet.bondWindowPoints>=PET_BOND_HOURLY_CAP)return {ok:false,reason:'hourly-cap',bond:pet.bond,evolved:pet.evolved};
  pet.bond=Math.min(PET_BOND_MAX,pet.bond+1);
  pet.bondWindowPoints+=1;
  emit('pets.petted',{actorId,petId,bond:pet.bond});
  return {ok:true,gain:1,bond:pet.bond,evolved:pet.evolved,readyToEvolve:pet.bond>=PET_BOND_MAX&&!pet.evolved};
 },

 'pet.evolve':({snapshot,command,principal,now,emit})=>{
  if(principal.role!=='owner')throw Error('UNAUTHORIZED');
  const {actorId,petId}=command.payload;
  actorOf(snapshot,actorId);
  const pet=ownedPet(snapshot,actorId,petId);
  if(pet.bond<PET_BOND_MAX)return {ok:false,reason:'not-ready'};
  if(pet.evolved)return {ok:false,reason:'already-evolved'};
  pet.evolved=true;
  emit('pets.evolved',{actorId,petId});
  return {ok:true,evolved:true};
 },
};
