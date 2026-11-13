import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDisclosure, deliverToClub } from './disclosure.mjs';
import { startVerification, startPaymentSetup, uploadBoxDocument } from './providers.mjs';
const record = {athleteId:'a',ageVerificationStatus:'verified',ageVerificationExpiresAt:200,rawIdentity:'never disclose'};
const grant = {ownerId:'p',recipientId:'c',athleteId:'a',expiresAt:150,fields:['athleteId','ageVerificationStatus']};
const input = {grant,actorId:'p',recipientId:'c',record,now:100};
test('only explicitly approved fields leave the boundary',()=>assert.deepEqual(buildDisclosure(input),{athleteId:'a',ageVerificationStatus:'verified'}));
for(const [name,change] of Object.entries({owner:{actorId:'other'},recipient:{recipientId:'other'},expired:{now:150},revoked:{grant:{...grant,revokedAt:99}},fields:{grant:{...grant,fields:['rawIdentity']}},stale:{record:{...record,ageVerificationExpiresAt:99}},athlete:{record:{...record,athleteId:'other'}}}))
  test('reject '+name,()=>assert.throws(()=>buildDisclosure({...input,...change})));
test('unconfigured providers and club cannot report success',async()=>{
  await assert.rejects(startVerification); await assert.rejects(startPaymentSetup); await assert.rejects(deliverToClub);
});
test('Box transport uses fixed host and returns reference only',async()=>{
  const result=await uploadBoxDocument({accessToken:'test',folderId:'123',bytes:new Uint8Array([1]),fetchImpl:async(url,options)=>{
    assert.equal(url,'https://upload.box.com/api/2.0/files/content');assert.equal(options.redirect,'error');
    return {ok:true,json:async()=>({entries:[{id:'456',private:'discard'}]})};
  }}); assert.deepEqual(result,{provider:'box',fileId:'456'});
});
test('Box rejects missing credentials and ambiguous receipt',async()=>{
  await assert.rejects(()=>uploadBoxDocument({}));
  await assert.rejects(()=>uploadBoxDocument({accessToken:'test',folderId:'123',bytes:new Uint8Array([1]),fetchImpl:async()=>({ok:true,json:async()=>({})})}),/uncertain/);
});
