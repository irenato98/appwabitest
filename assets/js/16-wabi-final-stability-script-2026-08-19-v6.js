
(function(){
'use strict';
document.addEventListener('DOMContentLoaded',()=>{
const W=window.wabi;if(!W)return;const $=(q,r=document)=>r.querySelector(q),$$=(q,r=document)=>[...r.querySelectorAll(q)];
const FLEX_PRESETS=window.WABI_PRODUCT_CONFIG.flexPresetMinutes;W.PRESETS=FLEX_PRESETS.map(m=>({v:`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`,l:m>=60?(m%60?`${Math.floor(m/60)} h ${m%60}`:`${m/60} h`):`${m} min`}));
const taskById=(key,id)=>(W.tasks?.[key]||[]).find(t=>String(t.id)===String(id));
const fmtDur=m=>{m=Math.max(0,Math.round(Number(m)||0));return m>=60?(m%60?`${Math.floor(m/60)} h ${m%60} min`:`${m/60} h`):`${m} min`};
const dateFromKey=k=>W.fromKey?W.fromKey(k):new Date(`${k}T12:00:00`);

/* Create uses the exact Edit visual language for Notes/Subtasks; energy is absent, not a second UI. */
function createSubtaskRow(root,value='',done=false){const row=document.createElement('div');row.className='subtask-row';row.innerHTML=`<button type="button" class="subtask-check ${done?'is-done':''}" data-create-sub-toggle aria-label="Marcar subtarea"></button><input class="subtask-text ${done?'is-done':''}" data-create-sub-text value="${String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}" placeholder="Nueva subtarea"><button type="button" class="subtask-delete" data-create-sub-delete aria-label="Eliminar"><i class="fa-solid fa-xmark"></i></button>`;root.appendChild(row);$('[data-create-sub-toggle]',row).onclick=()=>{const b=$('[data-create-sub-toggle]',row),i=$('[data-create-sub-text]',row);b.classList.toggle('is-done');i.classList.toggle('is-done',b.classList.contains('is-done'))};$('[data-create-sub-delete]',row).onclick=()=>row.remove();return row}
function enhanceCreate(){const modal=$('#modal-scrim .wabi-create-v3:not(.wabi-hover-activity-editor)');if(!modal||modal.dataset.finalEnhanced==='1')return;modal.dataset.finalEnhanced='1';$('#wc-energy',modal)?.closest('.wabi-field')?.remove();const body=$('.wabi-create-body',modal);if(body&&!$('#wc-notes',modal)){body.insertAdjacentHTML('beforeend',`<div class="wabi-field wabi-editor-extra"><label>Notas</label><textarea class="wabi-edit-notes" id="wc-notes" placeholder="Añade notas sobre esta actividad…"></textarea></div><div class="wabi-field wabi-editor-extra"><label>Subtareas</label><div id="wc-subtasks"></div><button class="btn-subtask-add wabi-edit-add-subtask" type="button" data-create-add-subtask><i class="fa-solid fa-plus"></i> Añadir subtarea</button></div>`);$('[data-create-add-subtask]',modal).onclick=()=>{const row=createSubtaskRow($('#wc-subtasks',modal));setTimeout(()=>$('[data-create-sub-text]',row)?.focus(),0)}}enhanceTimeMode(modal,'create')}
function enhanceEdit(){const editor=$('.wabi-hover-activity-editor');if(!editor||editor.dataset.finalEnhanced==='1')return;editor.dataset.finalEnhanced='1';$('#wce-energy',editor)?.closest('.wabi-field')?.remove();enhanceTimeMode(editor,'edit')}
const baseModalOpen=W.modal?.open?.bind(W.modal);if(baseModalOpen)W.modal.open=function(...args){closeIncompatible('create');const r=baseModalOpen(...args);requestAnimationFrame(enhanceCreate);return r};
let createdFromModal=null;const baseAddTask=W.addTask.bind(W);W.addTask=function(key,payload){const modal=$('#modal-scrim .wabi-create-v3:not(.wabi-hover-activity-editor)');let next=payload;if(modal&&modal.dataset.finalEnhanced==='1'){const subtasks=$$('#wc-subtasks .subtask-row',modal).map(row=>({text:$('[data-create-sub-text]',row)?.value.trim()||'',done:$('[data-create-sub-toggle]',row)?.classList.contains('is-done')||false})).filter(s=>s.text);next={...payload,type:null,notes:$('#wc-notes',modal)?.value||'',subtasks}}const task=baseAddTask(key,next);if(modal)createdFromModal={key,id:task.id,at:Date.now()};return task};

/* Fixed <-> flexible conversion: first available preset at or above the real duration; >2h leaves no selection. */
const timeStates=new WeakMap();const ceilPreset=m=>FLEX_PRESETS.find(x=>x>=m)??null;
function readClock(root,id){const ed=$(`[data-clock-editor="${id}"]`,root);if(!ed)return null;const h=Number($('[data-clock-hour]',ed)?.value),m=Number($('[data-clock-minute]',ed)?.value),amp=$('[data-clock-ampm].is-selected',ed)?.dataset.clockAmpm;if(!Number.isInteger(h)||h<1||h>24||!Number.isInteger(m)||m<0||m>59||!amp)return null;if(h===24&&m!==0)return null;if(h>12)return(h===24?0:h)*60+m;let hr=h%12;if(amp==='pm')hr+=12;return hr*60+m}
function clockDraft(root,prefix){const grab=which=>{const ed=$(`[data-clock-editor="${prefix}-${which}"]`,root);return ed?{h:$('[data-clock-hour]',ed)?.value||'',m:$('[data-clock-minute]',ed)?.value||'',amp:$('[data-clock-ampm].is-selected',ed)?.dataset.clockAmpm||''}:null};return{start:grab('start'),end:grab('end')}}
function restoreClock(root,prefix,d){if(!d)return;for(const which of ['start','end']){const v=d[which],ed=$(`[data-clock-editor="${prefix}-${which}"]`,root);if(!ed||!v)continue;const h=$('[data-clock-hour]',ed),m=$('[data-clock-minute]',ed);if(h)h.value=v.h;if(m)m.value=v.m;$$('[data-clock-ampm]',ed).forEach(b=>b.classList.toggle('is-selected',b.dataset.clockAmpm===v.amp))}}
function clearClock(root,prefix){for(const which of ['start','end']){const ed=$(`[data-clock-editor="${prefix}-${which}"]`,root);if(!ed)continue;$$('input',ed).forEach(i=>i.value='');$$('[data-clock-ampm]',ed).forEach(b=>b.classList.remove('is-selected'))}}
function durationBetween(a,b){if(a==null||b==null)return null;let e=b;if(e<=a)e+=1440;const d=e-a;return d>0&&d<1440?d:null}
function blockForMinute(m){return (W.BLOCKS||[]).find(b=>m>=Number(b.startAbs)&&m<Number(b.endAbs))?.key||null}
function enhanceTimeMode(root,kind){
  if(!root||timeStates.has(root))return;
  const prefix=kind==='create'?'create':'edit',toggle=$(kind==='create'?'#wc-time-mode':'#wce-time-mode',root);if(!toggle)return;
  const mode=$('button.is-selected',toggle)?.dataset.v||'estimate';
  const state={mode,fixedDraft:mode==='fixed'?clockDraft(root,prefix):null,estimateDraft:null};timeStates.set(root,state);
  /* If the user types only the hour, minutes default to :00. This affects the
     draft only; it never invents a complete fixed schedule on its own. */
  for(const which of ['start','end']){
    const ed=$(`[data-clock-editor="${prefix}-${which}"]`,root);if(!ed)continue;
    const hh=$('[data-clock-hour]',ed),mm=$('[data-clock-minute]',ed);if(!hh||!mm)continue;
    const fillMinutes=()=>{if(String(hh.value||'').trim()&&!String(mm.value||'').trim()){mm.value='00';mm.dispatchEvent(new Event('input',{bubbles:true}))}};
    hh.addEventListener('blur',fillMinutes);hh.addEventListener('change',fillMinutes);
  }
  toggle.addEventListener('pointerdown',e=>{
    const target=e.target.closest('button[data-v]');if(!target)return;
    const current=$('button.is-selected',toggle)?.dataset.v||state.mode;
    if(current==='fixed')state.fixedDraft=clockDraft(root,prefix);
    else{
      const sel=$(kind==='create'?'#wc-duration':'#wce-duration',root),blk=$(kind==='create'?'[data-block-choice].is-selected':'[data-edit-block].is-selected',root);
      state.estimateDraft={duration:Number(sel?.value)||null,block:blk?.dataset.blockChoice||blk?.dataset.editBlock||null};
    }
    const start=current==='fixed'?readClock(root,`${prefix}-start`):null,end=current==='fixed'?readClock(root,`${prefix}-end`):null,dur=durationBetween(start,end),next=target.dataset.v;
    setTimeout(()=>{
      state.mode=next;
      if(next==='fixed'){
        /* A card that already had fixed hours can freely test Flexible and come
           back without losing its original draft. A card that never had fixed
           hours opens blank, exactly as requested. */
        if(state.fixedDraft)restoreClock(root,prefix,state.fixedDraft);else clearClock(root,prefix);
        return;
      }
      const desired=dur!=null?ceilPreset(dur):state.estimateDraft?.duration||null,block=dur!=null?blockForMinute(start):state.estimateDraft?.block||null;
      const bb=block?$(kind==='create'?`[data-block-choice="${CSS.escape(block)}"]`:`[data-edit-block="${CSS.escape(block)}"]`,root):null;
      if(bb&&!bb.disabled)bb.click();
      setTimeout(()=>{
        const sel=$(kind==='create'?'#wc-duration':'#wce-duration',root);if(!sel)return;
        if(dur!=null&&desired==null){sel.selectedIndex=-1;sel.dispatchEvent(new Event('change',{bubbles:true}));return}
        if(desired!=null&&[...sel.options].some(o=>Number(o.value)===desired))sel.value=String(desired);else if(dur!=null)sel.selectedIndex=-1;
        sel.dispatchEvent(new Event('change',{bubbles:true}));
      },0);
    },0);
  },true);
}

/* Planner scroll is remembered per surface. First entry to current Día/Semana
   centers the live-time guide; later view switches restore exactly where that
   surface was left. User scrolling always wins. */
const surfaceScroll={day:null,week:null};const skipRememberOnce={day:false,week:false};const surfacePrimed={day:false,week:false};let scrollWriteDepth=0;
function surfaceScrollEl(surface=W._surface){return surface==='day'?$('.wabi-day-scroll'):surface==='week'?$('.wabi-week-timeline-scroll'):null}
function rememberSurfaceScroll(surface=W._surface,manual=null){
  const el=surfaceScrollEl(surface);if(!el||!(surface==='day'||surface==='week'))return;
  const prev=surfaceScroll[surface];
  /* Do not save scrollTop=0 while a freshly rendered current surface is still
     waiting for its first live-time positioning. */
  if(manual==null&&!prev&&!surfacePrimed[surface])return;
  surfaceScroll[surface]={top:el.scrollTop,left:el.scrollLeft,manual:manual==null?(prev?.manual||false):!!manual};
}
function withProgrammaticScroll(fn){scrollWriteDepth++;try{fn()}finally{requestAnimationFrame(()=>{scrollWriteDepth=Math.max(0,scrollWriteDepth-1)})}}
function surfaceIsCurrent(surface){if(surface==='day'){const tl=$('.wabi-day-timeline[data-day-key]');return !!(tl&&isTodayKey(tl.dataset.dayKey))}if(surface==='week'){return !!$('.wabi-week-day[data-day-key="'+W.dateKey(new Date())+'"]')}return false}
function currentNowTop(){return 28+nowMinutes()*.88}
function liveGuideContentY(surface,el){
  const line=surface==='day'?$('.wabi-day-timeline[data-day-key] .wabi-now-line.is-today'):$('.wabi-week-day[data-day-key="'+W.dateKey(new Date())+'"] .wabi-now-line.is-today');
  if(line){const lr=line.getBoundingClientRect(),er=el.getBoundingClientRect();return el.scrollTop+(lr.top-er.top)}
  const weekHead=surface==='week'?($('.wabi-week-head')?.offsetHeight||0):0;
  return weekHead+currentNowTop();
}
function restoreSurfaceScroll(){
  const surface=W._surface,el=surfaceScrollEl(surface);if(!el)return;
  const saved=surfaceScroll[surface],isCurrent=surfaceIsCurrent(surface);
  withProgrammaticScroll(()=>{
    if(saved){el.scrollTop=saved.top;el.scrollLeft=saved.left;surfacePrimed[surface]=true;return}
    if(isCurrent){const guideY=liveGuideContentY(surface,el);el.scrollTop=Math.max(0,guideY-el.clientHeight*.42);surfacePrimed[surface]=true}
  });
  if(!saved&&isCurrent)surfaceScroll[surface]={top:el.scrollTop,left:el.scrollLeft,manual:false};
}
document.addEventListener('scroll',e=>{const el=e.target;if(scrollWriteDepth||!(el instanceof Element)||!el.matches?.('.wabi-day-scroll,.wabi-week-timeline-scroll'))return;const surface=el.matches('.wabi-day-scroll')?'day':'week';if(!surfacePrimed[surface]&&surfaceIsCurrent(surface)&&!surfaceScroll[surface])return;surfacePrimed[surface]=true;surfaceScroll[surface]={top:el.scrollTop,left:el.scrollLeft,manual:true}},true);
/* Explicit Hoy means "bring me back to now"; clear only this surface's saved
   position so the following render centers the live-time guide again. */
document.addEventListener('click',e=>{if(e.target.closest?.('[data-nav-today]')&&(W._surface==='day'||W._surface==='week')){surfaceScroll[W._surface]=null;surfacePrimed[W._surface]=false;skipRememberOnce[W._surface]=true}},true);
if(W.board?.render){const br=W.board.render.bind(W.board);W.board.render=function(...a){const sf=W._surface;if(skipRememberOnce[sf])skipRememberOnce[sf]=false;else rememberSurfaceScroll(sf);const out=br(...a);requestAnimationFrame(()=>{fitTiny();paintNow();restoreSurfaceScroll();handleCreated()});return out}}
if(W.emit){const baseEmit=W.emit.bind(W);W.emit=function(evt,...args){if(evt==='tasks-changed')rememberSurfaceScroll(W._surface);return baseEmit(evt,...args)}}

/* Drag auto-scroll only while dragging near the timeline viewport edges. */
let autoRaf=0,autoScrollEl=null,autoSpeed=0;function stopAuto(){cancelAnimationFrame(autoRaf);autoRaf=0;autoScrollEl=null;autoSpeed=0}function tickAuto(){if(!autoScrollEl||!autoSpeed){stopAuto();return}autoScrollEl.scrollTop+=autoSpeed;autoRaf=requestAnimationFrame(tickAuto)}document.addEventListener('dragover',e=>{const sc=e.target.closest?.('.wabi-day-scroll,.wabi-week-timeline-scroll')||$('.wabi-day-scroll,.wabi-week-timeline-scroll');if(!sc){stopAuto();return}const r=sc.getBoundingClientRect(),zone=Math.min(80,Math.max(48,r.height*.12));let speed=0;if(e.clientY<r.top+zone)speed=-Math.max(3,(r.top+zone-e.clientY)/zone*15);else if(e.clientY>r.bottom-zone)speed=Math.max(3,(e.clientY-(r.bottom-zone))/zone*15);autoScrollEl=sc;autoSpeed=speed;if(speed&&!autoRaf)autoRaf=requestAnimationFrame(tickAuto);if(!speed)stopAuto()},true);document.addEventListener('dragend',stopAuto,true);document.addEventListener('drop',stopAuto,true);
document.addEventListener('dragover',e=>document.body.classList.toggle('wabi-drag-copy',!!e.altKey),true);document.addEventListener('dragend',()=>document.body.classList.remove('wabi-drag-copy'),true);document.addEventListener('drop',()=>document.body.classList.remove('wabi-drag-copy'),true);

/* Tiny-card content fitting uses measured pixels plus a deliberate safety gap. */
let canvas=null;function textWidth(el){canvas=canvas||document.createElement('canvas');const c=canvas.getContext('2d'),s=getComputedStyle(el);c.font=`${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;return c.measureText(el.textContent||'').width}function fitTiny(){for(const wrap of $$('.wabi-day-event.is-tiny,.wabi-week-event.is-tiny')){const card=$('.wabi-task-card',wrap),main=$('.wabi-card-main',card),title=$('.wabi-card-title',card),meta=$('.wabi-card-inline-symbols',card);if(!card||!main||!title||!meta)continue;meta.classList.remove('wabi-meta-fits');if(wrap.classList.contains('is-overlap'))continue;meta.classList.add('wabi-meta-measuring');const mw=meta.getBoundingClientRect().width;meta.classList.remove('wabi-meta-measuring');const available=main.clientWidth-(parseFloat(getComputedStyle(main).paddingLeft)||0)-(parseFloat(getComputedStyle(main).paddingRight)||0);const tw=Math.min(textWidth(title),available);if(tw+mw+24<=available)meta.classList.add('wabi-meta-fits')}}

/* Current-time guide. It moves continuously, sits above cards without stealing
   pointer events, and Día follows the date at midnight only when it was showing
   the real current day. */
function nowMinutes(){const n=new Date();return n.getHours()*60+n.getMinutes()+n.getSeconds()/60}
function isTodayKey(k){return k===W.dateKey(new Date())}
function paintNow(){
  const minute=nowMinutes(),top=28+minute*.88;$$('.wabi-now-line,.wabi-now-label').forEach(x=>x.remove());
  const day=$('.wabi-day-timeline[data-day-key]');
  if(day&&isTodayKey(day.dataset.dayKey)){
    const line=document.createElement('div');line.className='wabi-now-line is-today';line.style.top=`${top}px`;day.appendChild(line);
    const lab=document.createElement('span');lab.className='wabi-now-label';lab.style.top=`${top}px`;lab.textContent=new Intl.DateTimeFormat('es-PE',{hour:'numeric',minute:'2-digit'}).format(new Date());day.appendChild(lab);
  }
  const week=$('.wabi-week-timeline-grid');
  if(week){
    const today=$('.wabi-week-day[data-day-key="'+W.dateKey(new Date())+'"]',week);
    if(today){
      for(const col of $$('.wabi-week-day[data-day-key]',week)){const l=document.createElement('div');l.className=`wabi-now-line${isTodayKey(col.dataset.dayKey)?' is-today':''}`;l.style.top=`${top}px`;col.appendChild(l)}
      const gutter=$('.wabi-week-time-gutter',week);if(gutter){const lab=document.createElement('span');lab.className='wabi-now-label';lab.style.top=`${top}px`;lab.textContent=new Intl.DateTimeFormat('es-PE',{hour:'numeric',minute:'2-digit'}).format(new Date());gutter.appendChild(lab)}
    }
  }
}
let lastRealDayKey=W.dateKey(new Date());
function clockTick(){
  const nextKey=W.dateKey(new Date());
  if(nextKey!==lastRealDayKey){
    const previousKey=lastRealDayKey;lastRealDayKey=nextKey;
    if(W._surface==='day'&&W.dateKey(W._dayDate instanceof Date?W._dayDate:new Date())===previousKey){
      const wasManual=surfaceScroll.day?.manual||false;W._dayDate=new Date();if(!wasManual){surfaceScroll.day=null;skipRememberOnce.day=true}W.board?.render?.();return;
    }
    /* Week already contains the new day when the calendar week has not changed.
       If the user never moved the timeline, keep the live guide visible. */
    if(W._surface==='week'&&!surfaceScroll.week?.manual){surfaceScroll.week=null;restoreSurfaceScroll()}
  }
  paintNow();
}
setInterval(clockTick,15000);

/* Context spotlight helpers. The real card/day remains the source; no cloned card can resize or drift. */
let spotStack=[],temporarySpotLocks=0;
function spotRect(source){const r=source?.getBoundingClientRect?.();return r&&r.width&&r.height?{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null}
function spotPieces(r,source){
  const p=document.createElement('div');p.className='wabi-spot-piece';
  const radius=source?getComputedStyle(source).borderRadius:'0px';
  Object.assign(p.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`,borderRadius:radius||'0px'});
  document.body.appendChild(p);requestAnimationFrame(()=>p.classList.add('on'));return[p];
}
function syncSpotGeometry(st){
  if(!st||st.hidden||!st.sourceEl?.isConnected)return;
  const r=spotRect(st.sourceEl),p=st.pieces?.[0];if(!r||!p)return;
  st.sourceRect=r;const radius=getComputedStyle(st.sourceEl).borderRadius||'0px';
  Object.assign(p.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`,borderRadius:radius});
  st.raf=requestAnimationFrame(()=>syncSpotGeometry(st));
}
function hideSpotState(st){if(!st)return;st.hidden=true;cancelAnimationFrame(st.raf);st?.pieces?.forEach(p=>p.style.display='none');st?.sourceEl?.classList.remove('wabi-spot-source')}
function showSpotState(st){if(!st||!st.sourceEl?.isConnected)return;const r=spotRect(st.sourceEl);if(!r)return;st.hidden=false;st.sourceRect=r;st.pieces?.forEach(p=>p.remove());st.pieces=spotPieces(r,st.sourceEl);st.sourceEl.classList.add('wabi-spot-source');st.raf=requestAnimationFrame(()=>syncSpotGeometry(st))}
function unlockTemporary(st){if(!st?.temporary)return;temporarySpotLocks=Math.max(0,temporarySpotLocks-1);if(!temporarySpotLocks)document.body.classList.remove('wabi-spot-scroll-lock')}
function removeSpotState(st){clearTimeout(st?.timer);cancelAnimationFrame(st?.raf);st?.sourceEl?.classList.remove('wabi-spot-source');st?.pieces?.forEach(p=>{p.classList.remove('on');setTimeout(()=>p.remove(),170)});unlockTemporary(st)}
function clearAllSpots(){while(spotStack.length)removeSpotState(spotStack.pop())}
function beginSpot(source,{temporary=false,kind='generic'}={}){
  if(!source)return null;
  if(temporary)clearAllSpots();
  const prev=spotStack.at(-1);if(prev)hideSpotState(prev);
  const r=spotRect(source);if(!r)return null;
  const st={sourceEl:source,sourceRect:r,pieces:spotPieces(r,source),temporary,kind,timer:null,raf:0,hidden:false};source.classList.add('wabi-spot-source');spotStack.push(st);
  st.raf=requestAnimationFrame(()=>syncSpotGeometry(st));
  if(temporary){temporarySpotLocks++;document.body.classList.add('wabi-spot-scroll-lock');st.timer=setTimeout(()=>endTopSpot({restore:true}),2400)}
  return st;
}
function endTopSpot({restore=true}={}){const st=spotStack.pop();if(!st)return;removeSpotState(st);if(restore&&spotStack.length)showSpotState(spotStack.at(-1))}
function currentSpot(){return spotStack.at(-1)||null}
window.__wabiEndTemporarySpot=()=>{if(currentSpot()?.temporary)endTopSpot({restore:true})};
function animatePanelFromSource(panel){const st=currentSpot();if(!st||!panel)return;const pr=panel.getBoundingClientRect(),sr=st.sourceRect;if(!pr.width||!pr.height)return;const dx=(sr.left+sr.width/2)-(pr.left+pr.width/2),dy=(sr.top+sr.height/2)-(pr.top+pr.height/2),sx=Math.max(.15,Math.min(1,sr.width/pr.width)),sy=Math.max(.15,Math.min(1,sr.height/pr.height));panel.classList.add('wabi-editor-origin-animation');panel.animate([{opacity:.1,transform:`translate(${dx}px,${dy}px) scale(${sx},${sy})`},{opacity:1,transform:'none'}],{duration:190,easing:'cubic-bezier(.2,.8,.2,1)'})}
function closePanelBack(panel){const st=currentSpot();if(!st){return}const pr=panel?.getBoundingClientRect?.()||st.sourceRect,sr=st.sourceRect,clone=panel?.cloneNode?.(true);if(clone&&pr.width){clone.classList.add('wabi-editor-origin-animation');Object.assign(clone.style,{position:'fixed',zIndex:'15531',left:`${pr.left}px`,top:`${pr.top}px`,width:`${pr.width}px`,height:`${pr.height}px`,margin:'0',pointerEvents:'none',overflow:'hidden'});document.body.appendChild(clone);const dx=(sr.left+sr.width/2)-(pr.left+pr.width/2),dy=(sr.top+sr.height/2)-(pr.top+pr.height/2),sx=Math.max(.15,Math.min(1,sr.width/pr.width)),sy=Math.max(.15,Math.min(1,sr.height/pr.height));clone.animate([{opacity:1,transform:'none'},{opacity:0,transform:`translate(${dx}px,${dy}px) scale(${sx},${sy})`}],{duration:170,easing:'ease-in',fill:'forwards'}).finished.finally(()=>clone.remove())}endTopSpot({restore:true})}
function blockSpotScroll(e){if(temporarySpotLocks){e.preventDefault();e.stopPropagation()}}
window.addEventListener('wheel',blockSpotScroll,{capture:true,passive:false});window.addEventListener('touchmove',blockSpotScroll,{capture:true,passive:false});document.addEventListener('keydown',e=>{if(temporarySpotLocks&&['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key)){e.preventDefault();e.stopPropagation()}},true);
/* Created activity: visible -> spotlight; elsewhere -> actionable macOS-like notice. */
function isVisible(el){if(!el)return false;const r=el.getBoundingClientRect();return r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth}function cardFor(key,id){return document.querySelector(`.wabi-task-card[data-key="${CSS.escape(String(key))}"][data-task-id="${CSS.escape(String(id))}"]`)}
const PRIORITY_LABELS={urgent:'Urgente',important:'Importante',regular:'Regular',low:'Baja'};function showNotice(key,id){$('.wabi-created-notification')?.remove();const t=taskById(key,id);if(!t)return;const n=document.createElement('div');n.className='wabi-created-notification';const prLabel=PRIORITY_LABELS[t.priority]||PRIORITY_LABELS[t.priorityKey]||'',cat=t.category?(String(t.category).startsWith('#')?String(t.category):`#${t.category}`):'',subs=(t.subtasks||[]).length;n.innerHTML=`<button class="close" aria-label="Cerrar">×</button><strong>Actividad creada</strong><div class="title"></div><div class="meta"></div>`;$('.title',n).textContent=t.title||'Actividad';const meta=[];if(t.fixed&&t.startTime)meta.push(t.startTime);else meta.push(fmtDur((String(t.planned||'0:30').split(':').map(Number)[0]||0)*60+(String(t.planned||'0:30').split(':').map(Number)[1]||0)));if(prLabel)meta.push(prLabel);if(cat)meta.push(cat);if(subs)meta.push(`${subs} subtarea${subs===1?'':'s'}`);$('.meta',n).innerHTML=meta.map(x=>`<span>${String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</span>`).join('');document.body.appendChild(n);let timer=setTimeout(()=>n.remove(),7500);$('.close',n).onclick=e=>{e.stopPropagation();clearTimeout(timer);n.remove()};n.onclick=()=>{clearTimeout(timer);n.remove();navigateToTask(key,id)}}
function currentDayKey(){return W.dateKey(W._dayDate instanceof Date?W._dayDate:new Date())}
function keyInCurrentWeek(key){const ws=W.state.weekStart instanceof Date?W.state.weekStart:W.getWeekStart(new Date()),d=dateFromKey(key);return d>=ws&&d<W.addDays(ws,7)}
function keyInCurrentMonth(key){const d=dateFromKey(key),m=W.state.monthDate instanceof Date?W.state.monthDate:new Date();return d.getFullYear()===m.getFullYear()&&d.getMonth()===m.getMonth()}
function monthCellFor(key){return document.querySelector(`[data-month-day="${CSS.escape(String(key))}"]`)}
function revealElement(el,{scroll=true,kind='created'}={}){
  if(!el)return false;
  const finish=()=>{rememberSurfaceScroll(W._surface,true);beginSpot(el,{temporary:true,kind})};
  if(scroll&&!isVisible(el)){el.scrollIntoView({block:'center',inline:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});setTimeout(finish,300)}else finish();
  return true;
}
function navigateToTask(key,id){
  const d=dateFromKey(key);
  if(W._surface==='day'){surfaceScroll.day=null;skipRememberOnce.day=true;W._dayDate=d;W.state.view='board';W.board.render()}
  else if(W._surface==='week'){surfaceScroll.week=null;skipRememberOnce.week=true;W.state.weekStart=W.getWeekStart(d);W.state.view='board';W.board.render()}
  else{W.state.monthDate=new Date(d.getFullYear(),d.getMonth(),1);W.state.view='month';W.month.render()}
  setTimeout(()=>{
    if(W._surface==='month'){const cell=monthCellFor(key);if(cell)revealElement(cell,{scroll:true});return}
    const el=cardFor(key,id);if(el)revealElement(el,{scroll:true});
  },100);
}
function handleCreated(){
  if(!createdFromModal)return;const x=createdFromModal;createdFromModal=null;
  setTimeout(()=>{
    if(W._surface==='day'){
      if(x.key!==currentDayKey()){showNotice(x.key,x.id);return}
      if(!revealElement(cardFor(x.key,x.id),{scroll:true}))showNotice(x.key,x.id);return;
    }
    if(W._surface==='week'){
      if(!keyInCurrentWeek(x.key)){showNotice(x.key,x.id);return}
      if(!revealElement(cardFor(x.key,x.id),{scroll:true}))showNotice(x.key,x.id);return;
    }
    if(W._surface==='month'){
      if(!keyInCurrentMonth(x.key)){showNotice(x.key,x.id);return}
      if(!revealElement(monthCellFor(x.key),{scroll:true}))showNotice(x.key,x.id);return;
    }
    showNotice(x.key,x.id);
  },220);
}

/* Edit and Month panel spotlight/transitions. Month context survives a nested Edit. */
let lastEditor=null,lastMonth=null;
document.addEventListener('click',e=>{
  const edit=e.target.closest?.('[data-card-hover-edit]');
  if(edit){const pop=edit.closest('.wabi-card-hover-popover'),key=pop?.dataset.key,id=pop?.dataset.taskId,source=key&&id?cardFor(key,id):null;if(source)beginSpot(source,{kind:'edit'})}
  const cell=e.target.closest?.('[data-month-day]');
  if(cell&&!e.target.closest('[data-open-day]')){
    const panel=$('.wabi-month-day-panel'),same=panel?.dataset.monthKey===cell.dataset.monthDay;
    if(!same){while(currentSpot()?.kind==='month')endTopSpot({restore:false});beginSpot(cell,{kind:'month'})}
  }
  const closing=e.target.closest?.('[data-edit-close],[data-month-panel-close]');
  if(closing){const panel=closing.closest('.wabi-card-hover-popover.is-editor,.wabi-month-day-panel');if(panel)closePanelBack(panel)}
},true);
const obs=new MutationObserver(()=>{
  enhanceCreate();enhanceEdit();
  const editor=$('.wabi-card-hover-popover.is-editor');
  if(editor&&editor!==lastEditor){lastEditor=editor;requestAnimationFrame(()=>animatePanelFromSource(editor))}
  if(!editor&&lastEditor){lastEditor=null;if(currentSpot()?.kind==='edit')endTopSpot({restore:true})}
  const month=$('.wabi-month-day-panel');
  if(month&&month!==lastMonth){lastMonth=month;requestAnimationFrame(()=>animatePanelFromSource(month))}
  if(!month&&lastMonth){lastMonth=null;if(currentSpot()?.kind==='month')endTopSpot({restore:false})}
  const focus=$('.wabi-focus-overlay');if(focus&&!focus.dataset.finalEnhanced){focus.dataset.finalEnhanced='1';$$('.wabi-focus-summary span',focus).forEach(s=>{if(s.querySelector('.fa-leaf,.fa-bolt,.fa-equals'))s.remove()});const done=$('[data-focus-done]',focus),intro=$('.wabi-focus-intro',focus);if(done&&intro){const wrap=document.createElement('div');wrap.className='wabi-focus-top-action';wrap.appendChild(done);intro.insertBefore(wrap,intro.firstChild)}$('.wabi-focus-bottom',focus)?.remove()}
});obs.observe(document.body,{subtree:true,childList:true});
/* IA/+ / Feedback are exclusive surfaces. */
function closeCreate(){const sc=$('#modal-scrim');if(sc&&!sc.classList.contains('is-hidden')){sc.className='scrim is-hidden';sc.innerHTML=''}}function closeIncompatible(kind){if(kind!=='ai')$('.wabi-ai-scrim')?.remove();if(kind!=='feedback')$$('.wabi-feedback-scrim').forEach(x=>x.remove());if(kind!=='create')closeCreate();if(kind!=='edit'){$('.wabi-card-hover-popover.is-editor')?.remove()}}
document.addEventListener('click',e=>{const ai=e.target.closest?.('[data-wabi-ai]'),add=e.target.closest?.('[data-wabi-add]'),fb=e.target.closest?.('[data-feedback-v2]');if(ai)closeIncompatible('ai');else if(add)closeIncompatible('create');else if(fb)closeIncompatible('feedback')},true);

/* Screen-capture fallback if html2canvas fails to load/render. */
if(typeof navigator!=='undefined'&&navigator.mediaDevices?.getDisplayMedia){window.wabiCaptureScreenFallback=async function(){const stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:false,preferCurrentTab:true});try{const video=document.createElement('video');video.srcObject=stream;video.muted=true;await video.play();await new Promise(r=>setTimeout(r,80));const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;c.getContext('2d').drawImage(video,0,0);return c}finally{stream.getTracks().forEach(t=>t.stop())}}}

/* Legal text elsewhere in the prototype: clickable + underlined, intentionally inert until destinations exist. */
const WABI_LEGAL_URLS=Object.freeze({"términos y condiciones":"https://docs.google.com/document/d/1fFzv59NSgg1HnNvDMaqyS4yOyYCfxL5Cy7lo7W0lQVs/edit?usp=sharing","política de privacidad":"https://docs.google.com/document/d/1MxhfZKWEBpt445MhqjixOfi6VWXJdWoUk7kRBXtzBTs/edit?usp=sharing","libro de reclamaciones":"https://docs.google.com/forms/d/e/1FAIpQLSf2E6NCmYtMidP5NM6afvBZQeriTf5Sa5Q0Fj_Cl9Vt1psazQ/viewform?usp=sharing&ouid=101106306893361154467"});
function legalize(){for(const el of $$('a,button,span,div,p')){if(el.closest('#wabi-entry-onboarding'))continue;const txt=(el.childElementCount?'':el.textContent||'').trim();const url=WABI_LEGAL_URLS[txt.toLowerCase()];if(!url)continue;el.dataset.wabiLegal='1';if(el.tagName==='A'){el.href=url;el.target='_blank';el.rel='noopener noreferrer'}else{el.setAttribute('role','link');el.dataset.wabiLegalUrl=url}}}
document.addEventListener('click',e=>{const x=e.target.closest?.('[data-wabi-legal]');if(!x)return;const url=x.href||x.dataset.wabiLegalUrl;if(url&&x.tagName!=='A'){e.preventDefault();e.stopPropagation();window.open(url,'_blank','noopener,noreferrer')}},true);

W.on?.('tasks-changed',()=>setTimeout(()=>{fitTiny();paintNow();handleCreated();legalize()},30));window.addEventListener('resize',()=>{fitTiny();paintNow()});const primeNow=()=>{fitTiny();paintNow();if((W._surface==='day'||W._surface==='week')&&!surfacePrimed[W._surface])restoreSurfaceScroll();legalize()};setTimeout(primeNow,120);setTimeout(primeNow,420);setTimeout(primeNow,900);
});
})();
