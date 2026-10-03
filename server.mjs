// Local-only static preview. Only explicitly public files are served.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {metadataFor,sitemap} from './seo.mjs';
import {validPublicConfig} from './supabase-gateway.js';
try{process.loadEnvFile('.env');}catch{}
const candidate={url:process.env.PUBLIC_SUPABASE_URL,publishableKey:process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY};
const publicConfig=validPublicConfig(candidate)?candidate:{};
const root=fileURLToPath(new URL('.',import.meta.url));
const publicFiles=new Set(['index.html','app.js','data.js','commerce.js','commerce-views.js','management-views.js','import-core.js','launch-access.js','launch-views.js','supabase-gateway.js','supabase-vendor.js','backend-ui.js','styles.css','icon.svg','manifest.webmanifest']);
const mime={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',webmanifest:'application/manifest+json'};
const server=createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let file,url;
  try{url=new URL(req.url,'http://localhost');file=decodeURIComponent(url.pathname).slice(1)||'index.html';}catch{res.writeHead(400);res.end('Bad request');return;}
  const origin='http://127.0.0.1:'+Number(process.env.PORT||4173);
  if(file==='public-config.json'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(publicConfig));return;}
  if(file==='robots.txt'){res.writeHead(200,{'Content-Type':'text/plain','X-Robots-Tag':'noindex'});res.end('User-agent: *\nDisallow: /\n# Local preview: do not index. Production policy must follow server site visibility.\n');return;}
  if(file==='sitemap.xml'){res.writeHead(200,{'Content-Type':'application/xml','X-Robots-Tag':'noindex'});res.end(sitemap(origin));return;}
  const metadata=metadataFor(url.pathname,url.search);
  if(metadata)file='index.html';
  if(!publicFiles.has(file)){res.writeHead(404);res.end('Not found');return;}
  try{
    let data=await readFile(resolve(root,file));
    if(metadata){
      const safe=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const pageTitle=url.pathname==='/'?metadata.title:metadata.title+' | Sahoo ExamNexa';
      data=data.toString('utf8').replace(/<title>.*?<\/title>/,'<title>'+safe(pageTitle)+'</title>').replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="'+safe(metadata.description)+'">');
      data=data.replace('</head>','<link rel="canonical" href="'+safe(origin+url.pathname+url.search)+'"></head>');
    }
    res.writeHead(200,{'Content-Type':mime[file.split('.').pop()]||'application/octet-stream','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' ${publicConfig.url||''}; connect-src 'self' ${publicConfig.url||''}; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'`});
    res.end(req.method==='HEAD' ? undefined : data);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('Sahoo ExamNexa preview: http://127.0.0.1:4173'));
