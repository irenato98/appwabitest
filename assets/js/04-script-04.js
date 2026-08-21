
/* ═══════════════════════════════════════════════════════════════
   wabi · popovers (single global popover element)
   API: wabi.popover.open({ x, y, anchor, items, onSelect, sheetTitle, content })
        wabi.popover.close()
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const W = window.wabi;
  const P = W.popover = {};

  let el, currentClose;

  function ensureEl() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'popover';
    el.style.display = 'none';
    el.style.zIndex = '950';
    document.body.appendChild(el);

    document.addEventListener('mousedown', (e) => {
      if (el.style.display === 'none') return;
      if (!el.contains(e.target) && !e.target.closest('[data-popover-trigger]')) {
        P.close();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && el.style.display !== 'none') P.close();
    });
    return el;
  }

  P.close = function () {
    if (!el) return;
    el.style.display = 'none';
    el.classList.remove('is-mobile-sheet');
    el.innerHTML = '';
    if (currentClose) { currentClose(); currentClose = null; }
    // remove sheet scrim if any
    const scrim = document.getElementById('popover-scrim');
    if (scrim) scrim.remove();
  };

  P.open = function (opts) {
    P.close();
    ensureEl();
    el.innerHTML = '';

    const isMobile = W.isMobile();

    // Build content
    if (opts.content) {
      if (typeof opts.content === 'string') el.innerHTML = opts.content;
      else el.appendChild(opts.content);
    } else if (opts.items) {
      const list = document.createElement('div');
      list.className = 'popover-list';
      opts.items.forEach(item => {
        if (item.divider) { const d = document.createElement('div'); d.className = 'popover-divider'; list.appendChild(d); return; }
        if (item.sectionLabel) {
          const s = document.createElement('div');
          s.className = 'popover-section-label';
          s.textContent = item.sectionLabel;
          list.appendChild(s);
          return;
        }
        const it = document.createElement('button');
        it.className = 'popover-item';
        if (item.selected) it.classList.add('is-selected');
        if (item.destructive) it.classList.add('popover-destructive');
        const check = document.createElement('span');
        check.className = 'check';
        check.innerHTML = '<i class="fa-solid fa-check"></i>';
        it.appendChild(check);
        if (item.dotColor) {
          const dot = document.createElement('span');
          dot.className = 'tag-dot';
          dot.style.background = item.dotColor;
          it.appendChild(dot);
        } else if (item.icon) {
          const ic = document.createElement('span');
          ic.style.width = '14px';
          ic.style.color = 'var(--text-muted)';
          ic.innerHTML = `<i class="fa-solid ${item.icon}"></i>`;
          it.appendChild(ic);
        }
        const lbl = document.createElement('span');
        lbl.textContent = item.label;
        it.appendChild(lbl);
        it.addEventListener('click', () => {
          if (opts.onSelect) opts.onSelect(item.value, item);
          if (item.keepOpen) return;
          P.close();
        });
        list.appendChild(it);
      });
      el.appendChild(list);
    }

    // Position
    el.style.display = 'block';

    if (isMobile && opts.allowSheet !== false) {
      // bottom sheet
      el.classList.add('is-mobile-sheet');
      el.style.left = '0';
      el.style.right = '0';
      el.style.top = 'auto';
      el.style.bottom = '0';

      // scrim for sheet
      const scrim = document.createElement('div');
      scrim.id = 'popover-scrim';
      Object.assign(scrim.style, {
        position: 'fixed', inset: '0', background: 'rgba(0,0,0,.35)',
        zIndex: '940', animation: 'fadeIn 200ms both',
      });
      scrim.addEventListener('click', P.close);
      document.body.appendChild(scrim);
    } else {
      // anchored popover
      el.classList.remove('is-mobile-sheet');
      let { x, y, anchor, align = 'start' } = opts;
      if (anchor) {
        const r = anchor.getBoundingClientRect();
        x = align === 'end' ? r.right : r.left;
        y = r.bottom + 4;
      }
      // measure first
      el.style.visibility = 'hidden';
      el.style.left = '0px';
      el.style.top = '0px';
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      let left = x, top = y;
      if (align === 'end') left = x - rect.width;
      if (left + rect.width > vw - 8) left = vw - rect.width - 8;
      if (left < 8) left = 8;
      if (top + rect.height > vh - 8) {
        // flip up
        if (anchor) {
          const r = anchor.getBoundingClientRect();
          top = r.top - rect.height - 4;
        } else top = vh - rect.height - 8;
      }
      if (top < 8) top = 8;
      el.style.left = left + 'px';
      el.style.top = top + 'px';
      el.style.visibility = 'visible';
    }

    if (opts.onClose) currentClose = opts.onClose;
  };
})();

