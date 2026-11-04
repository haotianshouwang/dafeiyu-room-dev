import {createHash} from 'node:crypto';
import {defaultManifest as builtIn,farmPlots} from '../../shared/world/default-manifest.js';
import {getTemplate} from '../../shared/world/templates.js';
import {validLayout,normalizeSceneId} from '../../shared/layout.js';
export {normalizeSceneId} from '../../shared/layout.js';
export const SCHEMA_VERSION=1;
export function migrateWorld(db,{defaultManifest=builtIn}={}){
 db.exec('BEGIN IMMEDIATE');
 try {
  db.exec(`CREATE TABLE IF NOT EXISTS world_schema(version INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS worlds(world_id TEXT PRIMARY KEY,schema_version INTEGER NOT NULL,layout_revision INTEGER NOT NULL,snapshot TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS command_results(subject_id TEXT NOT NULL,world_id TEXT NOT NULL,request_id TEXT NOT NULL,command TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(subject_id,world_id,request_id));
   CREATE TABLE IF NOT EXISTS events(cursor INTEGER PRIMARY KEY AUTOINCREMENT,world_id TEXT NOT NULL,kind TEXT NOT NULL,subject_id TEXT,change_id TEXT,created_at INTEGER NOT NULL,data TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS events_world_cursor ON events(world_id,cursor);`);
  const version=db.prepare('SELECT version FROM world_schema').get()?.version;
  if(version && version!==SCHEMA_VERSION)throw Error('UNSUPPORTED_SCHEMA_VERSION');
  const worldId=defaultManifest.worldId;
  if(db.prepare('SELECT 1 FROM worlds WHERE world_id=?').get(worldId)){db.exec('COMMIT');return {schemaVersion:SCHEMA_VERSION,worldId,imported:false};}
  const hasLegacy=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='layouts'").get();
  const rows=hasLegacy?db.prepare('SELECT * FROM layouts ORDER BY id').all():[];
  const scenes=[],entities=[],warnings=[];
  for(const scene of defaultManifest.scenes){
   const sceneId=normalizeSceneId(scene.sceneId);getTemplate(scene.templateId);
   const row=rows.find(r=>r.id===sceneId)||rows.find(r=>normalizeSceneId(r.id)===sceneId);
   const layout=row?JSON.parse(row.layout):scene.entities;
   if(!validLayout(layout,sceneId))throw Error(`INVALID_LEGACY_LAYOUT:${sceneId}`);
   scenes.push({sceneId,name:scene.name,templateId:scene.templateId,status:'active',legacyRevision:row?.revision||0});
   layout.forEach((entity,index)=>{
    const entityId=`${sceneId}-${index+1}`;
    const value={entityId,sceneId,type:entity.type,position:[...entity.position],rotation:entity.rotation,scale:[...entity.scale],legacy:true};
    // Identity is assigned by occurrence, never by furniture type or transform.
    value.entityId=entityId;value.sceneId=sceneId;
    if(value.type==='yardFarm'){value.protected=true;value.plots=structuredClone(farmPlots);value.protectionFingerprint=createHash('sha256').update(JSON.stringify({position:value.position,rotation:value.rotation,scale:value.scale,plots:value.plots})).digest('hex');}
    entities.push(value);
   });
   if(row)warnings.push({sceneId,code:'LEGACY_LAYOUT_PRESERVED',message:'历史布局原样保留，空间冲突待建设规则检查。'});
  }
  const snapshot={schemaVersion:SCHEMA_VERSION,rulesVersion:1,worldId,layoutRevision:0,topologyRevision:0,scenes,entities,portals:structuredClone(defaultManifest.portals||[]),actors:structuredClone(defaultManifest.actors||[]),warnings};
  db.prepare('INSERT INTO worlds VALUES(?,?,?,?)').run(worldId,SCHEMA_VERSION,0,JSON.stringify(snapshot));
  if(!version)db.prepare('INSERT INTO world_schema VALUES(?)').run(SCHEMA_VERSION);
  db.exec('COMMIT');return {schemaVersion:SCHEMA_VERSION,worldId,imported:true,entityCount:entities.length,warnings};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
