
/* ═══════════════════════════════════════════════════════════════
   wabi · detail panel + timer
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const W = window.wabi;
  const D = W.detail = {};

  let detailEl;

  function ensure() {
    detailEl = document.getElementById('detail');
    return detailEl;
  }

  D.open = function () {
    if (!ensure()) return;
    const sel = W.state.selectedTask;
    if (!sel) return;
    const t = W.tasksFor(sel.key)[sel.idx];
    if (!t) return;

    detailEl.classList.add('is-open');
    document.body.classList.add('detail-open');
    detailEl.innerHTML = renderHTML(t, sel.key);
    bind(t, sel.key, sel.idx);
    startTimerTick();

    // Scrim click → close (desktop only)
    if (!W.isMobile()) {
      const onScrimClick = (e) => {
        if (!detailEl.contains(e.target) && !e.target.closest('.task-card') && !e.target.closest('.popover')) {
          D.close();
          document.removeEventListener('mousedown', onScrimClick, true);
        }
      };
      // Defer to avoid catching the click that opened it
      setTimeout(() => document.addEventListener('mousedown', onScrimClick, true), 0);
      D._scrimHandler = onScrimClick;
    }
  };

  D.close = function () {
    if (!ensure()) return;
    stopTimerTick();
    detailEl.classList.remove('is-open');
    document.body.classList.remove('detail-open');
    if (D._scrimHandler) {
      document.removeEventListener('mousedown', D._scrimHandler, true);
      D._scrimHandler = null;
    }
    W.state.selectedTask = null;
    if (W.board && W.state.view === 'board' && !W.isMobile()) W.board.render();
  };

  D.refresh = function () {
    if (!W.state.selectedTask) return;
    D.open();
  };

  function renderHTML(t, key) {
    const d = W.fromKey(key);
    const dateStr = `${W.DAYS_FULL[d.getDay()]}, ${d.getDate()} ${W.MONTHS_ES[d.getMonth()]}`;

    const cat = (t.category || '').trim();
    const catObj = W.CATS.find(c => c.label === cat);
    const blockObj = W.BLOCKS.find(b => b.key === t.block);

    const subtasks = (t.subtasks || []).map((s, i) => `
      <div class="subtask-row" data-sub-idx="${i}">
        <button class="subtask-check ${s.done ? 'is-done' : ''}" data-action="sub-toggle"></button>
        <input class="subtask-text ${s.done ? 'is-done' : ''}" value="${W.esc(s.text)}" data-action="sub-edit"/>
        <button class="subtask-delete" data-action="sub-delete" aria-label="Eliminar"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join('');

    return `
      <div class="detail-header">
        <div class="detail-header-left">
          <button class="tb-icon detail-back-mobile" data-action="close" title="Volver" aria-label="Volver"><i class="fa-solid fa-arrow-left"></i></button>
          <button class="tb-icon detail-nav-desktop" data-action="prev-task" title="Anterior"><i class="fa-solid fa-chevron-up"></i></button>
          <button class="tb-icon detail-nav-desktop" data-action="next-task" title="Siguiente"><i class="fa-solid fa-chevron-down"></i></button>
          <span class="detail-date">${dateStr}</span>
        </div>
        <div class="detail-header-actions">
          <button class="tb-icon" data-action="toggle-done" title="Marcar"><i class="fa-regular fa-circle-check"></i></button>
          <button class="tb-icon detail-close-desktop" data-action="close" title="Cerrar (Esc)"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="detail-body">
        <input class="detail-title-input" value="${W.esc(t.title || '')}" placeholder="Sin título" data-action="edit-title"/>

        <div>
          <div class="section-label">Tiempo</div>
          <div class="timer-card">
            <div class="timer-cell">
              <div class="timer-cell-label">Planeado</div>
              <div class="timer-cell-val" data-action="set-planned" style="cursor:pointer">${formatPlanned(t.planned)}</div>
            </div>
            <button class="btn-timer ${t.timerRunning ? 'is-running' : ''}" data-action="toggle-timer">
              <i class="fa-solid ${t.timerRunning ? 'fa-stop' : 'fa-play'}"></i>
              ${t.timerRunning ? 'Pausar' : 'Iniciar'}
            </button>
            <div class="timer-cell">
              <div class="timer-cell-label">Real</div>
              <div class="timer-cell-val ${t.timerRunning ? 'is-running' : ''}" id="timer-actual">${formatActual(t.timerSecs || 0)}</div>
            </div>
          </div>
        </div>

        <div>
          <div class="section-label">Detalles</div>
          <div class="meta-chips">
            <button class="meta-chip ${cat ? 'is-set' : ''}" data-action="set-category">
              ${cat ? `<span class="tag-dot" style="background:${catObj ? catObj.color : '#999'}"></span>${W.esc(cat)}` : `<i class="fa-solid fa-tag"></i> Categoría`}
            </button>
            <button class="meta-chip ${t.type ? 'is-set' : ''}" data-action="set-type">
              ${t.type ? (t.type === 'relax' ? '<i class="fa-solid fa-leaf"></i> Relax' : '<i class="fa-solid fa-bolt"></i> Intense') : '<i class="fa-solid fa-wave-square"></i> Tipo'}
            </button>
            <button class="meta-chip ${t.block ? 'is-set' : ''}" data-action="set-block">
              ${blockObj ? `<i class="fa-solid fa-clock"></i> ${blockObj.label}` : '<i class="fa-solid fa-clock"></i> Bloque'}
            </button>
            <button class="meta-chip" data-action="set-date">
              <i class="fa-regular fa-calendar"></i> Mover
            </button>
          </div>
        </div>

        <div>
          <div class="section-label">Subtareas (${(t.subtasks||[]).filter(s=>s.done).length}/${(t.subtasks||[]).length})</div>
          <div id="subtasks-list">${subtasks}</div>
          <div id="subtask-add-row"></div>
          <button class="btn-subtask-add" data-action="add-subtask"><i class="fa-solid fa-plus"></i> Añadir subtarea</button>
        </div>
      </div>
      <div class="detail-footer">
        <button class="btn btn--destructive btn--full" data-action="delete-task">
          <i class="fa-solid fa-trash"></i> Eliminar tarea
        </button>
      </div>`;
  }

  function formatActual(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function formatPlanned(v) {
    if (!v) return '—';
    // legacy "h:mm" or new "h:mm:ss" → render as HH:MM:SS
    const parts = String(v).split(':').map(n => parseInt(n,10) || 0);
    let h = 0, m = 0, s = 0;
    if (parts.length === 2) { h = parts[0]; m = parts[1]; }
    else if (parts.length === 3) { h = parts[0]; m = parts[1]; s = parts[2]; }
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function bind(t, key, idx) {
    const el = detailEl;

    el.querySelectorAll('[data-action="close"]').forEach(b => b.onclick = D.close);

    el.querySelector('[data-action="toggle-done"]').onclick = () => {
      W.toggleTask(key, idx);
      W.emit('tasks-changed');
      D.refresh();
    };

    el.querySelector('[data-action="prev-task"]').onclick = () => navigate(-1);
    el.querySelector('[data-action="next-task"]').onclick = () => navigate(1);

    const titleInput = el.querySelector('[data-action="edit-title"]');
    titleInput.onblur = () => {
      W.updateTask(key, idx, { title: titleInput.value.trim() });
      W.emit('tasks-changed');
    };
    titleInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); titleInput.blur(); } };

    el.querySelector('[data-action="set-planned"]').onclick = (e) => {
      W.popover.open({
        anchor: e.currentTarget,
        content: buildTimePresets(t.planned, (v) => {
          W.updateTask(key, idx, { planned: v });
          W.popover.close();
          W.emit('tasks-changed');
          D.refresh();
        }),
      });
    };

    el.querySelector('[data-action="set-category"]').onclick = (e) => {
      W.popover.open({
        anchor: e.currentTarget,
        items: [
          ...W.CATS.map(c => ({ value: c.label, label: c.label, dotColor: c.color, selected: t.category === c.label })),
          { divider: true },
          { value: '__clear', label: 'Sin categoría', icon: 'fa-ban' },
        ],
        onSelect: (v) => {
          W.updateTask(key, idx, { category: v === '__clear' ? null : v });
          W.emit('tasks-changed');
          D.refresh();
        }
      });
    };

    el.querySelector('[data-action="set-type"]').onclick = (e) => {
      W.popover.open({
        anchor: e.currentTarget,
        items: [
          { value: 'relax',   label: 'Relax',   icon: 'fa-leaf', selected: t.type === 'relax' },
          { value: 'intense', label: 'Intense', icon: 'fa-bolt', selected: t.type === 'intense' },
          { divider: true },
          { value: '__clear', label: 'Sin tipo', icon: 'fa-ban' },
        ],
        onSelect: (v) => {
          W.updateTask(key, idx, { type: v === '__clear' ? null : v });
          W.emit('tasks-changed');
          D.refresh();
        }
      });
    };

    el.querySelector('[data-action="set-block"]').onclick = (e) => {
      W.popover.open({
        anchor: e.currentTarget,
        items: W.BLOCKS.map(b => ({ value: b.key, label: b.label, selected: t.block === b.key })),
        onSelect: (v) => {
          W.updateTask(key, idx, { block: v });
          W.emit('tasks-changed');
          D.refresh();
        }
      });
    };

    el.querySelector('[data-action="set-date"]').onclick = (e) => {
      W.popover.open({
        anchor: e.currentTarget,
        content: buildMiniCal(key, (newKey) => {
          if (newKey === key) { W.popover.close(); return; }
          const r = W.moveTask(key, idx, newKey);
          if (r) {
            W.state.selectedTask = { key: r.newKey, idx: r.newIdx };
            if (W.isMobile()) W.state.mobileSelectedDay = newKey;
          }
          W.popover.close();
          W.emit('tasks-changed');
          D.refresh();
          W.toast('Tarea movida');
        }),
      });
    };

    el.querySelector('[data-action="delete-task"]').onclick = () => {
      W.deleteTask(key, idx);
      W.toast('Tarea eliminada');
      D.close();
      W.emit('tasks-changed');
    };

    // Subtasks
    el.querySelectorAll('.subtask-row').forEach(row => {
      const i = parseInt(row.dataset.subIdx, 10);
      row.querySelector('[data-action="sub-toggle"]').onclick = () => {
        t.subtasks[i].done = !t.subtasks[i].done;
        W.saveState();
        D.refresh();
        W.emit('tasks-changed');
      };
      const inp = row.querySelector('[data-action="sub-edit"]');
      inp.onblur = () => {
        t.subtasks[i].text = inp.value.trim();
        if (!t.subtasks[i].text) {
          t.subtasks.splice(i, 1);
          D.refresh();
        }
        W.saveState();
        W.emit('tasks-changed');
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } };
      row.querySelector('[data-action="sub-delete"]').onclick = () => {
        t.subtasks.splice(i, 1);
        W.saveState();
        D.refresh();
        W.emit('tasks-changed');
      };
    });

    el.querySelector('[data-action="add-subtask"]').onclick = (ev) => {
      ev.currentTarget.style.display = 'none';
      const row = el.querySelector('#subtask-add-row');
      row.innerHTML = `<div class="subtask-input-row">
        <span style="width:14px;height:14px;border:1.5px solid var(--hairline-strong);border-radius:4px;flex-shrink:0;"></span>
        <input placeholder="Nueva subtarea…" autofocus />
      </div>`;
      const inp = row.querySelector('input');
      inp.focus();
      const finish = (commit) => {
        if (commit && inp.value.trim()) {
          t.subtasks = t.subtasks || [];
          t.subtasks.push({ text: inp.value.trim(), done: false });
          W.saveState();
          W.emit('tasks-changed');
        }
        D.refresh();
      };
      inp.onblur = () => finish(true);
      inp.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); inp.value = ''; finish(false); }
      };
    };

    // Toggle timer
    el.querySelector('[data-action="toggle-timer"]').onclick = () => {
      const tt = W.tasksFor(key)[idx];
      if (!tt) return;
      W.updateTask(key, idx, { timerRunning: !tt.timerRunning });
      D.refresh();
    };
  }

  function navigate(dir) {
    const sel = W.state.selectedTask;
    if (!sel) return;
    const list = W.applyMode(W.applyFilter(W.tasksFor(sel.key)));
    if (list.length === 0) return;
    const cur = W.tasksFor(sel.key)[sel.idx];
    const inFiltered = list.indexOf(cur);
    let next = inFiltered + dir;
    if (next < 0) next = list.length - 1;
    if (next >= list.length) next = 0;
    const newTask = list[next];
    const newIdx = W.tasksFor(sel.key).indexOf(newTask);
    W.state.selectedTask = { key: sel.key, idx: newIdx };
    D.refresh();
    if (W.state.view === 'board' && !W.isMobile()) W.board.render();
  }

  function buildTimePresets(current, onSelect) {
    const wrap = document.createElement('div');
    wrap.className = 'time-presets';
    W.PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.className = 'time-preset' + (p.v === current ? ' is-selected' : '');
      b.textContent = p.l;
      b.onclick = () => onSelect(p.v);
      wrap.appendChild(b);
    });
    const clear = document.createElement('button');
    clear.className = 'time-preset';
    clear.style.gridColumn = '1 / -1';
    clear.style.color = 'var(--text-muted)';
    clear.textContent = 'Sin estimación';
    clear.onclick = () => onSelect(null);
    wrap.appendChild(clear);
    return wrap;
  }

  function buildMiniCal(currentKey, onSelect) {
    const wrap = document.createElement('div');
    wrap.className = 'cal cal--compact';
    const today = new Date();
    let viewDate = W.fromKey(currentKey);
    viewDate.setDate(1);
    function paint() {
      const y = viewDate.getFullYear(), m = viewDate.getMonth();
      const first = new Date(y, m, 1);
      const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1;
      const daysInMonth = new Date(y, m+1, 0).getDate();
      let html = `
        <div class="cal-head">
          <button class="tb-icon" data-cal="prev"><i class="fa-solid fa-chevron-left"></i></button>
          <div class="cal-title">${W.cap(W.MONTHS_ES[m])} ${y}</div>
          <button class="tb-icon" data-cal="next"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
        <div class="cal-grid">
          ${['Lu','Ma','Mi','Ju','Vi','Sá','Do'].map(d => `<div class="cal-dn">${d}</div>`).join('')}`;
      for (let i = 0; i < startDay; i++) html += `<div class="cal-d is-other"></div>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(y, m, d);
        const k = W.dateKey(dt);
        const cls = [
          k === W.dateKey(today) ? 'is-today' : '',
          k === currentKey ? 'is-selected' : '',
        ].join(' ');
        html += `<button class="cal-d ${cls}" data-cal-day="${k}">${d}</button>`;
      }
      html += `</div>
        <div class="cal-quick">
          <button class="cal-quick-btn" data-quick="today">Hoy</button>
          <button class="cal-quick-btn" data-quick="tomorrow">Mañana</button>
          <button class="cal-quick-btn" data-quick="week">+1 sem</button>
        </div>`;
      wrap.innerHTML = html;
      wrap.querySelector('[data-cal="prev"]').onclick = () => { viewDate = new Date(y, m-1, 1); paint(); };
      wrap.querySelector('[data-cal="next"]').onclick = () => { viewDate = new Date(y, m+1, 1); paint(); };
      wrap.querySelectorAll('[data-cal-day]').forEach(b => {
        b.onclick = () => onSelect(b.dataset.calDay);
      });
      wrap.querySelector('[data-quick="today"]').onclick = () => onSelect(W.dateKey(new Date()));
      wrap.querySelector('[data-quick="tomorrow"]').onclick = () => onSelect(W.dateKey(W.addDays(new Date(),1)));
      wrap.querySelector('[data-quick="week"]').onclick = () => onSelect(W.dateKey(W.addDays(new Date(),7)));
    }
    paint();
    return wrap;
  }

  /* TIMER TICK */
  function startTimerTick() {
    stopTimerTick();
    W.state.timerInterval = setInterval(() => {
      const sel = W.state.selectedTask;
      if (!sel) return;
      const t = W.tasksFor(sel.key)[sel.idx];
      if (!t || !t.timerRunning) return;
      t.timerSecs = (t.timerSecs || 0) + 1;
      const node = document.getElementById('timer-actual');
      if (node) node.textContent = formatActual(t.timerSecs);
      // persist sparingly
      if (t.timerSecs % 5 === 0) W.saveState();
    }, 1000);
  }
  function stopTimerTick() {
    if (W.state.timerInterval) {
      clearInterval(W.state.timerInterval);
      W.state.timerInterval = null;
    }
  }
})();

