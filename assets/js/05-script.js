/* ═══════════════════════════════════════════════════════════════
   wabi · mobile agenda view
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const W = window.wabi;
  const M = W.mobileBoard = {};

  M.render = function () {
    const root = document.getElementById('mobile-content');
    if (!root) return;
    if (W.state.view !== 'board') { root.innerHTML = ''; return; }

    const selKey = W.state.mobileSelectedDay;
    const today = new Date();

    // 7-day strip: Lun → Dom of the week containing the selected day
    const selDateForStrip = W.fromKey(selKey);
    const stripStart = W.getWeekStart(selDateForStrip);
    let stripHTML = '';
    for (let i = 0; i < 7; i++) {
      const d = W.addDays(stripStart, i);
      const k = W.dateKey(d);
      const isSel = k === selKey;
      const isTodayCls = W.isToday(d) ? 'is-today' : '';
      const tasks = W.tasksFor(k);
      const has = tasks.length > 0 ? 'has-tasks' : '';
      stripHTML += `
        <button class="day-pill ${isSel ? 'is-selected' : ''} ${isTodayCls} ${has}" data-day="${k}">
          <div class="day-pill-name">${W.DAYS_ES[d.getDay()]}</div>
          <div class="day-pill-num">${d.getDate()}</div>
          <div class="day-pill-dot"></div>
        </button>`;
    }

    // Subheader
    const selDate = W.fromKey(selKey);
    const subHTML = `
      <div class="mobile-subheader">
        <div class="seg" role="tablist">
          <button class="seg-btn" data-filter="all"     aria-pressed="${W.state.filter==='all'}">Todas</button>
          <button class="seg-btn" data-filter="pending" aria-pressed="${W.state.filter==='pending'}">Pendientes</button>
          <button class="seg-btn" data-filter="done"    aria-pressed="${W.state.filter==='done'}">Hechas</button>
        </div>
        <div class="mobile-date">${W.DAYS_FULL[selDate.getDay()]}, ${selDate.getDate()} ${W.MONTHS_SHORT[selDate.getMonth()]}</div>
      </div>
      <div class="mobile-day-strip">${stripHTML}</div>
    `;

    // Agenda
    const raw = W.tasksFor(selKey);
    const filtered = W.applyFilter(W.applyMode(raw));
    let agendaHTML = '';
    if (filtered.length === 0) {
      agendaHTML = `<div class="agenda-empty">
        <div class="agenda-empty-icon"><i class="fa-regular fa-circle-check"></i></div>
        <div class="agenda-empty-title">Sin tareas para este día</div>
        <div class="agenda-empty-sub">Toca + para crear una nueva tarea${W.state.filter !== 'all' ? ' o cambia el filtro arriba.' : '.'}</div>
      </div>`;
    } else {
      W.BLOCKS.forEach(b => {
        const items = filtered.map((t, i) => ({ t, origIdx: raw.indexOf(t) })).filter(({ t }) => (t.block || 'A') === b.key);
        if (items.length === 0) return;
        agendaHTML += `
          <div class="agenda-block">
            <div class="agenda-block-head">
              <span class="agenda-block-name blk-${b.key.toLowerCase()}">${b.label}</span>
              <span class="agenda-block-range">${b.range}</span>
              <span class="agenda-block-bar"></span>
            </div>
            <div class="agenda-tasks">
              ${items.map(({ t, origIdx }) => taskHTML(t, selKey, origIdx)).join('')}
            </div>
          </div>`;
      });
    }

    root.innerHTML = subHTML + `<div class="agenda">${agendaHTML}</div>` + `
      <button class="fab" id="fab-add-m" aria-label="Nueva tarea"><i class="fa-solid fa-plus"></i></button>`;

    bind();
  };

  function taskHTML(t, key, idx) {
    const blk = t.block ? `blk-${t.block.toLowerCase()}` : '';
    const done = t.done ? 'is-done' : '';
    const cat = (t.category || '').trim();
    const catObj = W.CATS.find(c => c.label === cat);
    const catHTML = cat ? `<span class="tag"><span class="tag-dot" style="background:${catObj ? catObj.color : '#999'}"></span>${W.esc(cat)}</span>` : '';
    const planned = t.planned ? `<span class="chip-mini"><i class="fa-regular fa-clock"></i>${t.planned}</span>` : '';
    const typeChip = t.type ? `<span class="chip-mini is-${t.type}">${t.type === 'relax' ? 'Relax' : 'Intense'}</span>` : '';
    return `
      <div class="agenda-task ${blk} ${done}" data-key="${key}" data-idx="${idx}">
        <div class="agenda-task-swipe-bg"><i class="fa-solid fa-trash" style="margin-right:8px"></i>Eliminar</div>
        <div class="agenda-task-content">
          <button class="task-check ${t.done ? 'is-done' : ''}" data-action="toggle" aria-label="Completar"></button>
          <div class="agenda-task-body">
            <div class="task-title">${W.esc(t.title || 'Sin título')}</div>
            ${(catHTML || planned || typeChip) ? `<div class="task-meta">${catHTML}${planned}${typeChip}</div>` : ''}
          </div>
        </div>
      </div>`;
  }

  function bind() {
    const root = document.getElementById('mobile-content');
    if (!root) return;

    // day pills
    root.querySelectorAll('.day-pill').forEach(b => {
      b.addEventListener('click', () => {
        W.state.mobileSelectedDay = b.dataset.day;
        M.render();
      });
    });

    // segmented
    root.querySelectorAll('.seg-btn[data-filter]').forEach(b => {
      b.addEventListener('click', () => {
        W.state.filter = b.dataset.filter;
        W.emit('filter-changed');
        M.render();
      });
    });

    // fab
    const fab = document.getElementById('fab-add-m');
    if (fab) fab.addEventListener('click', () => W.modal.open());

    // task cards: tap = open, swipe-left = delete
    root.querySelectorAll('.agenda-task').forEach(card => {
      const content = card.querySelector('.agenda-task-content');
      const key = card.dataset.key;
      const idx = parseInt(card.dataset.idx, 10);

      // toggle
      card.querySelector('[data-action="toggle"]').addEventListener('click', (e) => {
        e.stopPropagation();
        W.toggleTask(key, idx);
        W.emit('tasks-changed');
      });

      // tap to open
      content.addEventListener('click', (e) => {
        if (card.classList.contains('swiped')) {
          card.classList.remove('swiped');
          return;
        }
        W.state.selectedTask = { key, idx };
        W.detail.open();
      });

      // swipe to delete
      let startX = 0, startY = 0, dx = 0, dy = 0, swiping = false, locked = false;
      content.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX; startY = e.touches[0].clientY;
        dx = 0; dy = 0; swiping = true; locked = false;
        content.style.transition = 'none';
      }, { passive: true });
      content.addEventListener('touchmove', (e) => {
        if (!swiping) return;
        dx = e.touches[0].clientX - startX;
        dy = e.touches[0].clientY - startY;
        if (!locked) {
          if (Math.abs(dy) > Math.abs(dx) + 4) { swiping = false; content.style.transform = ''; return; }
          if (Math.abs(dx) > 8) locked = true;
        }
        if (locked && dx < 0) content.style.transform = `translateX(${Math.max(dx, -120)}px)`;
      }, { passive: true });
      content.addEventListener('touchend', () => {
        if (!swiping) { content.style.transition = ''; return; }
        swiping = false;
        content.style.transition = '';
        if (locked && dx < -50) {
          card.classList.add('swiped');
          content.style.transform = '';
          card.querySelector('.agenda-task-swipe-bg').addEventListener('click', () => {
            W.deleteTask(key, idx);
            W.toast('Tarea eliminada');
            W.emit('tasks-changed');
          }, { once: true });
        } else {
          content.style.transform = '';
          card.classList.remove('swiped');
        }
      });
    });
  }
})();
