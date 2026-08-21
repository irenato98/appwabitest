

(function() {
  'use strict';
  const W = window.wabi;

  /* 1. Mood segmented desktop */
  function syncMood() {
    document.querySelectorAll('[data-mood-btn]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.moodBtn === W.state.mode));
    });
    const mp = document.getElementById('mode-pill');
    if (mp) {
      mp.dataset.mode = W.state.mode;
      const lbl = mp.querySelector('.mode-label');
      if (lbl) lbl.textContent = W.MODES[W.state.mode].label;
    }
    const tbi = document.querySelector('[data-action="toggle-theme"] i');
    if (tbi) tbi.className = W.state.theme==='dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }

  document.querySelectorAll('[data-mood-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      W.state.mode = btn.dataset.moodBtn;
      W.saveState();
      syncMood();
      W.emit('tasks-changed');
    });
  });

  /* 2. Mode pill mobile */
  const mp = document.getElementById('mode-pill');
  if (mp) {
    mp.addEventListener('click', e => {
      W.popover.open({
        anchor: e.currentTarget, align: 'end',
        items: [
          { sectionLabel: 'Modo del día' },
          { value:'relax',   label:'Relax',   icon:'fa-leaf',   selected: W.state.mode==='relax' },
          { value:'normal',  label:'Normal',  icon:'fa-equals', selected: W.state.mode==='normal' },
          { value:'intense', label:'Intense', icon:'fa-bolt',   selected: W.state.mode==='intense' },
        ],
        onSelect: v => { W.state.mode=v; W.saveState(); syncMood(); W.emit('tasks-changed'); }
      });
    });
  }

  /* 3. Theme switch sidebar */
  const tsb = document.getElementById('theme-switch-sidebar');
  if (tsb) tsb.addEventListener('click', () => W.applyTheme(W.state.theme==='dark'?'light':'dark'));

  /* 4. Detail: mobile usa #detail-mobile */
  const _open  = W.detail.open.bind(W.detail);
  const _close = W.detail.close.bind(W.detail);

  W.detail.open = function() {
    if (W.isMobile()) {
      const dm = document.getElementById('detail-mobile');
      const dd = document.getElementById('detail');
      if (dd) dd.id = '_det_bak';
      if (dm) dm.id = 'detail';
      _open();
      const cur = document.getElementById('detail');
      if (cur && cur === dm) { /* keep id */ }
      const bak = document.getElementById('_det_bak');
      if (bak) bak.id = 'detail';
    } else {
      _open();
    }
  };
  W.detail.close = function() {
    _close();
    const dm = document.getElementById('detail-mobile');
    if (dm) { dm.classList.remove('is-open'); dm.innerHTML = ''; }
  };

  W.on('tasks-changed', syncMood);
  W.on('theme', syncMood);
  setTimeout(syncMood, 80);
})();

