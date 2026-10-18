import assert from 'node:assert/strict';

// Disposable PGlite data and isolated Auth transport only; run in dev and dist/.
export async function verifyAttemptPolicyBrowser({page,go,db,rpc,admin,getResponse}){
 const checks=[];
 await rpc(admin,'adminSave',{entity:'tests',record:{id:'policy-fixture',title:'Timer and scoring fixture',subject_id:'subject',topic_id:'topic',access:'free',published:false,timer_mode:'automatic'}});
 const qs=Array.from({length:3},(_,i)=>({id:'policy-q'+i,number:i+1,text:'Policy fixture '+i,options:['A','B','C','D'].map((text,j)=>({id:'o'+j,text})),correctOptionId:'o1',explanation:'Synthetic review '+i,tags:[],topic:'Fixture'}));
 // Install synthetic reviewed records using the trusted manual-question path.
 for(const q of qs)await rpc(admin,'adminSaveQuestion',{testId:'policy-fixture',expectedRevision:q.number-1,question:{...q,correctIndex:1}});
 const testrow=async()=>(await db.query("select * from public.tests where id='policy-fixture'")).rows[0];
 const open=async()=>{
  await go('admin/tests');
  await page.locator('.data-table tr').filter({hasText:'Timer and scoring fixture'}).getByRole('button',{name:'Edit',exact:true}).click();
  await page.locator('#live-timer_mode').waitFor();
 };
 const save=async()=>{await page.getByRole('button',{name:'Save to database',exact:true}).click();await page.getByText('Saved successfully.',{exact:true}).waitFor();};
 await open();assert.equal(await page.locator('#live-timer_mode').inputValue(),'automatic');assert.equal(await page.locator('[data-auto-duration]').innerText(),'1 min');assert.ok(await page.locator('#live-manual_duration_seconds').isDisabled());
 await page.locator('#live-timer_mode').selectOption('manual');await page.locator('#live-manual_duration_seconds').fill('3000');await save();await page.reload();await open();assert.equal(await page.locator('#live-manual_duration_seconds').inputValue(),'3000');assert.equal((await testrow()).duration_seconds,3000);
 checks.push('Admin Automatic/Manual selector: manual 3000 seconds saves and survives reload');
 await page.locator('#live-timer_mode').selectOption('automatic');await save();await open();assert.equal((await testrow()).duration_seconds,60);assert.equal((await testrow()).manual_duration_seconds,3000);
 await page.locator('#live-timer_mode').selectOption('manual');assert.equal(await page.locator('#live-manual_duration_seconds').inputValue(),'3000');await save();
 checks.push('Manual → Automatic recalculates; Automatic → Manual restores the saved manual duration');
 await page.setViewportSize({width:320,height:900});await open();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1280,height:1000});
 checks.push('Automatic and Manual timer controls fit 320px and desktop');
 await rpc(admin,'adminReviewQuestions',{testId:'policy-fixture',expectedRevision:(await testrow()).revision,decision:'approve',reason:'Reviewed every isolated policy fixture answer and explanation.'});
 await rpc(admin,'adminSave',{entity:'tests',record:{...(await testrow()),published:true}});
 await db.exec('update public.admin_settings set telegram_required=false');
 await go('test/policy-fixture');await page.locator('main .page-title').filter({hasText:'+1 correct / −0.25 incorrect / 0 unanswered'}).waitFor();
 await page.locator('button[data-start]').click();await page.locator('#timer').waitFor();const attempt=getResponse();
 assert.equal(attempt.page.scoringVersion,2);assert.equal(attempt.page.durationSeconds,3000);
 assert.doesNotMatch(JSON.stringify(attempt),/correctOptionId|isCorrect|explanation/);
 await page.locator('input[name=answer]').nth(attempt.page.questions[0].options.findIndex(o=>o.id==='o1')).check();
 await page.getByRole('button',{name:'Save & Next'}).click();
 await page.locator('input[name=answer]').nth(attempt.page.questions[1].options.findIndex(o=>o.id==='o0')).check();
 await page.getByRole('button',{name:'Finish & review'}).click();await page.getByRole('button',{name:'Submit sample'}).click();await page.locator('.score-ring b').waitFor();
 assert.equal(await page.locator('.score-ring b').innerText(),'0.75/3');
 assert.deepEqual(await page.locator('.score-breakdown dd').allTextContents(),['1','1','1','1.00','−0.25']);
 const result=await rpc(admin,'result',{attemptId:attempt.page.attemptId});assert.equal(result.score,.75);
 for(let i=0;i<3;i++)assert.deepEqual(await page.locator('.review-item').nth(i).locator('.review-options li').allTextContents(),attempt.page.questions[i].options.map(o=>o.text));
 checks.push('Browser score 0.75/3 matches server (+1/−0.25/0); breakdown and exact shuffled review order verified');
 await page.reload();await page.locator('main p').filter({hasText:'policy-fixture'}).getByRole('button',{name:'Review result'}).click();await page.locator('.score-ring b').waitFor();assert.equal(await page.locator('.score-ring b').innerText(),'0.75/3');
 checks.push('Decimal score and deductions survive saved-result reload');
 // Restore the isolated fixture catalog before the unrelated hierarchy suite.
 await db.exec("delete from public.attempts where test_id='policy-fixture';delete from public.manual_test_reviews where test_id='policy-fixture';delete from public.questions where test_id='policy-fixture';delete from public.tests where id='policy-fixture'");
 assert.equal((await db.query("select count(*)::int n from public.tests where id='policy-fixture'")).rows[0].n,0);
 checks.push('Disposable timer/scoring fixture cleaned up inside the isolated database');
 return checks;
}
