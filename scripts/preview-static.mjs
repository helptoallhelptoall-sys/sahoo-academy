// Local Pages-equivalent preview: only the generated artifact is served.
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const html=await readFile(root+'index.html','utf8');
const base=html.match(/<base href="([^"]+)">/)[1];
const files=new Set(await readdir(root));
const mime={html:'text/html',js:'text/javascript',css:'text/css',json:'application/json',svg:'image/svg+xml',webmanifest:'application/manifest+json'};
createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  let path;try{path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
  if(path===base.slice(0,-1)){res.writeHead(301,{Location:base});return res.end();}
  const file=path.startsWith(base)?path.slice(base.length)||'index.html':null;
  const found=file&&files.has(file);const chosen=found?file:'404.html';
  res.writeHead(found?200:404,{'Content-Type':mime[chosen.split('.').pop()]||'text/plain','Cache-Control':'no-store'});
  res.end(req.method==='HEAD'?undefined:await readFile(root+chosen));
}).listen(Number(process.env.PORT||4174),'127.0.0.1',()=>console.log('Static artifact preview ready on local port '+(process.env.PORT||4174)));
