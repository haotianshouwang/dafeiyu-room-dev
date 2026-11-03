import Fastify from 'fastify';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validLayout } from '../shared/layout.js';

export async function buildServer({ databasePath, serveStatic = false, logger = false } = {}) {
  const root=fileURLToPath(new URL('../',import.meta.url));
  const filename=databasePath || path.join(root,'data','game.sqlite');
  if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});
  const db=new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS layouts (id TEXT PRIMARY KEY, layout TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)');
  const app=Fastify({logger,bodyLimit:128*1024});
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
    const row=read.get(req.params.scene);
    return row?{layout:JSON.parse(row.layout),revision:row.revision,updatedAt:row.updated_at}:{layout:null,revision:0,updatedAt:null};
  });
  app.put('/api/layout/:scene',async(req,reply)=>{
    if(!['bedroom','living','yard'].includes(req.params.scene))return reply.code(404).send({error:'Unknown scene'});
    const {layout,revision}=req.body||{};
    if(!validLayout(layout,req.params.scene)||!Number.isSafeInteger(revision)||revision<0)return reply.code(400).send({error:'Invalid layout or revision'});
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
  if(serveStatic && existsSync(path.join(root,'dist','index.html'))) {
    await app.register((await import('@fastify/static')).default,{root:path.join(root,'dist')});
  }
  return app;
}
