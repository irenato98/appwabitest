
(function(){
'use strict';
const W=window.wabi;const FLOW_KEY='wabi.onboarding.flow.v3.completed',SESSION_KEY='wabi.beta.session',PROFILE_KEY='wabi.beta.profile',INTEGRATIONS_KEY='wabi.beta.integrations',TOUR_KEY='wabi.postonboarding.text.v2.completed';
const $=(q,r=document)=>r.querySelector(q),$$=(q,r=document)=>[...r.querySelectorAll(q)];
const readJSON=(k,f)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):f}catch{return f}},writeJSON=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const integrationLogo=k=>({
 google:'<b style="font:800 18px Arial;color:#4285f4">G</b>',
 outlook:'<svg class="wabi-brand-svg" viewBox="0 0 32 32" aria-hidden="true"><rect x="10" y="5" width="19" height="22" rx="2.6" fill="#0078D4"/><path d="M10 10.2 19.5 17 29 10.2V25a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2Z" fill="#28A8EA"/><path d="m10 10.2 9.5 7 9.5-7" fill="none" stroke="#fff" stroke-opacity=".72" stroke-width="1.2"/><rect x="2.5" y="7" width="15" height="19" rx="2.4" fill="#106EBE"/><text x="10" y="20.2" text-anchor="middle" font-family="Arial,sans-serif" font-size="10.8" font-weight="700" fill="white">O</text></svg>',
 icloud:'<i class="fa-brands fa-apple" style="font-size:20px"></i>',
 notion:'<svg class="wabi-brand-svg" viewBox="0 0 32 32" aria-hidden="true"><rect x="4.2" y="4.2" width="23.6" height="23.6" rx="2.8" fill="#fff" stroke="#111" stroke-width="1.8"/><path d="M9.1 23V9.4h4l7.7 9.4V11c0-.9-.4-1.2-1.5-1.4V8.5h5v1.1c-1 .2-1.4.6-1.4 1.4v12h-2.7l-8.9-10.8v8.2c0 .9.4 1.2 1.7 1.5V23Z" fill="#111"/></svg>'
})[k]||'';
const providerMark=p=>p==='Google'?'<b style="font:800 18px Arial;color:#4285f4">G</b>':p==='Microsoft'?integrationLogo('outlook'):'<i class="fa-brands fa-apple" style="font-size:20px"></i>';
let layer=document.getElementById('wabi-entry-onboarding');if(!layer){layer=document.createElement('div');layer.id='wabi-entry-onboarding';document.body.appendChild(layer)}
let step=0,authMode='register',provider='Google',slide=0,slideTimer=null,language='Español (Latinoamérica)';
const slides=[{"title": "Tu día en Bloques personalizables", "copy": "Organiza tu día a tu manera y dale una estructura clara a cada momento.", "kind": "single portrait", "imgs": ["assets/images/image-001.webp"]}, {"title": "Con o sin horario fijo. Tú decides.", "copy": "Mantén una actividad flexible cuando aún no sabes exactamente cuándo la harás, o asígnale una hora fija cuando necesites que ocurra en un momento específico.", "kind": "pair", "imgs": ["assets/images/image-002.webp", "assets/images/image-003.webp"]}, {"title": "Crea y prioriza en segundos con [wabi] IA.", "copy": "Dile qué tienes en mente y deja que [wabi] IA te ayude a convertirlo en actividades y priorizarlas según lo que más importa para ti.", "kind": "single wide", "imgs": ["assets/images/image-004.webp"]}, {"title": "Tiempo estimado vs. tiempo real", "copy": "Compara el tiempo planeado de una actividad con lo que realmente tardaste y conoce mejor tu ritmo para hacer estimaciones cada vez más precisas.", "kind": "pair stack", "imgs": ["assets/images/image-005.webp", "assets/images/image-006.webp"]}, {"title": "Una actividad. Nada más.", "copy": "Inicia una actividad y entra en Modo Foco para avanzar con timer, notas y subtareas, sin que el resto de tu calendario compita por tu atención.", "kind": "single wide", "imgs": ["assets/images/image-007.webp"]}];
const LEGAL_URLS=Object.freeze({
 'Términos y Condiciones':'https://docs.google.com/document/d/1fFzv59NSgg1HnNvDMaqyS4yOyYCfxL5Cy7lo7W0lQVs/edit?usp=sharing',
 'Política de Privacidad':'https://docs.google.com/document/d/1MxhfZKWEBpt445MhqjixOfi6VWXJdWoUk7kRBXtzBTs/edit?usp=sharing',
 'Libro de Reclamaciones':'https://docs.google.com/forms/d/e/1FAIpQLSf2E6NCmYtMidP5NM6afvBZQeriTf5Sa5Q0Fj_Cl9Vt1psazQ/viewform?usp=sharing&ouid=101106306893361154467'
});
const safeLink=(label)=>`<a class="wabi-legal-link" data-legal-link href="${LEGAL_URLS[label]}" target="_blank" rel="noopener noreferrer">${label}</a>`;
function mediaHTML(x){const cls=x.kind||'single';return `<div class="${cls}">${x.imgs.map((src,i)=>`<img src="${src}" alt="Captura real de [wabi]" class="${cls.includes('portrait')?'portrait':cls.includes('wide')?'wide':''}">`).join('')}</div>`}
function carousel(){
 const slidesHTML=slides.map((x,i)=>`<div class="wabi-slide-v2 ${i===slide?'on':''}" data-slide="${i}"><div class="wabi-slide-copy-v2"><h2>${x.title}</h2><p>${x.copy}</p></div><div class="wabi-slide-media-v2">${mediaHTML(x)}</div></div>`).join('');
 const dots=slides.map((_,i)=>`<button class="${i===slide?'on':''}" data-carousel-dot="${i}" aria-label="Ver función ${i+1}"></button>`).join('');
 return `<div class="wabi-carousel-v2">${slidesHTML}<div class="wabi-carousel-dots-v2">${dots}</div></div>`;
}
function startCarousel(){clearInterval(slideTimer);slideTimer=setInterval(()=>{if(step!==0)return;slide=(slide+1)%slides.length;render()},6000)}
function showPostTour(){
 if(localStorage.getItem(TOUR_KEY)==='1')return;
 const steps=[
  ['Dos formas de organizar tu tiempo','Crea una actividad con tiempo estimado para mantenerla flexible, o asígnale una hora fija cuando ya sepas exactamente cuándo ocurrirá.',''],
  ['Tu planificación en Día, Semana y Mes','Cambia de vista cuando quieras: enfócate en tu día, organiza tu semana o mira el mes completo sin perder el contexto de tus actividades.',''],
  ['Arrastra y reorganiza','Mueve tus actividades directamente en el calendario para cambiar su hora o su día sin tener que editarlas una por una.','* Solo aplica a actividades flexibles.'],
  ['Bienvenido/a a [wabi]','Ya tienes lo esencial. Empieza a organizar tu tiempo a tu ritmo y ajusta tu planificación a medida que tu día cambia.','']
 ];
 let i=0;const ov=document.createElement('div');ov.className='wabi-post-tour on';document.body.appendChild(ov);
 const paint=()=>{const s=steps[i];ov.innerHTML=`<div class="wabi-post-tour-card"><div class="wabi-post-tour-step">${i+1} de ${steps.length}</div><h2>${s[0]}</h2><p>${s[1]}</p>${s[2]?`<p class="wabi-post-tour-note">${s[2]}</p>`:''}<div class="wabi-post-tour-actions"><button class="back" data-tour-back ${i===0?'style="visibility:hidden"':''}>Anterior</button><div class="wabi-post-tour-dots">${steps.map((_,n)=>`<i class="${n===i?'on':''}"></i>`).join('')}</div><button class="next" data-tour-next>${i===steps.length-1?'Empezar':'Siguiente'}</button></div></div>`;$('[data-tour-back]',ov).onclick=()=>{if(i>0){i--;paint()}};$('[data-tour-next]',ov).onclick=()=>{if(i<steps.length-1){i++;paint();return}localStorage.setItem(TOUR_KEY,'1');ov.remove()}};paint();
}
function finish(){
 clearInterval(slideTimer);const now=Date.now(),sess=readJSON(SESSION_KEY,{}),p=readJSON(PROFILE_KEY,{});
 writeJSON(SESSION_KEY,{...sess,provider,createdAt:sess.createdAt||now});writeJSON(PROFILE_KEY,{...p,provider,createdAt:p.createdAt||sess.createdAt||now});
 try{localStorage.setItem(FLOW_KEY,'1');localStorage.setItem('wabi.onboarded','1')}catch{}
 layer.classList.remove('is-visible');document.body.classList.remove('wabi-entry-active');W?.emit?.('tasks-changed');setTimeout(showPostTour,180);
}
function bindLegalAndLanguage(){
 const trg=$('[data-language-trigger]',layer),menu=$('[data-language-menu]',layer);if(trg&&menu){trg.onclick=e=>{e.stopPropagation();menu.classList.toggle('on')};$$('[data-language-choice]',menu).forEach(b=>b.onclick=()=>{menu.classList.remove('on');if(b.dataset.languageChoice==='English')return;language='Español (Latinoamérica)';render()})}
}
function render(){
 clearInterval(slideTimer);
 if(step===0){
  const login=authMode==='login';
  layer.innerHTML=`<div class="wabi-entry-shell-v2"><section class="wabi-entry-left-v2"><div class="wabi-entry-top-v2"><div class="wabi-entry-beta-v2">Creado por neurodivergentes para neurodivergentes</div><div class="wabi-entry-brand-v2"><div class="wabi-entry-wordmark-v2"><span>[</span>wabi<span>]</span></div></div></div><div class="wabi-entry-main-v2"><h1>${login?'Inicia sesión':'Regístrate'}</h1><div class="wabi-entry-sub-v2">${login?'Qué bueno verte de nuevo.':'Empieza a planificar tu vida desde tu realidad.'}</div><div class="wabi-entry-providers-v2">${['Google','Microsoft','Apple'].map(p=>`<button class="wabi-entry-provider-v2" data-entry-provider="${p}"><span class="mark">${providerMark(p)}</span><span>${login?'Iniciar sesión':'Continuar'} con ${p}</span><span></span></button>`).join('')}</div></div><div class="wabi-entry-meta-v2"><div class="wabi-entry-existing-v2">${login?'¿Aún no tienes una cuenta?':'¿Ya tienes una cuenta?'} <button data-entry-toggle>${login?'Regístrate':'Inicia sesión'}</button></div><div class="wabi-entry-legal-v2">Al registrarte, aceptas nuestros ${safeLink('Términos y Condiciones')} y ${safeLink('Política de Privacidad')}. También puedes acceder a nuestro ${safeLink('Libro de Reclamaciones')}.</div><div class="wabi-entry-language-v2"><button type="button" class="wabi-language-trigger" data-language-trigger><i class="fa-solid fa-globe"></i> Idioma: ${language} <i class="fa-solid fa-chevron-up" style="font-size:7px"></i></button><div class="wabi-language-menu" data-language-menu><button class="${language==='Español (Latinoamérica)'?'is-selected':''}" data-language-choice="Español (Latinoamérica)">Español (Latinoamérica)</button><button class="" data-language-choice="English">English</button></div></div></div><div class="wabi-institution-v2"><div class="wabi-institution-copy-v2"><strong>Ganadores de StartUp Perú 12G</strong><span>Proyecto cofinanciado por ProInnóvate del Ministerio de la Producción</span><div class="wabi-institution-logos-v2"><img src="assets/images/image-008.png" alt="Ministerio de la Producción"><img class="startup" src="assets/images/image-009.png" alt="StartUp Perú"><img class="pro" src="assets/images/image-010.png" alt="ProInnóvate"></div></div></div></section><section class="wabi-entry-visual-v2">${carousel()}</section></div>`;
  $$('[data-entry-provider]',layer).forEach(b=>b.onclick=()=>{provider=b.dataset.entryProvider;if(login)finish();else{step=1;render()}});
  $('[data-entry-toggle]',layer).onclick=()=>{authMode=login?'register':'login';render()};
  $$('[data-carousel-dot]',layer).forEach(b=>b.onclick=()=>{slide=Number(b.dataset.carouselDot);render()});bindLegalAndLanguage();startCarousel();return;
 }
 const ints=readJSON(INTEGRATIONS_KEY,{}),items=[['Google Calendar','google','Eventos y calendarios de Google'],['Microsoft Outlook','outlook','Calendarios de Microsoft'],['iCloud Calendar','icloud','Calendarios de Apple / iCloud'],['Notion','notion','Bases de datos con tareas y fechas']];
 layer.innerHTML=`<div class="wabi-onb-card-v2"><div class="wabi-onb-title-v2">Trae lo que ya tienes.</div><div class="wabi-onb-copy-v2">Conecta calendarios o Notion para empezar con tu información en lugar de organizar todo desde cero.</div><div class="wabi-onb-integrations-v2">${items.map(([name,k,d])=>`<div class="wabi-onb-integration-v2"><span class="brand">${integrationLogo(k)}</span><span><strong>${name}</strong><small>${d}</small></span><button class="${ints[name]?'connected':''}" data-entry-connect="${name}">${ints[name]?'Desconectar':'Conectar'}</button></div>`).join('')}</div><button class="wabi-onb-primary-v2" data-entry-finish>Entrar a [wabi]</button><button class="wabi-onb-secondary-v2" data-entry-skip>Ahora no</button></div>`;
 $$('[data-entry-connect]',layer).forEach(b=>b.onclick=()=>{const x=readJSON(INTEGRATIONS_KEY,{});x[b.dataset.entryConnect]=!x[b.dataset.entryConnect];writeJSON(INTEGRATIONS_KEY,x);render()});
 $('[data-entry-finish]',layer).onclick=$('[data-entry-skip]',layer).onclick=finish;
}
window.__wabiEntryOpen=function(mode='register'){authMode=mode;step=0;slide=0;document.body.classList.add('wabi-entry-active');layer.classList.add('is-visible');render()};
function enforceNormal(){if(W?.state)W.state.mode='normal';$$('[data-wabi-mode],[data-mood-btn]').forEach(b=>{const m=b.dataset.wabiMode||b.dataset.moodBtn;b.setAttribute('aria-disabled','true');b.setAttribute('aria-pressed',String(m==='normal'));if(m!=='normal')b.tabIndex=-1;b.removeAttribute('title')})}
new MutationObserver(enforceNormal).observe(document.body,{subtree:true,childList:true});enforceNormal();
const hasSession=!!readJSON(SESSION_KEY,null);let done=false;try{done=localStorage.getItem(FLOW_KEY)==='1'}catch{}
window.__wabiPostTourOpen=function(){try{localStorage.removeItem(TOUR_KEY)}catch{}showPostTour()};
if(!hasSession||!done)window.__wabiEntryOpen('register');else{let toured=false;try{toured=localStorage.getItem(TOUR_KEY)==='1'}catch{}if(!toured)setTimeout(showPostTour,320)}
})();
