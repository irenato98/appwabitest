(function(){
'use strict';

document.addEventListener('DOMContentLoaded',()=>{
  const W=window.wabi;
  if(!W) return;
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const esc=W.esc||((s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));

  /* ───────── internal-view only ───────── */
  $('#wabi-auth')?.remove();
  W.isOnboarded=()=>true;
  W.isMobile=()=>false;
  /* The internal app always opens in the neutral planning mode. */
  W.state.mode='normal';
  W.saveState?.();

  /* ───────── common helpers ───────── */
  const BLOCK_STORE='wabi.blocks.v2';
  const FILTER_STORE='wabi.filters.v2';
  const PRIORITIES={
    urgent:{label:'Urgente',color:'#d85c52'},
    important:{label:'Importante',color:'#5967b4'},
    regular:{label:'Regular',color:'#737780'},
    low:{label:'Baja',color:'#aeb1b8'}
  };
  const BLOCK_KEYS=['A','B','C','D','E','F'];
  const fmtDuration=(m)=>{
    m=Math.max(0,Math.round(Number(m)||0));
    if(m<60) return `${m} min`;
    const h=Math.floor(m/60),r=m%60;
    return r?`${h} h ${r} min`:`${h} h`;
  };
  const durationMins=(v)=>{
    if(!v) return 30;
    const p=String(v).split(':').map(Number);
    return Math.max(0,(p[0]||0)*60+(p[1]||0));
  };
  const plannedFromMins=(m)=>`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;
  const clockParts=(m)=>{
    m=((Math.round(m)%1440)+1440)%1440;
    const h=Math.floor(m/60),mm=m%60,hh=h%12||12;
    return {h,mm,hh,ampm:h<12?'a. m.':'p. m.'};
  };
  const fmtClock=(m,{meridiem=true,minutes=true}={})=>{
    const x=clockParts(m);
    return `${x.hh}${minutes?`:${String(x.mm).padStart(2,'0')}`:''}${meridiem?` ${x.ampm}`:''}`;
  };
  const fmtRangeVisible=(start,endAbs)=>`${fmtClock(start)} – ${fmtClock(endAbs-1)}`;
  const fmtCardClock=(m)=>{m=((Math.round(Number(m)||0)%1440)+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`};
  const fmtFixedRange=(start,end)=>`<i class="fa-solid fa-lock"></i>${fmtCardClock(start)}–${fmtCardClock(end)}`;
  const timeString=(m)=>{m=((m%1440)+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`};
  const parseTime=(s)=>{const [h,m]=String(s||'0:0').split(':').map(Number);return (h||0)*60+(m||0)};
  const cap=(s)=>s?String(s).charAt(0).toUpperCase()+String(s).slice(1):'';
  const profile=()=>{try{return JSON.parse(localStorage.getItem('wabi.beta.profile'))||{}}catch{return {}}};
  const initials=(name)=>((name||'W').trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'W');
  const catObj=(label)=>W.CATS.find(c=>c.label===label);
  const priorityOf=(t)=>PRIORITIES[t.priority]||PRIORITIES.regular;
  const priorityKey=(t)=>PRIORITIES[t.priority]?t.priority:'regular';
  const nextId=()=>`t${Date.now()}${Math.random().toString(36).slice(2,6)}`;

  /* One completion/timer source of truth. Any place that marks an activity as
     done uses the same persisted timer comparison instead of maintaining a
     separate copy of the activity state. */
  const taskLiveTimerSeconds=(task)=>{
    const base=Math.max(0,Number(task?.timerSecs)||0);
    if(!task?.timerRunning)return Math.floor(base);
    const started=Number(task.timerStartedAt)||Date.now();
    return Math.floor(base+Math.max(0,Date.now()-started)/1000);
  };
  const actualStringFromSecs=(secs)=>{
    secs=Math.max(0,Math.floor(Number(secs)||0));
    const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;
    return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };
  const friendlyDeltaText=(task)=>{
    if(!task?.done)return '';
    const actual=Number(task.completedActualSecs ?? task.timerSecs)||0;
    if(actual<=0)return '';
    const planned=Number(task.completedPlannedSecs)||Math.max(30,durationMins(task.planned))*60;
    const delta=Number.isFinite(Number(task.completedDeltaSecs))?Number(task.completedDeltaSecs):actual-planned;
    const abs=Math.abs(delta);
    const amount=abs<60?'menos de 1 min':`${Math.max(1,Math.round(abs/60))} min`;
    if(delta>30)return `La actividad duró ${amount} más de lo estimado.`;
    if(delta<-30)return `La actividad duró ${amount} menos de lo estimado.`;
    return 'La actividad duró justo lo estimado.';
  };
  function setTaskDoneState(key,id,done){
    const task=(W.tasks?.[key]||[]).find(x=>x.id===id);if(!task)return null;
    const wasDone=!!task.done;
    if(done){
      const actual=taskLiveTimerSeconds(task);
      task.timerSecs=actual;
      task.timerRunning=false;
      delete task.timerStartedAt;
      task.done=true;
      if(actual>0){
        const planned=Math.max(30,durationMins(task.planned))*60;
        task.completedActualSecs=actual;
        task.completedPlannedSecs=planned;
        task.completedDeltaSecs=actual-planned;
        task.completedAt=Date.now();
        task.actual=actualStringFromSecs(actual);
      }
    }else task.done=false;
    W.saveState?.();
    if(done&&!wasDone)W.wabiSound?.('complete');
    return task;
  }
  /* Legacy completion controls, if any remain elsewhere in the app, use the
     same completion record as Hover and Focus. Event emission remains with the
     existing callers, matching the original W.toggleTask contract. */
  W.toggleTask=function(key,idx){
    const task=W.tasks?.[key]?.[idx];if(!task)return;
    setTaskDoneState(key,task.id,!task.done);
  };

  let wabiTimerAudioCtx=null;
  function unlockTimerAudio(){
    try{
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
      if(!wabiTimerAudioCtx)wabiTimerAudioCtx=new AC();
      if(wabiTimerAudioCtx.state==='suspended')wabiTimerAudioCtx.resume();
      return wabiTimerAudioCtx;
    }catch{return null}
  }
  function playEstimatedTimeAlarm(){
    if(typeof W.wabiSound==='function'){W.wabiSound('focus-estimate');return}
    const ctx=unlockTimerAudio();if(!ctx)return;
    const now=ctx.currentTime;
    [0,.22,.44].forEach((offset,i)=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';osc.frequency.value=[660,780,660][i];
      gain.gain.setValueAtTime(0.0001,now+offset);
      gain.gain.exponentialRampToValueAtTime(.055,now+offset+.02);
      gain.gain.exponentialRampToValueAtTime(.0001,now+offset+.18);
      osc.connect(gain);gain.connect(ctx.destination);osc.start(now+offset);osc.stop(now+offset+.2);
    });
  }

  /* Shared fixed vertical scale for Día + Semana.
     Approximately 53 px per hour, matching the supplied calendar reference. */
  const TIMELINE_PAD=28;
  const timelineScale=.88;
  const FLEX_PRESETS=window.WABI_PRODUCT_CONFIG.flexPresetMinutes;

  function defaultBlockConfig(){
    return {dayStart:0,blocks:window.WABI_PRODUCT_CONFIG.defaultBlocks.map(b=>({key:b.key,name:b.name,end:b.end}))};
  }
  function normalizeConfig(raw){
    const d=defaultBlockConfig();
    if(!raw||!Array.isArray(raw.blocks)||raw.blocks.length<2)return d;
    const oldStart=((Math.round((Number(raw.dayStart)||0)/30)*30)%1440+1440)%1440;
    const source=raw.blocks.slice(0,6).map((b,i)=>({key:BLOCK_KEYS[i],name:String(b.name||`Bloque ${BLOCK_KEYS[i]}`).slice(0,28),end:Number(b.end)}));
    /* Exact legacy default: rotate labels/ranges into the new midnight-first default. */
    const legacyDefault=oldStart===360&&source.length===4&&[660,1080,1440,1800].every((v,i)=>Number(source[i].end)===v);
    if(legacyDefault)return d;
    /* Custom legacy configs: derive real clock boundaries, then rebuild a continuous
       midnight-to-midnight set. Midnight splits a wrapping block only when needed. */
    let prev=oldStart,intervals=[];
    for(let i=0;i<source.length;i++){
      let e=Number.isFinite(source[i].end)?source[i].end:prev+Math.floor(1440/source.length/30)*30;
      while(e<=prev)e+=1440;
      if(i===source.length-1)e=oldStart+1440;
      intervals.push({name:source[i].name,start:prev,end:e});prev=e;
    }
    const pieces=[];
    for(const it of intervals){
      let a=it.start,b=it.end;
      while(a<0){a+=1440;b+=1440}
      while(a>=1440){a-=1440;b-=1440}
      if(b<=1440)pieces.push({name:it.name,start:a,end:b});
      else{pieces.push({name:it.name,start:a,end:1440});pieces.push({name:it.name,start:0,end:b-1440})}
    }
    pieces.sort((a,b)=>a.start-b.start||a.end-b.end);
    /* Merge adjacent pieces carrying the same label, but never exceed six product blocks. */
    const merged=[];
    for(const p of pieces){const last=merged.at(-1);if(last&&last.name===p.name&&Math.abs(last.end-p.start)<1)last.end=p.end;else merged.push({...p})}
    if(!merged.length||merged.length>6||merged[0].start!==0||Math.round(merged.at(-1).end)!==1440)return d;
    for(let i=1;i<merged.length;i++)if(Math.round(merged[i-1].end)!==Math.round(merged[i].start))return d;
    const blocks=merged.map((p,i)=>({key:BLOCK_KEYS[i],name:p.name||`Bloque ${BLOCK_KEYS[i]}`,end:i===merged.length-1?1440:Math.round(p.end/30)*30}));
    let p=0;
    for(let i=0;i<blocks.length;i++){const min=p+30,max=1440-(blocks.length-i-1)*30;blocks[i].end=i===blocks.length-1?1440:clamp(blocks[i].end,min,max);p=blocks[i].end}
    return {dayStart:0,blocks};
  }
  function loadBlockConfig(){
    try{return normalizeConfig(JSON.parse(localStorage.getItem(BLOCK_STORE)))}catch{return defaultBlockConfig()}
  }
  let blockConfig=loadBlockConfig();
  function saveBlockConfig(cfg){
    /* Block customization is visual/planning structure only. Freeze the current
       clock of every flexible activity before changing boundaries so no card jumps. */
    const currentStarts=new Map();
    for(const [dayKey,list] of Object.entries(W.tasks||{})){
      for(const t of (list||[])){
        if(t.fixed&&t.startTime){currentStarts.set(t.id,parseTime(t.startTime));continue}
        if(Number.isFinite(Number(t.preferredStart))){currentStarts.set(t.id,((Number(t.preferredStart)%1440)+1440)%1440);continue}
        const p=W.scheduleBlock(dayKey,t.block||W.BLOCKS[0].key,{mode:'normal'}).placements.get(t.id);
        if(p)currentStarts.set(t.id,((Number(p.start)%1440)+1440)%1440);
      }
    }
    blockConfig=normalizeConfig(cfg);
    try{localStorage.setItem(BLOCK_STORE,JSON.stringify(blockConfig))}catch{}
    installBlocks();
    Object.values(W.tasks||{}).forEach(list=>(list||[]).forEach(t=>{
      const minute=currentStarts.get(t.id);
      if(minute===undefined||!Number.isFinite(minute))return;
      if(!t.fixed)t.preferredStart=minute;
      t.block=hourBlockDynamic(Math.floor(minute/60),minute%60);
    }));
    W.saveState?.();
  }
  function blockInfos(cfg=blockConfig){
    let start=cfg.dayStart;
    return cfg.blocks.map((b,i)=>{
      const end=i===cfg.blocks.length-1?cfg.dayStart+1440:b.end;
      const key=BLOCK_KEYS[i];
      const info={key,label:b.name||`Bloque ${key}`,name:b.name||`Bloque ${key}`,startAbs:start,endAbs:end,total:end-start,startHour:Math.floor((start%1440)/60),range:fmtRangeVisible(start,end)};
      start=end;
      return info;
    });
  }
  function getBlock(key,cfg=blockConfig){return blockInfos(cfg).find(b=>b.key===key)||blockInfos(cfg)[0]}
  function absClockInDay(clock,cfg=blockConfig){return parseTime(clock)}
  function hourBlockDynamic(h,m=0,cfg=blockConfig){const x=((Number(h)||0)*60+(Number(m)||0)+1440)%1440;return blockInfos(cfg).find(b=>x>=b.startAbs&&x<b.endAbs)?.key||blockInfos(cfg).at(-1).key;}
  function installBlocks(){
    const infos=blockInfos();
    W.BLOCKS=infos.map(b=>({key:b.key,label:b.label,range:b.range,startHour:b.startHour,startAbs:b.startAbs,endAbs:b.endAbs,hours:[]}));
    W.HOURS_DISPLAY=Array.from({length:24},(_,i)=>i);
    W.hourBlock=(h,m=0)=>hourBlockDynamic(h,m);
    if(W.beta)W.beta.blockInfo=(key)=>getBlock(key);
  }
  installBlocks();

  /* ───────── task normalization + dynamic scheduling ───────── */
  Object.values(W.tasks||{}).forEach(list=>list.forEach(t=>{
    if(!PRIORITIES[t.priority])t.priority='regular';
    if(typeof t.fixed!=='boolean')t.fixed=false;
    if(!Array.isArray(t.reminders))t.reminders=[10];
    if(t.fixed&&t.startTime){const x=parseTime(t.startTime);t.block=hourBlockDynamic(Math.floor(x/60),x%60);}
    else if(!t.fixed&&Number.isFinite(Number(t.preferredStart))){const x=((Number(t.preferredStart)%1440)+1440)%1440;t.block=hourBlockDynamic(Math.floor(x/60),x%60);}
  }));

  /* One activity, one source of truth. A generated recurrence occurrence may
     carry occurrence-local execution state, but planning metadata comes from
     the same series root whenever it exists. */
  function recurrenceRootFor(task){
    if(!task?.recurrenceRootId)return null;
    for(const list of Object.values(W.tasks||{})){
      const root=(list||[]).find(x=>x.id===task.recurrenceRootId);
      if(root)return root;
    }
    return null;
  }

  /* One-time cleanup requested for this build:
     - remove every activity titled "hola" (case/space insensitive)
     - bring saved source activities into the current Monday-Sunday week,
       preserving weekday and every other activity property
     - discard generated recurrence copies so they can be regenerated from
       their single source of truth in the current week. */
  function migrateSavedActivitiesToCurrentWeek(){
    const MIGRATION_KEY='wabi.migration.current-week-source-truth.v1';
    try{if(localStorage.getItem(MIGRATION_KEY)==='1')return}catch{}
    const ws=W.getWeekStart(new Date());
    const moved={};
    for(const [oldKey,list] of Object.entries(W.tasks||{})){
      const oldDate=W.fromKey(oldKey);
      const weekday=(oldDate.getDay()+6)%7; // Monday=0 ... Sunday=6
      const targetDate=W.addDays(ws,weekday);
      const targetKey=W.dateKey(targetDate);
      for(const raw of (list||[])){
        if(String(raw?.title||'').trim().toLowerCase()==='hola')continue;
        if(raw?.recurrenceGenerated)continue;
        const t={...raw};
        if(t.repeat&&t.repeat!=='none')t.recurrenceStart=targetKey;
        if(!moved[targetKey])moved[targetKey]=[];
        moved[targetKey].push(t);
      }
    }
    W.tasks=moved;
    try{localStorage.setItem(MIGRATION_KEY,'1')}catch{}
    W.saveState?.();
  }
  /* Historical current-week QA migration disabled: never rewrite saved activity dates on load. */

  /* Real QA activities: ordinary [wabi] activity data, not special rendering.
     They are inserted once and can be edited, dragged, started, completed or
     deleted exactly like user-created activities. Large empty zones remain so
     the user can still create their own activities and test creation flows. */
  function seedRealQaWeekOnce(){
    const SEED_KEY='wabi.qa.real-week.v3';
    try{if(localStorage.getItem(SEED_KEY)==='1')return}catch{}
    const ws=W.getWeekStart(new Date());
    const keyFor=i=>W.dateKey(W.addDays(ws,i));
    const baseTask=(id,title,extra={})=>({
      id:`wabi-qa-${id}`,title,block:'A',planned:'0:30',category:'#personal',
      priority:'regular',type:null,fixed:false,startTime:null,endTime:null,
      reminders:[],repeat:'none',recurrenceStart:keyFor(0),done:false,
      notes:'',subtasks:[],actual:'0:00:00',timerSecs:0,timerRunning:false,
      ...extra
    });
    const add=(dayIndex,t)=>{
      const key=keyFor(dayIndex);
      if(Object.values(W.tasks||{}).flat().some(x=>x.id===t.id))return;
      t.recurrenceStart=t.recurrenceStart||key;
      if(!W.tasks[key])W.tasks[key]=[];
      W.tasks[key].push(t);
    };

    /* Monday: canonical Normal slots with deliberate whitespace. */
    add(0,baseTask('correr','Correr',{
      block:'A',planned:'0:45',preferredStart:360,type:'intense',
      category:'#salud',priority:'urgent',reminders:[10],
      notes:'Prueba el recordatorio de 10 minutos.'
    }));
    add(0,baseTask('respirar','Respirar y descansar',{
      block:'A',planned:'1:00',preferredStart:525,type:'relax',
      category:'#personal',priority:'low',reminders:[],
      subtasks:[{text:'Preparar agua',done:true},{text:'Dejar el teléfono lejos',done:false}]
    }));
    add(0,baseTask('leer','Leer capítulo',{
      block:'A',planned:'0:30',preferredStart:600,type:null,
      category:'#estudio',priority:'regular',reminders:[30],
      subtasks:[{text:'Leer 10 páginas',done:false},{text:'Anotar una idea',done:false}]
    }));
    add(0,baseTask('presentacion','Preparar presentación',{
      block:'A',planned:'0:30',preferredStart:630,type:'intense',
      category:'#trabajo',priority:'important',reminders:[5],
      notes:'Prueba una actividad breve dentro del bloque.'
    }));
    add(0,baseTask('reunion','Reunión de proyecto',{
      block:'B',planned:'0:45',fixed:true,startTime:'13:30',endTime:'14:15',
      category:'#trabajo',priority:'important',type:null,reminders:[15],
      notes:'Hora fija: conserva su horario.'
    }));

    /* Tuesday: fixed crossing a block plus a long flexible activity. */
    add(1,baseTask('cita-larga','Cita larga',{
      block:'A',planned:'2:00',fixed:true,startTime:'10:20',endTime:'12:20',
      category:'#salud',priority:'important',type:'relax',reminders:[60]
    }));
    add(1,baseTask('propuesta','Preparar propuesta',{
      block:'B',planned:'1:30',preferredStart:870,type:'intense',
      category:'#trabajo',priority:'urgent',reminders:[120],
      notes:'Card amplio para comprobar duraciones largas.'
    }));

    /* Wednesday: minimum card, daily recurrence and one real 50/50 overlap. */
    add(2,baseTask('rutina-diaria','Rutina diaria',{
      block:'A',planned:'0:30',preferredStart:435,type:'relax',
      category:'#salud',priority:'regular',reminders:[5],repeat:'daily',
      recurrenceStart:keyFor(2)
    }));
    add(2,baseTask('mensaje-5','Responder mensaje',{
      block:'A',planned:'0:30',preferredStart:480,type:null,
      category:'#personal',priority:'low',reminders:[0]
    }));
    add(2,baseTask('revision-solape','Revisión rápida',{
      block:'A',planned:'0:30',preferredStart:600,type:'intense',
      category:'#estudio',priority:'important',reminders:[10]
    }));
    add(2,baseTask('llamada-solape','Llamada breve',{
      block:'A',planned:'0:30',preferredStart:615,type:'relax',
      category:'#trabajo',priority:'regular',reminders:[15]
    }));

    /* Thursday stays intentionally almost empty (apart from recurrence). */

    add(4,baseTask('ordenar','Ordenar la casa',{
      block:'B',planned:'0:30',preferredStart:960,type:'relax',
      category:'#casa',priority:'low',reminders:[1440],repeat:'weekly',
      recurrenceStart:keyFor(4)
    }));
    add(4,baseTask('laborables','Revisar pendientes',{
      block:'A',planned:'0:30',preferredStart:570,type:null,
      category:'#trabajo',priority:'regular',reminders:[10],repeat:'weekdays',
      recurrenceStart:keyFor(4)
    }));
    add(5,baseTask('mensual','Revisión mensual',{
      block:'A',planned:'0:30',preferredStart:630,type:null,
      category:'#personal',priority:'important',reminders:[2880],repeat:'monthly',
      recurrenceStart:keyFor(5),
      notes:'Prueba recurrencia mensual y recordatorio de 2 días.'
    }));
    add(6,baseTask('proyecto-grande','Proyecto grande',{
      block:'B',planned:'2:00',preferredStart:840,type:'intense',
      category:'#estudio',priority:'urgent',reminders:[60],
      repeat:{type:'custom',every:2,unit:'week'},recurrenceStart:keyFor(6),
      notes:'Prueba Notas, Timer e Iniciar.',
      subtasks:[
        {text:'Definir resultado',done:true},
        {text:'Hacer primera parte',done:false},
        {text:'Revisar',done:false}
      ]
    }));
    add(6,baseTask('hecha','Actividad completada',{
      block:'C',planned:'0:30',preferredStart:1140,type:'relax',
      category:'#casa',priority:'regular',reminders:[],done:true,
      timerSecs:2520,completedActualSecs:2520,completedPlannedSecs:1800,completedDeltaSecs:720,completedAt:Date.now(),
      notes:'Prueba filtros y la comparación: 30 min estimados vs 42 min reales.'
    }));

    try{localStorage.setItem(SEED_KEY,'1')}catch{}
    W.saveState?.();
  }
  seedRealQaWeekOnce();
  (function refreshCompletedQaExample(){
    const t=Object.values(W.tasks||{}).flat().find(x=>x.id==='wabi-qa-hecha');if(!t)return;
    if(!Number(t.completedActualSecs)){t.done=true;t.timerSecs=2520;t.completedActualSecs=2520;t.completedPlannedSecs=1800;t.completedDeltaSecs=720;t.completedAt=t.completedAt||Date.now();W.saveState?.()}
  })();

  /* 30-minute minimum migration. These remain ordinary user activities; only
     legacy durations below the new product minimum are normalized. */
  (function migrateMinimumDuration30(){
    let changed=false;
    for(const list of Object.values(W.tasks||{}))for(const t of (list||[])){
      const old=durationMins(t.planned);
      if(old>=30)continue;
      t.planned=plannedFromMins(30);
      if(t.fixed){
        const s=absClockInDay(t.startTime||timeString(blockConfig.dayStart));
        t.endTime=timeString(s+30);
      }
      /* Flexible clock stays exactly where it was, even if 30 min crosses a block boundary. */
      changed=true;
    }
    if(changed)W.saveState?.();
  })();
  W.saveState?.();

  W.applyMode=function(taskList){
    const mode=W.state.mode||'normal';
    if(mode==='normal')return [...taskList];
    const out=[...taskList];
    /* Explicit [wabi] energy order:
       Relax   = Relax -> Intense -> Normal
       Intense = Intense -> Relax -> Normal.
       Only task identities change slots; the clock slots never move. */
    const rank=t=>mode==='relax'
      ?(t.type==='relax'?0:t.type==='intense'?1:2)
      :(t.type==='intense'?0:t.type==='relax'?1:2);
    W.BLOCKS.forEach(b=>{
      const positions=[];
      taskList.forEach((t,i)=>{if(!t.fixed&&(t.block||W.BLOCKS[0].key)===b.key)positions.push(i)});
      const ordered=positions.map((pos,baseIndex)=>({t:taskList[pos],baseIndex}))
        .sort((a,b2)=>rank(a.t)-rank(b2.t)||a.baseIndex-b2.baseIndex)
        .map(x=>x.t);
      positions.forEach((pos,i)=>{out[pos]=ordered[i]});
    });
    return out;
  };

    W.scheduleBlock=function(dayKey,blockKey,opts={}){
    const bi=getBlock(blockKey);
    const source=(opts.tasks||W.tasksFor(dayKey));
    const effectiveMode=opts.mode||W.state.mode||'normal';

    /* AUTHORITATIVE CLOCK MODEL
       Normal owns the clock slots. Relax/Intense never compact, nudge, resize,
       or generate new starts: they only swap flexible activity identities into
       those exact Normal start slots. Fixed activities stay anchored. */
    const fixedAll=source.filter(t=>t.fixed).map(t=>{
      const start=absClockInDay(t.startTime||timeString(blockConfig.dayStart));
      return {t,start,end:start+Math.max(30,durationMins(t.planned))};
    }).sort((a,b)=>a.start-b.start);

    /* Up to two simultaneous activities are valid, including fixed ones.
       A third concurrent interval is the only hard overlap rejection. */
    let valid=true,reason='';

    const blockers=fixedAll
      .filter(x=>x.end>bi.startAbs&&x.start<bi.endAbs)
      .map(x=>({start:Math.max(x.start,bi.startAbs),end:Math.min(x.end,bi.endAbs),t:x.t}))
      .sort((a,b)=>a.start-b.start);

    const fixedPlacements=new Map();
    fixedAll.forEach(x=>fixedPlacements.set(x.t.id,{start:x.start,end:x.end,fixed:true}));
    const flexSource=source.filter(t=>!t.fixed&&(t.block||W.BLOCKS[0].key)===blockKey);

    const maxConcurrent=(placementMap)=>{
      const marks=[];
      for(const p of placementMap.values()){
        const a=Math.max(p.start,bi.startAbs),b=Math.min(p.end,bi.endAbs);
        if(b>a)marks.push({time:a,delta:1},{time:b,delta:-1});
      }
      /* Ends before starts at the same minute: back-to-back is not overlap. */
      marks.sort((a,b)=>a.time-b.time||a.delta-b.delta);
      let active=0,maxActive=0;
      for(const m of marks){active+=m.delta;maxActive=Math.max(maxActive,active)}
      return maxActive;
    };

    const normalPlacements=new Map(fixedPlacements);
    if(valid){
      const normalFlex=flexSource
        .map((t,i)=>({t,i,p:Number.isFinite(Number(t.preferredStart))?Number(t.preferredStart):Infinity}))
        .sort((a,b)=>a.p-b.p||a.i-b.i)
        .map(x=>x.t);

      /* Occupied is used ONLY to give a first slot to a task that has never had
         a Normal slot. Existing preferredStart values never push neighbours. */
      const occupied=[...blockers.map(x=>({start:x.start,end:x.end})),...source.filter(t=>!t.fixed&&(t.block||W.BLOCKS[0].key)!==blockKey&&Number.isFinite(Number(t.preferredStart))).map(t=>{const s=Number(t.preferredStart);return {start:s,end:s+Math.max(30,durationMins(t.planned))}})].sort((a,b)=>a.start-b.start);
      const firstFreeSlot=(from,dur)=>{
        let s=Math.max(bi.startAbs,from);
        for(const o of occupied){
          if(o.end<=s)continue;
          if(s+dur<=o.start)return s;
          if(s<o.end)s=o.end;
          if(s+dur>bi.endAbs)return null;
        }
        return s+dur<=bi.endAbs?s:null;
      };

      for(const t of normalFlex){
        const dur=Math.max(30,durationMins(t.planned));
        const hasPreferred=Number.isFinite(Number(t.preferredStart));
        let slot=null;
        if(hasPreferred){
          const desired=Number(t.preferredStart);
          if(desired>=blockConfig.dayStart&&desired<blockConfig.dayStart+1440&&desired+dur<=blockConfig.dayStart+1440)slot=desired;
        }else{
          slot=firstFreeSlot(bi.startAbs,dur);
        }
        if(slot===null){
          /* Never return a half-built map that makes later cards disappear.
             Keep evaluating the rest and report the block invalid. */
          valid=false;
          reason=reason||'La actividad no cabe completa en su bloque.';
          continue;
        }
        normalPlacements.set(t.id,{start:slot,end:slot+dur,fixed:false});
        occupied.push({start:slot,end:slot+dur});
        occupied.sort((a,b)=>a.start-b.start);
      }
      if(maxConcurrent(normalPlacements)>2){
        valid=false;reason=reason||'Máximo 2 actividades al mismo tiempo.';
      }
    }

    /* Relax / Intense: ALL flexible activities in this block participate.
       Their Normal starts are immutable slots. Duration travels with the task,
       so a real temporal crossing can occur and is rendered 50/50. */
    let placements=new Map(normalPlacements);
    if(valid&&effectiveMode!=='normal'){
      const rank=t=>effectiveMode==='relax'
        ?(t.type==='relax'?0:t.type==='intense'?1:2)
        :(t.type==='intense'?0:t.type==='relax'?1:2);

      const entries=flexSource
        .map((t,baseIndex)=>({t,baseIndex,p:normalPlacements.get(t.id)}))
        .filter(x=>x.p)
        .sort((a,b)=>a.p.start-b.p.start||a.baseIndex-b.baseIndex);

      if(entries.length>1){
        const slots=entries.map(x=>x.p.start);
        const reordered=entries
          .map((x,normalOrder)=>({...x,normalOrder}))
          .sort((a,b)=>rank(a.t)-rank(b.t)||a.normalOrder-b.normalOrder);
        const trial=new Map(normalPlacements);
        let fits=true;
        reordered.forEach((x,i)=>{
          const start=slots[i],end=start+Math.max(30,durationMins(x.t.planned));
          if(start<bi.startAbs||end>bi.endAbs)fits=false;
          trial.set(x.t.id,{start,end,fixed:false});
        });
        if(fits&&maxConcurrent(trial)<=2)placements=trial;
        /* If the exact swap would leave the block or create a third concurrent
           card, the block remains Normal. We never invent another time. */
      }
    }

    const occupiedForCapacity=source.map(task=>{
      let p=placements.get(task.id);
      if(!p&&task.fixed&&task.startTime){const s=absClockInDay(task.startTime);p={start:s,end:s+Math.max(30,durationMins(task.planned))}}
      if(!p&&!task.fixed&&Number.isFinite(Number(task.preferredStart))){const s=Number(task.preferredStart);p={start:s,end:s+Math.max(30,durationMins(task.planned))}}
      return p?{start:Math.max(p.start,bi.startAbs),end:Math.min(p.end,bi.endAbs)}:null;
    }).filter(x=>x&&x.end>x.start).sort((a,b)=>a.start-b.start);
    const merged=[];
    for(const x of occupiedForCapacity){
      const last=merged[merged.length-1];
      if(!last||x.start>last.end)merged.push({...x});
      else last.end=Math.max(last.end,x.end);
    }
    const used=merged.reduce((n,x)=>n+(x.end-x.start),0);
    const free=Math.max(0,bi.total-used);
    const tasks=source.filter(t=>{
      const p=placements.get(t.id);if(!p)return false;
      if(t.fixed)return p.start>=bi.startAbs&&p.start<bi.endAbs;
      return (t.block||W.BLOCKS[0].key)===blockKey;
    }).sort((a,b)=>(placements.get(a.id)?.start??Infinity)-(placements.get(b.id)?.start??Infinity));

    return {valid,reason,placements,used,free,total:bi.total,tasks,block:bi};
  };
  function stabilizeFlexiblePlacements(dayKey){
    if(!dayKey||!W.tasks?.[dayKey])return false;
    const list=W.tasksFor(dayKey);let changed=false;
    for(const b of W.BLOCKS){
      const sch=W.scheduleBlock(dayKey,b.key,{mode:'normal'});
      for(const t of list){
        if(t.fixed||(t.block||W.BLOCKS[0].key)!==b.key)continue;
        if(Number.isFinite(Number(t.preferredStart)))continue;
        const p=sch.placements.get(t.id);if(!p)continue;
        t.preferredStart=p.start;
        t.manualOverlap=false;
        changed=true;
      }
    }
    if(changed)W.saveState?.();
    return changed;
  }

  /* Freeze missing flexible baselines once. Existing preferredStart values are
     never rewritten, which keeps drag and mode changes visually stable. */
  Object.keys(W.tasks||{}).forEach(stabilizeFlexiblePlacements);
  W.saveState?.();

  W.findEarliestFixedSlot=function(dayKey,blockKey,duration,excludeId){
    const bi=getBlock(blockKey);
    const ints=W.tasksFor(dayKey).filter(t=>t.fixed&&!t.done&&t.id!==excludeId).map(t=>{const s=absClockInDay(t.startTime);return {start:s,end:s+durationMins(t.planned)}}).sort((a,b)=>a.start-b.start);
    for(let s=bi.startAbs;s+duration<=bi.endAbs;s+=15)if(ints.every(x=>s+duration<=x.start||s>=x.end))return timeString(s);
    return null;
  };
  W.canPlaceTask=function(task,dayKey,blockKey,excludeId){
    const copy={...task,block:blockKey};
    const list=W.tasksFor(dayKey).filter(t=>t.id!==excludeId).map(t=>({...t}));
    const positioned=copy.fixed||Number.isFinite(Number(copy.preferredStart));
    if(positioned){
      const start=copy.fixed?absClockInDay(copy.startTime):Number(copy.preferredStart),end=start+Math.max(30,durationMins(copy.planned));
      if(!(end>start&&start>=blockConfig.dayStart&&end<=blockConfig.dayStart+1440))return {valid:false,reason:'El horario debe quedar dentro del día.',free:0};
      const marks=[{time:start,delta:1},{time:end,delta:-1}];
      for(const t of list){
        let s=null;
        if(t.fixed&&t.startTime)s=absClockInDay(t.startTime);
        else if(Number.isFinite(Number(t.preferredStart)))s=Number(t.preferredStart);
        if(s===null)continue;
        const e=s+Math.max(30,durationMins(t.planned));
        if(start<e&&end>s){marks.push({time:Math.max(start,s),delta:1},{time:Math.min(end,e),delta:-1})}
      }
      marks.sort((a,b)=>a.time-b.time||a.delta-b.delta);let active=0,max=0;
      for(const m of marks){active+=m.delta;max=Math.max(max,active)}
      if(max>2)return {valid:false,reason:'No se pueden cruzar más de 2 actividades.',free:0};
      return {valid:true,reason:'',free:getBlock(blockKey).total,total:getBlock(blockKey).total,placements:new Map([[copy.id,{start,end,fixed:copy.fixed}]])};
    }
    list.push(copy);
    return W.scheduleBlock(dayKey,blockKey,{tasks:list,mode:'normal'});
  };

  function blockAvailability(dayKey,blockKey){
    const bi=getBlock(blockKey);
    const intervals=W.tasksFor(dayKey).map(task=>{
      let start=null;
      if(task.fixed&&task.startTime)start=absClockInDay(task.startTime);
      else if(Number.isFinite(Number(task.preferredStart)))start=Number(task.preferredStart);
      else {const p=W.scheduleBlock(dayKey,task.block||W.BLOCKS[0].key,{mode:'normal'}).placements.get(task.id);if(p)start=p.start}
      if(start===null)return null;
      return {start:Math.max(bi.startAbs,start),end:Math.min(bi.endAbs,start+Math.max(30,durationMins(task.planned)))};
    }).filter(x=>x&&x.end>x.start).sort((a,b)=>a.start-b.start);
    const merged=[];for(const x of intervals){const last=merged[merged.length-1];if(!last||x.start>last.end)merged.push({...x});else last.end=Math.max(last.end,x.end)}
    const windows=[];let cursor=bi.startAbs;for(const x of merged){if(x.start>cursor)windows.push({start:cursor,end:x.start,duration:x.start-cursor});cursor=Math.max(cursor,x.end)}if(cursor<bi.endAbs)windows.push({start:cursor,end:bi.endAbs,duration:bi.endAbs-cursor});
    return {block:bi,windows,maxContinuous:windows.reduce((m,x)=>Math.max(m,x.duration),0),totalFree:windows.reduce((m,x)=>m+x.duration,0)};
  }

  function recurrenceSpec(t){
    if(!t||!t.repeat||t.repeat==='none'||t.recurrenceGenerated)return null;
    if(typeof t.repeat==='string')return {type:t.repeat,every:1};
    if(t.repeat?.type==='custom')return {type:'custom',every:Math.max(1,Number(t.repeat.every)||1),unit:t.repeat.unit||'week'};
    return null;
  }
  function dateOnly(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate())}
  function dayDiff(a,b){return Math.round((dateOnly(b)-dateOnly(a))/86400000)}
  function monthDiff(a,b){return (b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth())}
  function recurrenceMatches(rootDate,d,spec){
    if(d<rootDate)return false;
    const diff=dayDiff(rootDate,d);
    if(spec.type==='daily')return true;
    if(spec.type==='weekdays')return d.getDay()!==0&&d.getDay()!==6;
    if(spec.type==='weekly')return diff%7===0;
    if(spec.type==='monthly'){const md=monthDiff(rootDate,d);return md>=0&&d.getDate()===Math.min(rootDate.getDate(),new Date(d.getFullYear(),d.getMonth()+1,0).getDate())}
    if(spec.type==='custom'){
      const every=Math.max(1,Number(spec.every)||1);
      if(spec.unit==='day')return diff%every===0;
      if(spec.unit==='week')return diff%(7*every)===0;
      if(spec.unit==='month'){const md=monthDiff(rootDate,d);return md>=0&&md%every===0&&d.getDate()===Math.min(rootDate.getDate(),new Date(d.getFullYear(),d.getMonth()+1,0).getDate())}
    }
    return false;
  }
  function recurringRoots(){
    const roots=[];
    Object.entries(W.tasks||{}).forEach(([key,list])=>(list||[]).forEach(t=>{
      if(t?.recurrenceGenerated)return;
      const spec=recurrenceSpec(t);
      if(spec)roots.push({task:t,key,spec,start:W.fromKey(t.recurrenceStart||key)});
    }));
    return roots;
  }
  const recurrenceCloneValue=v=>Array.isArray(v)?v.map(x=>x&&typeof x==='object'?{...x}:x):(v&&typeof v==='object'?{...v}:v);
  const SERIES_SYNC_FIELDS=['title','block','planned','category','priority','type','fixed','startTime','endTime','reminders','notes','subtasks'];
  function occurrenceFor(rootId,dateKey){
    for(const list of Object.values(W.tasks||{})){
      const found=(list||[]).find(t=>t.recurrenceRootId===rootId&&t.recurrenceForDate===dateKey);
      if(found)return found;
    }
    return null;
  }
  function syncOccurrenceFromRoot(existing,root){
    if(existing.recurrenceOverride||existing.recurrenceStopHere)return false;
    let changed=false;
    for(const f of SERIES_SYNC_FIELDS){
      const rv=root[f];
      if(rv===undefined){if(existing[f]!==undefined){delete existing[f];changed=true}continue}
      const nv=recurrenceCloneValue(rv);
      if(JSON.stringify(existing[f])!==JSON.stringify(nv)){existing[f]=nv;changed=true}
    }
    const rr=typeof root.repeat==='object'?{...root.repeat}:root.repeat;
    if(JSON.stringify(existing.repeat)!==JSON.stringify(rr)){existing.repeat=rr;changed=true}
    existing.recurrenceStart=root.recurrenceStart||existing.recurrenceStart;
    return changed;
  }
  function ensureRecurringRange(startDate,endDate){
    const start=dateOnly(startDate),end=dateOnly(endDate);let changed=false;
    for(const root of recurringRoots()){
      const until=root.task.recurrenceUntil||null,exceptions=new Set(Array.isArray(root.task.recurrenceExceptions)?root.task.recurrenceExceptions:[]);
      for(let d=new Date(start);d<=end;d=W.addDays(d,1)){
        const key=W.dateKey(d);
        if(key===root.key||exceptions.has(key)||(until&&key>until)||!recurrenceMatches(root.start,d,root.spec))continue;
        const existing=occurrenceFor(root.task.id,key);
        if(existing){if(syncOccurrenceFromRoot(existing,root.task))changed=true;continue}
        const clone={...root.task,id:nextId(),repeat:typeof root.task.repeat==='object'?{...root.task.repeat}:root.task.repeat,recurrenceGenerated:true,recurrenceRootId:root.task.id,recurrenceForDate:key,recurrenceStart:root.task.recurrenceStart||root.key,recurrenceOverride:false,recurrenceStopHere:false,done:false,actual:'0:00:00',timerSecs:0,timerRunning:false};
        delete clone.recurrenceUntil;delete clone.recurrenceExceptions;
        clone.reminders=[...(root.task.reminders||[])];clone.subtasks=(root.task.subtasks||[]).map(x=>({...x}));
        if(!clone.fixed&&!Number.isFinite(Number(clone.preferredStart))){
          const probe=W.canPlaceTask(clone,key,clone.block||W.BLOCKS[0].key,null);
          if(!probe.valid){const rp=taskPlacementForDay(root.task,root.key,'normal');if(rp)clone.preferredStart=rp.start}
        }
        if(!W.tasks[key])W.tasks[key]=[];
        W.tasks[key].push(clone);changed=true;
      }
    }
    if(changed)W.saveState?.();
  }
  W.ensureRecurringRange=ensureRecurringRange;

  /* ───────── filters ───────── */
  let savedFilters={};try{savedFilters=JSON.parse(localStorage.getItem(FILTER_STORE))||{}}catch{}
  const categoryFilters=new Set(Array.isArray(savedFilters.categories)?savedFilters.categories:W.CATS.map(c=>c.label));
  const priorityFilters=new Set(Array.isArray(savedFilters.hiddenPriorities)?savedFilters.hiddenPriorities:[]);
  function saveFilters(){localStorage.setItem(FILTER_STORE,JSON.stringify({categories:[...categoryFilters],hiddenPriorities:[...priorityFilters]}));}
  function taskVisible(t){
    if(t.category&&!categoryFilters.has(t.category))return false;
    if(priorityFilters.has(priorityKey(t)))return false;
    if(W.state.filter==='pending'&&t.done)return false;
    if(W.state.filter==='done'&&!t.done)return false;
    return true;
  }
  function filteredForDay(key){return W.applyMode(W.tasksFor(key).filter(taskVisible));}

  /* ───────── brand text ───────── */
  function normalizeBrandText(root=document.body){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeValue&&/\bWabi\b/.test(n.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(n=>{n.nodeValue=n.nodeValue.replace(/\bWabi\b/g,'[wabi]')});
  }

  /* ───────── 1-second card hover preview ───────── */
  let cardHoverTimer=null,cardHoverCloseTimer=null,cardHoverEl=null;
  function cancelCardHoverClose(){clearTimeout(cardHoverCloseTimer);cardHoverCloseTimer=null}
  function closeCardHoverPreview(){
    clearTimeout(cardHoverTimer);cardHoverTimer=null;
    cancelCardHoverClose();
    cardHoverEl?.remove();cardHoverEl=null;
  }
  function scheduleCardHoverClose(delay=240){
    cancelCardHoverClose();
    cardHoverCloseTimer=setTimeout(closeCardHoverPreview,delay);
  }
  function cardHoverHTML(t,key){
    const p=taskPlacementForDay(t,key),prio=priorityOf(t),cat=catObj(t.category);
    const subs=(t.subtasks||[]),subDone=subs.filter(s=>s.done).length;
    const timeLine=p?`${fmtClock(p.start)} – ${fmtClock(p.end)}`:fmtDuration(durationMins(t.planned));
    const comparison=friendlyDeltaText(t);
    return `<div class="wabi-card-hover-head">
        <div class="wabi-card-hover-title">${esc(t.title||'Sin título')}</div>
        <div class="wabi-card-hover-actions">
          <button class="wabi-card-hover-done ${t.done?'is-done':''}" type="button" data-card-hover-done aria-label="${t.done?'Marcar pendiente':'Marcar como hecha'}"><i class="fa-solid fa-check"></i></button>
          <button class="wabi-card-hover-edit" type="button" data-card-hover-edit><i class="fa-solid fa-pen"></i><span>Editar</span></button>
          <button class="wabi-card-hover-start" type="button" data-card-hover-start><i class="fa-solid fa-play"></i><span>Iniciar</span></button>
        </div>
      </div>
      <div class="wabi-card-hover-row"><i class="fa-regular fa-clock"></i><span>${timeLine}</span>${t.fixed?'<span class="hover-fixed"><i class="fa-solid fa-lock"></i> Hora fija</span>':`<span>${fmtDuration(durationMins(t.planned))} estimados</span>`}</div>
      <div class="wabi-card-hover-tags">
        <span style="color:${prio.color}"><i class="fa-solid fa-flag"></i> ${prio.label}</span>
        ${cat?`<span style="color:${cat.color};font-weight:700">${esc(cat.label)}</span>`:''}
        ${subs.length?`<span><i class="fa-regular fa-square-check"></i> ${subDone}/${subs.length}</span>`:''}
      </div>
      ${comparison?`<div class="wabi-card-hover-comparison"><i class="fa-regular fa-clock"></i><span>${esc(comparison)}</span></div>`:''}`;
  }

  function openCardHoverEditor(el,key,id){
    const task=(W.tasks[key]||[]).find(x=>x.id===id);if(!task)return;
    const originalBlock=task.block,originalFixed=!!task.fixed;
    cancelCardHoverClose();clearTimeout(cardHoverTimer);
    el.classList.add('is-editor');
    el.dataset.editorLocked='1';

    let energy=task.type||'normal';
    let timeMode=task.fixed?'fixed':'estimate';
    const initialPlacement=taskPlacementForDay(task,key,'normal');
    const initialStart=task.fixed&&task.startTime?absClockInDay(task.startTime):(Number.isFinite(Number(task.preferredStart))?Number(task.preferredStart):(initialPlacement?.start??null));
    const displayedBlockFromClock=initialStart==null?(task.block||W.BLOCKS[0].key):hourBlockDynamic(Math.floor((((initialStart%1440)+1440)%1440)/60),((initialStart%1440)+1440)%60);
    let selectedBlockKey=displayedBlockFromClock||task.block||W.BLOCKS[0].key;
    const initialDisplayedBlock=selectedBlockKey;
    let blockExplicitlyChanged=false;
    let priority=priorityKey(task);
    let category=task.category||null;
    let reminders=new Set(Array.isArray(task.reminders)?task.reminders:[]);
    let repeat='none',repeatCustom={every:1,unit:'week'};
    const repeatSource=task.recurrenceStopHere?task:(recurrenceRootFor(task)||task);
    if(repeatSource.repeat&&typeof repeatSource.repeat==='object'){
      repeat='custom';
      repeatCustom={every:Math.max(1,Number(repeatSource.repeat.every)||1),unit:repeatSource.repeat.unit||'week'};
    }else if(typeof repeatSource.repeat==='string')repeat=repeatSource.repeat||'none';
    let editSubtasks=(task.subtasks||[]).map(s=>({text:String(s.text||''),done:!!s.done}));
    const initialFixedStart=task.fixed&&task.startTime?parseTime(task.startTime):null;
    const initialFixedEnd=task.fixed?(task.endTime?parseTime(task.endTime):(initialFixedStart==null?null:(initialFixedStart+durationMins(task.planned))%1440)):null;
    let fixedDraft=initialFixedStart==null?null:{start:initialFixedStart,end:initialFixedEnd};
    let estimateDurationDraft=task.fixed?(FLEX_PRESETS.find(x=>x>=durationMins(task.planned))??null):durationMins(task.planned);

    const date=W.fromKey(key);
    const dateInput=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const reminderOptions=[[0,'A la hora del evento'],[5,'5 minutos antes'],[10,'10 minutos antes'],[15,'15 minutos antes'],[30,'30 minutos antes'],[60,'1 hora antes'],[120,'2 horas antes'],[1440,'1 día antes'],[2880,'2 días antes']];
    const repeatOptions=[['none','No repetir'],['daily','Todos los días'],['weekdays','Días laborables'],['weekly','Cada semana'],['monthly','Cada mes'],['custom','Personalizar…']];
    const categoryOptions=`<button class="wabi-create-menu-item wabi-category-option" data-edit-cat-choice="" style="--choice-color:var(--text-muted)"><span class="wabi-category-dot"></span><span>Sin categoría</span><i class="fa-solid fa-check menu-check"></i></button>${W.CATS.map(c=>`<button class="wabi-create-menu-item wabi-category-option" data-edit-cat-choice="${esc(c.label)}" style="--choice-color:${c.color}"><span class="wabi-category-dot"></span><span>${esc(c.label)}</span><i class="fa-solid fa-check menu-check"></i></button>`).join('')}`;
    const fmtActual=secs=>{secs=Math.max(0,Math.floor(Number(secs)||0));const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`};

    el.innerHTML=`<div class="wabi-create wabi-create-v3 wabi-hover-activity-editor" role="dialog" aria-label="Editar actividad">
      <div class="wabi-create-head"><button class="wabi-close" data-edit-close aria-label="Cerrar">×</button></div>
      <div class="wabi-create-body">
        <input id="wce-title" class="wabi-title-input" placeholder="¿Qué quieres hacer?" value="${esc(task.title||'')}">
        <div class="wabi-field"><label>Día</label><input class="wabi-input" id="wce-date" type="date" value="${dateInput}"></div>
        <div class="wabi-field"><label>Planificación</label><div class="wabi-segment wabi-plan-toggle" id="wce-time-mode"><button data-v="estimate" class="${timeMode==='estimate'?'is-selected':''}"><i class="fa-regular fa-clock"></i>Tiempo estimado</button><button data-v="fixed" class="${timeMode==='fixed'?'is-selected':''}"><i class="fa-solid fa-lock"></i>Hora fija</button></div><div class="wabi-plan-content" id="wce-time-content"></div></div>
        <div class="wabi-field"><label>Prioridad</label><div class="wabi-choice-row" id="wce-priority">${Object.entries(PRIORITIES).map(([k,p])=>`<button class="wabi-choice-btn wabi-priority-choice ${priority===k?'is-selected':''}" data-edit-priority="${k}" style="--choice-color:${p.color}"><i class="fa-solid fa-flag"></i>${p.label}</button>`).join('')}</div></div>
        <div class="wabi-field"><label>Categoría</label><div class="wabi-create-dropdown"><button class="wabi-create-trigger" id="wce-cat-trigger" type="button"><span class="trigger-main"><i class="fa-solid fa-hashtag"></i><span data-edit-cat-label>Sin categoría</span></span><i class="fa-solid fa-chevron-down" style="font-size:8px"></i></button><div class="wabi-create-menu" id="wce-cat-menu">${categoryOptions}</div></div></div>
        <div class="wabi-two-col">
          <div class="wabi-field"><label>Recordatorio</label><div class="wabi-create-dropdown"><button class="wabi-create-trigger" id="wce-rem-trigger" type="button"><span class="trigger-main"><i class="fa-regular fa-bell"></i><span data-edit-rem-label>Ninguno</span></span><i class="fa-solid fa-chevron-down" style="font-size:8px"></i></button><div class="wabi-create-menu" id="wce-rem-menu"><button class="wabi-create-menu-item wabi-reminder-option" data-edit-rem-none><span>Ninguno</span><i class="fa-solid fa-check menu-check"></i></button>${reminderOptions.map(([v,l])=>`<button class="wabi-create-menu-item wabi-reminder-option" data-edit-rem="${v}"><span>${l}</span><i class="fa-solid fa-check menu-check"></i></button>`).join('')}</div></div></div>
          <div class="wabi-field"><label>Repetir</label><div class="wabi-create-dropdown"><button class="wabi-create-trigger" id="wce-repeat-trigger" type="button"><span class="trigger-main"><i class="fa-solid fa-repeat"></i><span data-edit-repeat-label>No repetir</span></span><i class="fa-solid fa-chevron-down" style="font-size:8px"></i></button><div class="wabi-create-menu" id="wce-repeat-menu">${repeatOptions.map(([v,l])=>`<button class="wabi-create-menu-item wabi-repeat-option" data-edit-repeat="${v}"><span>${l}</span><i class="fa-solid fa-check menu-check"></i></button>`).join('')}</div></div><div class="wabi-custom-repeat" id="wce-repeat-custom"><select class="wabi-select" id="wce-repeat-every">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===repeatCustom.every?'selected':''}>Cada ${i+1}</option>`).join('')}</select><select class="wabi-select" id="wce-repeat-unit"><option value="day" ${repeatCustom.unit==='day'?'selected':''}>día(s)</option><option value="week" ${repeatCustom.unit==='week'?'selected':''}>semana(s)</option><option value="month" ${repeatCustom.unit==='month'?'selected':''}>mes(es)</option></select></div></div>
        </div>

        <div class="wabi-field wabi-editor-extra"><label>Notas</label><textarea class="wabi-edit-notes" id="wce-notes" placeholder="Añade notas sobre esta actividad…">${esc(task.notes||'')}</textarea></div>

        <div class="wabi-field wabi-editor-extra"><label>Subtareas</label><div id="wce-subtasks"></div><button class="btn-subtask-add wabi-edit-add-subtask" type="button" data-edit-add-subtask><i class="fa-solid fa-plus"></i> Añadir subtarea</button></div>
      </div>
      <div class="wabi-create-foot wabi-edit-foot"><div class="wabi-edit-foot-left"><button type="button" class="wabi-edit-delete-text" data-edit-delete>Eliminar actividad</button><div class="wabi-create-error" id="wce-error"></div></div><div class="wabi-edit-foot-actions"><button class="wabi-btn" data-edit-close>Cancelar</button><button class="wabi-btn primary" id="wce-save">Guardar</button></div></div>
    </div>`;

    const editor=$('.wabi-hover-activity-editor',el);
    const closeMenus=(except=null)=>$$('.wabi-create-menu.is-open',editor).forEach(m=>{if(m!==except)m.classList.remove('is-open')});
    const toggleMenu=menu=>{const opening=!menu.classList.contains('is-open');closeMenus(menu);menu.classList.toggle('is-open',opening)};
    const error=msg=>{const x=$('#wce-error',editor);if(x)x.textContent=msg||''};
    const currentDay=()=>$('#wce-date',editor)?.value||key;

    function maxEditDuration(blockKey){
      /* When an existing fixed activity becomes Flexible, its old clock position
         remains its preferred position. Keep every standard duration available
         here so the user can try a larger/smaller card; Save performs the real
         collision/day-boundary validation at that exact position. */
      if(originalFixed&&!blockExplicitlyChanged&&initialStart!=null&&blockKey===initialDisplayedBlock)return FLEX_PRESETS.at(-1);
      let best=0;
      for(const mins of FLEX_PRESETS){
        const probe={...task,fixed:false,block:blockKey,planned:plannedFromMins(mins),startTime:null,endTime:null,manualOverlap:false};
        delete probe.preferredStart;delete probe.overlapSide;delete probe.overlapMovedAt;
        const ok=W.canPlaceTask(probe,currentDay(),blockKey,currentDay()===key?task.id:null);
        if(ok.valid)best=mins;
      }
      return best;
    }
    function durationHTML(max,current){
      return FLEX_PRESETS.filter(v=>v<=max).map(v=>`<option value="${v}" ${v===current?'selected':''}>${fmtDuration(v)}</option>`).join('');
    }
    function paintEditTime(){
      const holder=$('#wce-time-content',editor);if(!holder)return;
      if(timeMode==='estimate'){
        const currentDur=estimateDurationDraft??durationMins(task.planned);
        holder.innerHTML=`<div class="wabi-field" style="margin:0"><label>Bloque</label><div class="wabi-choice-row" id="wce-block-choices">${W.BLOCKS.map(b=>{const max=maxEditDuration(b.key);return `<button class="wabi-choice-btn wabi-block-choice ${b.key===selectedBlockKey?'is-selected':''} ${max<30?'is-unavailable':''}" ${max<30?'disabled':''} data-edit-block="${b.key}" style="${blockChoiceStyle(b.key)}"><span class="block-key">${b.key}</span><span>${esc(b.label)}</span></button>`}).join('')}</div></div><div class="wabi-field" style="margin:8px 0 0"><label>Duración Estimada</label><select class="wabi-select" id="wce-duration"></select></div><div class="wabi-time-choice-note">[wabi] busca un espacio disponible dentro del bloque que elegiste.</div><div class="wabi-plan-inline-error" id="wce-plan-error"></div>`;
        const setDuration=()=>{
          const sel=$('#wce-duration',holder);if(!sel)return;
          if(!selectedBlockKey){sel.innerHTML='';return}
          const max=maxEditDuration(selectedBlockKey);
          let desired=Number(sel.value)||currentDur||30;
          const allowed=FLEX_PRESETS.filter(v=>v<=max);
          if(!allowed.length){sel.innerHTML='';return}
          if(!allowed.includes(desired))desired=allowed.reduce((a,b)=>Math.abs(b-(currentDur||30))<Math.abs(a-(currentDur||30))?b:a,allowed[0]);
          sel.innerHTML=durationHTML(max,desired);sel.value=String(desired);
        };
        $$('[data-edit-block]',holder).forEach(b=>b.onclick=()=>{if(b.disabled)return;selectedBlockKey=b.dataset.editBlock;blockExplicitlyChanged=selectedBlockKey!==initialDisplayedBlock;$$('[data-edit-block]',holder).forEach(x=>x.classList.toggle('is-selected',x===b));setDuration()});
        setDuration();
        $('#wce-duration',holder)?.addEventListener('change',()=>{});
        return;
      }
      let startMin=fixedDraft?.start??null,endMin=fixedDraft?.end??null;
      holder.innerHTML=`<div class="wabi-fixed-range-grid"><div class="wabi-field" style="margin:0"><label>Empieza</label>${clockEditorHTML('edit-start',startMin)}</div><div class="dash">—</div><div class="wabi-field" style="margin:0"><label>Termina</label>${clockEditorHTML('edit-end',endMin)}</div></div><div class="wabi-estimated-readout" id="wce-est-readout" style="margin-top:8px"></div><div class="wabi-time-choice-note"><i class="fa-solid fa-lock"></i> La hora se guarda siempre en formato de 24 h. Los botones a. m./p. m. convierten el valor sin cambiar el momento elegido.</div><div class="wabi-plan-inline-error" id="wce-plan-error"></div>`;
      const update=()=>{const sm=readClockEditor(holder,'edit-start'),em=readClockEditor(holder,'edit-end'),read=$('#wce-est-readout',holder);if(sm===null||em===null){read.textContent='';return}const s=clockAbsForConfiguredDay(sm);let e=clockAbsForConfiguredDay(em);if(e<=s)e+=1440;const mins=e-s;read.textContent=mins>0&&mins<1440?`${fmtDuration(mins)} estimada`:''};
      bindClockEditor(holder,'edit-start',update);bindClockEditor(holder,'edit-end',update);update();
    }

    $$('#wce-time-mode button',editor).forEach(b=>b.onclick=()=>{
      if(b.dataset.v===timeMode)return;
      if(timeMode==='fixed'){
        const sm=readClockEditor(editor,'edit-start'),em=readClockEditor(editor,'edit-end');
        if(sm!==null&&em!==null){fixedDraft={start:sm,end:em};const real=(()=>{let e=em;if(e<=sm)e+=1440;return e-sm})();estimateDurationDraft=FLEX_PRESETS.find(x=>x>=real)??null;selectedBlockKey=hourBlockDynamic(Math.floor(sm/60),sm%60)||selectedBlockKey}
      }else{const sel=$('#wce-duration',editor);if(sel)estimateDurationDraft=Number(sel.value)||estimateDurationDraft}
      timeMode=b.dataset.v;$$('#wce-time-mode button',editor).forEach(x=>x.classList.toggle('is-selected',x===b));if(timeMode==='estimate'&&!selectedBlockKey)selectedBlockKey=initialDisplayedBlock;paintEditTime();
    });
    $('#wce-date',editor).onchange=()=>{if(timeMode==='estimate')paintEditTime()};
    $$('[data-edit-priority]',editor).forEach(b=>b.onclick=()=>{priority=b.dataset.editPriority;$$('[data-edit-priority]',editor).forEach(x=>x.classList.toggle('is-selected',x===b))});
    $$('#wce-energy button',editor).forEach(b=>b.onclick=()=>{energy=b.dataset.v;$$('#wce-energy button',editor).forEach(x=>x.classList.toggle('is-selected',x===b))});

    const catTrigger=$('#wce-cat-trigger',editor),catMenu=$('#wce-cat-menu',editor);
    catTrigger.onclick=()=>toggleMenu(catMenu);
    const paintCategory=()=>{const c=catObj(category);$('[data-edit-cat-label]',catTrigger).textContent=category||'Sin categoría';catTrigger.classList.toggle('has-color',!!c);if(c)catTrigger.style.setProperty('--choice-color',c.color);else catTrigger.style.removeProperty('--choice-color');$$('[data-edit-cat-choice]',catMenu).forEach(x=>x.classList.toggle('is-selected',(x.dataset.editCatChoice||null)===(category||null)))};
    $$('[data-edit-cat-choice]',catMenu).forEach(b=>b.onclick=()=>{category=b.dataset.editCatChoice||null;paintCategory();catMenu.classList.remove('is-open')});paintCategory();

    const remTrigger=$('#wce-rem-trigger',editor),remMenu=$('#wce-rem-menu',editor);
    const remLabel=v=>{const found=reminderOptions.find(x=>x[0]===v);if(found)return found[1];if(v%1440===0)return `${v/1440} día${v===1440?'':'s'} antes`;if(v%60===0)return `${v/60} hora${v===60?'':'s'} antes`;return `${v} minutos antes`};
    const paintReminders=()=>{const vals=[...reminders];$('[data-edit-rem-label]',remTrigger).textContent=!vals.length?'Ninguno':remLabel(vals[0]);$$('[data-edit-rem]',remMenu).forEach(x=>x.classList.toggle('is-selected',reminders.has(Number(x.dataset.editRem))));$('[data-edit-rem-none]',remMenu).classList.toggle('is-selected',!reminders.size)};
    remTrigger.onclick=()=>toggleMenu(remMenu);
    $('[data-edit-rem-none]',remMenu).onclick=()=>{reminders.clear();paintReminders();remMenu.classList.remove('is-open')};
    $$('[data-edit-rem]',remMenu).forEach(b=>b.onclick=()=>{reminders.clear();reminders.add(Number(b.dataset.editRem));paintReminders();remMenu.classList.remove('is-open')});
    paintReminders();

    const repeatTrigger=$('#wce-repeat-trigger',editor),repeatMenu=$('#wce-repeat-menu',editor),repeatCustomEl=$('#wce-repeat-custom',editor);
    const repeatLabel=v=>repeatOptions.find(x=>x[0]===v)?.[1]||'No repetir';
    const paintRepeat=()=>{$('[data-edit-repeat-label]',repeatTrigger).textContent=repeatLabel(repeat);$$('[data-edit-repeat]',repeatMenu).forEach(x=>x.classList.toggle('is-selected',x.dataset.editRepeat===repeat));repeatCustomEl.classList.toggle('is-visible',repeat==='custom')};
    repeatTrigger.onclick=()=>toggleMenu(repeatMenu);
    $$('[data-edit-repeat]',repeatMenu).forEach(b=>b.onclick=()=>{repeat=b.dataset.editRepeat;paintRepeat();repeatMenu.classList.remove('is-open')});
    $('#wce-repeat-every',editor).onchange=e=>repeatCustom.every=Number(e.target.value)||1;
    $('#wce-repeat-unit',editor).onchange=e=>repeatCustom.unit=e.target.value;paintRepeat();

    function paintSubtasks(){
      const root=$('#wce-subtasks',editor);if(!root)return;
      root.innerHTML=editSubtasks.map((s,i)=>`<div class="subtask-row" data-edit-sub="${i}"><button type="button" class="subtask-check ${s.done?'is-done':''}" data-edit-sub-toggle></button><input class="subtask-text ${s.done?'is-done':''}" value="${esc(s.text)}" data-edit-sub-text><button type="button" class="subtask-delete" data-edit-sub-delete aria-label="Eliminar"><i class="fa-solid fa-xmark"></i></button></div>`).join('');
      $$('[data-edit-sub]',root).forEach(row=>{const i=Number(row.dataset.editSub);$('[data-edit-sub-toggle]',row).onclick=()=>{editSubtasks[i].done=!editSubtasks[i].done;paintSubtasks()};$('[data-edit-sub-text]',row).oninput=e=>editSubtasks[i].text=e.target.value;$('[data-edit-sub-delete]',row).onclick=()=>{editSubtasks.splice(i,1);paintSubtasks()}});
    }
    paintSubtasks();
    $('[data-edit-add-subtask]',editor).onclick=()=>{editSubtasks.push({text:'',done:false});paintSubtasks();setTimeout(()=>{$$('[data-edit-sub-text]',editor).at(-1)?.focus()},0)};
    const closeEditor=()=>{closeCardHoverPreview()};
    $$('[data-edit-close]',editor).forEach(b=>b.onclick=closeEditor);
    $('[data-edit-delete]',editor).onclick=()=>{
      const list=W.tasks[key]||[],idx=list.findIndex(x=>x.id===id);if(idx<0){closeEditor();return}
      const current=list[idx];
      /* Root deletion removes the series. Deleting one generated occurrence
         creates a date exception so it does not silently reappear later. */
      if(current.recurrenceGenerated){
        const root=recurrenceRootFor(current),occDate=current.recurrenceForDate||key;
        if(root){const set=new Set(Array.isArray(root.recurrenceExceptions)?root.recurrenceExceptions:[]);set.add(occDate);root.recurrenceExceptions=[...set].sort()}
      }else{
        for(const [dayKey,items] of Object.entries(W.tasks||{})){
          const kept=(items||[]).filter(x=>x.recurrenceRootId!==current.id);
          if(kept.length)W.tasks[dayKey]=kept;else if(items?.length)delete W.tasks[dayKey];
        }
      }
      const fresh=W.tasks[key]||[],freshIdx=fresh.findIndex(x=>x.id===id);
      if(freshIdx>=0)W.deleteTask(key,freshIdx);else W.saveState?.();
      closeEditor();W.emit('tasks-changed');W.toast('Actividad eliminada');
    };
    editor.addEventListener('click',e=>{if(!e.target.closest('.wabi-create-dropdown'))closeMenus()});

    $('#wce-save',editor).onclick=()=>{
      error('');
      const current=(W.tasks[key]||[]).find(x=>x.id===id);if(!current){closeEditor();return}
      const title=$('#wce-title',editor).value.trim();if(!title){error('Ponle un nombre a la actividad.');return}
      const day=currentDay();if(!day){error('Selecciona un día.');return}
      let block=selectedBlockKey,planned,startTime=null,endTime=null,fixed=timeMode==='fixed';
      if(fixed){
        const sm=readClockEditor(editor,'edit-start'),em=readClockEditor(editor,'edit-end');
        if(sm===null||em===null){error('Escribe una hora y minutos válidos para inicio y término.');return}
        const s=clockAbsForConfiguredDay(sm);let e=clockAbsForConfiguredDay(em);if(e<=s)e+=1440;
        if(e-s<30||e-s>=1440){error('La actividad debe durar al menos 30 min.');return}
        const bi=blockInfos().find(b=>s>=b.startAbs&&s<b.endAbs);if(!bi){error('La hora de inicio no pertenece a ningún bloque configurado.');return}
        block=bi.key;planned=plannedFromMins(e-s);startTime=timeString(s);endTime=timeString(e);
      }else{
        if(!block){error('Selecciona un bloque disponible.');return}
        const dur=Number($('#wce-duration',editor)?.value)||0;if(!dur){error('Selecciona una duración disponible.');return}
        planned=plannedFromMins(dur);
      }
      const repeatData=repeat==='custom'?{type:'custom',every:repeatCustom.every,unit:repeatCustom.unit}:repeat;
      const patch={title,block,planned,category,priority,type:energy==='normal'?null:energy,fixed,startTime,endTime,reminders:[...reminders],repeat:repeatData,recurrenceStart:day,notes:$('#wce-notes',editor).value,subtasks:editSubtasks.filter(s=>s.text.trim()).map(s=>({text:s.text.trim(),done:!!s.done}))};
      const probe={...current,...patch};
      if(!fixed){
        delete probe.startTime;delete probe.endTime;
        if(blockExplicitlyChanged){
          delete probe.preferredStart;probe.manualOverlap=false;delete probe.overlapSide;delete probe.overlapMovedAt;
        }else if(current.fixed&&initialStart!=null){
          /* Fixed -> Flexible keeps the exact old start as preferredStart. */
          probe.preferredStart=initialStart;probe.manualOverlap=false;delete probe.overlapSide;delete probe.overlapMovedAt;
        }
      }else{delete probe.preferredStart;probe.manualOverlap=false;delete probe.overlapSide;delete probe.overlapMovedAt}
      const planningChanged=day!==key||fixed!==!!current.fixed||block!==(current.block||W.BLOCKS[0].key)||planned!==current.planned||(fixed&&((startTime||null)!==(current.startTime||null)||(endTime||null)!==(current.endTime||null)));
      if(planningChanged){
        const test=W.canPlaceTask(probe,day,block,day===key?id:null);
        if(!test.valid){error(test.reason||'Ese cambio no cabe en el horario seleccionado.');return}
      }

      if(current.recurrenceGenerated){
        const root=recurrenceRootFor(current),occDate=current.recurrenceForDate||key;
        const changedRule=!!root&&JSON.stringify(root.repeat||'none')!==JSON.stringify(repeatData);
        if(root&&changedRule&&repeatData==='none'){
          /* "Dejar de repetir" from an occurrence keeps this occurrence and
             everything before it, and cuts the series after this date. */
          root.recurrenceUntil=occDate;
          for(const [k,list] of Object.entries(W.tasks||{})){
            W.tasks[k]=(list||[]).filter(x=>!(x.recurrenceRootId===root.id&&x.recurrenceForDate>occDate));
            if(!W.tasks[k].length)delete W.tasks[k];
          }
          current.recurrenceStopHere=true;current.recurrenceOverride=true;
        }else if(root&&changedRule){
          /* Changing the repeat rule from a later occurrence starts a new
             series from here without rewriting earlier occurrences. */
          const prev=W.dateKey(W.addDays(W.fromKey(occDate),-1));root.recurrenceUntil=prev;
          for(const [k,list] of Object.entries(W.tasks||{})){
            W.tasks[k]=(list||[]).filter(x=>!(x.recurrenceRootId===root.id&&x.id!==current.id&&x.recurrenceForDate>=occDate));
            if(!W.tasks[k].length)delete W.tasks[k];
          }
          delete current.recurrenceGenerated;delete current.recurrenceRootId;delete current.recurrenceForDate;delete current.recurrenceStopHere;delete current.recurrenceOverride;
          current.recurrenceStart=day;
        }else{
          /* Editing one occurrence changes only that occurrence. */
          current.recurrenceOverride=true;
        }
      }else{
        const oldRule=current.repeat||'none',changedRule=JSON.stringify(oldRule)!==JSON.stringify(repeatData);
        if(changedRule){
          for(const [k,list] of Object.entries(W.tasks||{})){
            const kept=[];
            for(const x of (list||[])){
              if(x.recurrenceRootId!==current.id){kept.push(x);continue}
              if(repeatData!=='none'&&x.recurrenceOverride){
                const detached={...x,repeat:'none',recurrenceStart:k};delete detached.recurrenceGenerated;delete detached.recurrenceRootId;delete detached.recurrenceForDate;delete detached.recurrenceOverride;delete detached.recurrenceStopHere;kept.push(detached)
              }
            }
            if(kept.length)W.tasks[k]=kept;else if(list?.length)delete W.tasks[k];
          }
          delete current.recurrenceUntil;
          if(repeatData!=='none')current.recurrenceExceptions=[];
        }
      }
      Object.assign(current,patch);
      if(!fixed){
        delete current.startTime;delete current.endTime;
        if(blockExplicitlyChanged){
          delete current.preferredStart;current.manualOverlap=false;delete current.overlapSide;delete current.overlapMovedAt;
        }else if(originalFixed&&initialStart!=null){
          current.preferredStart=initialStart;current.manualOverlap=false;delete current.overlapSide;delete current.overlapMovedAt;
        }
      }else{
        delete current.preferredStart;current.manualOverlap=false;delete current.overlapSide;delete current.overlapMovedAt;
      }
      if(day!==key){
        const old=W.tasks[key]||[],idx=old.findIndex(x=>x.id===id);if(idx>=0)old.splice(idx,1);if(!old.length)delete W.tasks[key];
        if(!W.tasks[day])W.tasks[day]=[];W.tasks[day].push(current);
      }
      stabilizeFlexiblePlacements(key);if(day!==key)stabilizeFlexiblePlacements(day);
      W.saveState();closeEditor();W.toast('Actividad actualizada');W.emit('tasks-changed');
    };

    paintEditTime();

    requestAnimationFrame(()=>{
      const r=el.getBoundingClientRect(),pad=12;
      let left=parseFloat(el.style.left)||r.left,top=parseFloat(el.style.top)||r.top;
      if(left+r.width>window.innerWidth-pad)left=Math.max(pad,window.innerWidth-r.width-pad);
      if(top+r.height>window.innerHeight-pad)top=Math.max(pad,window.innerHeight-r.height-pad);
      el.style.left=`${left}px`;el.style.top=`${top}px`;
    });
  }


  function openFocusMode(key,id){
    closeCardHoverPreview();
    $('.wabi-focus-overlay')?.remove();
    const task=(W.tasks[key]||[]).find(x=>x.id===id);if(!task)return;
    if(task.timerRunning&&!Number.isFinite(Number(task.timerStartedAt))){task.timerStartedAt=Date.now();W.saveState()}
    const p=taskPlacementForDay(task,key),prio=priorityOf(task),cat=catObj(task.category),bi=getBlock(task.block||W.BLOCKS[0].key);
    const overlay=document.createElement('div');overlay.className='wabi-focus-overlay';
    const energy=task.type==='relax'?`<span style="color:var(--relax-fg)"><i class="fa-solid fa-leaf"></i> Relax</span>`:task.type==='intense'?`<span style="color:var(--intense-fg)"><i class="fa-solid fa-bolt"></i> Intense</span>`:'<span style="color:var(--normal-fg,var(--brand-600))"><i class="fa-solid fa-equals"></i> Normal</span>';
    const timeText=p
      ?`${fmtClock(p.start)} – ${fmtClock(p.end)}${task.fixed?' · Hora fija':` · ${fmtDuration(durationMins(task.planned))} estimados · ${esc(bi.label)}`}`
      :`${fmtDuration(durationMins(task.planned))} estimados · ${esc(bi.label)}`;
    overlay.innerHTML=`<div class="wabi-focus-shell" role="dialog" aria-modal="true" aria-label="Actividad en foco">
      <header class="wabi-focus-head"><div class="wabi-focus-brand"><span class="brand-bracket">[</span>wabi<span class="brand-bracket">]</span></div><button class="wabi-focus-close" data-focus-close aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></header>
      <main class="wabi-focus-main">
        <section class="wabi-focus-intro">
          <div class="wabi-focus-kicker">En foco</div>
          <h1>${esc(task.title||'Sin título')}</h1>
          <div class="wabi-focus-summary"><span><i class="fa-regular fa-clock"></i> ${timeText}</span>${energy}<span style="color:${prio.color}"><i class="fa-solid fa-flag"></i> ${prio.label}</span>${cat?`<span style="color:${cat.color};font-weight:700">${esc(cat.label)}</span>`:''}</div>
        </section>
        <section class="wabi-focus-timer-card">
          <div><div class="wabi-focus-label">Tiempo real</div><div class="wabi-focus-time" data-focus-time>00:00:00</div></div>
          <button class="wabi-focus-timer-btn" data-focus-timer><i class="fa-solid fa-play"></i><span>Iniciar</span></button>
          <div class="wabi-focus-planned"><span>Planeado</span><strong>${fmtDuration(durationMins(task.planned))}</strong></div>
        </section>
        <div class="wabi-focus-estimate-slot" data-focus-estimate-slot></div>
        <div class="wabi-focus-grid">
          <section class="wabi-focus-section"><div class="wabi-focus-section-head"><h2>Subtareas</h2><span data-focus-sub-count></span></div><div class="wabi-focus-subtasks" data-focus-subtasks></div><button class="wabi-focus-add" data-focus-add-sub><i class="fa-solid fa-plus"></i> Añadir subtarea</button></section>
          <section class="wabi-focus-section"><div class="wabi-focus-section-head"><h2>Notas</h2></div><textarea class="wabi-focus-notes" data-focus-notes placeholder="Escribe lo que necesites recordar mientras trabajas…">${esc(task.notes||'')}</textarea></section>
        </div>
        <div class="wabi-focus-bottom"><button class="wabi-focus-done ${task.done?'is-done':''}" data-focus-done><i class="fa-solid ${task.done?'fa-rotate-left':'fa-check'}"></i><span>${task.done?'Marcar pendiente':'Marcar como hecha'}</span></button></div>
      </main>
    </div>`;
    document.body.appendChild(overlay);

    const liveSeconds=()=>taskLiveTimerSeconds(task);
    const fmtSecs=secs=>{secs=Math.max(0,Math.floor(secs||0));const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`};
    const commitRunning=()=>{if(task.timerRunning){task.timerSecs=liveSeconds();task.timerRunning=false;delete task.timerStartedAt;task.actual=actualStringFromSecs(task.timerSecs);W.saveState()}};
    const plannedSecs=Math.max(30,durationMins(task.planned))*60;
    const closeEstimateNotice=()=>{$('[data-focus-estimate-alert]',overlay)?.remove()};
    const finishAndClose=()=>{setTaskDoneState(key,id,true);W.emit('tasks-changed');close()};
    const showEstimateNotice=()=>{
      if($('[data-focus-estimate-alert]',overlay))return;
      const slot=$('[data-focus-estimate-slot]',overlay);if(!slot)return;
      const notice=document.createElement('div');notice.className='wabi-focus-estimate-alert';notice.dataset.focusEstimateAlert='1';
      notice.innerHTML=`<div><strong>Llegaste al tiempo estimado · ${fmtDuration(durationMins(task.planned))}</strong><span>Puedes seguir trabajando o terminar la actividad.</span></div><div class="wabi-focus-estimate-actions"><button type="button" data-estimate-continue>Seguir</button><button type="button" class="done" data-estimate-done>Marcar como hecha</button></div>`;
      slot.appendChild(notice);
      $('[data-estimate-continue]',notice).onclick=()=>closeEstimateNotice();
      $('[data-estimate-done]',notice).onclick=finishAndClose;
    };
    const checkEstimateAlarm=()=>{
      if(!task.timerRunning||task.done||task.estimateAlarmFired)return;
      if(liveSeconds()<plannedSecs)return;
      task.estimateAlarmFired=true;W.saveState();playEstimatedTimeAlarm();showEstimateNotice();
    };
    const paintTimer=()=>{const n=$('[data-focus-time]',overlay),b=$('[data-focus-timer]',overlay);if(n)n.textContent=fmtSecs(liveSeconds());if(b){b.classList.toggle('is-running',!!task.timerRunning);b.innerHTML=`<i class="fa-solid ${task.timerRunning?'fa-pause':'fa-play'}"></i><span>${task.timerRunning?'Pausar':'Iniciar'}</span>`}checkEstimateAlarm()};
    let tick=setInterval(paintTimer,500);paintTimer();
    $('[data-focus-timer]',overlay).onclick=()=>{
      unlockTimerAudio();
      if(task.timerRunning)commitRunning();
      else{
        /* A fresh timing session may alert once when it reaches the estimate. */
        if((Number(task.timerSecs)||0)===0)task.estimateAlarmFired=false;
        task.timerRunning=true;task.timerStartedAt=Date.now();W.saveState();
      }
      paintTimer();
    };

    function paintFocusSubtasks(){
      const root=$('[data-focus-subtasks]',overlay),count=$('[data-focus-sub-count]',overlay),subs=task.subtasks||(task.subtasks=[]),done=subs.filter(s=>s.done).length;
      if(count)count.textContent=subs.length?`${done}/${subs.length}`:'0';
      root.innerHTML=subs.length?subs.map((s,i)=>`<div class="wabi-focus-sub-row" data-focus-sub="${i}"><button class="wabi-focus-sub-check ${s.done?'is-done':''}" data-focus-sub-toggle aria-label="Completar subtarea">${s.done?'<i class="fa-solid fa-check"></i>':''}</button><input value="${esc(s.text||'')}" class="${s.done?'is-done':''}" data-focus-sub-text><button class="wabi-focus-sub-delete" data-focus-sub-delete aria-label="Eliminar"><i class="fa-solid fa-xmark"></i></button></div>`).join(''):`<div class="wabi-focus-empty">Sin subtareas todavía.</div>`;
      $$('[data-focus-sub]',root).forEach(row=>{const i=Number(row.dataset.focusSub);$('[data-focus-sub-toggle]',row).onclick=()=>{subs[i].done=!subs[i].done;W.saveState();paintFocusSubtasks();W.emit('tasks-changed')};$('[data-focus-sub-text]',row).onchange=e=>{subs[i].text=e.target.value.trim();W.saveState();W.emit('tasks-changed')};$('[data-focus-sub-delete]',row).onclick=()=>{subs.splice(i,1);W.saveState();paintFocusSubtasks();W.emit('tasks-changed')}});
    }
    paintFocusSubtasks();
    $('[data-focus-add-sub]',overlay).onclick=()=>{(task.subtasks||(task.subtasks=[])).push({text:'',done:false});W.saveState();paintFocusSubtasks();setTimeout(()=>$$('[data-focus-sub-text]',overlay).at(-1)?.focus(),0)};

    let notesSave=null;$('[data-focus-notes]',overlay).oninput=e=>{task.notes=e.target.value;clearTimeout(notesSave);notesSave=setTimeout(()=>W.saveState(),450)};
    const close=()=>{clearInterval(tick);clearTimeout(notesSave);W.saveState();overlay.remove()};
    $('[data-focus-done]',overlay).onclick=()=>{if(task.done){setTaskDoneState(key,id,false);W.emit('tasks-changed');close()}else finishAndClose()};
    $('[data-focus-close]',overlay).onclick=close;
  }

  let cardHoverPoint={x:0,y:0};
  function showCardHoverPreview(card,key,id){
    if(dragState)return;
    window.__wabiEndTemporarySpot?.();
    const t=(W.tasks[key]||[]).find(x=>x.id===id);if(!t)return;
    closeCardHoverPreview();
    const el=document.createElement('div');el.className='wabi-card-hover-popover';el.dataset.key=key;el.dataset.taskId=id;
    document.body.appendChild(el);cardHoverEl=el;
    const renderHover=()=>{
      const current=(W.tasks[key]||[]).find(x=>x.id===id);if(!current){closeCardHoverPreview();return}
      el.innerHTML=cardHoverHTML(current,key);
      $('[data-card-hover-done]',el)?.addEventListener('click',e=>{
        e.preventDefault();e.stopPropagation();
        setTaskDoneState(key,id,!current.done);W.emit('tasks-changed');renderHover();
      });
      $('[data-card-hover-edit]',el)?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openCardHoverEditor(el,key,id)});
      $('[data-card-hover-start]',el)?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openFocusMode(key,id)});
    };
    renderHover();
    const r=card.getBoundingClientRect(),pad=10,gap=14;
    const x=cardHoverPoint.x||r.right,y=cardHoverPoint.y||r.top;
    let left=x+gap,top=y+10;
    if(left+el.offsetWidth>window.innerWidth-pad)left=Math.max(pad,x-el.offsetWidth-gap);
    if(top+el.offsetHeight>window.innerHeight-pad)top=Math.max(pad,window.innerHeight-el.offsetHeight-pad);
    el.style.left=`${left}px`;el.style.top=`${top}px`;

    el.addEventListener('mouseenter',()=>{clearTimeout(cardHoverTimer);cancelCardHoverClose()});
    el.addEventListener('mouseleave',()=>{if(!el.classList.contains('is-editor'))scheduleCardHoverClose(180)});
    requestAnimationFrame(()=>el.classList.add('on'));
  }
  function bindCardHoverPreview(card,key,id){
    card.addEventListener('mouseenter',e=>{
      cardHoverPoint={x:e.clientX,y:e.clientY};
      cancelCardHoverClose();
      clearTimeout(cardHoverTimer);
      cardHoverTimer=setTimeout(()=>showCardHoverPreview(card,key,id),1000);
    });
    card.addEventListener('mousemove',e=>{cardHoverPoint={x:e.clientX,y:e.clientY}});
    card.addEventListener('mouseleave',()=>scheduleCardHoverClose(260));
    card.addEventListener('mousedown',closeCardHoverPreview);
  }

  /* ───────── card markup ───────── */
  function cardHTML(t,key,idx,{timeline=false,draggable=true}={}){
    const blk=`blk-${String(t.block||W.BLOCKS[0].key).toLowerCase()}`,selected=(W.state.selectedTask&&W.state.selectedTask.key===key&&W.tasksFor(key)[W.state.selectedTask.idx]?.id===t.id)?' is-selected':'',done=t.done?' is-done':'';
    const subTotal=(t.subtasks||[]).length,subDone=(t.subtasks||[]).filter(s=>s.done).length;
    const cat=catObj(t.category),prio=priorityOf(t);
    const sch=W.scheduleBlock(key,t.block||W.BLOCKS[0].key),place=sch.placements.get(t.id);
    const dur=durationMins(t.planned);
    const time=t.fixed&&place
      ?`<span class="wabi-time-chip">${fmtFixedRange(place.start,place.end)}</span>`
      :`<span class="wabi-time-chip"><i class="fa-regular fa-clock"></i>${fmtDuration(dur)}</span>`;

    const symbols=[
      cat?`<span class="wabi-card-symbol category" aria-label="${esc(cat.label)}"><i class="fa-solid fa-hashtag" style="color:${cat.color}"></i></span>`:'',
      `<span class="wabi-card-symbol priority" aria-label="${prio.label}"><i class="fa-solid fa-flag" style="color:${prio.color}"></i></span>`,
      subTotal?`<span class="wabi-card-symbol subtasks" aria-label="Subtareas ${subDone} de ${subTotal}"><i class="fa-regular fa-square-check"></i><span>${subDone}/${subTotal}</span></span>`:'',
    ].join('');

    return `<div class="wabi-task-card ${blk}${selected}${done}${t.fixed?' is-fixed':''}${cat?' has-category':''}" style="${cat?`--card-category:${cat.color};`:''}" draggable="${draggable&&!t.fixed&&!W.isMobile?.()}" data-key="${key}" data-idx="${idx}" data-task-id="${esc(t.id)}">
      <div class="wabi-card-main">
        <span class="wabi-card-title">${esc(t.title||'Sin título')}</span>
        ${time}
        <span class="wabi-card-inline-symbols">${symbols}</span>
      </div>
      <div class="wabi-card-symbol-row">${symbols}</div>
    </div>`;
  }
  function densityClass(n){return n>=5?'density-ultra':n>=3?'density-compact':''}

  /* ───────── drag & drop / trash ───────── */
  let dragState=null,undoTimer=null,dragCopyModifier=false;
  document.addEventListener('keydown',e=>{if(e.key==='Alt'){dragCopyModifier=true;document.body.classList.add('wabi-drag-copy')}},true);
  document.addEventListener('keyup',e=>{if(e.key==='Alt'){dragCopyModifier=false;if(!dragState?.copy)document.body.classList.remove('wabi-drag-copy')}},true);
  window.addEventListener('blur',()=>{dragCopyModifier=false;if(!dragState)document.body.classList.remove('wabi-drag-copy')});
  let trash=$('#wabi-trash-drop');
  if(!trash){trash=document.createElement('div');trash.id='wabi-trash-drop';trash.className='wabi-trash-drop';trash.innerHTML='<i class="fa-solid fa-trash-can"></i><span>Soltar para eliminar</span>';document.body.appendChild(trash);}
  function hideTrash(){trash.classList.remove('on','hot')}
  function showTrashAt(x,y){
    trash.style.left=`${Math.min(window.innerWidth-170,Math.max(8,x+14))}px`;
    trash.style.top=`${Math.min(window.innerHeight-44,Math.max(8,y+14))}px`;
    trash.classList.add('on','hot');
  }
  const deleteHeader=$('.titlebar');
  deleteHeader?.addEventListener('dragover',e=>{
    if(!dragState)return;
    e.preventDefault();
    e.dataTransfer.dropEffect='move';
    showTrashAt(e.clientX,e.clientY);
  });
  deleteHeader?.addEventListener('dragleave',e=>{
    if(!deleteHeader.contains(e.relatedTarget))hideTrash();
  });
  deleteHeader?.addEventListener('drop',e=>{
    e.preventDefault();
    if(!dragState)return;
    const {key,id,copy}=dragState;
    hideTrash();
    if(!copy)deleteWithUndo(key,id);
    dragState=null;
  });
  document.addEventListener('dragover',e=>{
    if(!dragState)return;
    if(!e.target.closest?.('.titlebar'))hideTrash();
  });
  function deleteWithUndo(key,id){
    const arr=W.tasks[key]||[],idx=arr.findIndex(t=>t.id===id);if(idx<0)return;
    const task=arr[idx];arr.splice(idx,1);if(!arr.length)delete W.tasks[key];W.saveState();W.state.selectedTask=null;W.emit('tasks-changed');W.wabiSound?.('delete');
    $('.wabi-undo-toast')?.remove();
    const toast=document.createElement('div');toast.className='wabi-undo-toast';toast.innerHTML='<span>Actividad eliminada</span><button>Deshacer</button>';document.body.appendChild(toast);
    const undo=()=>{if(!W.tasks[key])W.tasks[key]=[];W.tasks[key].splice(Math.min(idx,W.tasks[key].length),0,task);W.saveState();W.emit('tasks-changed');toast.remove();clearTimeout(undoTimer)};
    $('button',toast).onclick=undo;clearTimeout(undoTimer);undoTimer=setTimeout(()=>toast.remove(),6500);
  }
  function dragPlacementFor(cell,e,source){
    const toKey=cell.dataset.dayKey,toBlock=cell.dataset.block,bi=getBlock(toBlock),dur=durationMins(source.planned);
    const rect=cell.getBoundingClientRect();
    let start=bi.startAbs+(e.clientY-rect.top)/Math.max(.01,timelineScale);
    start=Math.round(start/5)*5;
    start=clamp(start,bi.startAbs,Math.max(bi.startAbs,bi.endAbs-dur));
    return {toKey,toBlock,start};
  }
  function clearDragSlotPreview(root=document){
    $$('.wabi-drag-slot-preview',root).forEach(x=>x.remove());
  }
  function clearDragOverlapPreview(root=document){
    $$('.wabi-day-event.is-drag-overlap-left,.wabi-week-event.is-drag-overlap-left,.wabi-day-event.is-drag-overlap-right,.wabi-week-event.is-drag-overlap-right',root)
      .forEach(x=>x.classList.remove('is-drag-overlap-left','is-drag-overlap-right'));
  }
  function markDragOverlapPreview(dayKey,laneMap,root=document){
    if(!laneMap?.size)return;
    $$('.wabi-task-card',root).forEach(card=>{
      if(card.dataset.key!==dayKey||!laneMap.has(card.dataset.taskId))return;
      const wrap=card.closest('.wabi-day-event,.wabi-week-event');if(!wrap)return;
      wrap.classList.add(laneMap.get(card.dataset.taskId)===1?'is-drag-overlap-right':'is-drag-overlap-left');
    });
  }
  function normalPlacementForDrag(t,dayKey){
    if(t.fixed){const s=absClockInDay(t.startTime);return {start:s,end:s+durationMins(t.planned),fixed:true}}
    const preferred=Number(t.preferredStart);
    if(Number.isFinite(preferred))return {start:preferred,end:preferred+durationMins(t.planned),fixed:false};
    return taskPlacementForDay(t,dayKey,'normal');
  }
  function dragOverlapState(dayKey,start,end,excludeId,sourceTask=null){
    const existing=[];
    for(const t of W.tasksFor(dayKey)){
      if(t.id===excludeId)continue;
      const p=normalPlacementForDrag(t,dayKey);if(!p)continue;
      existing.push({id:t.id,t,start:p.start,end:p.end});
    }

    /* First validate concurrency against real Normal intervals only. No DOM or
       task data is touched before this passes, so a third overlap is atomic. */
    const marks=[{time:start,delta:1},{time:end,delta:-1}];
    for(const x of existing){
      const a=Math.max(start,x.start),b=Math.min(end,x.end);
      if(b>a){marks.push({time:a,delta:1},{time:b,delta:-1})}
    }
    marks.sort((a,b)=>a.time-b.time||a.delta-b.delta);
    let active=0,max=0;
    for(const m of marks){active+=m.delta;max=Math.max(max,active)}
    if(max>2)return {valid:false,reason:'max-overlap',overlap:true,overlapIds:[],existingLaneMap:new Map(),lane:null};

    const direct=existing.filter(x=>x.start<end&&x.end>start);
    if(!direct.length)return {valid:true,overlap:false,overlapIds:[],existingLaneMap:new Map(),lane:null};

    /* Preserve the lanes that already exist. The dragged card is added to the
       free lane; cards are never vertically moved to make room for it. */
    const current=computeStableOverlapLayout(existing);
    const candidateId='__wabi_drag_candidate__';
    const candidate={id:candidateId,t:sourceTask||{id:candidateId},start,end};
    const prefs=new Map();
    for(const x of existing) prefs.set(x.id,{col:current.cols.get(x.id)??0,weight:20});
    prefs.set(candidateId,{col:1,weight:6});
    const prospective=computeStableOverlapLayout([...existing,candidate],prefs);
    const lane=prospective.cols.get(candidateId)??1;
    const existingLaneMap=new Map(direct.map(x=>[x.id,prospective.cols.get(x.id)??0]));
    return {valid:true,overlap:true,overlapIds:direct.map(x=>x.id),existingLaneMap,lane};
  }
  function showDragSlotPreview(container,target,source,lane=null){
    clearDragSlotPreview(container.ownerDocument);
    const dur=durationMins(source.planned);
    const preview=document.createElement('div');
    const side=lane===1?' is-overlap-right':lane===0?' is-overlap-left':'';
    preview.className=`wabi-drag-slot-preview${side}`;
    const top=TIMELINE_PAD+(target.start-blockConfig.dayStart)*timelineScale;
    const h=Math.max(1,dur*timelineScale);
    preview.style.top=`${Math.max(TIMELINE_PAD,top)}px`;
    preview.style.height=`${h}px`;
    preview.innerHTML=`<span class="drag-preview-range">${fmtClock(target.start)} – ${fmtClock(target.start+dur)}</span>`;
    container.appendChild(preview);
  }
  function rejectDragDrop(message){
    if(dragState){
      const card=document.querySelector(`.wabi-task-card[data-key="${CSS.escape(dragState.key)}"][data-task-id="${CSS.escape(dragState.id)}"]`);
      const wrap=card?.closest('.wabi-day-event,.wabi-week-event');
      if(wrap){wrap.classList.remove('is-drag-rebound');void wrap.offsetWidth;wrap.classList.add('is-drag-rebound');setTimeout(()=>wrap.classList.remove('is-drag-rebound'),260)}
    }
    clearDragSlotPreview();clearDragOverlapPreview();
    W.toast(message);
  }

  function timelineDragPlacement(container,e,source){
    const toKey=container.dataset.dayKey;
    const dur=durationMins(source.planned),rect=container.getBoundingClientRect();
    let abs=blockConfig.dayStart+(e.clientY-rect.top-TIMELINE_PAD)/Math.max(.01,timelineScale);
    abs=Math.round(abs/5)*5;
    abs=clamp(abs,blockConfig.dayStart,blockConfig.dayStart+1440-5);
    const start=clamp(abs,blockConfig.dayStart,Math.max(blockConfig.dayStart,blockConfig.dayStart+1440-dur));
    const block=blockInfos().find(b=>start>=b.startAbs&&start<b.endAbs)||blockInfos().at(-1);
    return {toKey,toBlock:block.key,start};
  }
  function moveTaskByDrag(toKey,toBlock,preferredStart,precomputedOverlap=null){
    if(!dragState)return false;
    if((W.state.mode||'normal')!=='normal'){
      W.toast('Para reordenar horarios, cambia a Normal.');
      return false;
    }
    const {key:fromKey,id}=dragState,copy=!!dragState.copy;
    const src=W.tasks[fromKey]||[],fromIdx=src.findIndex(t=>t.id===id);if(fromIdx<0)return false;
    const original=src[fromIdx];if(original.fixed)return false;

    const dur=durationMins(original.planned),start=Number(preferredStart);
    const overlap=precomputedOverlap||dragOverlapState(toKey,start,start+dur,copy?null:id,original);
    if(!overlap.valid){rejectDragDrop('No se pueden cruzar más de 2 actividades.');return false}

    const moved={...original,id:copy?nextId():original.id,block:toBlock,preferredStart:start,manualOverlap:!!overlap.overlap};
    delete moved.startTime;delete moved.endTime;
    if(copy){
      moved.done=false;moved.actual='0:00:00';moved.timerSecs=0;moved.timerRunning=false;delete moved.timerStartedAt;delete moved.estimateAlarmFired;
      moved.subtasks=(original.subtasks||[]).map(s=>({text:String(s.text||''),done:!!s.done}));moved.reminders=[...(original.reminders||[])];
      moved.repeat='none';moved.recurrenceStart=toKey;delete moved.recurrenceGenerated;delete moved.recurrenceRootId;delete moved.recurrenceForDate;delete moved.recurrenceOverride;delete moved.recurrenceStopHere;
    }else if(moved.recurrenceGenerated){moved.recurrenceOverride=true}
    if(overlap.overlap){moved.overlapSide=overlap.lane===0?'left':'right';moved.overlapMovedAt=Date.now()}
    else{delete moved.overlapSide;delete moved.overlapMovedAt}

    const test=W.canPlaceTask(moved,toKey,toBlock,copy?null:id);
    if(!test.valid){rejectDragDrop(`No cabe aquí · ${test.reason||'el bloque no tiene espacio suficiente'}`);return false}

    /* Commit only the dragged activity. Neighbours keep the exact same data,
       preferredStart and order; no stabilizer or scheduler is allowed to write
       into them during a drag. */
    if(copy){
      W.tasks[toKey]=[...(W.tasks[toKey]||[]),moved];
    }else if(fromKey===toKey){
      W.tasks[fromKey]=src.map((t,i)=>i===fromIdx?moved:t);
    }else{
      const nextSrc=src.filter((_,i)=>i!==fromIdx);
      if(nextSrc.length)W.tasks[fromKey]=nextSrc;else delete W.tasks[fromKey];
      W.tasks[toKey]=[...(W.tasks[toKey]||[]),moved];
    }
    W.saveState();W.state.selectedTask=null;
    dragState=null;hideTrash();clearDragSlotPreview();clearDragOverlapPreview();
    renderSurface();syncShell();
    return true;
  }
  function bindCards(root){
    $$('.wabi-task-card',root).forEach(card=>{
      const key=card.dataset.key,id=card.dataset.taskId;

      $$('[title]',card).forEach(el=>el.removeAttribute('title'));
      card.addEventListener('click',e=>{
        const idx=(W.tasks[key]||[]).findIndex(t=>t.id===id);if(idx<0)return;
        const task=W.tasks[key][idx];
        const action=e.target.closest('[data-card-action]');
        if(action){e.stopPropagation();if(action.dataset.cardAction==='toggle'){W.toggleTask(key,idx);W.emit('tasks-changed')}return}
        e.preventDefault();e.stopPropagation();
      });

      bindCardHoverPreview(card,key,id);

      if(card.getAttribute('draggable')==='true'){
        card.addEventListener('dragstart',e=>{
          if((W.state.mode||'normal')!=='normal'){
            e.preventDefault();dragState=null;closeCardHoverPreview();clearDragSlotPreview();clearDragOverlapPreview();W.toast('Para reordenar horarios, cambia a Normal.');return;
          }
          dragState={key,id,copy:!!(e.altKey||dragCopyModifier)};
          closeCardHoverPreview();
          card.classList.add('is-drag-source');
          hideTrash();e.dataTransfer.effectAllowed='copyMove';e.dataTransfer.dropEffect=dragState.copy?'copy':'move';e.dataTransfer.setData('text/plain',id);

          let ghost=$('#wabi-drag-ghost');
          if(!ghost){ghost=document.createElement('div');ghost.id='wabi-drag-ghost';ghost.setAttribute('aria-hidden','true');Object.assign(ghost.style,{position:'fixed',left:'-20px',top:'-20px',width:'1px',height:'1px',opacity:'0.001',pointerEvents:'none',overflow:'hidden'});document.body.appendChild(ghost)}
          e.dataTransfer.setDragImage(ghost,0,0);
        });
        card.addEventListener('dragend',()=>{
          $$('.wabi-task-card.is-drag-source').forEach(x=>x.classList.remove('is-drag-source'));
          dragState=null;hideTrash();clearDragSlotPreview();clearDragOverlapPreview();
          $$('.wabi-day-block.is-drop-ok,.wabi-day-block.is-drop-no').forEach(x=>x.classList.remove('wabi-drop-ok','wabi-drop-no'));
        });
      }
    });

    const targets=[...$$('.wabi-week-day[data-day-key]',root),...$$('.wabi-day-timeline[data-day-key]',root)];
    targets.forEach(container=>{
      container.addEventListener('dragover',e=>{
        if(!dragState)return;
        const source=(W.tasks[dragState.key]||[]).find(t=>t.id===dragState.id);if(!source||source.fixed)return;
        e.preventDefault();dragState.copy=!!(e.altKey||dragCopyModifier);document.body.classList.toggle('wabi-drag-copy',dragState.copy);const target=timelineDragPlacement(container,e,source);
        const dur=durationMins(source.planned),overlap=dragOverlapState(target.toKey,target.start,target.start+dur,dragState.copy?null:source.id,source);
        let valid=overlap.valid;
        if(valid){const moved={...source,block:target.toBlock,preferredStart:target.start,manualOverlap:overlap.overlap};const test=W.canPlaceTask(moved,target.toKey,target.toBlock,source.id);valid=test.valid}
        clearDragOverlapPreview();
        if(valid){if(overlap.overlap)markDragOverlapPreview(target.toKey,overlap.existingLaneMap,root);showDragSlotPreview(container,target,source,overlap.overlap?overlap.lane:null)}else clearDragSlotPreview();
        e.dataTransfer.dropEffect=valid?(dragState.copy?'copy':'move'):'none';
      });
      container.addEventListener('dragleave',e=>{if(!container.contains(e.relatedTarget)){clearDragSlotPreview();clearDragOverlapPreview()}});
      container.addEventListener('drop',e=>{
        e.preventDefault();if(!dragState)return;
        const source=(W.tasks[dragState.key]||[]).find(t=>t.id===dragState.id);if(!source||source.fixed)return;
        dragState.copy=!!(e.altKey||dragCopyModifier);document.body.classList.toggle('wabi-drag-copy',dragState.copy);const target=timelineDragPlacement(container,e,source);
        const dur=durationMins(source.planned),overlap=dragOverlapState(target.toKey,target.start,target.start+dur,dragState.copy?null:source.id,source);
        clearDragSlotPreview();clearDragOverlapPreview();if(!overlap.valid){rejectDragDrop('No se pueden cruzar más de 2 actividades.');return}moveTaskByDrag(target.toKey,target.toBlock,target.start,overlap);
      });
    });
  }


  /* ───────── Día + Semana · one shared timeline language ───────── */
  function dayHeaderHTML(d){
    const key=W.dateKey(d),ts=W.tasksFor(key).filter(taskVisible),done=ts.filter(t=>t.done).length,total=ts.length,pct=total?Math.round(done/total*100):0;
    return `<div class="day-head" data-day-head="${key}"><div class="day-head-row"><span class="day-name">${W.DAYS_ES[d.getDay()]}</span><span class="day-num ${W.isToday(d)?'day-num--today':''}">${d.getDate()}</span></div><div class="day-progress"><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><span>${done}/${total}</span></div></div>`;
  }
  function timelineMetrics(){
    const dayStart=blockConfig.dayStart,dayEnd=dayStart+1440;
    return {dayStart,dayEnd,totalHeight:TIMELINE_PAD*2+1440*timelineScale,yFor:(abs)=>TIMELINE_PAD+(clamp(abs,dayStart,dayEnd)-dayStart)*timelineScale};
  }
  function timelineHourMarkup(kind,yFor,dayStart,dayEnd){
    let html='';
    const firstHour=Math.ceil(dayStart/60)*60;
    html+=`<div class="${kind}" style="top:${yFor(dayStart)}px"><span>${fmtClock(dayStart)}</span></div>`;
    for(let m=firstHour;m<dayEnd;m+=60){if(m===dayStart)continue;html+=`<div class="${kind}" style="top:${yFor(m)}px"><span>${fmtClock(m)}</span></div>`}
    html+=`<div class="${kind}" style="top:${yFor(dayEnd)}px"><span>${fmtClock(dayEnd)}</span></div>`;
    return html;
  }
  function blockBandsHTML(yFor,dayKey=null,week=false){
    return W.BLOCKS.map((b,blockIndex)=>{
      const cls=`blk-${b.key.toLowerCase()}`,top=yFor(b.startAbs),height=Math.max(1,yFor(b.endAbs)-top),sch=dayKey?W.scheduleBlock(dayKey,b.key):null;
      if(week)return `<div class="wabi-day-block wabi-week-band ${cls}" data-day-key="${dayKey}" data-block="${b.key}" style="top:${top}px;height:${height}px"><div class="wabi-day-block-head"><span>${esc(b.label)}</span><span class="wabi-day-block-free">${fmtDuration(sch.free)} libres</span></div></div>`;
      return `<div class="wabi-day-block-band ${cls} wabi-day-block ${blockIndex?'is-block-boundary':''}" data-day-key="${dayKey||''}" data-block="${b.key}" style="top:${top}px;height:${height}px"><span class="band-label">${esc(b.label)}</span>${sch?`<span class="band-free">${fmtDuration(sch.free)} libres</span>`:''}</div>`;
    }).join('');
  }
  function taskPlacementForDay(t,key,mode=W.state.mode||'normal'){
    if(t.fixed){const s=absClockInDay(t.startTime),e=s+durationMins(t.planned);return {start:s,end:e,fixed:true}}
    return W.scheduleBlock(key,t.block||W.BLOCKS[0].key,{mode}).placements.get(t.id)||null;
  }
  function eventHeight(top,bottom){return Math.max(1,bottom-top)}
  function layoutVisualCards(items,totalHeight){
    const INSET=1;
    for(const it of items){
      /* Visible geometry is a pure function of the real duration. Position,
         block edges and neighbours never alter card height. */
      const exact=Math.max(1,it.bottom-it.top);
      it.visualShift=INSET;
      it.visualHeight=Math.max(1,exact-INSET*2);
      /* At roughly a one-hour card or thinner, preserve only the activity name.
         Overlapped cards also use the title-only treatment via is-overlap. */
      it.density=it.visualHeight<=56?' is-tiny':it.visualHeight<76?' is-tight':'';
    }
    return items;
  }
  function eventVisualStyle(item){
    return `--visual-shift:${Number(item.visualShift||1).toFixed(2)}px;--visual-height:${Number(item.visualHeight||1).toFixed(2)}px;`;
  }
  function computeStableOverlapLayout(items,forcedPrefs=new Map()){
    const cols=new Map(),counts=new Map();
    if(!items?.length)return {cols,counts};
    const byId=new Map(items.map(x=>[x.id,x]));
    const adj=new Map(items.map(x=>[x.id,new Set()]));
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
      const a=items[i],b=items[j];
      if(a.start<b.end&&a.end>b.start){adj.get(a.id).add(b.id);adj.get(b.id).add(a.id)}
    }
    const seen=new Set();
    for(const seed of items){
      if(seen.has(seed.id))continue;
      const stack=[seed.id],component=[];seen.add(seed.id);
      while(stack.length){const id=stack.pop();component.push(id);for(const n of adj.get(id)||[]){if(!seen.has(n)){seen.add(n);stack.push(n)}}}
      if(component.length===1&&(adj.get(component[0])?.size||0)===0){cols.set(component[0],0);counts.set(component[0],1);continue}
      const base=new Map(),queue=[component[0]];base.set(component[0],0);let bipartite=true;
      while(queue.length){const id=queue.shift();for(const n of adj.get(id)||[]){const want=1-base.get(id);if(!base.has(n)){base.set(n,want);queue.push(n)}else if(base.get(n)!==want)bipartite=false}}
      if(!bipartite){
        /* Existing invalid legacy data should not make cards disappear. Keep a
           deterministic two-lane rendering until the user moves one in Normal. */
        const sorted=component.map(id=>byId.get(id)).sort((a,b)=>a.start-b.start||a.end-b.end||String(a.id).localeCompare(String(b.id)));
        const laneEnd=[-Infinity,-Infinity];
        for(const it of sorted){let c=laneEnd[0]<=it.start?0:1;cols.set(it.id,c);counts.set(it.id,2);laneEnd[c]=Math.max(laneEnd[c],it.end)}
        continue;
      }
      const score=(flip)=>component.reduce((sum,id)=>{
        const forced=forcedPrefs.get(id);
        let desired=null,weight=0;
        if(forced&&typeof forced==='object'){desired=Number(forced.col);weight=Number(forced.weight)||1}
        else if(forced===0||forced===1){desired=forced;weight=10}
        else{const side=byId.get(id)?.t?.overlapSide;if(side==='right'){desired=1;weight=4}else if(side==='left'){desired=0;weight=4}}
        if(desired===null)return sum;
        const actual=(base.get(id)||0)^flip;
        return sum+(actual===desired?0:weight);
      },0);
      const s0=score(0),s1=score(1);let flip=s1<s0?1:0;
      if(s0===s1){
        const first=component.map(id=>byId.get(id)).sort((a,b)=>a.start-b.start||a.end-b.end||String(a.id).localeCompare(String(b.id)))[0];
        flip=(base.get(first.id)||0)===0?0:1;
      }
      for(const id of component){cols.set(id,(base.get(id)||0)^flip);counts.set(id,2)}
    }
    return {cols,counts};
  }
  function assignOverlapColumns(items){
    if(!items.length)return items;
    const layout=computeStableOverlapLayout(items.map(it=>({id:it.t?.id||String(it.idx),t:it.t,start:it.start,end:it.end})));
    for(const it of items){
      const id=it.t?.id||String(it.idx);
      it.overlapCol=layout.cols.get(id)??0;
      it.overlapCount=layout.counts.get(id)??1;
    }
    return items;
  }
  function eventColumnStyle(item){
    const n=item.overlapCount||1,c=item.overlapCol||0;
    if(n===1)return `--event-left:4px;--event-width:calc(100% - 8px);`;
    if(c===0)return `--event-left:4px;--event-width:calc(50% - 6px);`;
    return `--event-left:calc(50% + 2px);--event-width:calc(50% - 6px);`;
  }

  function renderWeek(){
    const root=$('#content');if(!root)return;
    const ws=W.state.weekStart,days=Array.from({length:7},(_,i)=>W.addDays(ws,i)),{dayStart,dayEnd,totalHeight,yFor}=timelineMetrics();
    ensureRecurringRange(days[0],days[6]);
    const head=`<div class="wabi-week-head"><div class="gutter-head"></div>${days.map(dayHeaderHTML).join('')}</div>`;

    /* Semana uses the same timeline language as Día:
       the gutter only carries hours; every day carries its own block bands. */
    let gutterLabels='';
    const gutterMark=(m)=>{const top=yFor(m);gutterLabels+=`<div class="wabi-week-time-label" style="top:${top}px">${fmtClock(m)}</div><div class="wabi-week-time-line gutter" style="top:${top}px"></div>`};
    gutterMark(dayStart);
    const gutterFirst=Math.ceil(dayStart/60)*60;
    for(let m=gutterFirst;m<dayEnd;m+=60){if(m!==dayStart)gutterMark(m)}
    gutterMark(dayEnd);
    const gutter=`<div class="wabi-week-time-gutter" style="height:${totalHeight}px">${gutterLabels}</div>`;

    let dayCols='';
    for(const d of days){
      const key=W.dateKey(d),all=W.tasksFor(key),visible=filteredForDay(key);
      let bands='',lines='',events='';

      W.BLOCKS.forEach((b,blockIndex)=>{
        const cls=`blk-${b.key.toLowerCase()}`,top=yFor(b.startAbs),height=Math.max(1,yFor(b.endAbs)-top),sch=W.scheduleBlock(key,b.key);
        bands+=`<div class="wabi-day-block-band wabi-week-day-band wabi-day-block ${cls} ${blockIndex?'is-block-boundary':''}" data-day-key="${key}" data-block="${b.key}" style="top:${top}px;height:${height}px"><span class="band-label">${esc(b.label)}</span><span class="band-free">${fmtDuration(sch.free)} libres</span></div>`;
      });

      const firstHour=Math.ceil(dayStart/60)*60;
      lines+=`<div class="wabi-week-time-line" style="top:${yFor(dayStart)}px"></div>`;
      for(let m=firstHour;m<dayEnd;m+=60){if(m===dayStart)continue;lines+=`<div class="wabi-week-time-line" style="top:${yFor(m)}px"></div>`}
      lines+=`<div class="wabi-week-time-line" style="top:${yFor(dayEnd)}px"></div>`;

      const weekItems=[];
      for(const t of visible){
        const idx=all.findIndex(x=>x.id===t.id);if(idx<0)continue;
        const p=taskPlacementForDay(t,key);if(!p)continue;
        if(p.end<=dayStart||p.start>=dayEnd)continue;
        const start=Math.max(p.start,dayStart),end=Math.min(p.end,dayEnd);
        const top=yFor(start),bottom=yFor(end),height=eventHeight(top,bottom),density=height<28?' is-tiny':height<58?' is-tight':'';
        weekItems.push({t,idx,start,end,top,bottom,height,density});
      }
      assignOverlapColumns(weekItems);layoutVisualCards(weekItems,totalHeight);
      for(const it of weekItems){
        events+=`<div class="wabi-week-event${it.density}${it.overlapCount===2?' is-overlap':''}" style="top:${it.top}px;height:${it.height}px;${eventColumnStyle(it)}${eventVisualStyle(it)}">${cardHTML(it.t,key,it.idx,{timeline:true})}</div>`;
      }
      dayCols+=`<div class="wabi-week-day" data-week-day="${key}" data-day-key="${key}" style="height:${totalHeight}px">${bands}${lines}${events}</div>`;
    }

    root.innerHTML=`<div class="board wabi-week-timeline-shell" id="board"><div class="wabi-week-timeline-scroll">${head}<div class="wabi-week-timeline-grid">${gutter}${dayCols}</div></div></div>${fabHTML()}`;
    bindCards(root);bindFabs(root);
  }

  function currentDayDate(){
    if(!W._dayDate)W._dayDate=new Date();
    return W._dayDate instanceof Date?W._dayDate:new Date(W._dayDate);
  }
  function renderDay(){
    const root=$('#content');if(!root)return;
    const d=currentDayDate(),key=W.dateKey(d),{dayStart,dayEnd,totalHeight,yFor}=timelineMetrics();
    ensureRecurringRange(d,d);
    const bands=blockBandsHTML(yFor,key,false);
    let lines=timelineHourMarkup('wabi-hour-line',yFor,dayStart,dayEnd);
    const visible=filteredForDay(key),all=W.tasksFor(key);let events='';
    const dayItems=[];
    for(const t of visible){
      const idx=all.findIndex(x=>x.id===t.id);if(idx<0)continue;const p=taskPlacementForDay(t,key);if(!p)continue;
      if(p.end<=dayStart||p.start>=dayEnd)continue;
      const start=Math.max(p.start,dayStart),end=Math.min(p.end,dayEnd);
      const top=yFor(start),bottom=yFor(end),height=eventHeight(top,bottom),density=height<28?' is-tiny':height<58?' is-tight':'';
      dayItems.push({t,idx,start,end,top,bottom,height,density});
    }
    assignOverlapColumns(dayItems);layoutVisualCards(dayItems,totalHeight);
    for(const it of dayItems){
      events+=`<div class="wabi-day-event${it.density}${it.overlapCount===2?' is-overlap':''}" style="top:${it.top}px;height:${it.height}px;${eventColumnStyle(it)}${eventVisualStyle(it)}">${cardHTML(it.t,key,it.idx,{timeline:true})}</div>`;
    }
    root.innerHTML=`<div class="board wabi-day-view"><div class="wabi-day-view-head"><div class="wabi-day-date"><span>${W.DAYS_FULL[d.getDay()]}</span><strong>${d.getDate()} de ${W.MONTHS_ES[d.getMonth()]} de ${d.getFullYear()}</strong></div></div><div class="wabi-day-scroll"><div class="wabi-day-timeline" data-day-key="${key}" style="height:${totalHeight}px">${bands}${lines}${events}</div></div></div>${fabHTML()}`;
    bindCards(root);bindFabs(root);
  }

  /* ───────── Month view ───────── */
  function closeMonthDayPanel(){$('.wabi-month-day-panel')?.remove()}
  function openMonthDayPanel(key){
    closeMonthDayPanel();
    const d=W.fromKey(key),all=W.tasksFor(key),vis=filteredForDay(key);
    const panel=document.createElement('div');panel.className='wabi-month-day-panel';panel.dataset.monthKey=key;
    panel.innerHTML=`<div class="wabi-month-day-panel-head"><div><span>${W.DAYS_FULL[d.getDay()]}</span><strong>${d.getDate()} de ${W.MONTHS_ES[d.getMonth()]} de ${d.getFullYear()}</strong></div><button data-month-panel-close aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></div><div class="wabi-month-day-panel-list">${vis.length?vis.map(t=>{const idx=all.findIndex(x=>x.id===t.id);return idx>=0?cardHTML(t,key,idx,{draggable:false}):''}).join(''):`<div class="wabi-month-day-panel-empty">No hay actividades visibles para este día.</div>`}</div>`;
    document.body.appendChild(panel);
    $('[data-month-panel-close]',panel).onclick=closeMonthDayPanel;
    bindCards(panel);
    requestAnimationFrame(()=>panel.classList.add('on'));
  }
  function renderMonth(){
    closeMonthDayPanel();
    const root=$('#content');if(!root)return;
    const base=W.state.monthDate instanceof Date?W.state.monthDate:new Date(W.state.monthDate||Date.now());
    const first=new Date(base.getFullYear(),base.getMonth(),1),start=new Date(first);start.setDate(first.getDate()-((first.getDay()+6)%7));
    ensureRecurringRange(start,W.addDays(start,41));
    let cells='';
    for(let i=0;i<42;i++){
      const d=W.addDays(start,i),key=W.dateKey(d),other=d.getMonth()!==base.getMonth(),all=W.tasksFor(key),vis=filteredForDay(key);
      const ev=vis.slice(0,2).map(t=>{const cat=catObj(t.category),c=cat?.color||'#7b7f89',p=priorityOf(t);return `<button class="wabi-month-event ${t.done?'is-done':''}" data-month-task="${esc(t.id)}" data-month-key="${key}" style="--month-category:${c};background:color-mix(in srgb,${c} 18%,var(--bg-elev-0));border-color:color-mix(in srgb,${c} 34%,var(--hairline));color:var(--text)"><span class="event-title">${esc(t.title||'Actividad')}</span><span class="wabi-month-symbols"><i class="fa-solid fa-flag" style="color:${p.color}"></i></span></button>`}).join('');
      const more=vis.length>2?`<div class="month-more">y ${vis.length-2} más</div>`:'';
      cells+=`<div class="month-cell ${other?'is-other':''} ${W.isToday(d)?'is-today':''}" data-month-day="${key}"><button class="month-day-num" data-open-day="${key}">${d.getDate()}</button>${ev}${more}</div>`;
    }
    root.innerHTML=`<div class="month wabi-month-shell"><div class="month-toolbar"><div class="month-title-grp"><div class="month-title">${cap(W.MONTHS_ES[base.getMonth()])} de ${base.getFullYear()}</div></div></div><div class="wabi-month-grid-head">${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(x=>`<div class="month-dn">${x}</div>`).join('')}</div><div class="wabi-month-grid">${cells}</div></div>${fabHTML()}`;
    /* Main Month mini-cards are visual only. Any click in the day cell,
       including directly over a card, opens the day panel. Only the day
       number keeps its separate navigation to Vista Día. */
    $$('[data-open-day]',root).forEach(b=>b.onclick=e=>{e.stopPropagation();closeMonthDayPanel();W._surface='day';W._dayDate=W.fromKey(b.dataset.openDay);W.state.view='board';renderSurface();syncShell()});
    $$('[data-month-day]',root).forEach(cell=>cell.onclick=e=>{if(e.target.closest('[data-open-day]'))return;const key=cell.dataset.monthDay,panel=$('.wabi-month-day-panel');if(panel?.dataset.monthKey===key){closeMonthDayPanel();return}openMonthDayPanel(key)});
    bindFabs(root);
  }

  function openWabiAiPanel(anchor){
    $('.wabi-ai-scrim')?.remove();closeCardHoverPreview();
    const scrim=document.createElement('div');scrim.className='wabi-ai-scrim';
    scrim.innerHTML=`<section class="wabi-ai-panel" role="dialog" aria-modal="true" aria-label="[wabi] IA">
      <header class="wabi-ai-head"><div><span class="wabi-ai-mark">[w]</span><span>[wabi] IA</span></div><button data-ai-close aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></header>
      <div class="wabi-ai-body">
        <div class="wabi-ai-messages" data-ai-messages>
          <div class="wabi-ai-welcome" data-ai-welcome><span class="wabi-ai-welcome-mark">[w]</span><strong>¿Qué quieres hacer hoy?</strong><span>Puedo ayudarte a convertir lo que tienes en mente en un día más claro.</span></div>
        </div>
        <div class="wabi-ai-suggestions" data-ai-suggestions><button data-ai-preset="create"><span class="wabi-ai-suggestion-icon"><i class="fa-solid fa-plus"></i></span><span><strong>Crear actividades</strong><small>Convierte tus ideas en actividades para hoy.</small></span></button><button data-ai-preset="prioritize"><span class="wabi-ai-suggestion-icon"><i class="fa-solid fa-arrow-down-wide-short"></i></span><span><strong>Priorizar actividades</strong><small>Ayúdame a decidir qué hacer primero.</small></span></button></div>
      </div>
      <form class="wabi-ai-compose" data-ai-form><textarea rows="1" data-ai-input placeholder="Escribe un mensaje…"></textarea><button type="submit" aria-label="Enviar"><i class="fa-solid fa-arrow-up"></i></button></form>
    </section>`;
    document.body.appendChild(scrim);
    const panel=$('.wabi-ai-panel',scrim),messages=$('[data-ai-messages]',scrim),input=$('[data-ai-input]',scrim),welcome=$('[data-ai-welcome]',scrim),suggestions=$('[data-ai-suggestions]',scrim);
    const anchorRect=anchor?.getBoundingClientRect?.();
    if(anchorRect)scrim.style.setProperty('--wabi-ai-anchor-x',`${anchorRect.left+anchorRect.width/2}px`);
    const close=()=>scrim.remove();$('[data-ai-close]',scrim).onclick=close;scrim.onclick=e=>{if(e.target===scrim)close()};
    const addMessage=(role,text)=>{const m=document.createElement('div');m.className=`wabi-ai-message ${role}`;m.textContent=text;messages.appendChild(m);messages.scrollTop=messages.scrollHeight};
    if(typeof W.wabiAiAdapter!=='function')W.wabiAiAdapter=async(text,context)=>{
      if(context?.preset==='create')return 'Cuéntame qué actividades quieres hacer hoy y te ayudo a convertirlas en una lista clara.';
      if(context?.preset==='prioritize'){
        const pending=Object.values(W.tasks||{}).flat().filter(t=>!t.done).length;
        return pending?`Tienes ${pending} actividades pendientes. Dime cuáles quieres ordenar primero.`:'No tienes actividades pendientes ahora mismo.';
      }
      return 'Te escucho. Esta conversación ya está preparada para conectarse después con [wabi] IA.';
    };
    const send=async(text,preset=null)=>{
      text=String(text||'').trim();if(!text)return;if(welcome)welcome.remove();if(suggestions)suggestions.classList.add('is-used');addMessage('user',text);input.value='';
      const waiting=document.createElement('div');waiting.className='wabi-ai-message assistant is-thinking';waiting.textContent='…';messages.appendChild(waiting);messages.scrollTop=messages.scrollHeight;
      try{const reply=await W.wabiAiAdapter(text,{preset});waiting.remove();addMessage('assistant',String(reply||''))}catch{waiting.remove();addMessage('assistant','No pude responder ahora. Inténtalo de nuevo.')}
    };
    $$('[data-ai-preset]',scrim).forEach(b=>b.onclick=()=>send(b.dataset.aiPreset==='create'?'Quiero crear actividades':'Quiero priorizar actividades',b.dataset.aiPreset));
    $('[data-ai-form]',scrim).onsubmit=e=>{e.preventDefault();send(input.value)};
    input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(input.value)}};
    requestAnimationFrame(()=>{scrim.classList.add('on');if(anchorRect&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const r=panel.getBoundingClientRect();const dx=anchorRect.left+anchorRect.width/2-(r.left+r.width/2);const dy=anchorRect.top+anchorRect.height/2-(r.top+r.height/2);panel.animate([{opacity:0,transform:`translate(${dx}px,${dy}px) scale(.14)`},{opacity:1,transform:'translate(0,0) scale(1)'}],{duration:210,easing:'cubic-bezier(.2,.82,.2,1)',fill:'both'});}});setTimeout(()=>input.focus(),80);
  }

  function fabHTML(){return `<div class="wabi-fabs"><button class="wabi-fab-action ai" data-wabi-ai aria-label="Conversa con [wabi] IA"><span class="wabi-mini-mark">[w]</span><span class="fab-label">Conversa con [wabi] IA</span></button><button class="wabi-fab-action add" data-wabi-add aria-label="Añadir actividad"><i class="fa-solid fa-plus"></i><span class="fab-label">Añadir actividad</span></button></div>`}
  function bindFabs(root){
    $('[data-wabi-add]',root)?.addEventListener('click',e=>{W._createFabRect=e.currentTarget.getBoundingClientRect();W.modal.open()});
    $('[data-wabi-ai]',root)?.addEventListener('click',e=>openWabiAiPanel(e.currentTarget));
  }

  /* Replace renderers so the original state/event system keeps working. */
  W._surface=W._surface||'week';
  W.board.render=function(){if(W.state.view!=='board')return;if(W._surface==='day')renderDay();else renderWeek();syncShell();normalizeBrandText();};
  W.month.render=function(){if(W.state.view!=='month')return;renderMonth();syncShell();normalizeBrandText();};
  W.board.gotoToday=function(){W.state.weekStart=W.getWeekStart(new Date());W._dayDate=new Date();W.board.render()};
  W.board.next=function(){W.state.weekStart=W.addDays(W.state.weekStart,7);W.board.render()};
  W.board.prev=function(){W.state.weekStart=W.addDays(W.state.weekStart,-7);W.board.render()};

  /* ───────── create activity: day → planning → priority → category → energy → reminder → repeat ───────── */
  function options15(start,end,selected){let h='';for(let m=start;m<=end;m+=15)h+=`<option value="${m}" ${m===selected?'selected':''}>${fmtClock(m)}</option>`;return h}
  function durationOptions(maxContinuous=Infinity){
    return FLEX_PRESETS
      .map(m=>`<option value="${m}" ${m>maxContinuous?'disabled':''}>${fmtDuration(m)}</option>`).join('');
  }
  function blockChoiceStyle(key){const k=String(key||'A').toLowerCase();return `--choice-bg:var(--blk-${k}-bg);--choice-fg:var(--blk-${k}-fg);--choice-border:var(--blk-${k}-border)`}
  function parseClockInput(value){
    let raw=String(value||'').trim().toLowerCase();
    if(!raw)return null;
    raw=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const isPM=/(^|\s)p(?:\.?\s*m\.?)?($|\s)/.test(raw)||/pm/.test(raw);
    const isAM=/(^|\s)a(?:\.?\s*m\.?)?($|\s)/.test(raw)||/am/.test(raw);
    const nums=raw.replace(/[^0-9:]/g,'');
    const m=nums.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
    if(!m)return null;
    let h=Number(m[1]),min=Number(m[2]||0);
    if(min<0||min>59)return null;
    if(isAM||isPM){if(h<1||h>12)return null;if(isPM&&h!==12)h+=12;if(isAM&&h===12)h=0;}
    else if(h<0||h>23)return null;
    return h*60+min;
  }
  function clockAbsForConfiguredDay(minute){return ((Number(minute)||0)%1440+1440)%1440}
  function clockEditorHTML(id,minute=null){
    const has=Number.isFinite(minute),m=has?clockAbsForConfiguredDay(minute):null,h=has?Math.floor(m/60):'',mm=has?m%60:'',amp=has?(m>=720?'pm':'am'):'';
    return `<div class="wabi-clock-editor" data-clock-editor="${id}"><input class="wabi-clock-number" data-clock-hour inputmode="numeric" maxlength="2" placeholder="6" value="${has?(h===0?'00':String(h)):''}" aria-label="Hora en formato de 24 horas"><span class="wabi-clock-colon">:</span><input class="wabi-clock-number minute" data-clock-minute inputmode="numeric" maxlength="2" placeholder="00" value="${has?String(mm).padStart(2,'0'):''}" aria-label="Minutos"><div class="wabi-clock-meridiem" role="group" aria-label="AM o PM"><button type="button" data-clock-ampm="am" class="${amp==='am'?'is-selected':''}">a. m.</button><button type="button" data-clock-ampm="pm" class="${amp==='pm'?'is-selected':''}">p. m.</button></div></div>`;
  }
  function bindClockEditor(scope,id,onChange=()=>{}){
    const ed=$(`[data-clock-editor="${id}"]`,scope);if(!ed)return;
    const hh=$('[data-clock-hour]',ed),mm=$('[data-clock-minute]',ed);
    const clean=(input,max)=>{input.value=input.value.replace(/\D/g,'').slice(0,2);if(input.value!==''&&Number(input.value)>max)input.value=String(max)};
    const selectMeridiem=amp=>$$('[data-clock-ampm]',ed).forEach(x=>x.classList.toggle('is-selected',x.dataset.clockAmpm===amp));
    const syncMeridiem=()=>{if(hh.value===''){$$('[data-clock-ampm]',ed).forEach(x=>x.classList.remove('is-selected'));return}const h=Number(hh.value);selectMeridiem(h>=12?'pm':'am')};
    hh.addEventListener('input',()=>{
      clean(hh,23);
      if(hh.value!==''&&mm.value==='')mm.value='00';
      syncMeridiem();onChange();
    });
    mm.addEventListener('input',()=>{clean(mm,59);if(mm.value.length===2)mm.value=String(Number(mm.value)).padStart(2,'0');onChange()});
    hh.addEventListener('blur',()=>{if(hh.value!==''&&Number(hh.value)===0)hh.value='00';syncMeridiem();onChange()});
    mm.addEventListener('blur',()=>{if(mm.value!=='')mm.value=String(Number(mm.value)).padStart(2,'0')});
    $$('[data-clock-ampm]',ed).forEach(b=>b.onclick=()=>{
      if(hh.value===''){selectMeridiem(b.dataset.clockAmpm);onChange();return}
      let h=Number(hh.value);if(!Number.isFinite(h))return;
      if(b.dataset.clockAmpm==='pm'&&h<12)h+=12;
      if(b.dataset.clockAmpm==='am'&&h>=12)h-=12;
      hh.value=h===0?'00':String(h);if(mm.value==='')mm.value='00';syncMeridiem();onChange();
    });
    syncMeridiem();
  }
  function readClockEditor(scope,id){
    const ed=$(`[data-clock-editor="${id}"]`,scope);if(!ed)return null;
    const hv=$('[data-clock-hour]',ed)?.value,mv=$('[data-clock-minute]',ed)?.value;
    if(hv===''||mv==='')return null;
    const h=Number(hv),m=Number(mv);if(!Number.isInteger(h)||h<0||h>23||!Number.isInteger(m)||m<0||m>59)return null;
    return h*60+m;
  }

  W.modal.open=function(prefill={}){
    const scrim=$('#modal-scrim');if(!scrim)return;
    const key=prefill.key||(W._surface==='day'?W.dateKey(currentDayDate()):W.dateKey(new Date()));
    const date=W.fromKey(key),dateInput=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    ensureRecurringRange(date,date);
    let energy='normal',timeMode='estimate',selectedBlockKey=null,priority=null,category=null,reminders=new Set(),repeat='none',repeatCustom={every:1,unit:'week'};
    let createFixedDraft=null,createEstimateDraft={duration:30,block:null};
    scrim.className='scrim wabi-create-scrim';scrim.classList.remove('is-hidden','is-closing');
    const categoryOptions=`<button class="wabi-create-menu-item wabi-category-option is-selected" data-cat-choice="" style="--choice-color:var(--text-muted)"><span class="wabi-category-dot"></span><span>Sin categoría</span><i class="fa-solid fa-check menu-check"></i></button>${W.CATS.map(c=>`<button class="wabi-create-menu-item wabi-category-option" data-cat-choice="${esc(c.label)}" style="--choice-color:${c.color}"><span class="wabi-category-dot"></span><span>${esc(c.label)}</span><i class="fa-solid fa-check menu-check"></i></button>`).join('')}`;
    const reminderOptions=[[0,'A la hora del evento'],[5,'5 minutos antes'],[10,'10 minutos antes'],[15,'15 minutos antes'],[30,'30 minutos antes'],[60,'1 hora antes'],[120,'2 horas antes'],[1440,'1 día antes'],[2880,'2 días antes']];
    const repeatOptions=[['none','No repetir'],['daily','Todos los días'],['weekdays','Días laborables'],['weekly','Cada semana'],['monthly','Cada mes'],['custom','Personalizar…']];

    /* El contenido y el orden de la ventana se mantienen como estaban. */
    scrim.innerHTML=`<div class="wabi-create wabi-create-v3" role="dialog" aria-modal="true" aria-label="Nueva actividad"><div class="wabi-create-head"><button class="wabi-close" data-close aria-label="Cerrar">×</button></div><div class="wabi-create-body"><input id="wc-title" class="wabi-title-input" placeholder="¿Qué quieres hacer?" autofocus>
      <div class="wabi-field"><label>Día</label><input class="wabi-input" id="wc-date" type="date" value="${dateInput}"></div>
      <div class="wabi-field"><label>Planificación</label><div class="wabi-segment wabi-plan-toggle" id="wc-time-mode"><button data-v="estimate" class="is-selected"><i class="fa-regular fa-clock"></i>Tiempo estimado</button><button data-v="fixed"><i class="fa-solid fa-lock"></i>Hora fija</button></div><div class="wabi-plan-content" id="wc-time-content"></div></div>
      <div class="wabi-field"><label>Prioridad</label><div class="wabi-choice-row" id="wc-priority">${Object.entries(PRIORITIES).map(([k,p])=>`<button class="wabi-choice-btn wabi-priority-choice" data-priority-choice="${k}" style="--choice-color:${p.color}"><i class="fa-solid fa-flag"></i>${p.label}</button>`).join('')}</div></div>
      <div class="wabi-field"><label>Categoría</label><div class="wabi-create-dropdown"><button class="wabi-create-trigger" id="wc-cat-trigger" type="button"><span class="trigger-main"><i class="fa-solid fa-hashtag"></i><span data-cat-label>Sin categoría</span></span><i class="fa-solid fa-chevron-down" style="font-size:8px"></i></button><div class="wabi-create-menu" id="wc-cat-menu">${categoryOptions}</div></div></div>
      <div class="wabi-two-col"><div class="wabi-field"><label>Recordatorio</label><div class="wabi-create-dropdown"><button class="wabi-create-trigger" id="wc-rem-trigger" type="button"><span class="trigger-main"><i class="fa-regular fa-bell"></i><span data-rem-label>Ninguno</span></span><i class="fa-solid fa-chevron-down" style="font-size:8px"></i></button><div class="wabi-create-menu" id="wc-rem-menu"><button class="wabi-create-menu-item wabi-reminder-option is-selected" data-rem-none><span>Ninguno</span><i class="fa-solid fa-check menu-check"></i></button>${reminderOptions.map(([v,l])=>`<button class="wabi-create-menu-item wabi-reminder-option" data-rem-choice="${v}"><span>${l}</span><i class="fa-solid fa-check menu-check"></i></button>`).join('')}</div></div></div>
      <div class="wabi-field"><label>Repetir</label><div class="wabi-create-dropdown"><button class="wabi-create-trigger" id="wc-repeat-trigger" type="button"><span class="trigger-main"><i class="fa-solid fa-repeat"></i><span data-repeat-label>No repetir</span></span><i class="fa-solid fa-chevron-down" style="font-size:8px"></i></button><div class="wabi-create-menu" id="wc-repeat-menu">${repeatOptions.map(([v,l])=>`<button class="wabi-create-menu-item wabi-repeat-option ${v==='none'?'is-selected':''}" data-repeat-choice="${v}"><span>${l}</span><i class="fa-solid fa-check menu-check"></i></button>`).join('')}</div></div><div class="wabi-custom-repeat" id="wc-repeat-custom"><select class="wabi-select" id="wc-repeat-every">${Array.from({length:12},(_,i)=>`<option value="${i+1}">Cada ${i+1}</option>`).join('')}</select><select class="wabi-select" id="wc-repeat-unit"><option value="day">día(s)</option><option value="week" selected>semana(s)</option><option value="month">mes(es)</option></select></div></div></div>
      </div><div class="wabi-create-foot"><div class="wabi-create-error" id="wc-error"></div><div style="display:flex;gap:8px"><button class="wabi-btn" data-close>Cancelar</button><button class="wabi-btn primary" id="wc-create">Crear</button></div></div></div>`;

    let closeTimer=null;
    const close=()=>{clearTimeout(closeTimer);scrim.classList.add('is-closing');closeTimer=setTimeout(()=>{scrim.className='scrim is-hidden';scrim.innerHTML=''},145)};
    const closeMenus=(except=null)=>$$('.wabi-create-menu.is-open',scrim).forEach(m=>{if(m!==except)m.classList.remove('is-open')});
    const toggleMenu=menu=>{const opening=!menu.classList.contains('is-open');closeMenus(menu);menu.classList.toggle('is-open',opening)};
    $$('[data-close]',scrim).forEach(b=>b.onclick=close);
    scrim.onclick=e=>{if(e.target===scrim){close();return}if(!e.target.closest('.wabi-create-dropdown'))closeMenus()};

    const currentCreateDay=()=>$('#wc-date',scrim)?.value||dateInput;
    const planError=msg=>{const el=$('#wc-plan-error',scrim);if(el)el.textContent=msg||''};
    const bestDuration=(max,current=30)=>{const vals=FLEX_PRESETS.filter(x=>x<=max);if(!vals.length)return null;return vals.includes(current)?current:vals.reduce((best,x)=>Math.abs(x-current)<Math.abs(best-current)?x:best,vals[0])};
    const availabilityFor=blockKey=>blockAvailability(currentCreateDay(),blockKey);

    /* Validación inmediata y localizada de la sección Planificación.
       No modifica horarios ni cards existentes: sólo informa antes de Guardar. */
    const createExistingIntervals=dayKey=>W.tasksFor(dayKey).filter(t=>!t.done).map(t=>{
      const p=taskPlacementForDay(t,dayKey,'normal');
      return p?{start:p.start,end:p.end}:null;
    }).filter(Boolean);
    const createWouldBeThirdOverlap=(dayKey,start,end)=>{
      const marks=[];
      for(const p of createExistingIntervals(dayKey)){
        const a=Math.max(start,p.start),b=Math.min(end,p.end);
        if(b>a)marks.push({time:a,delta:1},{time:b,delta:-1});
      }
      marks.sort((a,b)=>a.time-b.time||a.delta-b.delta);
      let active=0;
      for(const m of marks){active+=m.delta;if(active>=2)return true}
      return false;
    };
    let validateCreatePlanning=()=>{};

    function refreshEstimateAvailability(){
      if(timeMode!=='estimate')return;
      const holder=$('#wc-time-content',scrim);if(!holder)return;
      const oldDur=Number($('#wc-duration',holder)?.value)||30;
      $$('[data-block-choice]',holder).forEach(btn=>{
        const av=availabilityFor(btn.dataset.blockChoice),full=av.maxContinuous<30;
        btn.disabled=full;btn.classList.toggle('is-unavailable',full);
        btn.title=full?'Este bloque está lleno':`Hasta ${fmtDuration(av.maxContinuous)} continuos disponibles`;
      });
      const sel=$('#wc-duration',holder);if(!sel)return;
      if(!selectedBlockKey){sel.innerHTML=durationOptions();return}
      const btn=$(`[data-block-choice="${selectedBlockKey}"]`,holder),av=availabilityFor(selectedBlockKey);
      if(!btn||btn.disabled){selectedBlockKey=null;$$('[data-block-choice]',holder).forEach(x=>x.classList.remove('is-selected'));sel.innerHTML=durationOptions();planError('Este bloque está lleno. Selecciona otro bloque.');return}
      sel.innerHTML=durationOptions(av.maxContinuous);const chosen=bestDuration(av.maxContinuous,oldDur);if(chosen!==null)sel.value=String(chosen);planError('');
    }

    function paintTime(){
      const holder=$('#wc-time-content',scrim);
      if(timeMode==='estimate'){
        holder.innerHTML=`<div class="wabi-field" style="margin:0"><label>Bloque</label><div class="wabi-choice-row" id="wc-block-choices">${W.BLOCKS.map(b=>`<button class="wabi-choice-btn wabi-block-choice ${b.key===selectedBlockKey?'is-selected':''}" data-block-choice="${b.key}" style="${blockChoiceStyle(b.key)}"><span class="block-key">${b.key}</span><span>${esc(b.label)}</span></button>`).join('')}</div></div><div class="wabi-field" style="margin:8px 0 0"><label>Duración Estimada</label><select class="wabi-select" id="wc-duration">${durationOptions()}</select></div><div class="wabi-time-choice-note">[wabi] busca un espacio disponible dentro del bloque que elegiste.</div><div class="wabi-plan-inline-error" id="wc-plan-error"></div>`;
        $('#wc-duration',holder).value='30';
        validateCreatePlanning=()=>{
          if(!selectedBlockKey){planError('');return true}
          const dur=Number($('#wc-duration',holder)?.value)||30;
          const av=availabilityFor(selectedBlockKey);
          if(dur>av.maxContinuous){planError(av.maxContinuous?`No cabe completa aquí. Solo hay ${fmtDuration(av.maxContinuous)} continuos disponibles.`:'Este bloque está lleno.');return false}
          planError('');return true;
        };
        $$('[data-block-choice]',holder).forEach(b=>b.onclick=()=>{if(b.disabled)return;selectedBlockKey=b.dataset.blockChoice;$$('[data-block-choice]',holder).forEach(x=>x.classList.toggle('is-selected',x===b));refreshEstimateAvailability();validateCreatePlanning()});
        $('#wc-duration',holder).onchange=()=>validateCreatePlanning();
        refreshEstimateAvailability();validateCreatePlanning();return;
      }
      holder.innerHTML=`<div class="wabi-fixed-range-grid"><div class="wabi-field" style="margin:0"><label>Empieza</label>${clockEditorHTML('create-start',createFixedDraft?.start??null)}</div><div class="dash">—</div><div class="wabi-field" style="margin:0"><label>Termina</label>${clockEditorHTML('create-end',createFixedDraft?.end??null)}</div></div><div class="wabi-estimated-readout" id="wc-est-readout" style="margin-top:8px"></div><div class="wabi-time-choice-note"><i class="fa-solid fa-lock"></i> La hora se guarda siempre en formato de 24 h. Los botones a. m./p. m. convierten el valor sin cambiar el momento elegido.</div><div class="wabi-plan-inline-error" id="wc-plan-error"></div>`;
      const read=$('#wc-est-readout',holder);
      const update=()=>{
        planError('');
        const sm=readClockEditor(holder,'create-start'),em=readClockEditor(holder,'create-end');
        if(sm===null||em===null){read.textContent='';return false}
        const sAbs=clockAbsForConfiguredDay(sm);let eAbs=clockAbsForConfiguredDay(em);if(eAbs<=sAbs)eAbs+=1440;
        createFixedDraft={start:sm,end:em};
        const mins=eAbs-sAbs;read.textContent=mins>0&&mins<1440?`${fmtDuration(mins)} estimada`:'';
        if(mins>=30&&mins<1440&&createWouldBeThirdOverlap(currentCreateDay(),sAbs,eAbs)){
          planError('Ya hay 2 actividades en este horario. No pueden coincidir más de 2 actividades.');
          return false;
        }
        return true;
      };
      validateCreatePlanning=update;
      bindClockEditor(holder,'create-start',update);bindClockEditor(holder,'create-end',update);
    }
    paintTime();

    $('#wc-date',scrim).onchange=()=>{if(timeMode==='estimate')refreshEstimateAvailability();validateCreatePlanning()};
    $$('#wc-time-mode button',scrim).forEach(b=>b.onclick=()=>{
      if(b.dataset.v===timeMode)return;
      if(timeMode==='estimate'){const sel=$('#wc-duration',scrim);createEstimateDraft={duration:Number(sel?.value)||30,block:selectedBlockKey}}
      else{const sm=readClockEditor(scrim,'create-start'),em=readClockEditor(scrim,'create-end');if(sm!==null&&em!==null)createFixedDraft={start:sm,end:em}}
      timeMode=b.dataset.v;if(timeMode==='estimate')selectedBlockKey=createEstimateDraft.block||null;
      $$('#wc-time-mode button',scrim).forEach(x=>x.classList.toggle('is-selected',x===b));paintTime();
      if(timeMode==='estimate'){const sel=$('#wc-duration',scrim);if(sel&&[...sel.options].some(o=>Number(o.value)===createEstimateDraft.duration))sel.value=String(createEstimateDraft.duration)}
    });
    $$('[data-priority-choice]',scrim).forEach(b=>b.onclick=()=>{priority=b.dataset.priorityChoice;$$('[data-priority-choice]',scrim).forEach(x=>x.classList.toggle('is-selected',x===b))});
    $$('#wc-energy button',scrim).forEach(b=>b.onclick=()=>{energy=b.dataset.v;$$('#wc-energy button',scrim).forEach(x=>x.classList.toggle('is-selected',x===b))});

    const catTrigger=$('#wc-cat-trigger',scrim),catMenu=$('#wc-cat-menu',scrim);
    catTrigger.onclick=()=>toggleMenu(catMenu);
    const paintCategory=()=>{const c=catObj(category);$('[data-cat-label]',catTrigger).textContent=category||'Sin categoría';catTrigger.classList.toggle('has-color',!!c);if(c)catTrigger.style.setProperty('--choice-color',c.color);else catTrigger.style.removeProperty('--choice-color');$$('[data-cat-choice]',catMenu).forEach(x=>x.classList.toggle('is-selected',(x.dataset.catChoice||null)===(category||null)))};
    $$('[data-cat-choice]',catMenu).forEach(b=>b.onclick=()=>{category=b.dataset.catChoice||null;paintCategory();catMenu.classList.remove('is-open')});paintCategory();

    const remTrigger=$('#wc-rem-trigger',scrim),remMenu=$('#wc-rem-menu',scrim);
    remTrigger.onclick=()=>toggleMenu(remMenu);
    const remLabel=v=>{const found=reminderOptions.find(x=>x[0]===v);if(found)return found[1];if(v%1440===0)return `${v/1440} día${v===1440?'':'s'} antes`;if(v%60===0)return `${v/60} hora${v===60?'':'s'} antes`;return `${v} minutos antes`};
    const paintReminders=()=>{const vals=[...reminders];$('[data-rem-label]',remTrigger).textContent=!vals.length?'Ninguno':remLabel(vals[0]);$$('[data-rem-choice]',remMenu).forEach(x=>x.classList.toggle('is-selected',reminders.has(Number(x.dataset.remChoice))));$('[data-rem-none]',remMenu).classList.toggle('is-selected',!reminders.size)};
    $('[data-rem-none]',remMenu).onclick=()=>{reminders.clear();paintReminders();remMenu.classList.remove('is-open')};
    $$('[data-rem-choice]',remMenu).forEach(b=>b.onclick=()=>{reminders.clear();reminders.add(Number(b.dataset.remChoice));paintReminders();remMenu.classList.remove('is-open')});
    paintReminders();

    const repeatTrigger=$('#wc-repeat-trigger',scrim),repeatMenu=$('#wc-repeat-menu',scrim),repeatCustomEl=$('#wc-repeat-custom',scrim);
    repeatTrigger.onclick=()=>toggleMenu(repeatMenu);
    const repeatLabel=v=>repeatOptions.find(x=>x[0]===v)?.[1]||'No repetir';
    const paintRepeat=()=>{$('[data-repeat-label]',repeatTrigger).textContent=repeatLabel(repeat);$$('[data-repeat-choice]',repeatMenu).forEach(x=>x.classList.toggle('is-selected',x.dataset.repeatChoice===repeat));repeatCustomEl.classList.toggle('is-visible',repeat==='custom')};
    $$('[data-repeat-choice]',repeatMenu).forEach(b=>b.onclick=()=>{repeat=b.dataset.repeatChoice;paintRepeat();repeatMenu.classList.remove('is-open')});
    $('#wc-repeat-every',scrim).onchange=e=>repeatCustom.every=Number(e.target.value)||1;$('#wc-repeat-unit',scrim).onchange=e=>repeatCustom.unit=e.target.value;paintRepeat();

    $('#wc-create',scrim).onclick=()=>{
      $('#wc-error',scrim).textContent='';planError('');
      const title=$('#wc-title',scrim).value.trim();if(!title){$('#wc-error',scrim).textContent='Ponle un nombre a la actividad.';return}
      const day=$('#wc-date',scrim).value;let block=selectedBlockKey,planned,startTime=null,endTime=null,fixed=timeMode==='fixed';
      if(!priority){$('#wc-error',scrim).textContent='Selecciona una prioridad.';return}
      if(!validateCreatePlanning())return;
      if(fixed){
        const sm=readClockEditor(scrim,'create-start'),em=readClockEditor(scrim,'create-end');
        if(sm===null||em===null){planError('Escribe una hora y minutos válidos para inicio y término.');return}
        const s=clockAbsForConfiguredDay(sm);let e=clockAbsForConfiguredDay(em);if(e<=s)e+=1440;
        if(e-s<30||e-s>=1440){planError('La actividad debe durar al menos 30 min.');return}
        const bi=blockInfos().find(b=>s>=b.startAbs&&s<b.endAbs);if(!bi){planError('La hora de inicio no pertenece a ningún bloque configurado.');return}
        block=bi.key;planned=plannedFromMins(e-s);startTime=timeString(s);endTime=timeString(e);
      }else{
        if(!block){planError('Selecciona un bloque disponible.');return}
        const duration=Number($('#wc-duration',scrim).value)||30,av=availabilityFor(block);
        if(duration>av.maxContinuous){planError(av.maxContinuous?`No cabe completa aquí. Solo hay ${fmtDuration(av.maxContinuous)} continuos disponibles.`:'Este bloque está lleno.');return}
        planned=plannedFromMins(duration);
      }
      const repeatData=repeat==='custom'?{type:'custom',every:repeatCustom.every,unit:repeatCustom.unit}:repeat;
      const payload={id:nextId(),title,block,planned,category,priority,type:energy==='normal'?null:energy,fixed,startTime,endTime,reminders:[...reminders],repeat:repeatData,recurrenceStart:day,done:false,subtasks:[],actual:'0:00:00',timerSecs:0,timerRunning:false};
      const test=W.canPlaceTask(payload,day,block,null);
      if(!test.valid){if(!fixed){const av=availabilityFor(block);planError(av.maxContinuous?`No cabe completa aquí. Solo hay ${fmtDuration(av.maxContinuous)} continuos disponibles.`:'Este bloque está lleno.')}else planError(test.reason||'Ese horario no está disponible.');return}
      W.addTask(day,payload);stabilizeFlexiblePlacements(day);close();W.toast('Actividad creada');W.emit('tasks-changed');
    };
  };

  /* ───────── detail additions: priority + fixed range ───────── */
  const previousDetailOpen=W.detail.open.bind(W.detail);
  W.detail.open=function(){previousDetailOpen();setTimeout(decorateDetail,45)};
  function decorateDetail(){
    const det=$('.detail.is-open');if(!det||!W.state.selectedTask)return;
    const {key}=W.state.selectedTask,idx=W.state.selectedTask.idx,t=W.tasksFor(key)[idx];if(!t)return;
    $('.wabi-detail-plan',det)?.remove();
    const meta=$('.meta-chips',det);
    if(meta&&!$('[data-wabi-priority-detail]',meta)){
      const p=priorityOf(t),btn=document.createElement('button');btn.className='meta-chip is-set';btn.dataset.wabiPriorityDetail='1';btn.innerHTML=`<i class="fa-solid fa-flag" style="color:${p.color}"></i> ${p.label}`;meta.appendChild(btn);
      btn.onclick=e=>W.popover.open({anchor:e.currentTarget,items:Object.entries(PRIORITIES).map(([k,x])=>({value:k,label:x.label,selected:priorityKey(t)===k,icon:'fa-flag'})),onSelect:v=>{W.updateTask(key,idx,{priority:v});W.emit('tasks-changed');W.detail.open()}});
    }
    const body=$('.detail-body',det);if(!body)return;
    const div=document.createElement('div');div.className='wabi-detail-plan';
    const bi=getBlock(t.block||W.BLOCKS[0].key),s=t.fixed?absClockInDay(t.startTime||timeString(bi.startAbs)):null,e=t.fixed?s+durationMins(t.planned):null;
    if(t.fixed){
      const currentStart=parseTime(t.startTime||timeString(bi.startAbs)),currentEnd=(currentStart+durationMins(t.planned))%1440;
      div.innerHTML=`<div class="section-label">Hora fija</div><div class="wabi-detail-card"><div class="wabi-fixed-range-grid"><div class="wabi-field"><label>Empieza</label>${clockEditorHTML('detail-start',currentStart)}</div><div class="dash">—</div><div class="wabi-field"><label>Termina</label>${clockEditorHTML('detail-end',currentEnd)}</div></div><div class="wabi-estimated-readout" data-fix-read></div></div>`;
      body.insertBefore(div,body.children[1]||null);
      const rr=$('[data-fix-read]',div);let saveTimer=null;
      const readRange=()=>{const sm=readClockEditor(div,'detail-start'),em=readClockEditor(div,'detail-end');if(sm===null||em===null){rr.textContent='Completa el horario';return null}const s=clockAbsForConfiguredDay(sm);let e=clockAbsForConfiguredDay(em);if(e<=s)e+=1440;if(e-s<=0||e-s>=1440){rr.textContent='Rango no válido';return null}rr.textContent=`Duración estimada: ${fmtDuration(e-s)}`;return {s,e}};
      const save=()=>{const r=readRange();if(!r)return;if(r.e-r.s<30){W.toast('La actividad debe durar al menos 30 min.');return}const block=hourBlockDynamic(Math.floor((r.s%1440)/60),r.s%60);const patch={fixed:true,block,startTime:timeString(r.s),endTime:timeString(r.e),planned:plannedFromMins(r.e-r.s)};const probe=W.canPlaceTask({...t,...patch},key,block,t.id);if(!probe.valid){W.toast(probe.reason||'Ese horario no está disponible');return}if(W.updateTask(key,idx,patch)!==false){W.emit('tasks-changed')}};
      const changed=()=>{readRange();clearTimeout(saveTimer);saveTimer=setTimeout(save,550)};
      bindClockEditor(div,'detail-start',changed);bindClockEditor(div,'detail-end',changed);readRange();
      const planned=$('[data-action="set-planned"]',det);if(planned){const clone=planned.cloneNode(true);clone.textContent=fmtDuration(durationMins(t.planned));clone.style.cursor='default';planned.replaceWith(clone)}
    }else{
      div.innerHTML=`<div class="section-label">Planificación</div><div class="wabi-detail-card"><strong style="font-size:12px">Tiempo estimado</strong><div style="font-size:10.5px;color:var(--text-muted);margin-top:3px">[wabi] calcula la hora dentro de ${esc(bi.label)}. Puedes cambiar la estimación desde “Planeado”.</div></div>`;body.appendChild(div);
    }
    $('.wabi-detail-notes',det)?.remove();
    const notes=document.createElement('div');
    notes.className='wabi-detail-notes';
    notes.innerHTML=`<div class="section-label">Notas</div><textarea class="wabi-detail-notes-input" placeholder="Añade notas sobre esta actividad…">${esc(t.notes||'')}</textarea>`;
    body.appendChild(notes);
    const notesInput=$('.wabi-detail-notes-input',notes);
    notesInput.onblur=()=>{
      const current=W.tasksFor(key)[idx];if(!current)return;
      current.notes=notesInput.value;
      W.saveState();
    };
    normalizeBrandText(det);
  }

  /* ───────── header + sidebar shell ───────── */
  function headerHTML(){
    const p=profile();return `<div class="wabi-header-left"><button class="btn-burger only-mobile" id="btn-burger-v2" aria-label="Menú"><i class="fa-solid fa-bars"></i></button><div class="brand-mark" aria-label="[wabi]™"><span class="brand-wordmark"><span class="brand-bracket">[</span>wabi<span class="brand-bracket">]</span></span></div><div class="wabi-header-nav"><button data-nav-prev aria-label="Anterior"><i class="fa-solid fa-chevron-left"></i></button><button class="wabi-today" data-nav-today>Hoy</button><button data-nav-next aria-label="Siguiente"><i class="fa-solid fa-chevron-right"></i></button></div></div><div class="wabi-header-center"><div class="wabi-mode-seg"><button data-wabi-mode="relax"><i class="fa-solid fa-leaf"></i>Relax</button><button data-wabi-mode="normal">Normal</button><button data-wabi-mode="intense"><i class="fa-solid fa-bolt"></i>Intense</button></div></div><div class="wabi-header-right"><div class="wabi-filter-wrap"><button class="wabi-filter-button" data-filter-open><span data-filter-label>Todas</span><i class="fa-solid fa-caret-down" style="font-size:8px"></i></button><div class="wabi-filter-menu" data-filter-menu>${[['all','Todas'],['pending','Pendientes'],['done','Hechas']].map(([k,l])=>`<button class="wabi-filter-option" data-status-filter="${k}"><span class="check">✓</span>${l}</button>`).join('')}</div></div><button class="wabi-header-icon" data-theme-v2 aria-label="Cambiar tema"><i class="fa-solid ${W.state.theme==='dark'?'fa-sun':'fa-moon'}"></i></button><button class="wabi-header-avatar" data-profile-v2 aria-label="Perfil y Ajustes">${initials(p.name)}</button></div>`;
  }
  function sidebarHTML(){
    return `<div class="sidebar-section">Vistas</div><div class="wabi-sidebar-views"><button class="nav-item" data-surface="day"><span class="nav-icon"><i class="fa-solid fa-calendar-day"></i></span><span class="nav-label">Día</span></button><button class="nav-item" data-surface="week"><span class="nav-icon"><i class="fa-solid fa-calendar-week"></i></span><span class="nav-label">Semana</span></button><button class="nav-item" data-surface="month"><span class="nav-icon"><i class="fa-regular fa-calendar"></i></span><span class="nav-label">Mes</span></button></div><div class="sidebar-section">Categorías</div><div class="wabi-sidebar-filters">${W.CATS.map(c=>`<button class="wabi-cat-filter ${categoryFilters.has(c.label)?'is-on':''}" data-cat-filter="${c.label}"><span class="wabi-cat-check" style="background:${c.color}"><i class="fa-solid fa-check"></i></span><span>${c.label}</span></button>`).join('')}</div><div class="sidebar-section">Prioridad</div><div class="wabi-sidebar-filters">${Object.entries(PRIORITIES).map(([k,x])=>`<button class="wabi-priority-filter ${priorityFilters.has(k)?'is-off':''}" data-priority-filter="${k}"><span class="flag"><i class="fa-solid fa-flag" style="color:${x.color}"></i></span><span>${x.label}</span></button>`).join('')}</div><div class="wabi-sidebar-footer"><button class="nav-item wabi-recommend" data-feedback-v2><span class="nav-icon"><i class="fa-regular fa-message"></i></span><span class="nav-label">Reportar un problema/feedback</span></button></div>`;
  }
  let html2CanvasLoader=null;
  function ensureHtml2Canvas(){
    if(window.html2canvas)return Promise.resolve(window.html2canvas);
    if(html2CanvasLoader)return html2CanvasLoader;
    const sources=[
      'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
      'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js'
    ];
    html2CanvasLoader=new Promise((resolve,reject)=>{
      let i=0;
      const next=()=>{
        if(window.html2canvas){resolve(window.html2canvas);return}
        if(i>=sources.length){reject(new Error('html2canvas-unavailable'));return}
        const tag=document.createElement('script'),src=sources[i++];tag.src=src;tag.async=true;
        const timer=setTimeout(()=>{tag.remove();next()},6500);
        tag.onload=()=>{clearTimeout(timer);if(window.html2canvas)resolve(window.html2canvas);else next()};
        tag.onerror=()=>{clearTimeout(timer);tag.remove();next()};
        document.head.appendChild(tag);
      };next();
    }).catch(err=>{html2CanvasLoader=null;throw err});
    return html2CanvasLoader;
  }
  function beginFeedbackAreaCapture(dialog,onDone){
    dialog.style.display='none';
    const app=$('.app')||document.body,appRect=app.getBoundingClientRect();

    /* Selection happens first. The screenshot is generated only after the user
       presses “Usar captura”, so opening the camera never captures by itself. */
    const captureBase=async()=>{
      try{
        await (document.fonts?.ready||Promise.resolve());
        const h2c=await ensureHtml2Canvas();
        return await h2c(app,{backgroundColor:null,useCORS:true,allowTaint:false,scale:Math.max(1,window.devicePixelRatio||1),logging:false,imageTimeout:10000,removeContainer:true});
      }catch(err){
        if(window.wabiCaptureScreenFallback)return await window.wabiCaptureScreenFallback();
        throw err;
      }
    };

    const ov=document.createElement('div');ov.className='wabi-capture-overlay';
    ov.innerHTML=`<div class="wabi-capture-help"><strong>Haz clic y, sin soltar, arrastra para encuadrar el área del problema.</strong><span>Presiona Esc para cancelar.</span></div><div class="wabi-capture-selection"><canvas class="wabi-capture-ink"></canvas><div class="wabi-capture-text-editor"><input maxlength="80" placeholder="Escribe aquí…"><button>Listo</button></div></div><div class="wabi-capture-tools"><button data-tool="pen" class="is-active"><i class="fa-solid fa-pencil"></i> Lápiz</button><button data-tool="marker"><i class="fa-solid fa-highlighter"></i> Plumón</button><button data-tool="text"><i class="fa-solid fa-font"></i> Texto</button><span class="tool-sep"></span><button class="capture-cancel" data-capture-cancel>Cancelar</button><button data-capture-reselect>Volver a recortar</button><button class="primary" data-capture-use>Usar captura</button></div>`;
    document.body.appendChild(ov);
    const help=$('.wabi-capture-help',ov),sel=$('.wabi-capture-selection',ov),ink=$('.wabi-capture-ink',ov),tools=$('.wabi-capture-tools',ov),textEditor=$('.wabi-capture-text-editor',ov),textInput=$('input',textEditor);
    let selecting=false,startX=0,startY=0,selection=null,tool='pen',drawing=false,last=null,history=[],captureStage='select';

    const onSelectionKeydown=e=>{
      if(e.key==='Escape'&&captureStage==='select'){
        e.preventDefault();e.stopPropagation();remove();
      }
    };
    document.addEventListener('keydown',onSelectionKeydown,true);

    function cleanup(){document.removeEventListener('keydown',onSelectionKeydown,true);ov.remove()}
    function remove(){cleanup();dialog.style.display='flex'}
    function within(x,y){return {x:clamp(x,appRect.left,appRect.right),y:clamp(y,appRect.top,appRect.bottom)}}
    function setSelection(l,t,w,h){
      selection={left:l,top:t,width:w,height:h};captureStage='annotate';help.classList.add('is-hidden');
      Object.assign(sel.style,{left:`${l}px`,top:`${t}px`,width:`${w}px`,height:`${h}px`});sel.classList.add('on');
      const dpr=Math.max(1,window.devicePixelRatio||1);ink.width=Math.max(1,Math.round(w*dpr));ink.height=Math.max(1,Math.round(h*dpr));
      ink.style.width=`${w}px`;ink.style.height=`${h}px`;ink.getContext('2d').setTransform(dpr,0,0,dpr,0,0);history=[];tools.classList.add('on');
    }
    function resetSelection(){captureStage='select';selection=null;sel.classList.remove('on');tools.classList.remove('on');textEditor.classList.remove('on');help.classList.remove('is-hidden');history=[]}
    function snapshot(){const ctx=ink.getContext('2d');history.push(ctx.getImageData(0,0,ink.width,ink.height));if(history.length>30)history.shift()}
    function restorePrevious(){if(!history.length)return;const ctx=ink.getContext('2d');history.pop();ctx.clearRect(0,0,ink.width,ink.height);if(history.length)ctx.putImageData(history[history.length-1],0,0)}

    ov.addEventListener('pointerdown',e=>{
      if(e.target.closest('.wabi-capture-tools,.wabi-capture-text-editor')||selection)return;
      const p=within(e.clientX,e.clientY);selecting=true;help.classList.add('is-hidden');startX=p.x;startY=p.y;sel.classList.add('on');
      Object.assign(sel.style,{left:`${p.x}px`,top:`${p.y}px`,width:'0px',height:'0px'});e.preventDefault();
    });
    ov.addEventListener('pointermove',e=>{
      if(!selecting)return;
      const p=within(e.clientX,e.clientY),l=Math.min(startX,p.x),t=Math.min(startY,p.y),w=Math.abs(p.x-startX),h=Math.abs(p.y-startY);
      Object.assign(sel.style,{left:`${l}px`,top:`${t}px`,width:`${w}px`,height:`${h}px`});
    });
    ov.addEventListener('pointerup',e=>{
      if(!selecting)return;selecting=false;
      const p=within(e.clientX,e.clientY),l=Math.min(startX,p.x),t=Math.min(startY,p.y),w=Math.abs(p.x-startX),h=Math.abs(p.y-startY);
      if(w<30||h<30){resetSelection();return}setSelection(l,t,w,h);
    });

    $$('[data-tool]',tools).forEach(b=>b.onclick=()=>{tool=b.dataset.tool;$$('[data-tool]',tools).forEach(x=>x.classList.toggle('is-active',x===b));ink.style.cursor=tool==='text'?'text':'crosshair'});
    ink.addEventListener('pointerdown',e=>{
      if(!selection)return;
      const r=ink.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
      if(tool==='text'){
        textEditor.style.left=`${clamp(x,4,Math.max(4,r.width-190))}px`;textEditor.style.top=`${clamp(y,4,Math.max(4,r.height-42))}px`;
        textEditor.dataset.x=x;textEditor.dataset.y=y;textEditor.classList.add('on');textInput.value='';setTimeout(()=>textInput.focus(),0);return;
      }
      drawing=true;last={x,y};snapshot();ink.setPointerCapture?.(e.pointerId);
    });
    ink.addEventListener('pointermove',e=>{
      if(!drawing||!last)return;
      const r=ink.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,ctx=ink.getContext('2d'),dpr=Math.max(1,window.devicePixelRatio||1);
      ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=tool==='marker'?'rgba(235,65,65,.45)':'#e53935';ctx.lineWidth=tool==='marker'?12:3;
      ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(x,y);ctx.stroke();ctx.restore();last={x,y};
    });
    const endDraw=()=>{if(!drawing)return;drawing=false;last=null;snapshot()};
    ink.addEventListener('pointerup',endDraw);ink.addEventListener('pointercancel',endDraw);

    function commitText(){
      const val=textInput.value.trim();if(!val||!selection){textEditor.classList.remove('on');return}
      snapshot();const x=Number(textEditor.dataset.x)||8,y=Number(textEditor.dataset.y)||22,ctx=ink.getContext('2d'),dpr=Math.max(1,window.devicePixelRatio||1);
      ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.font='600 16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';ctx.fillStyle='#e53935';ctx.textBaseline='top';ctx.fillText(val,x,y);ctx.restore();snapshot();textEditor.classList.remove('on');
    }
    $('button',textEditor).onclick=commitText;
    textInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commitText()}});
    $('[data-capture-reselect]',tools).onclick=resetSelection;
    $('[data-capture-cancel]',tools).onclick=remove;

    $('[data-capture-use]',tools).onclick=async()=>{
      if(!selection)return;
      const btn=$('[data-capture-use]',tools);btn.disabled=true;btn.textContent='Preparando…';
      try{
        const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('capture-timeout')),15000));
        const prevVis=ov.style.visibility;ov.style.visibility='hidden';await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        let shot;try{shot=await Promise.race([captureBase(),timeout])}finally{ov.style.visibility=prevVis}
        if(!shot?.width||!shot?.height)throw new Error('empty-capture');
        const sx=shot.width/appRect.width,sy=shot.height/appRect.height;
        const cx=Math.max(0,Math.round((selection.left-appRect.left)*sx)),cy=Math.max(0,Math.round((selection.top-appRect.top)*sy));
        const cw=Math.max(1,Math.min(shot.width-cx,Math.round(selection.width*sx))),ch=Math.max(1,Math.min(shot.height-cy,Math.round(selection.height*sy)));
        const out=document.createElement('canvas');out.width=cw;out.height=ch;const ctx=out.getContext('2d');if(!ctx)throw new Error('canvas-context');
        ctx.drawImage(shot,cx,cy,cw,ch,0,0,cw,ch);ctx.drawImage(ink,0,0,ink.width,ink.height,0,0,cw,ch);
        const blob=await new Promise((resolve,reject)=>out.toBlob(b=>b?resolve(b):reject(new Error('png-encode')),'image/png'));
        const data=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(String(fr.result||''));fr.onerror=()=>reject(fr.error||new Error('file-reader'));fr.readAsDataURL(blob)});
        if(!data.startsWith('data:image/png'))throw new Error('invalid-png');
        cleanup();dialog.style.display='flex';onDone(data);setTimeout(()=>dialog.querySelector('[data-feedback-text]')?.focus(),0);
      }catch(err){
        console.error('[wabi] feedback capture',err);W.toast('No se pudo preparar la captura. Inténtalo otra vez.');
      }finally{
        if(btn?.isConnected){btn.disabled=false;btn.textContent='Usar captura'}
      }
    };
  }
  function openFeedbackReport(){
    $('.wabi-feedback-scrim')?.remove();let kind='error',cropData=null;
    const sc=document.createElement('div');sc.className='wabi-feedback-scrim';sc.innerHTML=`<div class="wabi-feedback-card" role="dialog" aria-modal="true" aria-label="Reportar un problema o enviar feedback"><div class="wabi-feedback-head"><h2>Reportar un problema/feedback</h2><button class="wabi-close" data-feedback-close aria-label="Cerrar">×</button></div><div class="wabi-feedback-body"><div class="wabi-feedback-kind"><button class="is-selected" data-feedback-kind="error"><i class="fa-solid fa-triangle-exclamation"></i> Encontré un error</button><button data-feedback-kind="idea"><i class="fa-regular fa-lightbulb"></i> Tengo una sugerencia</button></div><div class="wabi-field" style="margin:0"><label>¿Qué pasó?</label><textarea class="wabi-feedback-textarea" data-feedback-text placeholder="Cuéntanos qué ocurrió o qué te gustaría mejorar."></textarea></div><div class="wabi-feedback-capture-row"><div><strong style="font-size:11px">Captura opcional</strong><div class="wabi-feedback-capture-note">Selecciona un área de [wabi], recórtala y márcala con lápiz, plumón o texto antes de adjuntarla.</div></div><button class="wabi-btn wabi-feedback-camera-only" data-feedback-capture aria-label="Seleccionar área"><i class="fa-solid fa-camera"></i></button></div><div class="wabi-feedback-thumb" data-feedback-thumb><img alt="Área seleccionada"><span>Captura marcada y lista para adjuntar.</span><button class="wabi-btn" data-feedback-recrop style="margin-left:auto">Cambiar</button></div><div class="wabi-feedback-prototype-note">En este HTML de prototipo el reporte se guarda localmente. Cuando conectes el backend de [wabi], este mismo formulario puede enviarte descripción, captura, vista, navegador y fecha automáticamente.</div></div><div class="wabi-feedback-foot"><button class="wabi-btn" data-feedback-close>Cancelar</button><button class="wabi-btn primary" data-feedback-send>Enviar feedback</button></div></div>`;document.body.appendChild(sc);
    const close=()=>sc.remove();$$('[data-feedback-close]',sc).forEach(b=>b.onclick=close);sc.onclick=e=>{if(e.target===sc)close()};
    $$('[data-feedback-kind]',sc).forEach(b=>b.onclick=()=>{kind=b.dataset.feedbackKind;$$('[data-feedback-kind]',sc).forEach(x=>x.classList.toggle('is-selected',x===b))});
    const thumb=$('[data-feedback-thumb]',sc),thumbImg=$('img',thumb);
    const launchCapture=()=>beginFeedbackAreaCapture(sc,data=>{cropData=data;thumbImg.src=data;thumb.classList.add('on');sc.style.display='flex'});
    $('[data-feedback-capture]',sc).onclick=launchCapture;$('[data-feedback-recrop]',sc).onclick=launchCapture;
    $('[data-feedback-send]',sc).onclick=()=>{
      const body=$('[data-feedback-text]',sc).value.trim();if(!body){W.toast('Cuéntanos qué pasó o qué te gustaría mejorar');return}
      const report={id:`fb-${Date.now()}`,kind,body,screenshot:cropData||null,surface:W._surface||'week',createdAt:new Date().toISOString(),browser:navigator.userAgent,viewport:{width:window.innerWidth,height:window.innerHeight}};
      let arr=[];try{arr=JSON.parse(localStorage.getItem('wabi.feedback.local')||'[]')}catch{}arr.push(report);try{localStorage.setItem('wabi.feedback.local',JSON.stringify(arr.slice(-50)))}catch{}
      close();
      const thanks=document.createElement('div');thanks.className='wabi-feedback-scrim';thanks.innerHTML=`<div class="wabi-feedback-thanks" role="dialog" aria-modal="true" aria-label="Gracias por tu feedback"><div class="wabi-feedback-thanks-icon"><i class="fa-solid fa-check"></i></div><h2>Gracias por ayudarnos a mejorar [wabi]</h2><p>Tus reportes y comentarios nos ayudan a hacer [wabi] más clara, útil y fácil de usar.</p><button class="wabi-btn primary" data-feedback-thanks-close>Aceptar</button></div>`;document.body.appendChild(thanks);
      const finish=()=>thanks.remove();$('[data-feedback-thanks-close]',thanks).onclick=finish;thanks.onclick=e=>{if(e.target===thanks)finish()};
    };
  }

  function rebuildShell(){
    const header=$('.titlebar'),sidebar=$('#sidebar');if(header)header.innerHTML=headerHTML();if(sidebar)sidebar.innerHTML=sidebarHTML();
    const tab=$('.tabbar');if(tab){tab.innerHTML='';tab.style.display='none';}
    bindShellV2();syncShell();normalizeBrandText();
  }
  function setSurface(surface){
    closeMonthDayPanel();
    W._surface=surface;
    if(surface==='month'){W.state.view='month';if(!(W.state.monthDate instanceof Date))W.state.monthDate=new Date();}
    else{W.state.view='board';if(surface==='day'&&!W._dayDate)W._dayDate=new Date();}
    W.saveState?.();renderSurface();syncShell();closeSidebar();
  }
  function closeSidebar(){$('#sidebar')?.classList.remove('is-open');$('#sidebar-scrim')?.classList.remove('is-visible')}
  function captureTimelineCardRects(){
    const map=new Map();
    $$('.wabi-day-event>.wabi-task-card,.wabi-week-event>.wabi-task-card').forEach(card=>{
      const wrap=card.closest('.wabi-day-event,.wabi-week-event');if(!wrap)return;
      map.set(`${card.dataset.key}::${card.dataset.taskId}`,wrap.getBoundingClientRect());
    });
    return map;
  }
  function animateModeTransition(before){
    if(!before?.size||W._surface==='month')return;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      $$('.wabi-day-event>.wabi-task-card,.wabi-week-event>.wabi-task-card').forEach(card=>{
        const wrap=card.closest('.wabi-day-event,.wabi-week-event');if(!wrap)return;
        const old=before.get(`${card.dataset.key}::${card.dataset.taskId}`);if(!old)return;
        const now=wrap.getBoundingClientRect(),dx=old.left-now.left,dy=old.top-now.top;
        if(Math.abs(dx)<.5&&Math.abs(dy)<.5)return;
        wrap.animate([
          {transform:`translate(${dx}px,${dy}px)`,opacity:.72},
          {transform:'translate(0,0)',opacity:1}
        ],{duration:320,easing:'cubic-bezier(.22,.8,.25,1)'});
      });
    }));
  }

  function bindShellV2(){
    $('[data-nav-prev]')?.addEventListener('click',()=>{if(W._surface==='month'){const d=W.state.monthDate instanceof Date?W.state.monthDate:new Date();W.state.monthDate=new Date(d.getFullYear(),d.getMonth()-1,1);renderSurface()}else if(W._surface==='day'){W._dayDate=W.addDays(currentDayDate(),-1);renderSurface()}else if(W.isMobile?.()){const d=W.fromKey(W.state.mobileSelectedDay||W.dateKey(new Date()));const n=W.addDays(d,-1);W.state.mobileSelectedDay=W.dateKey(n);W.state.weekStart=W.getWeekStart(n);renderSurface()}else{W.state.weekStart=W.addDays(W.state.weekStart,-7);renderSurface()}});
    $('[data-nav-next]')?.addEventListener('click',()=>{if(W._surface==='month'){const d=W.state.monthDate instanceof Date?W.state.monthDate:new Date();W.state.monthDate=new Date(d.getFullYear(),d.getMonth()+1,1);renderSurface()}else if(W._surface==='day'){W._dayDate=W.addDays(currentDayDate(),1);renderSurface()}else if(W.isMobile?.()){const d=W.fromKey(W.state.mobileSelectedDay||W.dateKey(new Date()));const n=W.addDays(d,1);W.state.mobileSelectedDay=W.dateKey(n);W.state.weekStart=W.getWeekStart(n);renderSurface()}else{W.state.weekStart=W.addDays(W.state.weekStart,7);renderSurface()}});
    $('[data-nav-today]')?.addEventListener('click',()=>{W.state.weekStart=W.getWeekStart(new Date());W.state.monthDate=new Date();W._dayDate=new Date();renderSurface()});
    $$('[data-wabi-mode]').forEach(b=>b.onclick=()=>{
      const next=b.dataset.wabiMode;if(next===(W.state.mode||'normal'))return;
      const before=captureTimelineCardRects();
      W.state.mode=next;W.saveState();closeCardHoverPreview();
      renderSurface();syncShell();animateModeTransition(before);
    });
    $('[data-filter-open]')?.addEventListener('click',e=>{e.stopPropagation();const m=$('[data-filter-menu]');m.classList.toggle('on');e.currentTarget.classList.toggle('is-open',m.classList.contains('on'))});
    $$('[data-status-filter]').forEach(b=>b.onclick=()=>{W.state.filter=b.dataset.statusFilter;W.saveState();renderSurface();syncShell();$('[data-filter-menu]')?.classList.remove('on')});
    $('[data-theme-v2]')?.addEventListener('click',()=>W.applyTheme(W.state.theme==='dark'?'light':'dark'));
    $('[data-theme-switch-v2]')?.addEventListener('click',()=>W.applyTheme(W.state.theme==='dark'?'light':'dark'));
    $$('[data-profile-v2]').forEach(b=>b.onclick=()=>W.beta?.openSettings?.('profile'));
    $('[data-feedback-v2]')?.addEventListener('click',openFeedbackReport);
    $$('[data-surface]').forEach(b=>b.onclick=()=>setSurface(b.dataset.surface));$$('[data-mobile-surface]').forEach(b=>b.onclick=()=>setSurface(b.dataset.mobileSurface));
    $('#btn-burger-v2')?.addEventListener('click',()=>{$('#sidebar')?.classList.add('is-open');$('#sidebar-scrim')?.classList.add('is-visible')});$('[data-sidebar-close-v2]')?.addEventListener('click',closeSidebar);$('#sidebar-scrim')?.addEventListener('click',closeSidebar);
    document.addEventListener('click',e=>{if(!e.target.closest('.wabi-filter-wrap')){$('[data-filter-menu]')?.classList.remove('on');$('[data-filter-open]')?.classList.remove('is-open')}});
    $$('[data-cat-filter]').forEach(b=>b.onclick=()=>{const k=b.dataset.catFilter;categoryFilters.has(k)?categoryFilters.delete(k):categoryFilters.add(k);saveFilters();b.classList.toggle('is-on',categoryFilters.has(k));renderSurface()});
    $$('[data-priority-filter]').forEach(b=>b.onclick=()=>{const k=b.dataset.priorityFilter;priorityFilters.has(k)?priorityFilters.delete(k):priorityFilters.add(k);saveFilters();b.classList.toggle('is-off',priorityFilters.has(k));renderSurface()});
  }
  function syncShell(){
    $$('[data-wabi-mode]').forEach(b=>b.classList.toggle('is-active',b.dataset.wabiMode===W.state.mode));
    $$('[data-status-filter]').forEach(b=>b.classList.toggle('on',b.dataset.statusFilter===W.state.filter));
    const labels={all:'Todas',pending:'Pendientes',done:'Hechas'};$('[data-filter-label]')&&($('[data-filter-label]').textContent=labels[W.state.filter]||'Todas');
    $$('[data-surface]').forEach(b=>b.classList.toggle('is-active',b.dataset.surface===W._surface));$$('[data-mobile-surface]').forEach(b=>b.classList.toggle('is-active',b.dataset.mobileSurface===W._surface));
    $('[data-theme-v2] i')&&($('[data-theme-v2] i').className=`fa-solid ${W.state.theme==='dark'?'fa-sun':'fa-moon'}`);
    const p=profile();$$('[data-profile-v2]').forEach(b=>{if(b.classList.contains('wabi-header-avatar'))b.textContent=initials(p.name);const mini=$('.wabi-profile-avatar-mini',b);if(mini)mini.textContent=initials(p.name)});
  }
  function applyMobileWeekFocus(root){
    if(!W.isMobile?.())return;
    const key=W.state.mobileSelectedDay||W.dateKey(new Date());$$('[data-day-head]',root).forEach(x=>x.classList.toggle('wabi-day-visible',x.dataset.dayHead===key));$$('.wabi-day-block',root).forEach(x=>x.classList.toggle('wabi-day-visible',x.dataset.dayKey===key));
  }
  function renderSurface(){if(W._surface==='month'){W.state.view='month';W.month.render()}else{W.state.view='board';W.board.render()}}

  /* ───────── settings: Planificación / custom blocks ───────── */
  function enhanceSettings(){
    const scrim=$('#wabi-settings');if(!scrim||!scrim.classList.contains('on'))return;
    const nav=$('.wabi-settings-nav',scrim);if(nav&&!$('[data-stab-v2="planning"]',nav)){
      const b=document.createElement('button');b.className='wabi-settings-tab';b.dataset.stabV2='planning';b.textContent='Bloques';
      const bottom=$('.wabi-settings-nav-bottom',nav);nav.insertBefore(b,bottom||null);b.onclick=()=>paintPlanning(scrim,b);
    }
    normalizeBrandText(scrim);
  }
  function paintPlanning(scrim,btn){
    $$('.wabi-settings-tab',scrim).forEach(x=>x.classList.toggle('on',x===btn));$('.wabi-settings-top h2',scrim).textContent='Bloques';
    const root=$('#wabi-settings-content',scrim);if(!root)return;
    let draft=normalizeConfig(JSON.parse(JSON.stringify(blockConfig)));
    const clockLabel=m=>fmtClock(m);
    const options=(from,to,current)=>{let s='';for(let m=from;m<=to;m+=30)s+=`<option value="${m}" ${m===current?'selected':''}>${clockLabel(m)}</option>`;return s};
    const draw=()=>{
      const infos=blockInfos(draft);
      root.innerHTML=`<div class="wabi-block-settings-intro"><strong>Personaliza tus bloques según tu ritmo.</strong><br>El día siempre va de 12:00 a. m. a 12:00 a. m. Los límites de los bloques avanzan cada 30 minutos y nunca cambian la hora de tus actividades existentes.</div><div class="wabi-block-settings-list">${infos.map((b,i)=>{const last=i===infos.length-1;const min=b.startAbs+30,max=1440-(infos.length-i-1)*30;return `<div class="wabi-block-setting" data-block-row="${i}"><span class="wabi-block-key">${b.key}</span><input class="wabi-block-name" data-block-name="${i}" value="${esc(b.name)}" maxlength="28"><div class="wabi-block-range-edit"><span>${clockLabel(b.startAbs)}</span><span>→</span>${last?`<strong>${clockLabel(1440)}</strong>`:`<select data-block-end="${i}">${options(min,max,b.endAbs)}</select>`}</div><button class="wabi-block-remove" data-block-remove="${i}" ${infos.length<=2?'disabled':''} aria-label="Eliminar bloque"><i class="fa-solid fa-minus"></i></button></div>`}).join('')}</div><div class="wabi-block-settings-actions"><button class="wabi-btn" id="wabi-reset-blocks"><i class="fa-solid fa-arrow-rotate-left"></i> Restablecer</button><button class="wabi-btn" id="wabi-add-block" ${infos.length>=6?'disabled':''}><i class="fa-solid fa-plus"></i> Añadir bloque</button><button class="wabi-btn primary" id="wabi-save-blocks">Guardar bloques</button></div>`;
      $$('[data-block-name]',root).forEach(x=>x.oninput=e=>{draft.blocks[Number(x.dataset.blockName)].name=e.target.value});
      $$('[data-block-end]',root).forEach(x=>x.onchange=e=>{const i=Number(x.dataset.blockEnd),val=Number(e.target.value);draft.blocks[i].end=val;for(let j=i+1;j<draft.blocks.length-1;j++)if(draft.blocks[j].end<=draft.blocks[j-1].end)draft.blocks[j].end=draft.blocks[j-1].end+30;draft=normalizeConfig(draft);draw()});
      $$('[data-block-remove]',root).forEach(x=>x.onclick=()=>{if(draft.blocks.length<=2)return;draft.blocks.splice(Number(x.dataset.blockRemove),1);draft.blocks.forEach((b,i)=>b.key=BLOCK_KEYS[i]);draft.blocks.at(-1).end=1440;draft=normalizeConfig(draft);draw()});
      $('#wabi-add-block',root).onclick=()=>{if(draft.blocks.length>=6)return;const oldLast=draft.blocks.at(-1),prevStart=draft.blocks.length===1?0:draft.blocks.at(-2).end;let split=Math.round(((prevStart+1440)/2)/30)*30;split=Math.max(prevStart+30,Math.min(1410,split));oldLast.end=split;draft.blocks.push({key:BLOCK_KEYS[draft.blocks.length],name:`Bloque ${BLOCK_KEYS[draft.blocks.length]}`,end:1440});draft=normalizeConfig(draft);draw()};
      $('#wabi-reset-blocks',root).onclick=()=>{draft=defaultBlockConfig();saveBlockConfig(draft);renderSurface();syncShell();W.emit('tasks-changed');W.toast('Bloques restablecidos');paintPlanning(scrim,btn)};
      $('#wabi-save-blocks',root).onclick=()=>{draft.blocks.forEach((b,i)=>{const inp=$(`[data-block-name="${i}"]`,root);if(inp)b.name=inp.value.trim()||`Bloque ${BLOCK_KEYS[i]}`});saveBlockConfig(draft);renderSurface();syncShell();W.emit('tasks-changed');W.toast('Bloques actualizados');paintPlanning(scrim,btn)};
    };draw();
  }


  const settingsObserver=new MutationObserver(()=>enhanceSettings());settingsObserver.observe(document.body,{subtree:true,childList:true});
  document.addEventListener('click',e=>{if(e.target.closest('#sp-save'))setTimeout(()=>{syncShell();rebuildShell()},80)});

  /* ───────── events / theme ───────── */
  W.on?.('theme',()=>{setTimeout(()=>{syncShell();renderSurface()},0)});
  W.on?.('tasks-changed',()=>setTimeout(()=>{if(W.state.view==='board'||W.state.view==='month')renderSurface()},0));

  rebuildShell();
  renderSurface();
  normalizeBrandText();
});
})();
