/* ═══════════════════════════════════════════════════════════════
   wabi · new-task modal + month view + onboarding
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const W = window.wabi;

  /* ───── MODAL: new task ───── */
  const Modal = W.modal = {};
  Modal.open = function () {
    const scrim = document.getElementById('modal-scrim');
    const today = W.isMobile() ? W.state.mobileSelectedDay : W.dateKey(new Date());
    let pickedDate = today;
    let pickedBlock = 'A';
    let pickedType = null;
    let pickedCat = null;
    let pickedPlanned = null;

    scrim.classList.remove('is-hidden');
    scrim.innerHTML = `
      <div class="modal" role="dialog" aria-label="Nueva tarea">
        <div class="modal-head">
          <div class="modal-title">Nueva tarea</div>
          <button class="tb-icon" data-mod="close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <input class="modal-input" id="m-title" placeholder="¿Qué quieres hacer?" autofocus />
          <div class="meta-chips">
            <button class="meta-chip" data-mod="date"><i class="fa-regular fa-calendar"></i> <span id="m-date-lbl">Hoy</span></button>
            <button class="meta-chip" data-mod="block"><i class="fa-solid fa-clock"></i> <span id="m-block-lbl">Bloque A</span></button>
            <button class="meta-chip" data-mod="planned"><i class="fa-regular fa-clock"></i> <span id="m-planned-lbl">Estimación</span></button>
            <button class="meta-chip" data-mod="type"><i class="fa-solid fa-wave-square"></i> <span id="m-type-lbl">Tipo</span></button>
            <button class="meta-chip" data-mod="cat"><i class="fa-solid fa-tag"></i> <span id="m-cat-lbl">Categoría</span></button>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn" data-mod="close">Cancelar</button>
          <button class="btn btn--primary" data-mod="create"><i class="fa-solid fa-plus"></i> Crear</button>
        </div>
      </div>`;

    const dateLbl    = scrim.querySelector('#m-date-lbl');
    const blockLbl   = scrim.querySelector('#m-block-lbl');
    const plannedLbl = scrim.querySelector('#m-planned-lbl');
    const typeLbl    = scrim.querySelector('#m-type-lbl');
    const catLbl     = scrim.querySelector('#m-cat-lbl');

    function dateLabel(k) {
      if (k === W.dateKey(new Date())) return 'Hoy';
      if (k === W.dateKey(W.addDays(new Date(),1))) return 'Mañana';
      const d = W.fromKey(k);
      return `${d.getDate()} ${W.MONTHS_SHORT[d.getMonth()]}`;
    }
    dateLbl.textContent = dateLabel(pickedDate);

    function close() { scrim.classList.add('is-hidden'); scrim.innerHTML = ''; }
    scrim.querySelectorAll('[data-mod="close"]').forEach(b => b.onclick = close);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });

    scrim.querySelector('[data-mod="date"]').onclick = (e) => {
      const cal = buildPickerCalendar(pickedDate, (k) => {
        pickedDate = k;
        dateLbl.textContent = dateLabel(k);
        W.popover.close();
      });
      W.popover.open({ anchor: e.currentTarget, content: cal });
    };
    scrim.querySelector('[data-mod="block"]').onclick = (e) => {
      W.popover.open({
        anchor: e.currentTarget,
        items: W.BLOCKS.map(b => ({ value: b.key, label: b.label, selected: pickedBlock === b.key })),
        onSelect: (v) => { pickedBlock = v; blockLbl.textContent = W.BLOCKS.find(x=>x.key===v).label; }
      });
    };
    scrim.querySelector('[data-mod="planned"]').onclick = (e) => {
      const wrap = document.createElement('div');
      wrap.className = 'time-presets time-presets--compact';
      W.PRESETS.forEach(p => {
        const b = document.createElement('button');
        b.className = 'time-preset' + (p.v === pickedPlanned ? ' is-selected' : '');
        b.textContent = p.l;
        b.onclick = () => { pickedPlanned = p.v; plannedLbl.textContent = p.l; W.popover.close(); };
        wrap.appendChild(b);
      });
      const clear = document.createElement('button');
      clear.className = 'time-preset time-preset--clear';
      clear.textContent = 'Sin estimación';
      clear.onclick = () => { pickedPlanned = null; plannedLbl.textContent = 'Estimación'; W.popover.close(); };
      wrap.appendChild(clear);
      W.popover.open({ anchor: e.currentTarget, content: wrap });
    };
    scrim.querySelector('[data-mod="type"]').onclick = (e) => {
      W.popover.open({
        anchor: e.currentTarget,
        items: [
          { value: 'relax',   label: 'Relax',   icon: 'fa-leaf', selected: pickedType==='relax' },
          { value: 'intense', label: 'Intense', icon: 'fa-bolt', selected: pickedType==='intense' },
        ],
        onSelect: (v) => { pickedType = v; typeLbl.textContent = v === 'relax' ? 'Relax' : 'Intense'; }
      });
    };
    scrim.querySelector('[data-mod="cat"]').onclick = (e) => {
      W.popover.open({
        anchor: e.currentTarget,
        items: W.CATS.map(c => ({ value: c.label, label: c.label, dotColor: c.color, selected: pickedCat === c.label })),
        onSelect: (v) => { pickedCat = v; catLbl.textContent = v; }
      });
    };

    const titleInp = scrim.querySelector('#m-title');
    titleInp.focus();

    function create() {
      const title = titleInp.value.trim();
      if (!title) { titleInp.focus(); return; }
      W.addTask(pickedDate, {
        title, block: pickedBlock, type: pickedType,
        category: pickedCat, planned: pickedPlanned,
      });
      if (W.isMobile()) W.state.mobileSelectedDay = pickedDate;
      close();
      W.toast('Tarea creada');
      W.emit('tasks-changed');
    }
    scrim.querySelector('[data-mod="create"]').onclick = create;
    titleInp.onkeydown = (e) => { if (e.key === 'Enter') create(); else if (e.key === 'Escape') close(); };
  };

  // Compact calendar picker (used by modal date chip)
  function buildPickerCalendar(currentKey, onSelect) {
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
          <button class="cal-quick-btn" data-quick="week">+1 semana</button>
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

  /* ───── MONTH VIEW ───── */
  const Mo = W.month = {};
  Mo.render = function () {
    if (W.state.view !== 'month') return;
    const target = W.isMobile() ? document.getElementById('mobile-content') : document.getElementById('content');
    if (!target) return;

    const md = W.state.monthDate;
    const y = md.getFullYear(), m = md.getMonth();
    const first = new Date(y, m, 1);
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const daysInMonth = new Date(y, m+1, 0).getDate();
    const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;

    let cells = '';
    for (let i = 0; i < totalCells; i++) {
      const dayOffset = i - startDay;
      const dt = new Date(y, m, dayOffset + 1);
      const k = W.dateKey(dt);
      const isOther = i < startDay || dayOffset >= daysInMonth;
      const isTodayCls = W.isToday(dt) ? 'is-today' : '';
      const isSelCls = (W.state.selectedMonthDay === k) ? 'is-selected' : '';
      const tasks = W.tasksFor(k);
      const events = tasks.slice(0, 3).map(t => {
        const cls = t.type ? ` is-${t.type}` : '';
        const d = t.done ? ' is-done' : '';
        return `<div class="month-event${cls}${d}">${W.esc(t.title || 'Tarea')}</div>`;
      }).join('');
      const more = tasks.length > 3 ? `<div class="month-more">+${tasks.length - 3} más</div>` : '';
      cells += `<div class="month-cell ${isOther ? 'is-other' : ''} ${isTodayCls} ${isSelCls}" data-mday="${k}" data-other="${isOther}">
        <div class="month-day-num">${dt.getDate()}</div>
        ${events}${more}
      </div>`;
    }

    // Detail of selected day — only show if user explicitly clicked a day
    let detailHTML = '';
    if (W.state.selectedMonthDay && W.state.monthDetailOpen) {
      const k = W.state.selectedMonthDay;
      const d = W.fromKey(k);
      const tasks = W.tasksFor(k);
      detailHTML = `
        <div class="month-detail">
          <div class="month-detail-head">
            <div class="month-detail-title">${W.DAYS_FULL[d.getDay()]}, ${d.getDate()} ${W.MONTHS_ES[d.getMonth()]}</div>
            <div class="month-detail-count">${tasks.length} tarea${tasks.length===1?'':'s'}</div>
          </div>
          ${tasks.length === 0
            ? '<div style="color:var(--text-muted);font-size:13px;">Sin tareas. <button class="btn btn--ghost" id="month-add-here" style="margin-left:8px;"><i class="fa-solid fa-plus"></i> Añadir</button></div>'
            : `<div style="display:flex;flex-direction:column;gap:6px;">${tasks.map((t, i) => {
                const cat = W.CATS.find(c => c.label === t.category);
                return `<div class="task-card ${t.block ? 'blk-'+t.block.toLowerCase() : ''} ${t.done?'is-done':''}" data-key="${k}" data-idx="${i}" style="cursor:pointer;">
                  <div class="task-row">
                    <button class="task-check ${t.done?'is-done':''}" data-action="toggle"></button>
                    <span class="task-title">${W.esc(t.title || 'Sin título')}</span>
                  </div>
                </div>`;
              }).join('')}</div>`
          }
        </div>`;
    }

    target.innerHTML = `
      <div class="month">
        <div class="month-toolbar">
          <div class="month-title-grp">
            <div class="month-title">${W.cap(W.MONTHS_ES[m])} ${y}</div>
          </div>
          <div class="date-nav" style="display:inline-flex;">
            <button class="btn-date-arrow" data-mo="prev" aria-label="Mes anterior"><i class="fa-solid fa-chevron-left"></i></button>
            <button class="btn-today" data-mo="today">Hoy</button>
            <button class="btn-date-arrow" data-mo="next" aria-label="Mes siguiente"><i class="fa-solid fa-chevron-right"></i></button>
          </div>
        </div>
        <div class="month-grid-head">
          ${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=>`<div class="month-dn">${d}</div>`).join('')}
        </div>
        <div class="month-grid">${cells}</div>
        ${detailHTML}
      </div>
      <button class="fab" id="fab-add-mo" aria-label="Nueva tarea"><i class="fa-solid fa-plus"></i></button>
    `;
    bindMonth();
  };
  function bindMonth() {
    const root = W.isMobile() ? document.getElementById('mobile-content') : document.getElementById('content');
    if (!root) return;
    const prevBtn = root.querySelector('[data-mo="prev"]'); if (prevBtn) prevBtn.onclick = () => { W.state.monthDate = new Date(W.state.monthDate.getFullYear(), W.state.monthDate.getMonth()-1, 1); Mo.render(); };
    const nextBtn = root.querySelector('[data-mo="next"]'); if (nextBtn) nextBtn.onclick = () => { W.state.monthDate = new Date(W.state.monthDate.getFullYear(), W.state.monthDate.getMonth()+1, 1); Mo.render(); };
    const todayBtn = root.querySelector('[data-mo="today"]'); if (todayBtn) todayBtn.onclick = () => { W.state.monthDate = new Date(); W.state.selectedMonthDay = W.dateKey(new Date()); Mo.render(); };
    root.querySelectorAll('.month-cell[data-mday]').forEach(c => {
      c.onclick = () => {
        if (c.dataset.other === 'true') return;
        W.state.selectedMonthDay = c.dataset.mday;
        W.state.monthDetailOpen = true;
        Mo.render();
      };
    });
    const addBtn = root.querySelector('#month-add-here');
    if (addBtn) addBtn.onclick = () => {
      if (W.isMobile()) W.state.mobileSelectedDay = W.state.selectedMonthDay;
      W.modal.open();
    };
    root.querySelectorAll('.task-card[data-key]').forEach(card => {
      const key = card.dataset.key, idx = parseInt(card.dataset.idx, 10);
      card.querySelector('[data-action="toggle"]').onclick = (e) => {
        e.stopPropagation();
        W.toggleTask(key, idx);
        W.emit('tasks-changed');
        Mo.render();
      };
      card.onclick = () => {
        W.state.selectedTask = { key, idx };
        W.detail.open();
      };
    });
    const fab = root.querySelector('#fab-add-mo');
    if (fab) fab.onclick = () => W.modal.open();
  }

})();
