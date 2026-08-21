/* ═══════════════════════════════════════════════════════════════
   WABI beta product layer · frontend-only scaffolding
   Auth / profile / trial / integrations are local mock flows until backend.
   Planning, capacity, fixed activities, reminders & drag-drop work locally.
   ═══════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const W = window.wabi;
if(!W) return;

/* Prevent the legacy tour from auto-opening; it remains available from Ayuda/Tour. */
W.isOnboarded = () => true;

/* ---------- configuration ---------- */
W.PRESETS = window.WABI_PRODUCT_CONFIG.flexPresetMinutes.map(m=>({v:`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`,l:m>=60?(m%60?`${Math.floor(m/60)} h ${m%60}`:`${m/60} h`):`${m} min`}));
const STORE = {
  session:'wabi.beta.session', profile:'wabi.beta.profile', invite:'wabi.beta.invite',
  integrations:'wabi.beta.integrations', prefs:'wabi.beta.prefs'
};
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const readJSON=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback}};
const writeJSON=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const minsFromPlanned=(v)=>{
  if(!v) return 30;
  const p=String(v).split(':').map(Number); return Math.max(0,(p[0]||0)*60+(p[1]||0));
};
const plannedFromMins=(m)=>`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;
const fmtDur=(m)=>m>=60?(m%60?`${Math.floor(m/60)} h ${m%60} min`:`${m/60} h`):`${m} min`;
const fmtClock=(m)=>{
  m=((m%1440)+1440)%1440; const h=Math.floor(m/60), mm=m%60;
  const hh=h%12||12; return `${hh}:${String(mm).padStart(2,'0')} ${h<12?'a. m.':'p. m.'}`;
};
const blockInfo=(key)=>{
  const b=W.BLOCKS.find(x=>x.key===key)||W.BLOCKS[0];
  const start=b.startHour*60;
  let end;
  if(key==='A')end=12*60; else if(key==='B')end=18*60; else if(key==='C')end=23*60; else end=30*60;
  return {...b,start,end,total:end-start};
};
const absTimeInBlock=(time,block)=>{
  if(!time) return blockInfo(block).start;
  const [h,m]=time.split(':').map(Number); let x=h*60+(m||0);
  const bi=blockInfo(block); if(block==='D' && x<6*60) x+=1440;
  return x;
};
const timeStringFromAbs=(m)=>{m=((m%1440)+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`};

/* ---------- task normalization ---------- */
W.normalizeBetaTasks=function(){
  Object.values(W.tasks||{}).forEach(list=>list.forEach(t=>{
    if(typeof t.fixed!=='boolean') t.fixed=false;
    if(!Array.isArray(t.reminders)) t.reminders=[10];
    if(t.fixed && !t.startTime){const bi=blockInfo(t.block||'A');t.startTime=timeStringFromAbs(bi.start);}
    if(typeof t.externalEvent!=='boolean')t.externalEvent=false;
  }));
  W.saveState();
};

/* Guard edits so fixed times and duration changes never create impossible blocks. */
const baseUpdateTask=W.updateTask.bind(W);
W.updateTask=function(key,idx,patch){
  const t=W.tasksFor(key)[idx]; if(!t)return false;
  const next=Object.assign({},t,patch);
  if(next.fixed && patch.block && patch.block!==(t.block||'A') && !patch.startTime){
    const slot=W.findEarliestFixedSlot?W.findEarliestFixedSlot(key,patch.block,minsFromPlanned(next.planned),t.id):null;
    if(!slot){W.toast('No hay un horario continuo disponible en ese bloque');return false}
    next.startTime=slot; patch=Object.assign({},patch,{startTime:slot});
  }
  if(W.scheduleBlock && (patch.block!==undefined||patch.planned!==undefined||patch.startTime!==undefined||patch.fixed!==undefined)){
    const block=next.block||'A';
    const arr=W.tasksFor(key).map(x=>x.id===t.id?next:x);
    const test=W.scheduleBlock(key,block,{tasks:arr,mode:'normal'});
    if(!test.valid){W.toast('Ese cambio no cabe en el bloque');return false}
  }
  baseUpdateTask(key,idx,patch);return true;
};

/* Legacy bootstrap scheduler removed: the authoritative clock scheduler below is the only implementation used by the active app. */

