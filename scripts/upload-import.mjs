// Same dispatch in production, browser integration tests and offline acceptance.
import {inspectCanonicalHtml} from './html-import.mjs';
import {inspectSourceArrayHtml} from './source-array-import.mjs';
export function inspectUploadedHtml(html,expectedCount){
  return html.includes('<script type="application/json" id="sahoo-mock-data">')
    ? inspectCanonicalHtml(html)
    : inspectSourceArrayHtml(html,{expectedCount});
}
