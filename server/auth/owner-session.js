import {secret,hash,equal,SCOPES} from './grants.js';
export function createOwnerSessions(store,{bootstrapCode,onBootstrap,issuer,worldId='default',clock=Date.now,recoverOwner=false}={}){
 const secure=new URL(issuer).protocol==='https:',cookieName='world_owner';
 if(recoverOwner){store.remove('meta','paired');store.remove('meta','bootstrap');store.db.prepare("DELETE FROM auth_records WHERE kind='session'").run();}
 if(!store.get('meta','paired')){const code=bootstrapCode||secret();store.put('meta','bootstrap',{hash:hash(code),expiresAt:clock()+15*60000});onBootstrap?.(code);}
 const owner=()=>{const s=store.service.readSnapshot(worldId);return {subjectId:'local-owner',role:'owner',worldIds:[worldId],actorIds:s.actors.map(a=>a.actorId),scopes:[...SCOPES]};};
 function resolve(req,{write=false}={}){const raw=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);const s=raw?store.get('session',hash(raw)):null;if(!s||s.expiresAt<=clock())throw Error('UNAUTHORIZED');if(write&&!equal(req.headers['x-csrf-token']||req.body?.csrfToken||'',s.csrfToken))throw Error('CSRF_REQUIRED');return {...owner(),expiresAt:s.expiresAt,csrfToken:s.csrfToken};}
 function pair(req,reply){if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.ip))throw Error('LOCAL_PAIRING_ONLY');const entry=store.get('meta','bootstrap');if(store.get('meta','paired')||!entry||entry.expiresAt<=clock()||typeof req.body?.code!=='string'||!equal(hash(req.body.code),entry.hash))throw Error('UNAUTHORIZED');store.remove('meta','bootstrap');store.put('meta','paired',{at:clock()});const token=secret(),csrfToken=secret();store.put('session',hash(token),{csrfToken,expiresAt:clock()+30*86400000});reply.header('set-cookie',`${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure?'; Secure':''}`);return {status:'paired',csrfToken};}
 return {resolve,pair,owner};
}
