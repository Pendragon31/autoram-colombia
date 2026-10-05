const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function setup(send) {
 const records=new Map();
 const db={transaction:()=>{const t={};const request=value=>{const r={result:value};queueMicrotask(()=>t.oncomplete?.());return r};t.objectStore=()=>({getAll:()=>request([...records.values()]),put:item=>{records.set(item.id,item);return request(item.id)},delete:id=>{records.delete(id);return request()},count:()=>request(records.size)});return t}};
 const indexedDB={open:()=>{const req={result:db};queueMicrotask(()=>req.onsuccess());return req}};
 const exports={};const code=ts.transpileModule(fs.readFileSync('lib/offline-queue.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:()=>{},indexedDB,navigator:{onLine:true},console:{warn:()=>{}},queueMicrotask});
 const box=exports.outbox;box.client={from:()=>({insert:send})};return{box,records};
}
const item={id:'record1',table:'trips',op:'insert',payload:{},created_at:1,attempts:0};
test('records survive 20 failures and stop retrying',async()=>{let calls=0;const {box,records}=setup(async()=>{calls++;return{error:{code:'42501',message:'denied'}}});records.set(item.id,{...item});for(let n=0;n<22;n++)await box.flush();assert(records.has(item.id));assert.equal(records.get(item.id).attempts,20);assert.equal(calls,20);assert.equal(box.state.syncing,false)});
test('concurrent flush sends record once',async()=>{let calls=0;const{box,records}=setup(async()=>{calls++;return{error:null}});records.set(item.id,{...item});await Promise.all([box.flush(),box.flush()]);assert.equal(calls,1);assert.equal(records.size,0)});
test('subscription cleanup returns void',()=>{const{box}=setup(()=>{});const unsubscribe=box.subscribe(()=>{});assert.equal(unsubscribe(),undefined)});
