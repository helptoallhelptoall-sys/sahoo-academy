// Public merchandising metadata only. No premium question IDs, prompts, options or answers.
// A purchase covers one SUBJECT for 3 calendar months, never an HTML file or single test.
export const subjectPlans = Object.freeze([
  {id:'geography',name:'Geography',icon:'globe',color:'sage',pricePaise:29900,topics:['Solar System','Atmosphere','Rivers','Earth','Climate']},
  {id:'quant',name:'Quantitative Aptitude',icon:'calculator',color:'sand',pricePaise:24900,topics:['Percentages','Ratio & proportion','Profit & loss','Time & work']},
  {id:'reasoning',name:'Logical Reasoning',icon:'spark',color:'lilac',pricePaise:24900,topics:['Number series','Analogies','Coding & decoding','Directions']},
  {id:'gk',name:'General Knowledge',icon:'landmark',color:'blue',pricePaise:29900,topics:['Odisha geography','Indian history','Indian polity','General science']},
  {id:'english',name:'English Language',icon:'book',color:'sand',pricePaise:19900,topics:['Grammar','Vocabulary','Reading comprehension','Sentence correction']},
  {id:'odia',name:'Odia Language',icon:'pen',color:'pink',pricePaise:19900,topics:['ବ୍ୟାକରଣ / Grammar','ଶବ୍ଦଭଣ୍ଡାର / Vocabulary','Reading comprehension','Literature basics']},
  {id:'computer',name:'Computer Awareness',icon:'monitor',color:'sage',pricePaise:19900,topics:['Computer fundamentals','Internet basics','Office applications','Digital safety']}
].map(p=>Object.freeze({...p,currency:'INR',validityMonths:3,priceStatus:'illustrative',visibility:'published',includedContent:'All included topic-wise mock tests in this subject'})));
export const premiumTests=Object.freeze(subjectPlans.flatMap(p=>p.topics.map((topic,i)=>Object.freeze({id:`${p.id}-topic-${i+1}`,planId:p.id,title:`${topic} · Topic Mock 01`,topic,type:'Topic-wise',subject:p.name,access:'paid',questionCount:40,minutes:10,color:p.color,desc:`Planned topic-wise practice, included with ${p.name} – 3 Months Access.`}))));
export const money = paise => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(paise/100);
// Documentation for display; no client-side transition function or entitlement mutation exists.
export const orderStatuses = Object.freeze([
  {id:'awaiting_payment',label:'Awaiting payment',description:'A server-created order is waiting for payment and a transaction reference.'},
  {id:'pending_review',label:'Pending review',description:'The UTR is submitted. Access stays locked while ExamNexa checks receipt.'},
  {id:'approved',label:'Approved',description:'An authorized admin confirmed receipt; the server activates three-month subject access atomically.'},
  {id:'rejected',label:'Rejected',description:'Payment could not be matched. A reason and permitted next step are shown.'},
  {id:'expired',label:'Expired',description:'The payment window ended. Any late payment needs reconciliation.'},
  {id:'refunded',label:'Refunded',description:'An authorized refund is recorded and access follows the refund policy.'}
]);
export function validateTestPrice(access, price) {
  if(!['Free sample','Paid / Premium'].includes(access))return 'Choose a valid access type.';
  const amount=Number(price);
  if(String(price).trim()==='' || !Number.isFinite(amount) || amount<0 || amount>100000 || Math.abs(amount*100-Math.round(amount*100))>0.00001)return 'Enter a valid price with at most two decimal places.';
  if(access==='Free sample' && amount!==0)return 'A free sample must have a price of ₹0.';
  if(access==='Paid / Premium' && amount<=0)return 'A paid test must have a price greater than ₹0.';
  return '';
}
export const getPlan=id=>subjectPlans.find(p=>p.id===id);
export function defaultDurationSeconds(count,overrideMinutes=null){
  if(!Number.isSafeInteger(count)||count<=0)throw new Error('A positive question count is required.');
  if(overrideMinutes!==null && (!Number.isFinite(overrideMinutes)||overrideMinutes<=0))throw new Error('Timer override must be positive.');
  return overrideMinutes===null ? count*15 : Math.round(overrideMinutes*60);
}
