const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const path=require('node:path');
const root=path.join(__dirname,'..');
function evaluate(file, requireStub, globals={}) {
 const output=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(output,{exports,require:requireStub,console,...globals});return exports;
}
const geo=evaluate('lib/geo.ts',()=>{});
function tracker(vehicleId,initialDraft) {
 const memory=new Map();if(initialDraft)memory.set('autoram.trip.draft.v1',JSON.stringify(initialDraft));
 let position,error,clears=0;const intervals=new Set();let interval=0;
 const React={useState:value=>[typeof value==='function'?value():value,()=>{}],useRef:value=>({current:value}),useCallback:fn=>fn,useEffect:()=>{}};
 const globals={Date,Number,localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,v)=>memory.set(key,v),removeItem:key=>memory.delete(key)},navigator:{geolocation:{watchPosition:(p,e)=>{position=p;error=e;return 7},clearWatch:()=>clears++}},window:{setInterval:()=>{const id=++interval;intervals.add(id);return id},clearInterval:id=>intervals.delete(id)}};
 const hook=evaluate('hooks/use-trip-tracker.ts',id=>id==='react'?React:id.includes('offline-queue')?{newClientId:()=>require('node:crypto').randomUUID()}:geo,globals).useTripTracker({vehicleId});
 return {hook,memory,intervals,get clears(){return clears},position:(lat,lng,t)=>position({coords:{latitude:lat,longitude:lng,accuracy:5,speed:0},timestamp:t}),error:code=>error({code})};
}
test('GPS denied releases observer and draft timer',()=>{const t=tracker(1);t.hook.start();t.error(1);assert.equal(t.clears,1);assert.equal(t.intervals.size,0)});
test('GPS temporary error keeps observer active',()=>{const t=tracker(1);t.hook.start();t.error(2);assert.equal(t.clears,0);assert.equal(t.intervals.size,1)});
test('failed save keeps final GPS points, even before periodic save',()=>{const t=tracker(1);t.hook.start();const now=Date.now();t.position(4.15,-73.63,now);t.position(4.151,-73.63,now+60000);assert(t.hook.stop());t.hook.finish(false);const d=JSON.parse(t.memory.get('autoram.trip.draft.v1'));assert.equal(d.points.length,2)});
test('resume does not load another vehicle draft',()=>{const t=tracker(2,{vehicleId:1,startedAt:new Date().toISOString(),points:[[4,-73,Date.now()],[4.01,-73,Date.now()+60000]]});t.hook.resume();assert.equal(t.intervals.size,0)});
test('malformed draft cannot crash resume',()=>{const t=tracker(1,{vehicleId:1,startedAt:'invalid',points:null});assert.doesNotThrow(()=>t.hook.resume());assert.equal(t.intervals.size,0)});
test('successful save clears draft',()=>{const t=tracker(1);t.hook.start();t.hook.finish(true);assert(!t.memory.has('autoram.trip.draft.v1'))});

test('each accepted GPS point is durable before the periodic timer',()=>{const t=tracker(1);t.hook.start();const now=Date.now();t.position(4.15,-73.63,now);t.position(4.151,-73.63,now+60000);const d=JSON.parse(t.memory.get('autoram.trip.draft.v1'));assert.equal(d.points.length,2)});
test('saved trip remains pinned to the vehicle and client id of the draft',()=>{const t=tracker(7);t.hook.start();const now=Date.now();t.position(4.15,-73.63,now);t.position(4.151,-73.63,now+60000);const d=JSON.parse(t.memory.get('autoram.trip.draft.v1'));const trip=t.hook.stop();assert.equal(trip.vehicleId,7);assert.equal(trip.clientId,d.clientId)});
