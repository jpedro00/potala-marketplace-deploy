import assert from 'node:assert/strict';
import test from 'node:test';
import { localOrigin,percentile } from './ops-common.mjs';
test('operational probes reject remote, auth and alternative protocol targets',()=>{
 for(const value of ['https://example.com','http://127.0.0.1.example.com','http://user:pass@localhost','file:///tmp','https://localhost']) assert.throws(()=>localOrigin(value));
 assert.equal(localOrigin('http://127.0.0.1:18080/a'),'http://127.0.0.1:18080');
 assert.equal(localOrigin('http://[::1]:3000'),'http://[::1]:3000');
});
test('reported percentiles use nearest rank and do not mutate samples',()=>{const values=[4,1,3,2];assert.equal(percentile(values,.75),3);assert.deepEqual(values,[4,1,3,2]);assert.equal(percentile([],.75),null);});
