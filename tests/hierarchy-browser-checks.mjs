import assert from 'node:assert/strict';
import {inspectCanonicalHtml} from '../scripts/html-import.mjs';

// Called by the real SDK/handler/PGlite browser suite in development and dist/.
export async function verifyHierarchy({page,go,db,rpc,admin,html}){
 const checks=[],save=(entity,record)=>rpc(admin,'adminSave',{entity,record});
 const original=await db.query('select test_id,number,content from public.questions order by test_id,number');
 for(const [exam,name] of [['si','Odisha Police SI'],['peo','OSSSC PEO'],['forest','Forest Guard'],['hidden','Hidden exam']]){
  await save('exams',{id:exam,name,published:exam!=='hidden'});
  await save('subjects',{id:exam+'-computer',name:'Computer',exam_ids:[exam],published:true,price_paise:9900,validity_months:3});
  await save('topics',{id:exam+'-intro',name:'Introduction to Computer',subject_id:exam+'-computer',published:true});
  for(const access of ['free','paid']){
   const record={id:exam+'-'+access,subject_id:exam+'-computer',topic_id:exam+'-intro',title:name+' '+(access==='free'?'Introduction to Computer — Practice Test 1':'Premium Test'),access,duration_seconds:600,published:false};
   await save('tests',record);await rpc(admin,'adminImport',{testId:record.id,html,import:inspectCanonicalHtml(html)});const imp=(await db.query('select id from public.imports where test_id=$1',[record.id])).rows[0];await rpc(admin,'adminVerifyContent',{importId:imp.id,decision:'approve',reason:'Synthetic complete content review in isolated database only.'});await save('tests',{...record,published:true});
  }
 }
 await save('subjects',{id:'si-hidden',name:'Hidden subject',exam_ids:['si'],price_paise:0,published:false});
 await save('topics',{id:'si-hidden-topic',subject_id:'si-computer',name:'Hidden topic',published:false});
 await save('tests',{id:'si-hidden-test',subject_id:'si-computer',topic_id:'si-intro',title:'Hidden test',access:'free',duration_seconds:600,published:false});
 await go('home');await page.getByRole('heading',{level:1,name:'Choose Exam',exact:true}).waitFor();
 const examCards=page.locator('main .card');assert.ok(!(await examCards.allTextContents()).join(' ').includes('Hidden exam'));assert.ok(!(await examCards.allTextContents()).join(' ').includes('Computer'));
 await examCards.filter({has:page.getByRole('heading',{level:2,name:'Odisha Police SI',exact:true})}).getByRole('link',{name:'Choose exam',exact:true}).click();
 await page.getByRole('heading',{level:1,name:'Odisha Police SI',exact:true}).waitFor();assert.equal(await page.locator('main .grid.cols-3 > .card h2').allTextContents().then(x=>x.join()),'Computer');assert.ok(!(await page.locator('main').innerText()).includes('OSSSC PEO'));
 await page.getByRole('link',{name:'Explore topics',exact:true}).click();await page.getByRole('heading',{level:1,name:'Computer',exact:true}).waitFor();
 assert.equal(await page.locator('main .grid.cols-3 > .card h2').allTextContents().then(x=>x.join()),'Introduction to Computer');assert.ok(page.url().includes('subject/si-computer?exam=si'));
 await page.getByRole('link',{name:'View tests',exact:true}).click();await page.getByRole('heading',{level:1,name:'Introduction to Computer',exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'View test',exact:true}).count(),2);const text=await page.locator('main').innerText();assert.ok(text.includes('FREE')&&text.includes('PREMIUM'));assert.ok(!/OSSSC PEO|Forest Guard|Hidden test/.test(text));
 checks.push('Choose Exam → Police SI → Computer → Introduction → only SI FREE/PREMIUM tests');
 await page.goBack();await page.getByRole('heading',{level:1,name:'Computer',exact:true}).waitFor();await page.goForward();await page.getByRole('heading',{level:1,name:'Introduction to Computer',exact:true}).waitFor();await page.reload();await page.getByRole('heading',{level:1,name:'Introduction to Computer',exact:true}).waitFor();assert.ok(page.url().includes('exam=si'));
 checks.push('Browser back, forward, reload and breadcrumbs preserve exam context');
 await go('exam/peo');await page.getByRole('heading',{level:1,name:'OSSSC PEO',exact:true}).waitFor();await page.getByRole('link',{name:'Explore topics',exact:true}).click();await page.getByRole('link',{name:'View tests',exact:true}).click();await page.getByRole('heading',{level:1,name:'Introduction to Computer',exact:true}).waitFor();const peo=await page.locator('main').innerText();assert.ok(peo.includes('OSSSC PEO'));assert.ok(!peo.includes('Odisha Police SI'));
 checks.push('Same display name Computer has distinct SI/PEO topics and tests without name-based sharing');
 for(const route of ['exam/hidden','subject/si-computer?exam=peo','topic/peo-intro?exam=si','test/peo-free?exam=si','subject/si-hidden','topic/si-hidden-topic','test/si-hidden-test']){await go(route);await page.getByText('This exam, subject, topic or test is unavailable in the selected hierarchy.',{exact:true}).waitFor();assert.equal(await page.locator('main [data-start]').count(),0);}
 checks.push('Forged cross-exam direct routes and all hidden catalog routes fail closed');
 await go('topic/si-intro');await page.getByRole('heading',{level:1,name:'Introduction to Computer',exact:true}).waitFor();assert.ok((await page.locator('[aria-label="Test hierarchy"]').innerText()).includes('Odisha Police SI'));
 await go('test/si-paid?exam=si');await page.getByRole('button',{name:'Start Premium Mock',exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'Start Premium Mock',exact:true}).isDisabled());
 checks.push('Legacy ID routes resolve their actual exam; premium remains entitlement-locked');
 await go('admin/subjects');await page.locator('#live-exam_ids').waitFor();await page.locator('#live-id').fill('peo-extra');await page.locator('#live-name').fill('Computer');await page.locator('#live-exam_ids').selectOption('peo');await page.getByRole('button',{name:'Save to database',exact:true}).click();await page.getByText('Saved successfully.',{exact:true}).waitFor();assert.deepEqual((await db.query("select exam_ids from public.subjects where id='peo-extra'")).rows[0].exam_ids,['peo']);
 checks.push('Admin subject creation selects an actual parent exam and stores exact ID mapping');
 await go('admin/topics');await page.locator('#live-subject_id').waitFor();const labels=await page.locator('#live-subject_id option').allTextContents();assert.ok(labels.includes('Odisha Police SI → Computer'));assert.ok(labels.includes('OSSSC PEO → Computer'));
 await page.locator('#live-id').fill('peo-extra-topic');await page.locator('#live-name').fill('Introduction to Computer');await page.locator('#live-subject_id').selectOption('peo-extra');await page.getByRole('button',{name:'Save to database',exact:true}).click();await page.getByText('Saved successfully.',{exact:true}).waitFor();
 await go('admin/tests');await page.locator('#live-subject_id').waitFor();await page.locator('#live-id').fill('peo-draft');await page.locator('#live-title').fill('PEO isolated draft');await page.locator('#live-subject_id').selectOption('si-computer');assert.deepEqual(await page.locator('#live-topic_id option').evaluateAll(xs=>xs.map(x=>x.value).sort()),['','si-hidden-topic','si-intro']);
 await page.locator('#live-topic_id').selectOption('si-intro');await page.locator('#live-subject_id').selectOption('peo-extra');assert.equal(await page.locator('#live-topic_id').inputValue(),'');assert.deepEqual(await page.locator('#live-topic_id option').evaluateAll(xs=>xs.map(x=>x.value)),['','peo-extra-topic']);await page.locator('#live-topic_id').selectOption('peo-extra-topic');await page.getByRole('button',{name:'Save to database',exact:true}).click();await page.getByText('Saved successfully.',{exact:true}).waitFor();
 const draft=(await db.query("select subject_id,topic_id,published from public.tests where id='peo-draft'")).rows[0];assert.deepEqual(draft,{subject_id:'peo-extra',topic_id:'peo-extra-topic',published:false});
 checks.push('Admin parent labels disambiguate subjects; changing subject resets incompatible topic and saves correct draft placement');
 for(const width of [320,1280]){await page.setViewportSize({width,height:900});for(const r of ['exams','exam/si','subject/si-computer?exam=si','topic/si-intro?exam=si','admin/tests','admin/topics','admin/subjects']){await go(r);await page.locator('main h2, main h1').first().waitFor();await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width+' '+r);}await go('topic/si-intro?exam=si');await page.getByRole('heading',{level:1,name:'Introduction to Computer',exact:true}).waitFor();await page.screenshot({path:'test-artifacts/hierarchy-'+width+'.png',fullPage:true});}
 checks.push('Exam/topic and Admin hierarchy controls fit 320px and desktop');
 const after=(await db.query("select test_id,number,content from public.questions where test_id in ('free','paid') order by test_id,number"));assert.deepEqual(after.rows,original.rows);
 checks.push('Existing isolated imported questions remain byte-for-byte unchanged during hierarchy operations');
 return checks;
}
