import test from 'node:test';
import assert from 'node:assert/strict';
import {CommunityApiClient, CommunityApiError, normaliseApiBase} from '../src/community/api-client.js';

test('community API uses configured base URL, cookies and in-memory CSRF token', async () => {
  const calls = [];
  const api = new CommunityApiClient({baseUrl: 'https://community.example.test/', csrfToken: 'csrf-memory', request: async (url, options) => {
    calls.push({url, options});
    return new Response(JSON.stringify({success: true, user: {username: 'alice'}}), {status: 200, headers: {'content-type': 'application/json'}});
  }});
  const result = await api.login({username: 'alice', password: 'secret'});
  assert.equal(result.data.user.username, 'alice');
  assert.equal(calls[0].url, 'https://community.example.test/api/auth/login');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.headers.get('x-csrf-token'), 'csrf-memory');
  assert.equal(JSON.parse(calls[0].options.body).password, 'secret');
  assert.equal(normaliseApiBase('https://community.example.test/'), 'https://community.example.test');
});

test('community API never turns a 401 into a successful guest session', async () => {
  let expired = 0;
  const api = new CommunityApiClient({onSessionExpired: () => expired++, request: async () => new Response(JSON.stringify({error: 'UNAUTHORIZED'}), {status: 401})});
  await assert.rejects(api.me(), error => error instanceof CommunityApiError && error.code === 'UNAUTHORIZED');
  assert.equal(expired, 1);
});

test('registration remains pending until the verification endpoint returns the authenticated user',async()=>{
  const calls=[];
  const api=new CommunityApiClient({request:async(url,options)=>{
    calls.push({url,options});
    const body=JSON.parse(options.body);
    if(url==='/api/auth/register')return new Response(JSON.stringify({success:true,verification_required:true,email:'u***@example.test'}),{status:202});
    if(url==='/api/auth/register/verify')return new Response(JSON.stringify({success:true,user:{id:'user-1',email:'user@example.test'}}),{status:200,headers:{'x-csrf-token':'csrf-verified'}});
    return new Response('{}',{status:404});
  }});
  const pending=await api.register({email:'user@example.test',password:'correct horse battery staple',accept_terms:true,accept_privacy:true});
  assert.equal(pending.data.verification_required,true);
  assert.equal(api.currentUserId,null);
  const verified=await api.verifyRegistration({token:'t'.repeat(43)});
  assert.equal(verified.data.user.id,'user-1');
  assert.equal(api.currentUserId,'user-1');
  assert.equal(calls[1].url,'/api/auth/register/verify');
});

test('cloud requests preserve protocol paths and binary chunk headers', async () => {
  const calls = [];
  const api = new CommunityApiClient({request: async (url, options) => { calls.push({url, options}); return new Response(JSON.stringify({success: true, receipt: {chunk_index: 0}}), {status: 200}); }});
  await api.uploadChunk('u-1', 0, new Uint8Array([1, 2, 3]), 0, 'a'.repeat(64));
  assert.equal(calls[0].url, '/api/cloud/uploads/u-1/chunks/0');
  assert.equal(calls[0].options.headers.get('content-type'), 'application/octet-stream');
  assert.equal(calls[0].options.headers.get('x-chunk-offset'), '0');
  assert.deepEqual([...new Uint8Array(await new Response(calls[0].options.body).arrayBuffer())], [1, 2, 3]);
});

test('an account changed by another browser tab invalidates pending work before using its identity',async()=>{
  const api=new CommunityApiClient({request:async()=>new Response(JSON.stringify({user:{id:'bob'}}))});
  api.currentUserId='alice';api.csrfToken='alice-csrf';let changed;api.onIdentityChanged=user=>changed=user.id;
  await assert.rejects(api.me(),error=>error.code==='SESSION_CHANGED'&&error.retryable===false);
  assert.equal(changed,'bob');assert.equal(api.identityVersion,1);assert.equal(api.currentUserId,'bob');assert.equal(api.csrfToken,null);
});

test('logout does not race a realtime session check into another identity change',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});const calls=[];
  const api=new CommunityApiClient({request:async url=>{calls.push(url);await gate;return new Response('{}');}});
  api.currentUserId='alice';const logout=api.logout();assert.equal(api.authenticationPending,true);
  await assert.rejects(api.me(),error=>error.code==='SESSION_CHANGED');assert.deepEqual(calls,['/api/auth/logout']);
  release();await logout;assert.equal(api.authenticationPending,false);assert.equal(api.identityVersion,1);assert.equal(api.currentUserId,null);
});

test('community API preserves nested protocol error code and message',async()=>{
  const api=new CommunityApiClient({request:async()=>new Response(JSON.stringify({success:false,error:{code:'QUOTA_EXCEEDED_BYTES',message:'Storage quota exceeded',retryable:false,details:{available_bytes:0}}}),{status:400})});
  await assert.rejects(api.quota(),error=>error instanceof CommunityApiError&&error.code==='QUOTA_EXCEEDED_BYTES'&&error.message==='Storage quota exceeded'&&error.details.available_bytes===0&&!error.retryable);
});

test('latest message history uses a UTF-8 safe upper-bound cursor', async () => {
  const calls = [];
  const api = new CommunityApiClient({request: async (url, options) => { calls.push({url, options}); return new Response(JSON.stringify({success: true, messages: []}), {status: 200}); }});
  await api.listMessages('conversation-1', {latest: true});
  const cursor = new URL(calls[0].url, 'http://local').searchParams.get('before');
  assert.equal(Buffer.from(cursor, 'base64url').toString('utf8'), `${Number.MAX_SAFE_INTEGER}:end`);
});
