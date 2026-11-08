import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
function fixture(){
 const listeners={};const stored=new Map();let networkCalls=0;let skipped=false;
 const cache={addAll:async paths=>{for(const p of paths)stored.set(p,new Response('cached:'+p));},match:async key=>stored.get(key),put:async(key,response)=>stored.set(key,response)};
 const context=vm.createContext({URL,Set,Response,Request,caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},fetch:async()=>{networkCalls++;throw Error('offline');},self:{location:{origin:'https://vlt.example'},clients:{claim:async()=>{}},skipWaiting:()=>{skipped=true;},addEventListener:(name,handler)=>listeners[name]=handler}});
 vm.runInContext(source,context);
 return {listeners,stored,networkCalls:()=>networkCalls,skipped:()=>skipped};
}
test('PWA caches public shell only and serves both languages and Docs offline',async()=>{
 const f=fixture();let ready;f.listeners.install({waitUntil:promise=>ready=promise});await ready;
 assert.ok(f.stored.has('/'));assert.ok(f.stored.has('/docs.html'));
 assert.ok([...f.stored.keys()].every(key=>!(/api|launch|downloads|Profils|Sauvegardes/i.test(key))));
 for(const path of ['/?lang=fr','/?lang=en','/docs?lang=fr','/docs/']){
  let response;f.listeners.fetch({request:new Request('https://vlt.example'+path),respondWith:promise=>response=promise});
  assert.equal((await response).status,200);
 }
 assert.equal(f.networkCalls(),0);
});
test('PWA never intercepts settings, pairing codes, authenticated requests or external servers',()=>{
 const f=fixture();for(const request of [new Request('https://vlt.example/api',{method:'POST',body:'secret'}),new Request('https://vlt.example/api'),new Request('https://vlt.example/launch?lang=fr'),new Request('https://vlt.example/',{headers:{Authorization:'Bearer secret'}}),new Request('http://127.0.0.1:43187/api'),new Request('https://riot.example/settings'),new Request('https://vlt.example/downloads/vlt-connector.zip')]){
  let intercepted=false;f.listeners.fetch({request,respondWith:()=>intercepted=true});assert.equal(intercepted,false,request.url);
 }
 assert.equal(f.skipped(),false);f.listeners.message({data:{type:'ACTIVATE_UPDATE'}});assert.equal(f.skipped(),true);
});
test('manifest icons exist, have correct PNG dimensions and remain within app scope',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');
 for(const icon of manifest.icons){const png=await readFile(new URL('../public'+icon.src,import.meta.url));const size=Number(icon.sizes.split('x')[0]);assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
});
