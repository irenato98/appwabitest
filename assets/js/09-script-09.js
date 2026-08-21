
/* ═══════════════════════════════════════════════════════════════
   wabi · app entry & wiring
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const W = window.wabi;

  function fmtRange(ws) {
    const we = W.addDays(ws, 6);
    const sameMonth = ws.getMonth() === we.getMonth();
    const sameYear  = ws.getFullYear() === we.getFullYear();
    if (sameMonth) return `${ws.getDate()}–${we.getDate()} ${W.cap(W.MONTHS_ES[ws.getMonth()])} ${ws.getFullYear()}`;
    if (sameYear) return `${ws.getDate()} ${W.MONTHS_SHORT[ws.getMonth()]} – ${we.getDate()} ${W.MONTHS_SHORT[we.getMonth()]} ${ws.getFullYear()}`;
    return `${ws.getDate()} ${W.MONTHS_SHORT[ws.getMonth()]} ${ws.getFullYear()} – ${we.getDate()} ${W.MONTHS_SHORT[we.getMonth()]} ${we.getFullYear()}`;
  }

  function renderHeader() {
    const dateEl = document.getElementById('current-date');
    if (dateEl) dateEl.textContent = fmtRange(W.state.weekStart);

    document.querySelectorAll('.seg-btn[data-filter-desktop]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.filterDesktop === W.state.filter));
    });
    const mp = document.getElementById('mode-pill');
    if (mp) {
      mp.dataset.mode = W.state.mode;
      mp.querySelector('.mode-label').textContent = W.MODES[W.state.mode].label;
    }

    document.querySelectorAll('.nav-item[data-view]').forEach(n => {
      n.classList.toggle('is-active', n.dataset.view === W.state.view);
    });
    document.querySelectorAll('.tabbar-btn[data-tab]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.tab === W.state.view);
    });

    // toggle theme btn icon
    const tbi = document.querySelector('[data-action="toggle-theme"] i');
    if (tbi) tbi.className = W.state.theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }

  function renderAll() {
    renderHeader();
    if (W.state.view === 'board') {
      if (W.isMobile()) W.mobileBoard.render(); else W.board.render();
    } else if (W.state.view === 'month') {
      W.month.render();
    }
    if (W.isMobile()) {
      const dt = document.getElementById('desktop-content-wrap');
      const mt = document.getElementById('mobile-content-wrap');
      if (dt) dt.style.display = 'none';
      if (mt) mt.style.display = 'flex';
    } else {
      const dt = document.getElementById('desktop-content-wrap');
      const mt = document.getElementById('mobile-content-wrap');
      if (dt) dt.style.display = 'flex';
      if (mt) mt.style.display = 'none';
    }
  }

  W.on('tasks-changed', renderAll);
  W.on('filter-changed', renderAll);
  W.on('theme', renderAll);
  W.on('header-rerender', renderHeader);

  function bindShell() {
    // Date nav — context-aware (Semana navega weeks, Mes navega months)
    document.getElementById('btn-prev').onclick = () => {
      if (W.state.view === 'month') {
        W.state.monthDate = new Date(W.state.monthDate.getFullYear(), W.state.monthDate.getMonth()-1, 1);
        W.month.render();
      } else {
        W.board.prev();
      }
      renderHeader();
    };
    document.getElementById('btn-next').onclick = () => {
      if (W.state.view === 'month') {
        W.state.monthDate = new Date(W.state.monthDate.getFullYear(), W.state.monthDate.getMonth()+1, 1);
        W.month.render();
      } else {
        W.board.next();
      }
      renderHeader();
    };
    document.getElementById('btn-today').onclick = () => {
      if (W.state.view === 'month') {
        W.state.monthDate = new Date();
        W.state.selectedMonthDay = W.dateKey(new Date());
        W.month.render();
      } else {
        W.board.gotoToday();
      }
      renderHeader();
    };

    // Filters (desktop)
    document.querySelectorAll('.seg-btn[data-filter-desktop]').forEach(b => {
      b.onclick = () => { W.state.filter = b.dataset.filterDesktop; renderAll(); };
    });

    // Mode pill
    const modePill = document.getElementById('mode-pill');
    modePill.onclick = (e) => {
      W.popover.open({
        anchor: e.currentTarget,
        align: 'end',
        items: [
          { sectionLabel: 'Modo del día' },
          ...Object.keys(W.MODES).map(k => ({
            value: k,
            label: W.MODES[k].label,
            selected: W.state.mode === k,
            icon: k === 'relax' ? 'fa-leaf' : k === 'intense' ? 'fa-bolt' : 'fa-equals',
          })),
        ],
        onSelect: (v) => { W.state.mode = v; W.saveState(); renderAll(); }
      });
    };

    // Toggle theme
    document.querySelector('[data-action="toggle-theme"]').onclick = () => {
      W.applyTheme(W.state.theme === 'dark' ? 'light' : 'dark');
    };

    // Burger / sidebar mobile
    const sidebar = document.getElementById('sidebar');
    const sbScrim = document.getElementById('sidebar-scrim');
    document.getElementById('btn-burger').onclick = () => {
      sidebar.classList.add('is-open');
      sbScrim.classList.add('is-visible');
    };
    sbScrim.onclick = () => {
      sidebar.classList.remove('is-open');
      sbScrim.classList.remove('is-visible');
    };
    document.querySelectorAll('[data-action="close-sidebar"]').forEach(b => {
      b.onclick = () => {
        sidebar.classList.remove('is-open');
        sbScrim.classList.remove('is-visible');
      };
    });

    // Nav items (sidebar)
    document.querySelectorAll('.nav-item[data-view]').forEach(n => {
      n.onclick = () => {
        W.state.view = n.dataset.view;
        if (W.state.view === 'month' && !W.state.selectedMonthDay) {
          W.state.selectedMonthDay = W.dateKey(new Date());
        }
        sidebar.classList.remove('is-open');
        sbScrim.classList.remove('is-visible');
        renderAll();
      };
    });

    // Tabbar mobile
    document.querySelectorAll('.tabbar-btn[data-tab]').forEach(b => {
      b.onclick = () => {
        const tab = b.dataset.tab;
        if (tab === 'add') { W.modal.open(); return; }
        W.state.view = tab;
        if (tab === 'month' && !W.state.selectedMonthDay) W.state.selectedMonthDay = W.dateKey(new Date());
        renderAll();
      };
    });

    // Sidebar buttons
    document.querySelector('[data-action="new-task"]').onclick = () => W.modal.open();

    // Esc closes detail
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const det = document.getElementById('detail');
        if (det && det.classList.contains('is-open')) W.detail.close();
      }
    });

    // Resize → switch desktop/mobile rendering
    let lastMobile = W.isMobile();
    window.addEventListener('resize', () => {
      const m = W.isMobile();
      if (m !== lastMobile) {
        lastMobile = m;
        renderAll();
      }
    });
  }

  /* INIT */
  document.addEventListener('DOMContentLoaded', () => {
    W.loadState();
    W.applyTheme(W.state.theme || 'light');
    bindShell();
    renderAll();
  });
})();

