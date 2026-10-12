import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {exams,subjects,questions,tests,gradeTest} from '../data.js';
import {subjectPlans,premiumTests,defaultDurationSeconds} from '../commerce.js';
import {prepareImport,removeGreenEmoji,shuffleOptions} from '../import-core.js';
import {inspectCanonicalHtml} from '../scripts/html-import.mjs';
import {inspectSourceArrayHtml,parseDataLiteral} from '../scripts/source-array-import.mjs';
import {expiryFromActivation,renewalWindow} from '../subscription-policy.mjs';
import {academyBackend} from '../backend.js';
test('reusable source-array importer accepts other subjects and variable counts',()=>{
  for(const [topic,count] of [['Odia / ଓଡ଼ିଆ',2],['History',5],['Mathematics',9],['Computer Awareness',1]]){
    const records=Array.from({length:count},(_,i)=>({id:i+1,chapter:topic,question_statement:`Synthetic ${topic} fixture ${i+1} 🟢 [SAMPLE]`,options:['A','B','C','D'],correct:i%4,explanation:`Synthetic explanation ${i+1}`,custom:{subject:topic,version:1}}));
    const result=inspectSourceArrayHtml('<script>const questions = '+JSON.stringify(records)+';</script>',{expectedCount:count});
    assert.equal(result.audit.sourceQuestions,count);assert.equal(result.audit.importedQuestions,count);assert.equal(result.audit.added,0);assert.equal(result.audit.removed,0);assert.equal(result.audit.greenEmojiRemoved,count);assert.deepEqual(result.issues,[]);
    for(const [i,q] of result.imported.entries()){assert.equal(q.topic,topic);assert.equal(q.text,records[i].question_statement.replaceAll('🟢',''));assert.deepEqual(q.metadata.sourceRecord,records[i]);}
  }
});
test('reusable canonical HTML importer preserves mixed subjects and source tags',()=>{
  const questions=['English','Reasoning','Economics'].map((topic,i)=>({id:`synthetic-${i}`,number:i+1,topic,text:`Synthetic ${topic} question 🟢`,options:['A','B','C','D'].map((text,j)=>({id:`opt-${j}`,text})),correctOptionId:`opt-${i}`,explanation:'Synthetic explanation',tags:['SAMPLE ONLY'],metadata:{language:'en',customField:i}}));
  const source={questionCount:3,questions,metadata:{subject:'Mixed mock',source:'synthetic test'}};
  const result=inspectCanonicalHtml('<script type="application/json" id="sahoo-mock-data">'+JSON.stringify(source)+'</script>');
  assert.deepEqual(result.issues,[]);assert.equal(result.audit.importedQuestions,3);assert.deepEqual(result.metadata,source.metadata);
  for(const [i,q] of result.imported.entries()){assert.deepEqual(q,{...questions[i],text:questions[i].text.replaceAll('🟢','')});}
});
test('sample scoring distinguishes correct, incorrect and skipped',()=>{
  assert.deepEqual(gradeTest(questions,{q1:2,q2:0}),{correct:1,attempted:2,incorrect:1,skipped:4,total:6,accuracy:50,percentage:17});
});
test('unanswered samples produce zero without NaN',()=>{
  const result=gradeTest(questions,{});assert.equal(result.accuracy,0);assert.equal(result.skipped,6);assert.equal(result.percentage,0);
});
test('all correct answers produce full marks',()=>{assert.equal(gradeTest(questions,Object.fromEntries(questions.map(q=>[q.id,q.answer]))).percentage,100);});
test('catalog IDs are unique and test references resolve',()=>{
  for(const collection of [exams,subjects,questions,tests])assert.equal(new Set(collection.map(x=>x.id)).size,collection.length);
  for(const t of tests){assert.ok(t.minutes>0);assert.ok(t.ids.length);for(const id of t.ids)assert.ok(questions.find(q=>q.id===id));}
  for(const q of questions){assert.ok(q.options[q.answer]);assert.ok(q.explanation);}
});
test('manifest uses only relative local assets',async()=>{const m=JSON.parse(await readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'));assert.equal(m.scope,'./');assert.equal(m.icons[0].src,'sahoo-examnexa-icon-192.png');});
test('main UI delegates credentials and API calls to the official SDK gateway; no offline cache',async()=>{
  const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
  for(const forbidden of ['localStorage','sessionStorage','serviceWorker.register','fetch(','XMLHttpRequest','service_role','sk_live_'])assert.equal(source.includes(forbidden),false,forbidden);
});
test('premium catalog exposes metadata only and purchases resolve to a three-month subject',()=>{
  for(const t of premiumTests){assert.equal(t.access,'paid');assert.ok(subjectPlans.some(p=>p.id===t.planId));for(const key of ['ids','questions','options','answer','correctOptionId','explanation','html','downloadUrl'])assert.equal(Object.hasOwn(t,key),false);}
  for(const p of subjectPlans){assert.equal(p.validityMonths,3);assert.equal(p.priceStatus,'illustrative');assert.ok(p.pricePaise>0);}
  for(const t of tests){assert.equal(t.access,'free');assert.equal(t.pricePaise,0);}
});
test('default CBT duration follows Q/4 minutes with explicit overrides',()=>{
  for(const [count,minutes] of [[40,10],[100,25],[160,40],[332,83]])assert.equal(defaultDurationSeconds(count),minutes*60);
  assert.equal(defaultDurationSeconds(332,90),5400);assert.throws(()=>defaultDurationSeconds(0));assert.throws(()=>defaultDurationSeconds(5,-1));
});
const fixture=count=>({questionCount:count,metadata:{source:'Synthetic test fixture, not the user file'},questions:Array.from({length:count},(_,i)=>({id:'fixture-'+i,number:i+1,text:`🟢 Synthetic question ${i+1}  `,options:['a','b','c','d'].map(id=>({id,text:`Option ${id}`})),correctOptionId:'b',explanation:'Synthetic explanation',topic:'Solar System',tags:['PYP sample tag'],metadata:{sourceNumber:i+1}}))});
test('332-question synthetic HTML fixture imports exactly 332 with add 0 remove 0',()=>{
  const source=fixture(332),html='<html><script type="application/json" id="sahoo-mock-data">'+JSON.stringify(source)+'</script><script>throw new Error("must never execute")</script></html>';
  const result=inspectCanonicalHtml(html);assert.equal(result.audit.sourceQuestions,332);assert.equal(result.audit.importedQuestions,332);assert.equal(result.audit.added,0);assert.equal(result.audit.removed,0);assert.equal(result.audit.countMatch,true);assert.equal(result.audit.greenEmojiRemoved,332);assert.equal(result.issues.length,0);assert.equal(result.pass2,'pending');assert.equal(result.publishable,false);assert.equal(result.sourceSha256.length,64);
  assert.deepEqual(result.imported,removeGreenEmoji(source.questions));assert.deepEqual(result.original,source.questions);
});
test('green emoji removal changes only that character and preserves tags and metadata',()=>{
  const source=fixture(1);source.questions[0].text=' 🟢Text  🟢. 🔴';source.questions[0].options[0].text='Option 🟢';source.questions[0].explanation='Explanation 🟢';source.questions[0].tags=['PYP 🟢'];source.questions[0].metadata={note:'Metadata 🟢'};const result=prepareImport(source);assert.equal(result.imported[0].text,' Text  . 🔴');assert.deepEqual(result.imported[0].tags,source.questions[0].tags);assert.deepEqual(result.imported[0].metadata,source.questions[0].metadata);assert.deepEqual(result.imported[0].options,source.questions[0].options);assert.equal(result.imported[0].explanation,source.questions[0].explanation);assert.equal(result.audit.greenEmojiRemoved,2);assert.equal(result.original[0].text,' 🟢Text  🟢. 🔴');
});
test('source array adapter preserves every source field and zero-based answer mapping',()=>{
  const record={id:1,chapter:'Example topic',question_statement:'Example 🟢 question',options:['A 🟢','B','C','D'],correct:1,explanation:'Explanation 🟢',tags:['PYP tag'],custom:{value:'Keep this'}};
  const html='<script>const questions = ['+JSON.stringify(record)+'];</script>';
  const result=inspectSourceArrayHtml(html,{expectedCount:1});assert.equal(result.audit.countMatch,true);assert.equal(result.audit.greenEmojiRemoved,1);assert.deepEqual(result.studentRecords[0],{...record,question_statement:'Example  question'});assert.equal(result.imported[0].correctOptionId,'option-1');assert.deepEqual(result.imported[0].metadata.sourceRecord,record);assert.deepEqual(result.imported[0].tags,record.tags);
});
test('data literal parser rejects executable expressions, duplicate keys and unsafe keys',()=>{
  for(const input of ['[{id: run()}]','[{id:1,id:2}]','[{__proto__:1}]','[{value:()=>1}]','[{value:window.secret}]'])assert.throws(()=>parseDataLiteral(input));
  const parsed=parseDataLiteral('[{id:1, text:"Literal \\"quoted\\"", options:[1,2,3,4,],}]');assert.equal(parsed.data[0].id,1);
});
test('missing answers, duplicates and malformed records are flagged, never dropped',()=>{
  const source=fixture(3);source.questions[1].text=source.questions[0].text;source.questions[1].correctOptionId='missing';source.questions[2]=null;const result=prepareImport(source);assert.equal(result.imported.length,3);assert.ok(result.issues.some(x=>x.field==='duplicate'));assert.ok(result.issues.some(x=>x.field==='answer'));assert.ok(result.issues.some(x=>x.field==='item'));assert.equal(result.publishable,false);
});
test('unsupported source formats and invalid JSON fail instead of executing scripts',()=>{
  assert.throws(()=>inspectCanonicalHtml('<script>window.questions = [];</script>'),/Unsupported/);assert.throws(()=>inspectCanonicalHtml('<script type="application/json" id="sahoo-mock-data">bad</script>'),/Invalid/);
  const result=prepareImport({...fixture(2),questionCount:332});assert.equal(result.audit.declaredCountMatches,false);assert.equal(result.audit.countMatch,false);assert.equal(result.audit.declaredSourceQuestions,332);assert.ok(result.issues.some(i=>i.field==='declared_count'&&i.severity==='blocking'));assert.equal(result.publishable,false);
});
test('option permutation keeps stable correct-answer identity',()=>{
  const q=fixture(1).questions[0],shuffled=shuffleOptions(q,['d','b','a','c']);assert.equal(shuffled.correctOptionId,'b');assert.equal(shuffled.options.find(o=>o.id===shuffled.correctOptionId).text,'Option b');assert.throws(()=>shuffleOptions(q,['a','a','b','c']));
});
test('three-calendar-month expiry clamps month ends and preserves activation time',()=>{
  assert.equal(expiryFromActivation('2026-01-31T09:30:00Z'),'2026-04-30T09:30:00.000Z');assert.equal(expiryFromActivation('2026-11-30T00:00:00Z'),'2027-02-28T00:00:00.000Z');assert.equal(expiryFromActivation('2027-11-30T00:00:00Z'),'2028-02-29T00:00:00.000Z');assert.throws(()=>expiryFromActivation('invalid'));
});
test('renewal retains remaining access or starts from approval after expiry',()=>{
  assert.deepEqual(renewalWindow({currentExpiry:'2026-12-01T00:00:00Z',approvedAt:'2026-11-01T00:00:00Z'}),{startsAt:'2026-12-01T00:00:00.000Z',expiresAt:'2027-03-01T00:00:00.000Z'});
  assert.equal(renewalWindow({currentExpiry:'2026-10-01T00:00:00Z',approvedAt:'2026-11-01T00:00:00Z'}).startsAt,'2026-11-01T00:00:00.000Z');
});
test('every unconnected backend action rejects without returning a fake success',async()=>{
  for(const operation of Object.values(academyBackend))await assert.rejects(operation({}),{code:'BACKEND_UNAVAILABLE'});
});
