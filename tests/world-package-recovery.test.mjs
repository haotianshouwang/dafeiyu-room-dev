import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {buildWorldPackage, recoverWorldPackageTemps} from '../server/world-package.js';
import {migrateWorld} from '../server/storage/migrations.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worldPackageUrl = pathToFileURL(path.join(repo, 'server/world-package.js')).href;
const migrationsUrl = pathToFileURL(path.join(repo, 'server/storage/migrations.js')).href;
const nodeExecutable = [process.execPath, ...(process.env.Path || process.env.PATH || '').split(path.delimiter).map(directory=>path.join(directory,'node.exe'))].find(candidate=>existsSync(candidate)) || 'node';

function snapshot() { return {worldId:'source',schemaVersion:1,rulesVersion:1,layoutRevision:5,topologyRevision:1,scenes:[{sceneId:'room',name:'Room',templateId:'cozy_room_v1'}],entities:[],portals:[],actors:[]}; }
function packageBytes() { return buildWorldPackage({snapshot:snapshot(),assets:[{path:'assets/recovery.bin',bytes:Buffer.from('recovery-data')}]}); }
function waitForFile(file, timeoutMs=10000) { return new Promise((resolve,reject)=>{ const start=Date.now(); const poll=()=>{ if(existsSync(file)) return resolve(); if(Date.now()-start>=timeoutMs) return reject(new Error(`fault signal timeout: ${file}`)); setTimeout(poll,20); }; poll(); }); }
function waitForExit(child) { if(child.exitCode!==null||child.signalCode!==null)return Promise.resolve({code:child.exitCode,signal:child.signalCode}); return new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal}))); }
function startImport({root, fault}) {
  const dbPath=path.join(root,'world.sqlite'), assetDirectory=path.join(root,'assets'), packagePath=path.join(root,'package.dfworld'), signal=path.join(root,'fault.json');
  writeFileSync(packagePath, packageBytes());
  const code=`import {DatabaseSync} from 'node:sqlite'; import {readFileSync} from 'node:fs'; import {migrateWorld} from ${JSON.stringify(migrationsUrl)}; import {importWorldPackage} from ${JSON.stringify(worldPackageUrl)}; const db=new DatabaseSync(${JSON.stringify(dbPath)}); db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000'); migrateWorld(db); importWorldPackage({buffer:readFileSync(${JSON.stringify(packagePath)}),db,targetWorldId:'crash-world',assetDirectory:${JSON.stringify(assetDirectory)}}); db.close();`;
  const child=spawn(nodeExecutable,['--input-type=module','-e',code],{cwd:repo,env:{...process.env,NODE_ENV:'test',DAFEIYU_WORLD_PACKAGE_FAULT:fault,DAFEIYU_WORLD_PACKAGE_FAULT_SIGNAL:signal},stdio:['ignore','ignore','pipe']});
  return {child,dbPath,assetDirectory,signal};
}

