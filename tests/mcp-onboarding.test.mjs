import test from 'node:test';
import assert from 'node:assert/strict';
import {buildServer} from '../server/app.js';
import {connectionSummary,copyEndpoint} from '../src/ui/agent-connect.js';
const issuer='http://127.0.0.1:5200';
const options={databasePath:':memory:',worldMode:true,startRuntime:false,auth:{localAccess:true}};
test('metadata exposes only configured address; grant names require owner; revoke is CSRF protected',async()=>{
 const app=await buildServer(options);try{
 const before=app.worldService.readSnapshot('default');
 const g=app.auth.store.create({clientName:'私人朋友',actorIds:[before.actors[0].actorId]});
 const publicResult=await app.inject('/api/integrations/mcp');assert.equal(publicResult.statusCode,200);
 const meta=publicResult.json();assert.equal(meta.endpoint,'http://127.0.0.1:5200/mcp');assert.equal(meta.reachability.kind,'local');assert.deepEqual(meta.connectedAgents,[]);assert.equal(meta.health.protocol,'awaiting_client');
 assert.ok(!publicResult.body.includes('私人朋友'));assert.ok(!publicResult.body.includes(g.accessToken));
 const paired=await app.inject({method:'POST',url:'/api/auth/local-session',headers:{host:new URL(issuer).host,origin:issuer},payload:{}});const cookie=paired.headers['set-cookie'].split(';')[0],csrf=paired.json().csrfToken;
 const data=(await app.inject({url:'/api/integrations/mcp',headers:{cookie}})).json();assert.equal(data.connectedAgents[0].status,'authorized');assert.equal(data.connectedAgents[0].clientName,'私人朋友');assert.ok(!JSON.stringify(data).includes(g.subjectId));
 let copied;await copyEndpoint(data,{writeText:async v=>copied=v});assert.equal(copied,meta.endpoint);assert.deepEqual(app.worldService.readSnapshot('default'),before);
 assert.equal((await app.inject({method:'POST',url:`/api/auth/grants/${g.grantId}/revoke`,headers:{cookie},payload:{}})).statusCode,403);
 assert.equal((await app.inject({method:'POST',url:`/api/auth/grants/${g.grantId}/revoke`,headers:{cookie,'x-csrf-token':csrf},payload:{}})).statusCode,200);assert.throws(()=>app.auth.store.authorize(g.accessToken,'actor:control'),/UNAUTHORIZED/);
 assert.equal((await app.inject({url:'/api/integrations/mcp',headers:{cookie}})).json().connectedAgents[0].status,'revoked');
 }finally{await app.close();}
});
test('remote address comes from configured HTTPS issuer and never claims network verification',async()=>{const app=await buildServer({...options,auth:{...options.auth,issuer:'https://world.example'}});try{const data=(await app.inject('/api/integrations/mcp')).json();assert.equal(data.endpoint,'https://world.example/mcp');assert.equal(data.reachability.kind,'remote');assert.equal(data.reachability.verified,false);assert.equal((await app.inject('/__private/secret.glb')).statusCode,404);}finally{await app.close();}});
test('UI distinguishes offline, incompatible protocol, owner expiry and pending protocol verification',()=>{assert.match(connectionSummary(null),/离线/);assert.match(connectionSummary({health:{service:'ready',protocol:'incompatible'}}),/不兼容/);assert.match(connectionSummary({health:{service:'ready',protocol:'awaiting_client',authorization:'owner_required'}}),/主人会话/);assert.match(connectionSummary({health:{service:'ready',protocol:'awaiting_client',authorization:'owner'}}),/待客户端验证/);});
test('copy rejects credentials and malformed endpoint',async()=>{for(const endpoint of ['http://localhost/mcp?token=secret','https://user:pass@host/mcp','javascript:alert(1)'])await assert.rejects(()=>copyEndpoint({endpoint},{writeText:async()=>{throw Error('must not copy');}}),/地址/);});
test('mock DOM panel copies address only, renders untrusted names as text, refreshes and revokes using owner CSRF',async()=>{
 const {AgentConnect}=await import('../src/ui/agent-connect.js');
 class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.style={};this.map={};}
 append(...els){this.children.push(...els);}remove(){this.removed=true;}replaceChildren(...els){this.children=els;}focus(){}select(){}
 set innerHTML(value){this.html=value;for(const key of ['section','[data-close]','[data-copy]','[data-refresh]','[data-connect]','[data-status]','[data-reach]','[data-agents]','input'])this.map[key]=new Element('div');}
 querySelector(s){return this.map[s];}querySelectorAll(){return []}
 }
 const document={head:new Element('head'),body:new Element('body'),createElement:t=>new Element(t),addEventListener(){},removeEventListener(){}};
 const calls=[],data={endpoint:'http://127.0.0.1:5200/mcp',health:{service:'ready',protocol:'awaiting_client',authorization:'owner'},reachability:{message:'仅限本机'},connectedAgents:[{grantId:'test-grant',clientName:'<img src=x onerror=alert(1)>',scopes:['world:read'],status:'authorized'}]};let copied;
 const panel=new AgentConnect({document,clipboard:{writeText:async value=>copied=value},session:{read:async()=>({csrfToken:'fixture-csrf'})},request:async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>data};}});
 await panel.open();assert.equal(panel.panel.querySelector('input').value,data.endpoint);await panel.panel.querySelector('[data-copy]').onclick();assert.equal(copied,data.endpoint);assert.equal(calls.length,1);assert.equal(panel.panel.querySelector('[data-copy]').textContent,'已复制');assert.equal(panel.panel.querySelector('[data-connect]').hidden,true);assert.match(panel.style.textContent,/\[hidden\]\{display:none!important\}/);
 const row=panel.panel.querySelector('[data-agents]').children[0];assert.equal(row.children[0].children[0].textContent,data.connectedAgents[0].clientName);
 await row.children[1].onclick();assert.equal(calls[1].url,'/api/auth/grants/test-grant/revoke');assert.equal(calls[1].init.headers['x-csrf-token'],'fixture-csrf');assert.equal(calls[1].init.body,'{}');assert.equal(calls[2].url,'/api/integrations/mcp');
 await panel.panel.querySelector('[data-refresh]').onclick();assert.match(panel.panel.querySelector('[data-status]').textContent,/状态已刷新/);assert.equal(panel.panel.querySelector('[data-refresh]').disabled,false);
 data.health.authorization='owner_required';await panel.refresh();assert.equal(panel.panel.querySelector('[data-connect]').hidden,false);
 panel.session.read=async()=>{throw Error('连接失败测试');};await panel.panel.querySelector('[data-connect]').onclick();assert.equal(panel.panel.querySelector('[data-status]').textContent,'连接失败测试');assert.equal(panel.panel.querySelector('[data-connect]').disabled,false);
 panel.session.read=async()=>{data.health.authorization='owner';return {};};await panel.panel.querySelector('[data-connect]').onclick();assert.equal(panel.panel.querySelector('[data-connect]').hidden,true);assert.match(panel.panel.querySelector('[data-status]').textContent,/主人会话已连接/);
 panel.panel.querySelector('[data-close]').onclick();assert.equal(panel.panel,null);panel.dispose();
});
test('OAuth consent explains local connection and world permissions in Chinese',async()=>{
 const {createHash}=await import('node:crypto');const app=await buildServer(options);try{
 const client=(await app.inject({method:'POST',url:'/oauth/register',payload:{client_name:'<朋友>',redirect_uris:['http://127.0.0.1:9999/cb']}})).json();const q=new URLSearchParams({client_id:client.client_id,redirect_uri:client.redirect_uris[0],response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update('x'.repeat(43)).digest('base64url'),scope:'world:read actor:control build:write'});
 const anonymous=await app.inject('/oauth/authorize?'+q);assert.equal(anonymous.statusCode,401);assert.match(anonymous.body,/请先连接本机游戏/);assert.match(anonymous.headers['content-security-policy'],/frame-ancestors 'none'/);
 const paired=await app.inject({method:'POST',url:'/api/auth/local-session',headers:{host:new URL(issuer).host,origin:issuer},payload:{}}),cookie=paired.headers['set-cookie'].split(';')[0];const consent=await app.inject({url:'/oauth/authorize?'+q,headers:{cookie}});assert.equal(consent.statusCode,200);assert.match(consent.body,/场景建设/);assert.doesNotMatch(consent.body,/message:|voice:/);assert.match(consent.body,/&lt;朋友&gt;/);assert.match(consent.body,/name="csrfToken"/);
 }finally{await app.close();}
});
