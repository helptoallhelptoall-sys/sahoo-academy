import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSourceArrayHtml,parseDataLiteral} from '../scripts/source-array-import.mjs';
import {inspectUploadedHtml} from '../scripts/upload-import.mjs';
export const record=(id=1)=>({id,chapter:'Computer / ଓଡ଼ିଆ',question_statement:`Synthetic ${id} 🟢 😀 [Source unverified]`,options:['A ଓଡ଼ିଆ','B <b>text</b>','C 🟢','D'],correct:1,explanation:'Explanation 🟢 ଓଡ଼ିଆ',tags:['PYP unverified','Custom 😀'],source:'Unverified source',custom:{keep:true}});
export const sourceHtml=(records=[record()],after='')=>'<html><script>const theme="unused"; const questions = '+JSON.stringify(records)+';'+after+'</script></html>';
const inspect=html=>inspectSourceArrayHtml(html,{expectedCount:1});
test('static array with surrounding UI code preserves every source field and ignores quiz-time shuffling',()=>{
 const q=record(),r=inspect(sourceHtml([q],'function shuffle(){ questions.reverse(); questions[0].correct=3; } document.addEventListener("click",shuffle); throw Error("Never executed");'));
 assert.deepEqual(r.sourceRecords,[q]);assert.deepEqual(r.original[0].metadata.sourceRecord,q);assert.equal(r.imported[0].text,q.question_statement.replaceAll('🟢',''));assert.deepEqual(r.imported[0].options,q.options.map((text,i)=>({id:'option-'+i,text})));assert.equal(r.imported[0].correctOptionId,'option-1');assert.equal(r.imported[0].explanation,q.explanation);assert.deepEqual(r.imported[0].tags,q.tags);assert.equal(r.pass2,'pending');assert.equal(r.publishable,false);
});
test('quoted strings, comments, escapes, Unicode and trailing commas are literal data',()=>{
 const r=inspect(`<script>/* const questions = [bad]; */ const label='const questions = [fake]'; const questions=[{id:'one',chapter:'ଓଡ଼ିଆ',question_statement:'It\\'s \\u0041 😀',options:['A','B','C','D',],correct:0,explanation:'Keep \\n newline',},]; function ui(){return questions;}</script>`);
 assert.equal(r.imported[0].text,"It's A 😀");assert.equal(r.imported[0].explanation,'Keep \n newline');
});
test('HTML comments cannot supply a question bank',()=>{assert.throws(()=>inspect('<!--'+sourceHtml()+'-->'));assert.equal(inspect('<!--'+sourceHtml()+'-->'+sourceHtml()).imported.length,1);});
const expressions=['buildQuestions()','[...other]','[record]','[{...record}]','[].concat([])','[] .map(x=>x)','[(()=>({}))()]','[{get id(){return 1}}]','[{["id"]:1}]','[{id:1,id:2}]','[{__proto__:null}]','[{constructor:1}]','[{id:NaN}]','[{id:Infinity}]','[{id:/x/}]','[{id:1n}]','[,]', '[{id:`${run()}`}]'];
for(const expression of expressions)test('reject dynamic/unsupported literal: '+expression,()=>{assert.throws(()=>inspect('<script>const questions = '+expression+';</script>'));});
for(const suffix of ['questions.push({});','questions[0].correct=3;','const alias=questions;','questions.length=0;','(()=>questions.push({}))();','function extend(){questions.push({})} extend();'])test('reject top-level runtime bank construction: '+suffix,()=>assert.throws(()=>inspect(sourceHtml([record()],suffix))));
test('reject truncated arrays, malformed scripts, nested and ambiguous declarations',()=>{
 for(const html of [sourceHtml().replace('];',';'),sourceHtml().replace('</script>',''),sourceHtml()+sourceHtml(),'<script>function f(){const questions=[]}</script>','<script>let questions=[];</script>','<script>window.questions=[];</script>'])assert.throws(()=>inspect(html));
});
test('reject unsafe structural records without dropping or inventing any',()=>{
 for(const patch of [{id:null},{id:undefined},{chapter:''},{question_statement:''},{options:['a','b','c']},{options:['a','b','c','d','e']},{options:['a','b','c',null]},{correct:-1},{correct:4},{correct:1.5},{correct:'1'},{explanation:''},{tags:'tag'}])assert.throws(()=>inspect(sourceHtml([{...record(),...patch}])));
 assert.throws(()=>inspectSourceArrayHtml(sourceHtml([record(),record()]),{expectedCount:2}));
 assert.throws(()=>inspectSourceArrayHtml(sourceHtml([record(),record('1')]),{expectedCount:2}));
 assert.throws(()=>inspectSourceArrayHtml(sourceHtml(),{expectedCount:165}));
});
test('repeated content is retained and flagged for review, never deduplicated',()=>{const r=inspectSourceArrayHtml(sourceHtml([record(),{...record(),id:2}]),{expectedCount:2});assert.equal(r.imported.length,2);assert.equal(r.audit.removed,0);assert.equal(r.issues[0].field,'duplicate');});
test('bounded literal nesting rejects pathological data',()=>{assert.throws(()=>parseDataLiteral('['.repeat(70)+'0'+']'.repeat(70)));});
test('canonical dispatch still preserves complete private metadata',()=>{
 const q={id:'q',number:1,text:'Canonical 🟢',topic:'Topic',options:['a','b','c','d'].map(id=>({id,text:id,isCorrect:id==='a'})),correctOptionId:'a',explanation:'Private',tags:['Source'],metadata:{preserve:true}};
 const r=inspectUploadedHtml('<script type="application/json" id="sahoo-mock-data">'+JSON.stringify({questionCount:1,questions:[q]})+'</script>',1);assert.deepEqual(r.original,[q]);assert.equal(r.format,'sahoo-canonical-v1');assert.deepEqual(r.issues,[]);
});

test('Edge entry compiles and Deno resolves the same pinned parser dependency',async()=>{
 const fs=await import('node:fs/promises'),{build}=await import('esbuild');
 const map=JSON.parse(await fs.readFile(new URL('../supabase/functions/academy-api/deno.json',import.meta.url),'utf8'));
 const pkg=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
 assert.equal(map.imports.acorn,'npm:acorn@'+pkg.dependencies.acorn);
 const result=await build({entryPoints:['supabase/functions/academy-api/index.ts'],bundle:true,write:false,platform:'node',format:'esm',external:['npm:*']});assert.equal(result.outputFiles.length,1);
});
