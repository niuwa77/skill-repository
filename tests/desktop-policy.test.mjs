import test from 'node:test';
import assert from 'node:assert/strict';
import policy from '../desktop/policy.cjs';
test('desktop protocol serves only allowlisted assets at the exact app origin',()=>{
  assert.deepEqual(policy.resolveAsset('skillvault://app/'),['index.html','text/html; charset=utf-8']);
  assert.equal(policy.resolveAsset('skillvault://app/core.mjs')[0],'core.mjs');
  for(const url of ['skillvault://app/LICENSE','skillvault://app/../desktop/main.cjs','skillvault://evil/app.mjs','https://app/app.mjs','skillvault://user@app/app.mjs']) assert.equal(policy.resolveAsset(url),null);
});
test('only http(s) links without embedded credentials reach the system browser',()=>{
  assert.equal(policy.externalURL('https://example.com/skill'),'https://example.com/skill');
  for(const url of ['file:///C:/test','javascript:alert(1)','data:text/html,test','https://user:password@example.com','skillvault://app/','not a URL'])assert.equal(policy.externalURL(url),null);
});
