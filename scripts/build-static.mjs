import {readFile,writeFile,mkdir,readdir,rm,copyFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {validPublicConfig} from '../supabase-gateway.js';
import {publicFiles} from './public-files.mjs';

export function staticConfig(env) {
  const config={url:env.PUBLIC_SUPABASE_URL,publishableKey:env.PUBLIC_SUPABASE_PUBLISHABLE_KEY};
  if(!validPublicConfig(config))throw Error('Missing/invalid public Supabase configuration. Values are not logged.');
  let site;try{site=new URL(env.PUBLIC_SITE_URL);}catch{throw Error('PUBLIC_SITE_URL must be the final HTTPS site URL.');}
  if(site.protocol!=='https:'||site.username||site.password||site.search||site.hash||!/^\/[A-Za-z0-9/_-]*$/.test(site.pathname))throw Error('Invalid production site URL.');
  site.pathname=site.pathname.replace(/\/?$/,'/');
  return {config,site};
}
export async function buildStatic(env=process.env) {
  const {config,site}=staticConfig(env); // Fail before touching an existing artifact.
  const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'dist');
  if(out!==resolve(root,'dist'))throw Error('Invalid artifact directory');
  await mkdir(out,{recursive:true});
  if((await lstat(out)).isSymbolicLink())throw Error('Artifact directory must not be a symlink');
  // Only remove checked immediate files in this dedicated generated directory.
  for(const entry of await readdir(out,{withFileTypes:true})){
    if(!entry.isFile())throw Error('Unexpected directory/link in dist; inspect manually.');
  }
  for(const name of await readdir(out))await rm(resolve(out,name));
  for(const name of publicFiles.filter(n=>!['index.html','supabase-vendor.js'].includes(n)))await copyFile(resolve(root,name),resolve(out,name));
  await build({stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:root,sourcefile:'supabase-client-entry.js'},outfile:resolve(out,'supabase-vendor.js'),bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,legalComments:'eof'});
  const csp=`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' ${config.url}; connect-src 'self' ${config.url}; object-src 'none'; base-uri 'self'; form-action 'none'`;
  let html=(await readFile(resolve(root,'index.html'),'utf8')).replace('<base href="/">',`<base href="${site.pathname}">`).replace('<meta name="robots" content="noindex, nofollow">','<meta name="robots" content="index, follow">');
  html=html.replace('<base ',`<meta http-equiv="Content-Security-Policy" content="${csp}">\n  <meta name="referrer" content="no-referrer">\n  <base `);
  await writeFile(resolve(out,'index.html'),html);
  await writeFile(resolve(out,'404.html'),html.replace('content="index, follow"','content="noindex, nofollow"'));
  await writeFile(resolve(out,'public-config.json'),JSON.stringify(config));
  await writeFile(resolve(out,'.nojekyll'),'');
  console.log('Built restricted static artifact: dist/. Public configuration validated; values not logged.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildStatic();
