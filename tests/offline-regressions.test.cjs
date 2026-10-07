const {test}=require('node:test'),assert=require('node:assert/strict');
const {offlineStore}=require('./helpers.cjs');
function setup(send) {
 const {outbox:box,records}=offlineStore();box.start({from:()=>({insert:send})},'owner');return{box,records};
}
const item={id:'record1',table:'trips',op:'insert',payload:{user_id:'owner'},created_at:1,attempts:0};
test('records survive 20 failures and stop retrying',async()=>{let calls=0;const {box,records}=setup(async()=>{calls++;return{error:{code:'42501',message:'denied'}}});records.set(item.id,{...item});for(let n=0;n<22;n++)await box.flush();assert(records.has(item.id));assert.equal(records.get(item.id).attempts,20);assert.equal(calls,20);assert.equal(box.state.syncing,false)});
test('concurrent flush sends record once',async()=>{let calls=0;const{box,records}=setup(async()=>{calls++;return{error:null}});records.set(item.id,{...item});await Promise.all([box.flush(),box.flush()]);assert.equal(calls,1);assert.equal(records.size,0)});
test('subscription cleanup returns void',()=>{const{box}=setup(()=>{});const unsubscribe=box.subscribe(()=>{});assert.equal(unsubscribe(),undefined)});

test('manual retry unblocks a preserved record',async()=>{const{box,records}=setup(async()=>({error:null}));records.set(item.id,{...item,attempts:20});await box.retryBlocked();assert.equal(records.size,0)});
test('only the signed in owner records are sent',async()=>{const sent=[];const{box,records}=setup(async p=>{sent.push(p.user_id);return{error:null}});records.set(item.id,{...item});records.set('other',{...item,id:'other',payload:{user_id:'other-user'}});await box.flush();assert.deepEqual(sent,['owner']);assert(records.has('other'))});
test('updates affecting zero rows remain pending',async()=>{const{outbox:box,records}=offlineStore();const q={eq:()=>q,select:async()=>({data:[],error:null})};box.start({from:()=>({update:()=>q})},'owner');records.set(item.id,{...item,op:'update',payload:{},match:{id:1,user_id:'owner'}});await box.flush();assert(records.has(item.id));assert.match(records.get(item.id).last_error,/actualizar la jornada/)});
test('an unrelated unique constraint does not discard a pending insert',async()=>{const{outbox:box,records}=offlineStore();const q={eq:()=>q,maybeSingle:async()=>({data:null,error:null})};box.start({from:()=>({insert:async()=>({error:{code:'23505',message:'another unique constraint'}}),select:()=>q})},'owner');records.set(item.id,{...item});await box.flush();assert(records.has(item.id))});
