import {spawnSync} from 'node:child_process';
for(const state of ['old-old-off','old-new-off','new-old-off','new-new-off','new-new-on']){
 const r=spawnSync(process.execPath,['tests/rollout-browser.mjs'],{env:{...process.env,ROLLOUT_STATE:state},stdio:'inherit',windowsHide:true});
 if(r.error)throw r.error;
 if(r.status!==0)process.exit(r.status||1);
}
