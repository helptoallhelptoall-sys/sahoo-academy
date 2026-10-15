// UI convenience only. Every scope, revision, deletion impact and mutation is checked by SQL.
export function moveItem(ids,id,position){
  if(!Number.isInteger(position)||position<1||position>ids.length||!ids.includes(id))throw Error('Choose a valid display position.');
  const next=ids.filter(x=>x!==id);next.splice(position-1,0,id);return next;
}
export function createOrderControls({gateway,get,escape:e,render,clear,admin}){
  const scopes=new Map(),states=new Map();let busy=false,message='',drag=null;
  function view(entity,parents=[]){
    if(!admin())return '';
    let parent=scopes.get(entity)||'';
    if(entity!=='exams'&&!parents.some(x=>x.id===parent))parent=parents[0]?.id||'';
    scopes.set(entity,parent);
    const data=entity==='exams'||parent?get('order:'+entity+':'+parent,'adminOrderList',{entity,parentId:parent}):{records:[],version:''};
    states.set(entity,{parent,data});
    return `<section class="card order-panel" data-order-panel="${e(entity)}"><h2>Reorder / delete ${e(entity)}</h2><p>Drag the handle, use Move up/down, or enter a Display Order. Order is saved to the database. Question changes hide the test and require fresh review; historical attempts stay intact.</p>${entity!=='exams'?`<label>Parent scope<select data-order-scope="${e(entity)}">${parents.map(p=>`<option value="${e(p.id)}" ${p.id===parent?'selected':''}>${e(p.name||p.title)}</option>`).join('')}</select></label>`:''}<p role="status">${e(message)}</p>${!data?'<p>Loading order…</p>':data.error?'<p class="notice warning">Ordering unavailable. Confirm the Admin controls migration and API are installed.</p>':`<ol class="order-list">${data.records.map((r,i)=>`<li data-order-id="${e(r.id)}"><button type="button" class="btn secondary small order-handle" draggable="true" data-order-drag="${e(r.id)}" aria-label="Drag ${e(r.name||r.title)}" ${busy?'disabled':''}>↕</button><div class="order-label"><strong>${e(r.name||r.title)}</strong><small>${e(r.id)} · ${r.published?'Published':'Hidden / Draft'}</small></div><div class="order-actions"><button class="btn secondary small" data-order-step="-1" aria-label="Move up ${e(r.name||r.title)}" ${busy||i===0?'disabled':''}>↑</button><button class="btn secondary small" data-order-step="1" aria-label="Move down ${e(r.name||r.title)}" ${busy||i===data.records.length-1?'disabled':''}>↓</button><form data-order-position><label>Display Order<input name="position" type="number" min="1" max="${data.records.length}" value="${i+1}" required></label><button class="btn secondary small" ${busy?'disabled':''}>Move</button></form><button class="btn secondary small" data-order-delete ${busy?'disabled':''}>Delete</button></div></li>`).join('')}</ol>${!data.records.length?'<p>No active records in this scope.</p>':''}`}</section>`;
  }
  const context=target=>{const row=target.closest('[data-order-id]'),panel=target.closest('[data-order-panel]');if(!row||!panel)return null;const entity=panel.dataset.orderPanel;return {entity,id:row.dataset.orderId,...states.get(entity)};};
  async function change(fn){if(busy||!admin())return;busy=true;message='Saving…';render();try{await fn();clear();message='Saved securely. Current order reloaded.';}catch(err){message=err.message||'Could not save. Reload current records and retry.';}finally{busy=false;render();}}
  const move=(c,position)=>change(()=>gateway.call('adminReorder',{entity:c.entity,parentId:c.parent,expectedVersion:c.data.version,ids:moveItem(c.data.records.map(r=>r.id),c.id,position)}));
  async function deletion(c){
    if(busy||!admin())return;busy=true;
    try{
      const p=await gateway.call('adminDeletePreview',{entity:c.entity,id:c.id,parentId:c.parent});
      const dialog=document.createElement('dialog');dialog.className='delete-dialog';
      dialog.innerHTML=`<form method="dialog"><h2>Delete permanently?</h2><p><strong>${e(p.label)}</strong> (${e(p.entity)}) · ${p.published?'Published':'Hidden / Draft'}</p><p>Children: ${p.childRecords} · Questions: ${p.questions} · Imports: ${p.imports} · Referencing attempts: ${p.attempts} · Submitted results: ${p.results} · Payments: ${p.payments} · Entitlements: ${p.entitlements}</p><p>Remove from active content. Original imports, historical snapshots/results, payment records and audit history will be retained privately. Question deletion hides the test and invalidates review. This cannot be undone in this UI.</p><label>Reason<textarea name="reason" required minlength="5" maxlength="2000"></textarea></label><label>Type Delete permanently<input name="confirmation" required autocomplete="off" pattern="Delete permanently"></label><div class="order-actions"><button type="button" data-delete-cancel class="btn secondary">Cancel</button><button class="btn" value="delete">Delete permanently</button></div></form>`;
      document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-delete-cancel]').onclick=()=>dialog.close();
      const approved=await new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='delete'),{once:true}));
      const values=Object.fromEntries(new FormData(dialog.querySelector('form')));dialog.remove();busy=false;
      if(approved)await change(()=>gateway.call('adminDelete',{entity:c.entity,id:c.id,parentId:c.parent,expectedVersion:p.version,...values}));
    }catch(err){busy=false;message=err.message||'Deletion preview unavailable. Nothing changed.';render();}finally{busy=false;}
  }
  document.addEventListener('change',ev=>{if(admin()&&ev.target.matches('[data-order-scope]')){scopes.set(ev.target.dataset.orderScope,ev.target.value);message='';render();}});
  document.addEventListener('click',ev=>{if(!admin())return;const c=context(ev.target);if(!c)return;if(ev.target.closest('[data-order-delete]'))deletion(c);const b=ev.target.closest('[data-order-step]');if(b)move(c,c.data.records.findIndex(r=>r.id===c.id)+1+Number(b.dataset.orderStep));});
  document.addEventListener('submit',ev=>{if(!admin()||!ev.target.matches('[data-order-position]'))return;ev.preventDefault();move(context(ev.target),Number(new FormData(ev.target).get('position')));});
  document.addEventListener('dragstart',ev=>{if(!admin()||busy||!ev.target.matches('[data-order-drag]'))return;drag=context(ev.target);ev.dataTransfer.setData('text/plain',drag.id);ev.dataTransfer.effectAllowed='move';});
  document.addEventListener('dragover',ev=>{const c=context(ev.target);if(drag&&c&&c.entity===drag.entity&&c.parent===drag.parent)ev.preventDefault();});
  document.addEventListener('drop',ev=>{const c=context(ev.target),from=drag;drag=null;if(!from||!c||c.entity!==from.entity||c.parent!==from.parent)return;ev.preventDefault();move(from,c.data.records.findIndex(r=>r.id===c.id)+1);});
  document.addEventListener('dragend',()=>{drag=null;});
  // Touch dragging uses the same server operation; the list remains scrollable outside handles.
  document.addEventListener('pointerdown',ev=>{if(ev.pointerType!=='touch'||busy||!admin()||!ev.target.matches('[data-order-drag]'))return;drag=context(ev.target);ev.target.setPointerCapture(ev.pointerId);});
  document.addEventListener('pointerup',ev=>{if(ev.pointerType!=='touch'||!drag)return;const from=drag,c=context(document.elementFromPoint(ev.clientX,ev.clientY)||ev.target);drag=null;if(c&&c.entity===from.entity&&c.parent===from.parent)move(from,c.data.records.findIndex(r=>r.id===c.id)+1);});
  // Native HTML dragging cancels the mouse pointer stream; keep its drag state until drop.
  document.addEventListener('pointercancel',ev=>{if(ev.pointerType==='touch')drag=null;});
  return {view};
}