/* ---------- account state helpers ---------- */
function session(){return readJSON(STORE.session,null)}
function profile(){return readJSON(STORE.profile,{name:'',provider:''})}
function initials(name){return (name||'W').trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'W'}

/* ---------- account button ---------- */
function refreshAccountUI(){
  let b=$('#wabi-account-btn');
  if(!b){b=document.createElement('button');b.id='wabi-account-btn';b.className='wabi-account-btn';b.title='Cuenta';$('.titlebar-right')?.appendChild(b);b.onclick=()=>openSettings('profile');}
  b.textContent=initials(profile().name);
}

/* Legacy create/board/detail UI removed. The active internal-view implementation below is authoritative. */

/* ---------- reminder delivery ----------
   The old one-minute polling implementation was intentionally removed.
   The final stability layer owns one reminder scheduler for the whole app,
   so Create/Edit/Focus/Settings never compete with separate timers. */

/* ---------- settings / profile ---------- */
const settingsScrim=document.createElement('div');settingsScrim.className='wabi-settings-scrim';settingsScrim.id='wabi-settings';document.body.appendChild(settingsScrim);
let settingsTab='profile';
function settingsTabs(){return [['profile','Perfil'],['plan','Plan'],['integrations','Integraciones'],['preferences','Preferencias'],['privacy','Privacidad y datos']].map(([k,l])=>`<button class="wabi-settings-tab ${settingsTab===k?'on':''}" data-stab="${k}">${l}</button>`).join('')}
function openSettings(tab='profile'){settingsTab=tab;settingsScrim.classList.add('on');paintSettings()}
function closeSettings(){settingsScrim.classList.remove('on')}
function paintSettings(){
  const p=profile();
  settingsScrim.innerHTML=`<div class="wabi-settings"><aside class="wabi-settings-nav"><div class="wabi-settings-person"><div class="wabi-settings-avatar">${initials(p.name)}</div><strong>${W.esc(p.name||'Usuario Wabi')}</strong><small>${p.provider||'Cuenta beta'}</small></div>${settingsTabs()}<div class="wabi-settings-nav-bottom"><button class="wabi-settings-tab wabi-signout-danger" id="wabi-signout">Cerrar sesión</button></div></aside><main class="wabi-settings-main"><div class="wabi-settings-top"><h2>${({profile:'Perfil',plan:'Plan',integrations:'Integraciones',preferences:'Preferencias',privacy:'Privacidad y datos'})[settingsTab]}</h2><button class="wabi-close" id="wabi-settings-close">×</button></div><div class="wabi-settings-section" id="wabi-settings-content"></div></main></div>`;
  $('#wabi-settings-close',settingsScrim).onclick=closeSettings;settingsScrim.onclick=e=>{if(e.target===settingsScrim)closeSettings()};
  $$('[data-stab]',settingsScrim).forEach(b=>b.onclick=()=>{settingsTab=b.dataset.stab;paintSettings()});
  $('#wabi-signout',settingsScrim).onclick=()=>{localStorage.removeItem(STORE.session);localStorage.removeItem('wabi.onboarding.flow.v3.completed');localStorage.removeItem('wabi.onboarded');closeSettings();window.__wabiEntryOpen?.('register')};
  renderSettingsContent();
}
function renderSettingsContent(){
  const root=$('#wabi-settings-content'),p=profile();if(!root)return;
  if(settingsTab==='profile'){
    root.innerHTML=`<div class="wabi-settings-group"><h3>Identidad</h3><div class="wabi-settings-row"><div><strong>Nombre</strong><small>Así te llamará Wabi.</small></div><input class="wabi-input" id="sp-name" style="width:220px" value="${W.esc(p.name||'')}"></div><div class="wabi-settings-row"><div><strong>Inicio de sesión</strong><small>Proveedor conectado.</small></div><strong>${p.provider||'Beta local'}</strong></div></div><button class="wabi-btn primary" id="sp-save">Guardar cambios</button>`;
    $('#sp-save',root).onclick=()=>{writeJSON(STORE.profile,{...p,name:$('#sp-name',root).value.trim()||p.name});refreshAccountUI();paintSettings();W.toast('Perfil actualizado')};
  }
  if(settingsTab==='plan'){
    root.innerHTML=`<div class="wabi-plan-card"><div class="wabi-plan-badge">Beta privada gratuita</div><div class="wabi-plan-title">[wabi] es gratis para ti por ser tester fundador</div><div class="wabi-plan-copy">Durante la beta privada puedes usar [wabi] sin costo. Cuando lancemos el plan mensual, quienes hayan participado como testers fundadores tendrán un precio especial durante un periodo definido. Te avisaremos el precio, la duración de ese beneficio y las condiciones antes de cualquier cobro.</div></div>`;
  }
  if(settingsTab==='integrations'){
    const ints=readJSON(STORE.integrations,{});
    const services=[
      ['Google Calendar','google','Eventos y calendarios de Google'],
      ['Microsoft Outlook','outlook','Calendarios de Microsoft'],
      ['iCloud Calendar','icloud','Calendarios de Apple / iCloud'],
      ['Notion','notion','Bases de datos con tareas y fechas']
    ];
    const integrationLogo=kind=>({
      google:'<i class="fa-brands fa-google"></i>',
      outlook:'<svg class="wabi-brand-svg" viewBox="0 0 32 32" aria-hidden="true"><rect x="10" y="5" width="19" height="22" rx="2.6" fill="#0078D4"/><path d="M10 10.2 19.5 17 29 10.2V25a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2Z" fill="#28A8EA"/><path d="m10 10.2 9.5 7 9.5-7" fill="none" stroke="#fff" stroke-opacity=".72" stroke-width="1.2"/><rect x="2.5" y="7" width="15" height="19" rx="2.4" fill="#106EBE"/><text x="10" y="20.2" text-anchor="middle" font-family="Arial, sans-serif" font-size="10.8" font-weight="700" fill="white">O</text></svg>',
      icloud:'<i class="fa-brands fa-apple"></i>',
      notion:'<svg class="wabi-brand-svg" viewBox="0 0 32 32" aria-hidden="true"><rect x="4.2" y="4.2" width="23.6" height="23.6" rx="2.8" fill="#fff" stroke="#111" stroke-width="1.8"/><path d="M9.1 23V9.4h4l7.7 9.4V11c0-.9-.4-1.2-1.5-1.4V8.5h5v1.1c-1 .2-1.4.6-1.4 1.4v12h-2.7l-8.9-10.8v8.2c0 .9.4 1.2 1.7 1.5V23Z" fill="#111"/></svg>'
    })[kind]||'';
    root.innerHTML=`<div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:14px">Conecta tus servicios o importa un archivo .ics exportado desde otras apps de calendario.</div>${services.map(([n,icon,d])=>`<div class="wabi-integration"><div class="wabi-integration-icon wabi-integration-logo">${integrationLogo(icon)}</div><div><strong>${n}</strong><small>${d}</small></div><div>${ints[n]?'<span class="wabi-status">Conectado</span>':''}<button class="wabi-btn ${ints[n]?'danger':''}" data-int="${n}">${ints[n]?'Desconectar':'Conectar'}</button></div></div>`).join('')}<div class="wabi-integration"><div class="wabi-integration-icon wabi-ics-logo"><i class="fa-regular fa-calendar"></i></div><div><strong>Importar calendario (.ics)</strong><small>Lee eventos con título, fecha y horario de archivos .ics exportados por calendarios compatibles.</small></div><div><input type="file" id="ics-file" accept=".ics,text/calendar" hidden><button class="wabi-btn" id="ics-open">Importar .ics</button></div></div>`;
    $$('[data-int]',root).forEach(b=>b.onclick=()=>{const x=readJSON(STORE.integrations,{});x[b.dataset.int]=!x[b.dataset.int];writeJSON(STORE.integrations,x);renderSettingsContent()});
    $('#ics-open',root).onclick=()=>$('#ics-file',root).click();$('#ics-file',root).onchange=e=>importICS(e.target.files?.[0]);
  }
  if(settingsTab==='preferences'){
    const prefs=readJSON(STORE.prefs,{notifications:false,sound:true,soundProfile:'soft',focusSound:true,completeSound:false,deleteSound:true,language:'es-419'});
    prefs.language='es-419';
    let notificationConsent=false;try{notificationConsent=localStorage.getItem('wabi.notifications.consent.v1')==='1'}catch{}
    prefs.notifications=notificationConsent&&prefs.notifications===true;
    if(typeof prefs.sound!=='boolean')prefs.sound=true;
    if(!['soft','clear'].includes(prefs.soundProfile))prefs.soundProfile='soft';
    if(typeof prefs.focusSound!=='boolean')prefs.focusSound=true;
    if(typeof prefs.completeSound!=='boolean')prefs.completeSound=false;
    if(typeof prefs.deleteSound!=='boolean')prefs.deleteSound=true;
    const perm=typeof window.wabiNotificationStatusText==='function'?window.wabiNotificationStatusText(prefs):(('Notification'in window)?Notification.permission:'no disponible');
    root.innerHTML=`<div class="wabi-settings-group"><h3>Notificaciones</h3>
      <div class="wabi-settings-row"><div><strong>Notificaciones del sistema</strong><small>${perm}. Actívalas para recibir recordatorios cuando estés en otra pestaña o ventana.</small></div><button class="wabi-toggle ${prefs.notifications?'on':''}" data-pref-native-notifications></button></div>
      <div class="wabi-settings-row"><div><strong>Sonido de recordatorios</strong><small>Suena mientras [wabi] está abierta y el navegador permite audio.</small></div><button class="wabi-toggle ${prefs.sound?'on':''}" data-pref-toggle="sound"></button></div>
      <div class="wabi-settings-row"><div><strong>Sonido al llegar al tiempo estimado</strong><small>Aviso suave dentro de Modo Foco.</small></div><button class="wabi-toggle ${prefs.focusSound?'on':''}" data-pref-toggle="focusSound"></button></div>
      <div class="wabi-settings-row"><div><strong>Sonido al completar</strong><small>Confirmación breve al marcar una actividad como hecha.</small></div><button class="wabi-toggle ${prefs.completeSound?'on':''}" data-pref-toggle="completeSound"></button></div>
      <div class="wabi-settings-row"><div><strong>Sonido al eliminar</strong><small>Confirmación breve al eliminar una actividad, también al soltarla en la zona de eliminar.</small></div><button class="wabi-toggle ${prefs.deleteSound?'on':''}" data-pref-toggle="deleteSound"></button></div>
      <div class="wabi-settings-row"><div><strong>Tono</strong><small>Elige un tono discreto para los avisos de [wabi].</small></div><div class="wabi-sound-controls"><select class="wabi-select" data-sound-profile><option value="soft" ${prefs.soundProfile==='soft'?'selected':''}>Suave</option><option value="clear" ${prefs.soundProfile==='clear'?'selected':''}>Claro</option></select><button class="wabi-btn" type="button" data-sound-preview>Probar</button></div></div>
    </div>
    <div class="wabi-settings-group"><h3>Idioma</h3><div class="wabi-settings-row"><div><strong>Idioma de [wabi]</strong><small>Elige el idioma de la interfaz.</small></div><div class="wabi-language-seg"><button class="is-selected" type="button">Español (Latinoamérica)</button><button type="button" data-language-en>English</button></div></div></div>
    <div class="wabi-settings-help">Los recordatorios dentro de [wabi] funcionan mientras la app esté abierta. Para mostrarlos cuando estás usando otra pestaña o programa, el navegador necesita permiso de notificaciones. Con [wabi] cerrada, las notificaciones push se conectarán después al backend/service worker.</div>`;
    writeJSON(STORE.prefs,prefs);
    $('[data-pref-native-notifications]',root).onclick=async()=>{
      if(prefs.notifications){prefs.notifications=false;writeJSON(STORE.prefs,prefs);renderSettingsContent();return}
      const ok=typeof window.wabiRequestNotifications==='function'?await window.wabiRequestNotifications({source:'settings'}):false;
      prefs.notifications=!!ok;writeJSON(STORE.prefs,prefs);renderSettingsContent();
    };
    $$('[data-pref-toggle]',root).forEach(b=>b.onclick=()=>{const k=b.dataset.prefToggle;prefs[k]=!prefs[k];writeJSON(STORE.prefs,prefs);b.classList.toggle('on',prefs[k])});
    $('[data-sound-profile]',root).onchange=e=>{prefs.soundProfile=e.target.value;writeJSON(STORE.prefs,prefs);window.wabiSound?.('reminder',{force:true})};
    $('[data-sound-preview]',root).onclick=()=>window.wabiSound?.('reminder',{force:true});
    $('[data-language-en]',root).onclick=()=>{};
  }
  if(settingsTab==='privacy'){
    const code=randomDeleteCode();
    root.innerHTML=`<div class="wabi-settings-group"><h3>Tus datos</h3><div class="wabi-settings-row"><div><strong>Descargar mis datos</strong><small>Descarga una copia limpia de tus datos de [wabi] y un calendario .ics básico para poder llevar tus actividades a otra app.</small></div><button class="wabi-btn" id="export-data">Descargar</button></div></div><div class="wabi-danger-zone"><strong style="font-size:13px">Eliminar cuenta</strong><p style="font-size:11px;color:var(--text-muted);line-height:1.5;margin:6px 0 12px">Es una pena verte ir. Cuando exista backend, esta acción deberá borrar el perfil y los datos relacionados según las reglas de la base de datos. En esta beta local borra los datos de este navegador.</p><div style="font-size:11px;margin-bottom:6px">Para confirmar escribe <span class="wabi-delete-code">${code}</span></div><input class="wabi-input" id="delete-confirm" autocomplete="off" placeholder="Escribe exactamente el texto"><button class="wabi-btn danger" id="delete-account" style="margin-top:10px" disabled>Eliminar permanentemente</button></div>`;
    $('#export-data',root).onclick=exportData;const inp=$('#delete-confirm',root),del=$('#delete-account',root);inp.oninput=()=>del.disabled=inp.value!==code;del.onclick=()=>{if(inp.value!==code)return;Object.keys(localStorage).filter(k=>k.startsWith('wabi')).forEach(k=>localStorage.removeItem(k));location.reload()};
  }
}
function randomDeleteCode(){return [...'ELIMINAR'].map(c=>Math.random()>.5?c.toUpperCase():c.toLowerCase()).join('')}
function exportData(){
  const safeText=v=>String(v??'');
  const minsOf=v=>{const p=safeText(v).split(':').map(Number);return Math.max(30,(p[0]||0)*60+(p[1]||0))};
  const parseClock=v=>{const p=safeText(v).split(':').map(Number);return (p[0]||0)*60+(p[1]||0)};
  const pad=n=>String(n).padStart(2,'0');
  const ymd=(key,dayOffset=0)=>{const m=safeText(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3]+dayOffset);return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`};
  const icsEscape=s=>safeText(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const cleanActivities=[];const ics=[];
  Object.entries(W.tasks||{}).sort(([a],[b])=>a.localeCompare(b)).forEach(([day,list])=>{
    (list||[]).forEach((t,index)=>{
      let start=null;
      if(t.fixed&&t.startTime)start=parseClock(t.startTime);
      else if(Number.isFinite(Number(t.preferredStart)))start=Number(t.preferredStart);
      else try{start=W.scheduleBlock?.(day,t.block||W.BLOCKS?.[0]?.key,{mode:'normal'})?.placements?.get(t.id)?.start??null}catch{}
      const duration=minsOf(t.planned),end=start==null?null:start+duration;
      cleanActivities.push({
        title:safeText(t.title),date:day,start:start==null?null:`${pad(Math.floor((start%1440)/60))}:${pad(start%60)}`,
        end:end==null?null:`${pad(Math.floor((end%1440)/60))}:${pad(end%60)}`,durationMinutes:duration,
        planning:t.fixed?'fixed':'flexible',block:t.block||null,category:t.category||null,priority:t.priority||null,
        energy:t.type||'normal',repeat:t.repeat??'none',reminders:Array.isArray(t.reminders)?[...t.reminders]:[],notes:safeText(t.notes),
        subtasks:Array.isArray(t.subtasks)?t.subtasks.map(s=>({text:safeText(s.text||s.title),done:!!s.done})):[],done:!!t.done,
        estimatedMinutes:duration,actualSeconds:Number(t.timerSecs||0)
      });
      if(start==null)return;const ds=ymd(day,Math.floor(start/1440));const de=ymd(day,Math.floor(end/1440));if(!ds||!de)return;
      const sm=((start%1440)+1440)%1440,em=((end%1440)+1440)%1440;
      ics.push('BEGIN:VEVENT',`UID:wabi-${ds}-${index}-${Math.abs(safeText(t.title).split('').reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0,0))}@flowneuro.local`,`DTSTART:${ds}T${pad(Math.floor(sm/60))}${pad(sm%60)}00`,`DTEND:${de}T${pad(Math.floor(em/60))}${pad(em%60)}00`,`SUMMARY:${icsEscape(t.title||'Actividad')}`,'DESCRIPTION:Exportado desde [wabi]','END:VEVENT');
    });
  });
  const p=profile()||{},sess=session()||{},prefs=readJSON(STORE.prefs,{}),ints=readJSON(STORE.integrations,{});
  const account={name:p.name||null,email:p.email||null,provider:p.provider||sess.provider||null,createdAt:p.createdAt||sess.createdAt||null};
  const data={exportedAt:new Date().toISOString(),account,preferences:{language:prefs.language||'es-419',notifications:prefs.notifications!==false},integrations:Object.fromEntries(Object.entries(ints).map(([k,v])=>[k,!!v])),activities:cleanActivities};
  const json=JSON.stringify(data,null,2);const calendar=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Flow Neuro//wabi//ES','CALSCALE:GREGORIAN',...ics,'END:VCALENDAR',''].join('\r\n');
  const enc=new TextEncoder();
  const crcTable=(()=>{const a=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;a[n]=c>>>0}return a})();
  const crc32=u8=>{let c=0xffffffff;for(const b of u8)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0};
  const u16=n=>new Uint8Array([n&255,(n>>>8)&255]),u32=n=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);
  const cat=(...parts)=>{const len=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(len);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out};
  const files=[['mis-datos-wabi.json',enc.encode(json)],['calendario-wabi.ics',enc.encode(calendar)]];const locals=[],centrals=[];let offset=0;
  for(const [name,bytes] of files){const nb=enc.encode(name),crc=crc32(bytes);const local=cat(u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(bytes.length),u32(bytes.length),u16(nb.length),u16(0),nb,bytes);locals.push(local);const central=cat(u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(bytes.length),u32(bytes.length),u16(nb.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nb);centrals.push(central);offset+=local.length}
  const centralSize=centrals.reduce((n,p)=>n+p.length,0);const end=cat(u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralSize),u32(offset),u16(0));
  const blob=new Blob([...locals,...centrals,end],{type:'application/zip'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`wabi-mis-datos-${W.dateKey(new Date())}.zip`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);W.toast('Tus datos están listos');
}
function importICS(file){
  if(!file)return;
  const r=new FileReader();
  r.onload=()=>{try{
    const raw=String(r.result||'').replace(/\r\n[ \t]|\n[ \t]/g,'');
    const events=[...raw.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi)].map(m=>m[1]);
    let imported=0,skipped=0,duplicates=0;
    const unescapeICS=s=>String(s||'').replace(/\\n/gi,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\');
    const prop=(ev,name)=>{const line=ev.split(/\r?\n/).find(l=>l.toUpperCase().startsWith(name.toUpperCase()+':')||l.toUpperCase().startsWith(name.toUpperCase()+';'));if(!line)return null;const pos=line.indexOf(':');if(pos<0)return null;return {meta:line.slice(0,pos),value:line.slice(pos+1).trim()}};
    const metaParam=(p,name)=>{const m=String(p?.meta||'').match(new RegExp('(?:^|;)'+name+'=([^;:]+)','i'));return m?m[1].replace(/^"|"$/g,''):null};
    const zonedWallToDate=(parts,tz)=>{
      if(!tz)return new Date(parts.y,parts.mo-1,parts.d,parts.h,parts.mi,parts.s||0);
      try{
        let guess=Date.UTC(parts.y,parts.mo-1,parts.d,parts.h,parts.mi,parts.s||0);
        const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
        for(let i=0;i<3;i++){
          const vals=Object.fromEntries(fmt.formatToParts(new Date(guess)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
          const shown=Date.UTC(vals.year,vals.month-1,vals.day,vals.hour,vals.minute,vals.second||0);
          const desired=Date.UTC(parts.y,parts.mo-1,parts.d,parts.h,parts.mi,parts.s||0);
          const diff=desired-shown;if(Math.abs(diff)<1000)break;guess+=diff;
        }
        return new Date(guess);
      }catch{return new Date(parts.y,parts.mo-1,parts.d,parts.h,parts.mi,parts.s||0)}
    };
    const parseDate=p=>{
      if(!p)return null;const s=p.value||'';
      if(/^\d{8}$/.test(s))return {allDay:true,date:new Date(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8),0,0)};
      const m=s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);if(!m)return null;
      const parts={y:+m[1],mo:+m[2],d:+m[3],h:+m[4],mi:+m[5],s:+(m[6]||0)};
      const date=m[7]?new Date(Date.UTC(parts.y,parts.mo-1,parts.d,parts.h,parts.mi,parts.s)):zonedWallToDate(parts,metaParam(p,'TZID'));
      return {allDay:false,date};
    };
    const durationFromISO=s=>{const m=String(s||'').match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i);return m?((+m[1]||0)*1440+(+m[2]||0)*60+(+m[3]||0)):null};
    const repeatFromRRule=rr=>{
      if(!rr)return 'none';const v=String(rr.value||'').toUpperCase();
      const freq=(v.match(/(?:^|;)FREQ=([^;]+)/)||[])[1],byday=(v.match(/(?:^|;)BYDAY=([^;]+)/)||[])[1];
      if(freq==='DAILY')return 'daily';
      if(freq==='WEEKLY'&&byday&&new Set(byday.split(',')).size===5&&['MO','TU','WE','TH','FR'].every(x=>byday.split(',').includes(x)))return 'weekdays';
      if(freq==='WEEKLY'&&!byday)return 'weekly';
      if(freq==='MONTHLY')return 'monthly';
      return 'none';
    };
    const existingUids=new Set(Object.values(W.tasks||{}).flat().map(t=>t.externalUid).filter(Boolean));
    for(const ev of events){
      const uid=unescapeICS(prop(ev,'UID')?.value||'');if(uid&&existingUids.has(uid)){duplicates++;continue}
      const ps=prop(ev,'DTSTART'),pe=prop(ev,'DTEND'),pd=prop(ev,'DURATION'),pt=prop(ev,'SUMMARY'),rr=prop(ev,'RRULE'),st=parseDate(ps);
      if(!st||st.allDay){skipped++;continue}
      let en=parseDate(pe),dur=pd?durationFromISO(pd.value):null;if(en?.date)dur=Math.round((en.date-st.date)/60000);if(!Number.isFinite(dur)||dur<=0)dur=60;dur=Math.max(30,Math.round(dur/15)*15);
      const key=W.dateKey(st.date),startM=st.date.getHours()*60+st.date.getMinutes(),title=unescapeICS(pt?.value)||'Evento importado',h=st.date.getHours(),block=W.hourBlock(h);
      const payload={id:typeof nextId==='function'?nextId():`ics-${Date.now()}-${imported}`,title,block,planned:plannedFromMins(dur),fixed:true,startTime:`${String(h).padStart(2,'0')}:${String(st.date.getMinutes()).padStart(2,'0')}`,endTime:`${String(Math.floor(((startM+dur)%1440)/60)).padStart(2,'0')}:${String((startM+dur)%60).padStart(2,'0')}`,externalEvent:true,externalUid:uid||null,type:null,category:null,priority:null,reminders:[],repeat:repeatFromRRule(rr),recurrenceStart:key,done:false,subtasks:[],actual:'0:00:00',timerSecs:0,timerRunning:false};
      const test=W.canPlaceTask?.(payload,key,block,null);if(test&&test.valid===false){skipped++;continue}W.addTask(key,payload);if(uid)existingUids.add(uid);imported++;
    }
    W.emit('tasks-changed');const extras=[skipped?`${skipped} omitido${skipped===1?'':'s'}`:'',duplicates?`${duplicates} duplicado${duplicates===1?'':'s'}`:''].filter(Boolean).join(' · ');W.toast(`${imported} evento${imported===1?'':'s'} importado${imported===1?'':'s'}${extras?' · '+extras:''}`);renderSettingsContent();
  }catch(err){console.error('[wabi] import .ics',err);W.toast('No pudimos leer ese archivo .ics')}
  };
  r.readAsText(file);
}

/* ---------- account nav item in sidebar ---------- */
function injectAccountNav(){const foot=$('.sidebar-footer');if(foot&&!$('[data-action="open-account"]',foot)){const b=document.createElement('button');b.className='nav-item';b.dataset.action='open-account';b.innerHTML='<span class="nav-icon">◉</span><span class="nav-label">Cuenta y ajustes</span>';foot.insertBefore(b,foot.firstChild);b.onclick=()=>openSettings('profile')}}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded',()=>{
  W.normalizeBetaTasks();refreshAccountUI();injectAccountNav();
  setTimeout(()=>{if(W.state.view==='board')W.board.render()},50);
});

/* expose small helpers for future backend wiring */
W.beta={openSettings,blockInfo,scheduleBlock:W.scheduleBlock};
})();