test('real child-process termination at each crash window is recoverable or safely preserved', async () => {
  const points=['AFTER_TEMP_DIR_CREATED','AFTER_TEMP_MARKER_WRITTEN','AFTER_ASSET_WRITTEN','AFTER_ASSET_VALIDATED','BEFORE_RESOURCE_MOVE','AFTER_RESOURCE_MOVE','BEFORE_DATABASE_COMMIT','AFTER_DATABASE_COMMIT','BEFORE_COMPLETION_MARKER','AFTER_COMPLETION_MARKER','BEFORE_TEMP_CLEANUP'];
  for (const fault of points) {
    const root=mkdtempSync(path.join(tmpdir(),'dfworld-crash-'));
    let run=null;
    try {
      run=startImport({root,fault}); await waitForFile(run.signal); const pid=JSON.parse(readFileSync(run.signal,'utf8')).pid;
      assert.equal(pid,run.child.pid,`${fault} signal pid`); run.child.kill('SIGKILL'); const exit=await waitForExit(run.child);
      assert.ok(exit.code !== 0 || exit.signal,`${fault} must be force terminated`);
      await new Promise(resolve=>setTimeout(resolve,100));
      const db=new DatabaseSync(run.dbPath); const committed=Boolean(db.prepare('SELECT 1 FROM worlds WHERE world_id=?').get('crash-world'));
      const result=recoverWorldPackageTemps({assetDirectory:run.assetDirectory,db,maxAgeMs:0,now:Date.now()+1000});
      const asset=path.join(run.assetDirectory,'recovery.bin');
      if (committed) { assert.equal(existsSync(asset),true,`${fault} committed asset`); } else { assert.equal(existsSync(asset),false,`${fault} uncommitted asset cleanup`); }
      assert.equal(Boolean(db.prepare('SELECT 1 FROM worlds WHERE world_id=?').get('crash-world')),committed,`${fault} database stable after recovery`);
      if (fault !== 'AFTER_TEMP_DIR_CREATED') assert.ok(result.recovered >= 1 || committed,`${fault} recovery decision`);
      db.close();
    } finally {
      if(run?.child && run.child.exitCode===null && run.child.signalCode===null){run.child.kill('SIGKILL'); await waitForExit(run.child);}
      rmSync(root,{recursive:true,force:true});
    }
  }
});

test('recovery is idempotent and refuses unsafe or unmarked directories', () => {
  const root=mkdtempSync(path.join(tmpdir(),'dfworld-idempotent-')), assets=path.join(root,'assets');
  const db=new DatabaseSync(path.join(root,'world.sqlite')); migrateWorld(db);
  const stale=path.join(root,'.dfworld-stale'); mkdirSync(stale); const orphan=path.join(assets,'orphan.bin'); mkdirSync(assets); writeFileSync(orphan,'orphan');
  writeFileSync(path.join(stale,'.dfworld-temp.json'),JSON.stringify({version:1,taskId:'.dfworld-stale',format:'dfworld',worldId:'missing',created:['orphan.bin'],phase:'promoting',createdAt:1}));
  assert.equal(recoverWorldPackageTemps({assetDirectory:assets,db,maxAgeMs:0,now:Date.now()+1000}).recovered,1); assert.equal(existsSync(orphan),false);
  assert.equal(recoverWorldPackageTemps({assetDirectory:assets,db,maxAgeMs:0,now:Date.now()+1000}).recovered,0);
  const unsafe=path.join(root,'.dfworld-unsafe'); mkdirSync(unsafe); writeFileSync(path.join(unsafe,'.dfworld-temp.json'),JSON.stringify({version:1,taskId:'.dfworld-unsafe',format:'dfworld',worldId:'missing',created:['../outside'],phase:'promoting'}));
  const outside=path.join(root,'outside'); writeFileSync(outside,'keep'); recoverWorldPackageTemps({assetDirectory:assets,db,maxAgeMs:0,now:Date.now()+1000}); assert.equal(existsSync(outside),true); assert.equal(existsSync(unsafe),true);
  const badState=path.join(root,'.dfworld-bad-state'); mkdirSync(badState); writeFileSync(path.join(badState,'.dfworld-temp.json'),JSON.stringify({version:1,taskId:'.dfworld-bad-state',format:'dfworld',worldId:'missing',created:[],phase:'unknown'})); recoverWorldPackageTemps({assetDirectory:assets,db,maxAgeMs:0,now:Date.now()+1000}); assert.equal(existsSync(badState),true);
  const unmarked=path.join(root,'.dfworld-unmarked'); mkdirSync(unmarked); writeFileSync(path.join(unmarked,'user.bin'),'keep'); recoverWorldPackageTemps({assetDirectory:assets,db,maxAgeMs:0,now:Date.now()+1000}); assert.equal(existsSync(unmarked),true); db.close(); rmSync(root,{recursive:true,force:true});
});
