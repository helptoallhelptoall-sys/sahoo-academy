// Local preview metadata. Production must select only PUBLIC/PUBLISHED records on the server.
import {exams} from './data.js';
import {subjectPlans} from './commerce.js';
const pages=new Map([
  ['/',{title:'Sahoo ExamNexa | Competitive Exam Preparation',description:'Sahoo ExamNexa - Competitive Exam Preparation Platform for Odisha and All India Government Exams'}],
  ['/exams',{title:'Odisha Competitive Exam Pathways',description:'Choose an Odisha exam, then explore subjects, topics and planned topic-wise mock tests at Sahoo ExamNexa.'}],
  ['/subjects',{title:'Three-Month Subject Subscriptions',description:'Choose a subject subscription covering its included topic-wise mock tests. Preview the Sahoo ExamNexa learning catalog.'}],
  ['/tests',{title:'Free Samples & Premium Topic-wise Mock Tests',description:'Try free CBT sample tests and explore locked premium tests included in subject subscriptions.'}]
]);
for(const e of exams)pages.set('/exam/'+e.id,{title:e.name+' Preparation',description:'Explore the '+e.name+' preparation pathway: subjects, topics and topic-wise mocks. Illustrative coverage awaiting official review.'});
for(const p of subjectPlans){
  pages.set('/subject/'+p.id,{title:p.name+' – 3 Months Access',description:'Explore '+p.name+' topic-wise mock tests: '+p.topics.join(', ')+'. Preview three-month subject access and free samples.'});
  for(const topic of p.topics)pages.set('/topic/'+p.id+'?name='+encodeURIComponent(topic),{title:topic+' Topic-wise Mock Tests | '+p.name,description:'Practise '+topic+' with planned topic-wise mocks in '+p.name+'. Preview test details and three-month subject access at Sahoo ExamNexa.'});
}
export const publicPageMetadata=pages;
const xml=s=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function sitemap(origin){return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...pages.keys()].map(path=>'<url><loc>'+xml(origin+path)+'</loc></url>').join('')+'</urlset>';}
export function metadataFor(path,search=''){return pages.get(path+search)||pages.get(path);}
