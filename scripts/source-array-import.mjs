// NON-PUBLIC source-specific adapter for HTML containing `const questions = [...]`.
// Only a restricted data-literal grammar is read. No eval, VM, DOM or source execution.
import {createHash} from 'node:crypto';
import {prepareImport} from '../import-core.js';

export function parseDataLiteral(source,start=0){
  let position=start;
  const whitespace=()=>{while(/\s/.test(source[position]||'')&&position<source.length)position++;};
  const fail=message=>{throw new Error(`${message} at source offset ${position}. Nothing is executed.`);};
  function string(){
    const begin=position++;
    while(position<source.length){const char=source[position++];if(char==='\\'){position++;continue;}if(char==='"'){try{return JSON.parse(source.slice(begin,position));}catch{fail('Invalid quoted string');}}}
    fail('Unterminated string');
  }
  function value(){
    whitespace();const char=source[position];
    if(char==='"')return string();
    if(char==='['){position++;const result=[];whitespace();if(source[position]===']'){position++;return result;}while(true){result.push(value());whitespace();if(source[position]===']'){position++;return result;}if(source[position++]!==',')fail('Expected array delimiter');whitespace();if(source[position]===']'){position++;return result;}}}
    if(char==='{'){position++;const result=Object.create(null);whitespace();if(source[position]==='}'){position++;return result;}while(true){whitespace();let key;if(source[position]==='"')key=string();else{const found=source.slice(position).match(/^[A-Za-z_$][\w$]*/);if(!found)fail('Invalid object key');key=found[0];position+=key.length;}if(Object.hasOwn(result,key))fail('Duplicate object key');if(['__proto__','prototype','constructor'].includes(key))fail('Unsafe object key');whitespace();if(source[position++]!==':')fail('Expected colon');result[key]=value();whitespace();if(source[position]==='}'){position++;return result;}if(source[position++]!==',')fail('Expected object delimiter');whitespace();if(source[position]==='}'){position++;return result;}}}
    const literal=source.slice(position).match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)(?=[\s,\]}])/);
    if(literal){position+=literal[0].length;return JSON.parse(literal[0]);}
    fail('Only plain data literals are supported');
  }
  const data=value();return {data,end:position};
}

export function inspectSourceArrayHtml(html,{expectedCount}={}){
  if(typeof html!=='string'||Buffer.byteLength(html)>10*1024*1024)throw new Error('Source must be UTF-8 HTML within 10 MB.');
  const matches=[...html.matchAll(/\bconst\s+questions\s*=\s*(?=\[)/g)];
  if(matches.length!==1)throw new Error('Expected one unambiguous const questions array. Use a source-specific adapter.');
  const start=matches[0].index+matches[0][0].length;
  const {data:parsedRecords,end}=parseDataLiteral(html,start);
  const records=JSON.parse(JSON.stringify(parsedRecords));
  if(!Array.isArray(records))throw new Error('Question bank must be an array.');
  if(!/^\s*;?\s*<\/script\s*>/i.test(html.slice(end)))throw new Error('Unexpected code after question data; manual adapter review required.');
  for(const [i,q] of records.entries()){
    if(!q||typeof q!=='object'||typeof q.question_statement!=='string'||!Array.isArray(q.options))throw new Error(`Unsupported question structure at record ${i+1}; no records dropped.`);
  }
  const canonical=records.map((q,i)=>({
    id:String(q.id??`source-position-${i+1}`),number:i+1,text:q.question_statement,
    options:q.options.map((text,j)=>({id:`option-${j}`,text})),
    correctOptionId:Number.isInteger(q.correct)?`option-${q.correct}`:null,
    explanation:q.explanation,topic:q.chapter,
    tags:Array.isArray(q.tags)?q.tags:[],
    metadata:{sourceIndex:i,sourceId:q.id,sourceRecord:q}
  }));
  const declaredCount=expectedCount??Number(html.match(/new\s+Array\((\d+)\)\.fill\(null\)/)?.[1]??records.length);
  const result=prepareImport({questionCount:declaredCount,questions:canonical,metadata:{format:'const-questions-data-v1'}});
  return {...result,sourceRecords:records,studentRecords:records.map(q=>({...q,question_statement:q.question_statement.replaceAll('🟢','')})),sourceSha256:createHash('sha256').update(html).digest('hex'),arraySource:html.slice(start,end),format:'const-questions-data-v1',sourceLineStart:html.slice(0,start).split('\n').length};
}
