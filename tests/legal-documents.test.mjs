import test from 'node:test';
import assert from 'node:assert/strict';
import {legalDocumentUrl} from '../src/community/legal-documents.js';

test('local and desktop legal links preserve the community server proxy prefix', () => {
  const location = {href:'http://127.0.0.1:5200/?character=whale'};
  for (const baseUrl of ['/community-api','http://127.0.0.1:5200/community-api/']) {
    assert.equal(legalDocumentUrl('terms',{baseUrl,location}),'http://127.0.0.1:5200/community-api/terms');
    assert.equal(legalDocumentUrl('privacy',{baseUrl,location}),'http://127.0.0.1:5200/community-api/privacy');
  }
});

test('community web and remote servers serve legal content independently of the game build path', () => {
  const location = {href:'https://community.test/game/'};
  assert.equal(legalDocumentUrl('terms',{location}),'https://community.test/terms');
  assert.equal(legalDocumentUrl('privacy',{baseUrl:'https://other.test/',location}),'https://other.test/privacy');
  assert.equal(legalDocumentUrl('terms',{baseUrl:'https://other.test/proxy',location}),'https://other.test/proxy/terms');
  assert.throws(()=>legalDocumentUrl('../secrets'),/未知/);
  assert.throws(()=>legalDocumentUrl('terms',{baseUrl:'javascript:alert(1)'}),/无效/);
});
