(function(){
  const W=window.wabi;
  function syncMonth(){const g=document.querySelector('.wabi-month-grid'),h=document.querySelector('.wabi-month-grid-head');if(!g||!h)return;h.style.paddingRight=Math.max(0,g.offsetWidth-g.clientWidth)+'px'}
  const mo=new MutationObserver(()=>requestAnimationFrame(syncMonth));mo.observe(document.body,{subtree:true,childList:true});window.addEventListener('resize',syncMonth);setTimeout(syncMonth,0);
  document.addEventListener('click',e=>{const b=e.target.closest('[data-wabi-mode="relax"],[data-wabi-mode="intense"],[data-mood-btn="relax"],[data-mood-btn="intense"]');if(b){e.preventDefault();e.stopImmediatePropagation();if(W?.state)W.state.mode='normal'}},true);
})();
