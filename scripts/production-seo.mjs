import {createHash} from 'node:crypto';
import {homeTitle, homeDescription} from '../public-seo.js';

const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const newSite = 'https://sahooexamnexa.github.io/';
export const oldSite = 'https://helptoallhelptoall-sys.github.io/sahoo-academy/';

export function productionSeo(site, redirectTarget) {
  // Opt-in only AFTER new-site live verification. Never redirect the new site.
  if (redirectTarget && (site.href !== oldSite || redirectTarget !== newSite)) throw Error('Unsupported migration redirect target/site.');
  const canonical = redirectTarget || site.href;
  const image = new URL('sahoo-examnexa-icon-512.png', canonical).href;
  const json = JSON.stringify({'@context':'https://schema.org','@graph':[
    {'@type':'Organization','@id':canonical+'#organization',name:'Sahoo ExamNexa',url:canonical,logo:image},
    {'@type':'WebSite','@id':canonical+'#website',name:'Sahoo ExamNexa',url:canonical,inLanguage:'en',publisher:{'@id':canonical+'#organization'}}
  ]}).replace(/</g,'\\u003c');
  return {
    head: `<link rel="canonical" href="${escape(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Sahoo ExamNexa">
  <meta property="og:title" content="${escape(homeTitle)}">
  <meta property="og:description" content="${escape(homeDescription)}">
  <meta property="og:url" content="${escape(canonical)}">
  <meta property="og:image" content="${escape(image)}">
  <meta property="og:image:alt" content="Sahoo ExamNexa official logo">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escape(homeTitle)}">
  <meta name="twitter:description" content="${escape(homeDescription)}">
  <meta name="twitter:image" content="${escape(image)}">
  <script type="application/ld+json">${json}</script>`,
    hash: createHash('sha256').update(json).digest('base64'),
    title: escape(homeTitle), description: escape(homeDescription),
    // Static content visible even without JS, replaced by the existing app once ready.
    landing: `<main id="main" tabindex="-1"><h1>Sahoo ExamNexa</h1>
      <h2>Odisha competitive exam preparation</h2>
      <p>Explore topic-wise mock tests for your exam preparation. Start by choosing an exam, then a subject, topic and available free or premium test.</p>
      <p>For learners preparing for Odisha Police SI, PEO and Civil Constable: check the current catalog for available practice material. An exam mention does not guarantee a published test or official syllabus coverage.</p>
      <p>Previous-year questions (PYQs) carry their source labels where supplied; practice questions are not a claim of official exam provenance. Sahoo ExamNexa is an independent preparation platform, not a government recruitment authority.</p>
      <a href="#/exams">Choose Exam — view available mock tests</a>
      <p>Enable JavaScript to use the catalog and sign in to take a test.</p></main>`,
    // Only real public HTML documents belong here. Do not list # routes, fixture
    // catalogs, drafts, Admin, Auth, results or student-specific URLs.
    sitemap: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escape(canonical)}</loc></url></urlset>\n`,
    robots: 'User-agent: *\nAllow: '+site.pathname+'\n'+['admin','account','dashboard','login','register','forgot-password','reset-password.html','results','orders','purchase','test/','api/','auth/','public-config.json'].map(p=>'Disallow: '+site.pathname+p).join('\n')+'\nSitemap: '+new URL('sitemap.xml',canonical).href+'\n',
    redirectScript: redirectTarget ? `// Public-navigation migration only. Never forward auth material or sessions.
const target=${JSON.stringify(redirectTarget)};
let signedIn=true;
try { signedIn=Object.keys(localStorage).some(k=>/^sb-.*-auth-token$/.test(k)); } catch {}
const safeRoute=/^#\\/(?:home|exams|exam|subjects|subject|topic|tests|about|privacy|help)(?:\\/[a-zA-Z0-9_-]+)?$/;
const atHome=location.pathname===${JSON.stringify(site.pathname)}||location.pathname===${JSON.stringify(site.pathname+'index.html')};
if (!signedIn && atHome && !location.search && (!location.hash || safeRoute.test(location.hash))) location.replace(target+location.hash);
` : null
  };
}
