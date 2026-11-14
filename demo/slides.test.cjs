const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/drift-room-slides.html','utf8');
function harness(){const nodes=new Map();function node(){return {classList:{toggle(){}},setAttribute(){},replaceChildren(){},append(){},addEventListener(){},style:{}}}const slides=Array.from({length:6},node);const context={URL,document:{querySelectorAll:()=>slides,getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},createElement:node,body:node(),addEventListener(){}},window:{}};vm.createContext(context);vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);return context;}
function snapshot(){return {schemaVersion:1,id:'synthetic-test-only',capturedAt:'2026-11-14T21:00:00Z',sources:[{id:'s1',content:'Synthetic literal citation.',access:'available'}],reviews:['intent','delivery','skeptic'].map(role=>({id:role,role,name:role,snapshotId:'synthetic-test-only',mode:'recorded agent review',reviewedAt:'2026-11-14T21:01:00Z',summary:'Synthetic summary',dissent:'Synthetic dissent',findings:[{title:'Synthetic finding',claim:'Synthetic claim',uncertainty:'Synthetic uncertainty',correction:'Synthetic correction',citations:[{sourceId:'s1',quote:'literal citation'}]}]}))};}
test('deck has exactly six slides and no external render dependencies',()=>{assert.equal((html.match(/<section aria-label="Slide|<section class="active" aria-label="Slide/g)||[]).length,6);assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+rel=["']stylesheet|<img[^>]+src=["']https?:/i);assert.doesNotMatch(html,/fetch\(/);});
test('complete synthetic recorded snapshot validates',()=>{harness().validate(snapshot());});
test('mismatched snapshot rejected',()=>{const s=snapshot();s.reviews[1].snapshotId='wrong';assert.throws(()=>harness().validate(s),/association/);});
test('invented quote rejected',()=>{const s=snapshot();s.reviews[0].findings[0].citations[0].quote='invented';assert.throws(()=>harness().validate(s),/literal substring/);});
test('unavailable source rejected',()=>{const s=snapshot();s.sources[0].access='unavailable';assert.throws(()=>harness().validate(s),/available/);});
test('partial reviewers rejected',()=>{const s=snapshot();s.reviews.pop();assert.throws(()=>harness().validate(s),/complete three-role/);});
test('live review label rejected',()=>{const s=snapshot();s.reviews[0].mode='live';assert.throws(()=>harness().validate(s),/invalid/);});
test('duplicate source rejected',()=>{const s=snapshot();s.sources.push(s.sources[0]);assert.throws(()=>harness().validate(s),/unique/);});
test('duplicate role rejected',()=>{const s=snapshot();s.reviews[1].role='intent';assert.throws(()=>harness().validate(s),/invalid/);});
test('import uses safe text rendering',()=>{assert.doesNotMatch(html,/innerHTML|insertAdjacentHTML/);const h=harness();assert.doesNotThrow(()=>h.applySnapshot(snapshot()));});
