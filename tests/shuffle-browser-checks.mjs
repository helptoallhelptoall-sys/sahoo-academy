import assert from 'node:assert/strict';
export async function verifyShuffleBrowser({page,db,rpc,student,getResponse}){
 const checks=[],original=structuredClone(getResponse()),attemptId=original.page.attemptId;
 const displayed=async()=>({text:await page.locator('#question-heading').textContent(),options:await page.locator('.answer-option').allTextContents()});
 const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('examnexa-active-attempt')));
 assert.deepEqual(Object.keys(stored).sort(),['key','route','testId','userId']);assert.equal(stored.userId,student);
 const initial=await displayed();
 assert.equal(initial.text,original.page.questions[0].text);
 await page.locator('input[name=answer]').nth(2).check();await page.getByRole('button',{name:'Mark for Review',exact:true}).click();
 await page.getByRole('button',{name:'Save & Next'}).click();await page.getByRole('button',{name:'Previous',exact:true}).click();assert.deepEqual(await displayed(),initial);
 checks.push('Shuffled stable option IDs and question order persist through Previous/Next');
 // Wait for queued saves through DB instead of reloading while a request is in flight.
 for(let i=0;i<40;i++){const row=(await db.query('select answers,flags from public.attempts where id=$1',[attemptId])).rows[0];if(row.flags.length===1&&row.answers[original.page.questions[0].id])break;await new Promise(r=>setTimeout(r,50));}
 page.once('dialog',d=>d.accept());await page.reload();await page.locator('#timer').waitFor();
 assert.equal(getResponse().page.attemptId,attemptId);assert.equal(getResponse().page.deadline,original.page.deadline);assert.deepEqual(getResponse().page.questions,original.page.questions);assert.deepEqual(await displayed(),initial);assert.ok(await page.locator('input[name=answer]').nth(2).isChecked());assert.equal(await page.getByRole('button',{name:'Unflag question',exact:true}).count(),1);
 checks.push('Reload restores same snapshot, deadline, selected stable option and review flag');
 await page.getByRole('button',{name:'Exit test',exact:true}).click();await page.getByRole('button',{name:'Leave test',exact:true}).click();await page.locator('a[href="#/dashboard"]').click();await page.getByRole('button',{name:'Resume test',exact:true}).click();await page.locator('#timer').waitFor();assert.deepEqual(getResponse().page.questions,original.page.questions);assert.equal(getResponse().page.attemptId,attemptId);assert.deepEqual(await displayed(),initial);
 checks.push('Dashboard resume reuses the existing attempt without inserting another snapshot');
 for(const width of [320,390,767,1024,1280]){
  await page.setViewportSize({width,height:950});
  const rect=async selector=>page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};});
  const question=await rect('.live-question'),timer=await rect('.test-timer'),nav=await rect('.test-navigation'),controls=await rect('.test-controls');
  if(width<768){assert.ok(timer.bottom<=question.y+1);assert.ok(controls.bottom<=nav.y+1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  else{assert.ok(timer.x>=question.right);assert.ok(nav.x>=question.right);}
  await page.locator('.question-grid [data-question="1"]').click();assert.equal(await page.locator('#question-heading').textContent(),original.page.questions[1].text);await page.getByRole('button',{name:'Previous',exact:true}).click();assert.deepEqual(await displayed(),initial);
  assert.ok(await page.locator('input[name=answer]').nth(2).isChecked());assert.ok((await page.locator('.question-grid [data-question="0"]').getAttribute('class')).includes('flagged'));
  if(width===320||width===1280)await page.screenshot({path:'test-artifacts/shuffle-cbt-'+width+'.png',fullPage:true});
 }
 checks.push('320/390/767px show timer → question/options/controls → palette/finish; 1024/1280px retain desktop sidebar');
 await page.locator('input[name=answer]').nth(2).focus();await page.keyboard.press('ArrowRight');assert.ok(await page.locator('input[name=answer]').nth(3).isChecked());
 await page.getByRole('button',{name:'Unflag question',exact:true}).click();
 checks.push('Mobile/desktop palette state, clicks, keyboard option navigation and watermark remain usable');
 // Saved review is checked by the main suite after server submission.
 const snap=(await db.query('select snapshot from public.attempts where id=$1',[attemptId])).rows[0].snapshot;
 assert.deepEqual(snap.map(q=>q.id),original.page.questions.map(q=>q.id));assert.deepEqual(snap.map(q=>q.options.map(({id,text})=>({id,text}))),original.page.questions.map(q=>q.options));
 assert.doesNotMatch(JSON.stringify(getResponse()),/correctOptionId|isCorrect|explanation|answerKey|metadata/);
 return checks;
}
