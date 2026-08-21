

(function () {
  'use strict';
  const W = window.wabi;
  const Board = W.board = {};

  Board.render = function () {
    const root = document.getElementById('content');
    if (!root || W.state.view !== 'board') return;
    const ws = W.state.weekStart;
    const days = Array.from({ length: 7 }, (_, i) => W.addDays(ws, i));

    let headHTML = '<div class="gutter-head"></div>';
    days.forEach(d => {
      const todayCls = W.isToday(d) ? 'day-num--today' : '';
      const ts = W.tasksFor(W.dateKey(d));
      const total = ts.length, done = ts.filter(t => t.done).length;
      const pct = total ? Math.round(done/total*100) : 0;
      headHTML += `<div class="day-head">
        <div class="day-head-row">
          <span class="day-name">${W.DAYS_ES[d.getDay()]}</span>
          <span class="day-num ${todayCls}">${d.getDate()}</span>
        </div>
        <div class="day-progress">
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
          <span>${done}/${total}</span>
        </div>
      </div>`;
    });

    let bodyHTML = '<div class="gutter">';
    W.BLOCKS.forEach(b => {
      bodyHTML += `<div class="gutter-cell blk-${b.key.toLowerCase()}">
        <div><strong>${b.label}</strong></div>
        <div style="font-size:8px;opacity:.8;margin-top:2px;">${b.range}</div>
      </div>`;
    });
    bodyHTML += '</div>';

    days.forEach(d => {
      const key = W.dateKey(d);
      let raw = W.applyMode(W.applyFilter(W.tasksFor(key)));
      const byBlock = { A:[], B:[], C:[], D:[] };
      raw.forEach(t => {
        const origIdx = W.tasksFor(key).indexOf(t);
        const blk = (t.block && byBlock[t.block]) ? t.block : 'A';
        byBlock[blk].push({ task: t, origIdx });
      });

      let dayHTML = `<div class="day-col" data-day-key="${key}">`;
      W.BLOCKS.forEach(b => {
        const items = byBlock[b.key];
        const cardsHTML = items.map(item => taskCardHTML(item.task, key, item.origIdx)).join('');
        dayHTML += `<div class="block-section blk-${b.key.toLowerCase()}">
          <div class="block-label blk-${b.key.toLowerCase()}">${b.key}</div>
          <div class="tasks-stack">${cardsHTML}</div>
        </div>`;
      });
      dayHTML += '</div>';
      bodyHTML += dayHTML;
    });

    root.innerHTML = `
      <div class="board" id="board">
        <div class="board-headers">${headHTML}</div>
        <div class="board-body">${bodyHTML}</div>
      </div>
      <button class="fab" id="fab-add" title="Nueva actividad" aria-label="Nueva tarea">
        <i class="fa-solid fa-plus"></i>
      </button>`;
    bindBoardEvents();
  };

  function taskCardHTML(t, key, idx) {
    const blk = t.block ? `blk-${t.block.toLowerCase()}` : '';
    const sel = (W.state.selectedTask && W.state.selectedTask.key===key && W.state.selectedTask.idx===idx) ? 'is-selected' : '';
    const done = t.done ? 'is-done' : '';
    const cat = (t.category||'').trim();
    const catObj = W.CATS.find(c => c.label===cat);
    const catHTML = cat ? `<span class="tag"><span class="tag-dot" style="background:${catObj?catObj.color:'#999'}"></span>${W.esc(cat)}</span>` : '';
    const planned = t.planned ? `<span class="chip-mini"><i class="fa-regular fa-clock"></i>${t.planned}</span>` : '';
    const typeChip = t.type ? `<span class="chip-mini is-${t.type}">${t.type==='relax'?'Relax':'Intense'}</span>` : '';
    const subDone = (t.subtasks||[]).filter(s=>s.done).length;
    const subTotal = (t.subtasks||[]).length;
    const subHTML = subTotal ? `<span class="chip-mini"><i class="fa-regular fa-square-check"></i>${subDone}/${subTotal}</span>` : '';
    const meta = (catHTML||planned||typeChip||subHTML) ? `<div class="task-meta">${catHTML}${planned}${typeChip}${subHTML}</div>` : '';
    return `<div class="task-card ${blk} ${sel} ${done}" data-key="${key}" data-idx="${idx}">
      <div class="task-row">
        <button class="task-check ${t.done?'is-done':''}" data-action="toggle" aria-label="Completar"></button>
        <span class="task-title">${W.esc(t.title||'Sin título')}</span>
      </div>
      ${meta}
      <div class="card-actions">
        <button class="btn-card-action" data-action="delete" aria-label="Eliminar"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>`;
  }

  function bindBoardEvents() {
    const board = document.getElementById('board');
    if (!board) return;
    board.addEventListener('click', e => {
      const card = e.target.closest('.task-card');
      if (!card) return;
      const key = card.dataset.key;
      const idx = parseInt(card.dataset.idx, 10);
      const action = e.target.closest('[data-action]');
      if (action) {
        e.stopPropagation();
        if (action.dataset.action === 'toggle') {
          W.toggleTask(key, idx); W.emit('tasks-changed');
        } else if (action.dataset.action === 'delete') {
          if (W.state.selectedTask && W.state.selectedTask.key===key && W.state.selectedTask.idx===idx) W.detail.close();
          W.deleteTask(key, idx); W.toast('Tarea eliminada'); W.emit('tasks-changed');
        }
        return;
      }
      W.state.selectedTask = { key, idx };
      W.detail.open();
      Board.render();
    });
    const fab = document.getElementById('fab-add');
    if (fab) fab.addEventListener('click', () => W.modal.open());
  }

  Board.gotoToday = function() { W.state.weekStart = W.getWeekStart(new Date()); Board.render(); };
  Board.next  = function() { W.state.weekStart = W.addDays(W.state.weekStart,  7); Board.render(); };
  Board.prev  = function() { W.state.weekStart = W.addDays(W.state.weekStart, -7); Board.render(); };
})();

