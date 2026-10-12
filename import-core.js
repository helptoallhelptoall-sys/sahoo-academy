// Pure audit functions, not an upload endpoint or authorization boundary.
// Never evaluates uploaded scripts, renders uploaded HTML, drops or merges a question.
const copy=value=>JSON.parse(JSON.stringify(value));
export function removeGreenEmoji(value){
  // Only canonical student-facing question text is normalized. Everything else is preserved.
  if(Array.isArray(value))return value.map(removeGreenEmoji);
  if(value && typeof value==='object')return {...copy(value),...(typeof value.text==='string'?{text:value.text.replaceAll('🟢','')}:{})};
  return value;
}
export function prepareImport(source){
  if(!source || !Array.isArray(source.questions))throw new Error('Unsupported source: a canonical questions array is required. No questions imported.');
  if(source.questions.length===0)throw new Error('The source contains no questions.');
  const original=copy(source.questions),imported=removeGreenEmoji(original);
  const declaredCountMatches=source.questionCount===undefined || source.questionCount===original.length;
  const audit={sourceQuestions:original.length,declaredSourceQuestions:source.questionCount??null,importedQuestions:imported.length,added:0,removed:0,countMatch:original.length===imported.length && declaredCountMatches,declaredCountMatches,greenEmojiRemoved:original.reduce((n,q)=>n+(q?.text?.match(/🟢/gu)||[]).length,0)};
  const issues=auditQuestions(imported);
  if(!declaredCountMatches)issues.unshift({number:null,field:'declared_count',severity:'blocking',message:`Source declares ${source.questionCount} questions but only ${original.length} records were extracted. Resolve the source/adapter discrepancy; never fabricate missing questions.`});
  return {original,imported,metadata:copy(source.metadata||{}),audit,issues,pass2:'pending',publishable:false};
}
export function auditQuestions(items){
  const issues=[],seen=new Map(),ids=new Set();
  const issue=(index,field,message)=>issues.push({number:index+1,field,severity:'blocking',message});
  for(const [i,q] of items.entries()){
    if(!q || typeof q!=='object' || Array.isArray(q)){issue(i,'item','Malformed question record. Preserve the record and resolve manually.');continue;}
    if(!q.id || ids.has(q.id))issue(i,'id','Missing or duplicate question ID.');ids.add(q.id);
    if(q.number!==i+1)issue(i,'number','Source numbering is missing, repeated or out of sequence.');
    if(typeof q.text!=='string' || !q.text.trim())issue(i,'text','Question text is missing.');
    if(!Array.isArray(q.options)||q.options.length!==4)issue(i,'options','Exactly four options are required for this CBT format. Do not add or remove options automatically.');
    const options=Array.isArray(q.options)?q.options:[];
    const optionIds=options.map(o=>o?.id);
    if(new Set(optionIds).size!==optionIds.length || optionIds.some(id=>!id))issue(i,'options','Option IDs must be present and unique for stable answer mapping.');
    if(options.some(o=>typeof o?.text!=='string'||!o.text.trim()))issue(i,'options','One or more option texts are missing.');
    if(!q.correctOptionId || !optionIds.includes(q.correctOptionId))issue(i,'answer','Correct-answer mapping is missing or does not reference an option.');
    if(typeof q.explanation!=='string'||!q.explanation.trim())issue(i,'explanation','Explanation is missing.');
    if(!Array.isArray(q.tags))issue(i,'tags','Source/PYP tags must be an array; an empty array means the source supplied none.');
    if(typeof q.topic!=='string'||!q.topic.trim())issue(i,'topic','Topic metadata is missing.');
    const fingerprint=JSON.stringify([q.text,options.map(o=>o?.text)]);
    if(seen.has(fingerprint))issue(i,'duplicate',`Exact repeated question content also appears at question ${seen.get(fingerprint)}. Review; do not delete automatically.`);else seen.set(fingerprint,i+1);
  }
  return issues;
}
export function shuffleOptions(question,order){
  const ids=question.options.map(o=>o.id);
  if(ids.length!==4 || new Set(ids).size!==ids.length || order.length!==ids.length || new Set(order).size!==ids.length || order.some(id=>!ids.includes(id)) || !ids.includes(question.correctOptionId))throw new Error('Invalid option permutation or answer mapping.');
  return {...copy(question),options:order.map(id=>copy(question.options.find(o=>o.id===id)))};
}
