// NON-PUBLIC offline adapter prototype. Not an upload server; no publish/approval capability.
// Supported source is explicit canonical JSON embedded in HTML. Unknown source formats fail closed.
import {createHash} from 'node:crypto';
import {prepareImport} from '../import-core.js';
export function inspectCanonicalHtml(html){
  if(typeof html!=='string' || Buffer.byteLength(html)>10*1024*1024)throw new Error('Source must be UTF-8 HTML within the 10 MB prototype limit.');
  const marker='<script type="application/json" id="sahoo-mock-data">';
  const start=html.indexOf(marker);
  if(start<0 || html.indexOf(marker,start+marker.length)!==-1)throw new Error('Unsupported or ambiguous HTML export. A source-specific adapter is required; nothing was imported.');
  const end=html.indexOf('</script>',start+marker.length);
  if(end<0)throw new Error('Unterminated data block. Nothing was imported.');
  let source;
  try{source=JSON.parse(html.slice(start+marker.length,end));}catch{throw new Error('Invalid canonical JSON. Nothing was imported.');}
  const result=prepareImport(source);
  return {...result,sourceSha256:createHash('sha256').update(html).digest('hex'),format:'sahoo-canonical-v1'};
}
