(function(){
  const W=window.wabi;
  if(!W||!W.state)return;

  /* Keep all existing activity energy data, but make the calendar operate only
     from its Normal baseline until Relax/Intense are re-enabled later. */
  W.state.mode='normal';

  if(!W.__normalOnlySavePatched && typeof W.saveState==='function'){
    const originalSave=W.saveState.bind(W);
    W.saveState=function(){W.state.mode='normal';return originalSave();};
    W.__normalOnlySavePatched=true;
  }

  W.applyMode=function(taskList){return [...(taskList||[])];};

  if(!W.__normalOnlySchedulePatched && typeof W.scheduleBlock==='function'){
    const normalSchedule=W.scheduleBlock.bind(W);
    W.scheduleBlock=function(dayKey,blockKey,opts={}){
      return normalSchedule(dayKey,blockKey,Object.assign({},opts,{mode:'normal'}));
    };
    W.__normalOnlySchedulePatched=true;
    if(W.beta)W.beta.scheduleBlock=W.scheduleBlock;
  }

  function lockModeUI(){
    const buttons=[...document.querySelectorAll('[data-mood-btn]')];
    if(buttons.length){
      const seg=buttons[0].parentElement;
      if(seg)seg.classList.add('wabi-modes-disabled');
      buttons.forEach(btn=>{
        btn.disabled=true;
        btn.setAttribute('aria-disabled','true');
        btn.setAttribute('aria-pressed',String(btn.dataset.moodBtn==='normal'));
        btn.removeAttribute('title');
      });
    }
    const mobile=document.getElementById('mode-pill');
    if(mobile){
      mobile.disabled=true;
      mobile.classList.add('wabi-mode-disabled');
      mobile.dataset.mode='normal';
      mobile.setAttribute('aria-disabled','true');
      const label=mobile.querySelector('.mode-label');if(label)label.textContent='Normal';
    }
  }

  lockModeUI();
  document.addEventListener('DOMContentLoaded',lockModeUI,{once:true});
  W.saveState?.();
  setTimeout(()=>{W.state.mode='normal';lockModeUI();W.emit?.('tasks-changed');},0);
})();
