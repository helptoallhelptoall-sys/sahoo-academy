import {build} from 'esbuild';
await build({stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:process.cwd(),sourcefile:'supabase-client-entry.js'},outfile:'supabase-vendor.js',bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,legalComments:'eof'});
console.log('Built official Supabase browser client. No environment values are bundled.');
