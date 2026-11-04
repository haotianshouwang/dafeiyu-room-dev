import {installStreetHomeEntrance} from './world/street-home-feature.js';
import {installStoreLights} from './world/store-lighting.js';
import {installStoreScene} from './world/store-feature.js';
import {installAudio} from './audio/playback.js';
import Fastify from 'fastify';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateWorld } from './storage/migrations.js';
import { WorldService } from './world/service.js';
import { validLayout } from '../shared/layout.js';
import {installAuth} from './auth/routes.js';
import {installMcp} from './mcp/server.js';
import {installMcpIntegration} from './integrations/mcp.js';
import {projectSnapshot} from './mcp/resources.js';
import {createRuntimeHandlers,WorldRuntime} from './world/runtime.js';
import {createBuildHandlers} from './world/build.js';

export async function buildServer({ databasePath, serveStatic = false, logger = false, worldMode = false, resolvePrincipal, worldHandlers = {}, auth = {}, mcpExtensions = {}, startRuntime = true } = {}) {
  const root=fileURLToPath(new URL('../',import.meta.url));
  const filename=databasePath || path.join(root,'data','game.sqlite');
  if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS layouts (id TEXT PRIMARY KEY, layout TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)');
  if(worldMode)migrateWorld(db);
  const migrated=Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='worlds'").get() && db.prepare('SELECT 1 FROM worlds LIMIT 1').get());
  const worldService=migrated?new WorldService(db,{handlers:{...createRuntimeHandlers(),...createBuildHandlers(),...worldHandlers}}):null;
  if(worldMode&&worldService){installStoreScene(worldService);installStoreLights(worldService);installStreetHomeEntrance(worldService);}
  const app=Fastify({logger,bodyLimit:6*1024*1024});
  app.decorate('worldService',worldService);
  const authService=worldService?installAuth(app,db,worldService,auth):null;
  app.decorate('auth',authService);
  if(authService){const audio=installAudio(app,authService);app.decorate('audioPlayback',audio);mcpExtensions={audio_play:({principal,worldId,args})=>audio.play(principal,worldId,args),audio_get_status:({principal,worldId,args})=>audio.public(audio.get(principal,worldId,args.playbackId)),audio_stop:({principal,worldId,args})=>audio.stop(principal,worldId,args.playbackId),...mcpExtensions};installMcp(app,worldService,authService,{extensions:mcpExtensions});installMcpIntegration(app,authService);}
  const runtime=worldService&&startRuntime?new WorldRuntime(worldService).start():null;
  app.addHook('onClose',async()=>runtime?.stop());
  app.addHook('onClose',async()=>db.close());
  // Local single-player service: disallow cross-origin browser writes.
  app.addHook('onRequest',async(req,reply)=>{
    if(['POST','PUT','DELETE','PATCH'].includes(req.method) && req.headers.origin) {
      try { if(new URL(req.headers.origin).host!==req.headers.host)return reply.code(403).send({error:'Origin not allowed'}); }
      catch {return reply.code(403).send({error:'Origin not allowed'});}
    }
  });
  app.get('/api/health',async()=>({ok:true}));
  const read=db.prepare('SELECT layout, revision, updated_at FROM layouts WHERE id=?');
  app.get('/api/layout/:scene',async(req,reply)=>{
    if(!['bedroom','living','yard'].includes(req.params.scene))return reply.code(404).send({error:'Unknown scene'});
    if(authService&&!resolvePrincipal){try{authService.resolvePrincipal(req);}catch{return reply.code(401).send({error:'UNAUTHORIZED'});}}
    const row=read.get(req.params.scene);
    return row?{layout:JSON.parse(row.layout),revision:row.revision,updatedAt:row.updated_at}:{layout:null,revision:0,updatedAt:null};
  });
  app.put('/api/layout/:scene',async(req,reply)=>{
    if(!['bedroom','living','yard'].includes(req.params.scene))return reply.code(404).send({error:'Unknown scene'});
    if(authService&&!resolvePrincipal){try{authService.resolvePrincipal(req);}catch(error){return reply.code(error.message==='CSRF_REQUIRED'?403:401).send({error:error.message,...(error.details?{details:error.details}:{})});}}
    const {layout,revision}=req.body||{};
    if(!validLayout(layout,req.params.scene)||!Number.isSafeInteger(revision)||revision<0)return reply.code(400).send({error:'Invalid layout or revision'});
    if(migrated)return reply.code(409).send({error:'WORLD_MIGRATED',status:'draft',draft:{sceneId:req.params.scene,layout,legacyRevision:revision},message:'旧布局仅保留为待合并草稿，请通过世界建设预览提交。'});
    const updatedAt=new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      const current=read.get(req.params.scene);
      if((current?.revision||0)!==revision){db.exec('ROLLBACK');return reply.code(409).send({error:'Layout changed in another window'});}
      db.prepare('INSERT INTO layouts(id,layout,revision,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET layout=excluded.layout,revision=excluded.revision,updated_at=excluded.updated_at')
        .run(req.params.scene,JSON.stringify(layout),revision+1,updatedAt);
      db.exec('COMMIT');return {revision:revision+1,updatedAt};
    } catch(error){db.exec('ROLLBACK');throw error;}
  });
  if(worldService){
    const principal=async req=>resolvePrincipal?await resolvePrincipal(req):authService.resolvePrincipal(req);
    const failure=(reply,error)=>reply.code(error.message==='CSRF_REQUIRED'?403:error.message==='UNAUTHORIZED'?401:error.message==='WORLD_NOT_FOUND'?404:400).send({error:error.message,...(error.details?{details:error.details}:{})});
    app.get('/api/world/:id/snapshot',async(req,reply)=>{try{const p=await principal(req);return projectSnapshot(worldService.getSnapshot(p,req.params.id),p);}catch(error){return failure(reply,error);}});
    app.get('/api/world/:id/state',async(req,reply)=>{try{const p=await principal(req);const s=projectSnapshot(worldService.getSnapshot(p,req.params.id),p);return {worldId:s.worldId,layoutRevision:s.layoutRevision,topologyRevision:s.topologyRevision,actors:s.actors,actions:s.actions||{}};}catch(error){return failure(reply,error);}});
    app.get('/api/world/:id/events',async(req,reply)=>{try{return worldService.getEvents(await principal(req),{worldId:req.params.id,afterCursor:Number(req.query.after??0),limit:Number(req.query.limit??100)});}catch(error){return failure(reply,error);}});
    app.post('/api/world/:id/commands',async(req,reply)=>{try{if(req.body?.worldId!==req.params.id)throw Error('WORLD_ID_MISMATCH');return worldService.execute(await principal(req),req.body);}catch(error){return failure(reply,error);}});
  }
  if(serveStatic && existsSync(path.join(root,'dist','index.html'))) {
    await app.register((await import('@fastify/static')).default,{root:path.join(root,'dist')});
  }
  return app;
}
