
/* ═══════════════════════════════════════════════════════════════
   wabi · state, constants, persistence, utils
   Exposes everything on `window.wabi`.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const W = window.wabi = window.wabi || {};

  /* ── CONSTANTS ── */
  W.DAYS_ES   = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  W.DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  W.MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  W.MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  W.CATS = [
    { label: '#trabajo',  color: '#d97706' },
    { label: '#personal', color: '#7c3aed' },
    { label: '#casa',     color: '#059669' },
    { label: '#estudio',  color: '#0891b2' },
    { label: '#salud',    color: '#db2777' },
  ];

  W.BLOCKS = [
    { key: 'A', label: 'Bloque A', range: '6 AM – 11 AM', startHour: 6,  hours: [6,7,8,9,10,11] },
    { key: 'B', label: 'Bloque B', range: '12 PM – 5 PM', startHour: 12, hours: [12,13,14,15,16,17] },
    { key: 'C', label: 'Bloque C', range: '6 PM – 10 PM', startHour: 18, hours: [18,19,20,21,22] },
    { key: 'D', label: 'Bloque D', range: '11 PM – 5 AM', startHour: 23, hours: [23,0,1,2,3,4,5] },
  ];

  W.HOURS_DISPLAY = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,1,2,3,4,5];

  W.hourBlock = function (h) {
    // Hours 11, 17, 22 belong to the same block as their preceding cluster
    if (h >= 6 && h <= 11) return 'A';
    if (h >= 12 && h <= 17) return 'B';
    if (h >= 18 && h <= 22) return 'C';
    return 'D';
  };

  W.MODES = {
    normal:  { label: 'Normal',  desc: 'Mezcla equilibrada' },
    relax:   { label: 'Relax',   desc: 'Prioriza tareas suaves' },
    intense: { label: 'Intense', desc: 'Prioriza tareas intensas' },
  };

  W.PRESETS = window.WABI_PRODUCT_CONFIG.flexPresetMinutes.map(m=>({v:`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`,l:m>=60?(m%60?`${Math.floor(m/60)} h ${m%60}`:`${m/60} h`):`${m} min`}));

  /* ── STATE ── */
  W.state = {
    view: 'board',           // 'board' | 'month'
    filter: 'all',           // 'all' | 'pending' | 'done'
    mode: 'normal',
    weekStart: getWeekStart(new Date()),
    selectedTask: null,      // { key, idx } or null
    monthDate: new Date(),
    selectedMonthDay: null,
    mobileSelectedDay: dateKey(new Date()),
    timerInterval: null,
    sidebarOpen: false,
    theme: 'light',
  };
  W.tasks = {};

  /* ── PERSISTENCE ── */
  // Bump LS_KEY so new format applies cleanly
  const LS_KEY = 'wabi.v6';

  W.loadState = function () {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) {
        seedDemoTasks();
        W.saveState();
        return;
      }
      const obj = JSON.parse(raw);
      W.tasks = obj.tasks || {};
      if (obj.theme) W.state.theme = obj.theme;
      if (obj.mode) W.state.mode = obj.mode;
    } catch (e) {
      console.warn('wabi: load failed', e);
      W.tasks = {};
    }
  };

  W.saveState = function () {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        tasks: W.tasks,
        theme: W.state.theme,
        mode: W.state.mode,
      }));
    } catch (e) {}
  };

  /* ── ONBOARDING FLAG ── */
  W.isOnboarded = function () {
    try { return localStorage.getItem('wabi.onboarded') === '1'; } catch { return false; }
  };
  W.markOnboarded = function () {
    try { localStorage.setItem('wabi.onboarded', '1'); } catch {}
  };
  W.resetOnboarded = function () {
    try { localStorage.removeItem('wabi.onboarded'); } catch {}
  };
  W.resetOnboarding = function () {
    try { localStorage.removeItem('wabi.onboarded'); } catch {}
  };

  /* ── DATE UTILS ── */
  function getWeekStart(d) {
    const dd = new Date(d);
    const day = dd.getDay();
    dd.setDate(dd.getDate() + (day === 0 ? -6 : 1 - day));
    dd.setHours(0, 0, 0, 0);
    return dd;
  }
  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  }
  function addDays(d, n) {
    const dd = new Date(d);
    dd.setDate(dd.getDate() + n);
    return dd;
  }
  function isToday(d) {
    return dateKey(d) === dateKey(new Date());
  }
  function fromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }

  W.getWeekStart = getWeekStart;
  W.dateKey = dateKey;
  W.addDays = addDays;
  W.isToday = isToday;
  W.fromKey = fromKey;

  W.cap = function (s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; };
  W.esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  /* ── TASK CRUD ── */
  W.tasksFor = function (key) {
    return W.tasks[key] || [];
  };
  W.addTask = function (key, payload) {
    if (!W.tasks[key]) W.tasks[key] = [];
    const id = 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const task = Object.assign({
      id, title: '', done: false, subtasks: [],
      actual: '0:00', timerSecs: 0, timerRunning: false,
      planned: null, category: null, type: null, block: null,
      createdAt: Date.now(),
    }, payload);
    W.tasks[key].push(task);
    W.saveState();
    return task;
  };
  W.updateTask = function (key, idx, patch) {
    if (!W.tasks[key] || !W.tasks[key][idx]) return;
    Object.assign(W.tasks[key][idx], patch);
    W.saveState();
  };
  W.deleteTask = function (key, idx) {
    if (!W.tasks[key] || !W.tasks[key][idx]) return;
    W.tasks[key].splice(idx, 1);
    if (W.tasks[key].length === 0) delete W.tasks[key];
    W.saveState();
  };
  W.toggleTask = function (key, idx) {
    if (!W.tasks[key] || !W.tasks[key][idx]) return;
    W.tasks[key][idx].done = !W.tasks[key][idx].done;
    W.saveState();
  };
  W.moveTask = function (fromKey, fromIdx, toKey) {
    if (!W.tasks[fromKey] || !W.tasks[fromKey][fromIdx]) return;
    const t = W.tasks[fromKey].splice(fromIdx, 1)[0];
    if (W.tasks[fromKey].length === 0) delete W.tasks[fromKey];
    if (!W.tasks[toKey]) W.tasks[toKey] = [];
    W.tasks[toKey].push(t);
    W.saveState();
    return { newKey: toKey, newIdx: W.tasks[toKey].length - 1 };
  };

  /* ── DEMO SEED ── */
  function seedDemoTasks() {
    const today = new Date();
    const k = dateKey(today);
    const yk = dateKey(addDays(today, -1));
    const tk = dateKey(addDays(today, 1));
    W.tasks = {
      [yk]: [
        { id: 'd1', title: 'Revisar correo y mensajes', done: true,  subtasks: [], actual: '0:00:00', timerSecs: 0, timerRunning: false, planned: '0:20:00', category: '#trabajo', type: 'relax', block: 'A' },
      ],
      [k]: [
        { id: 'd2', title: 'Sesión de deep work',         done: false, subtasks: [{text:'Cerrar pestañas', done:true},{text:'Modo enfoque', done:false}], actual: '0:00:00', timerSecs: 0, timerRunning: false, planned: '1:30:00', category: '#trabajo', type: 'intense', block: 'A' },
        { id: 'd3', title: 'Caminar 20 minutos',          done: false, subtasks: [], actual: '0:00:00', timerSecs: 0, timerRunning: false, planned: '0:20:00', category: '#salud', type: 'relax', block: 'B' },
        { id: 'd4', title: 'Llamar a mamá',               done: false, subtasks: [], actual: '0:00:00', timerSecs: 0, timerRunning: false, planned: '0:15:00', category: '#personal', type: 'relax', block: 'C' },
        { id: 'd5', title: 'Lavar la ropa',               done: true,  subtasks: [], actual: '0:00:00', timerSecs: 0, timerRunning: false, planned: '0:30:00', category: '#casa', type: 'relax', block: 'B' },
        { id: 'd6', title: 'Leer 30 páginas',             done: false, subtasks: [], actual: '0:00:00', timerSecs: 0, timerRunning: false, planned: '0:45:00', category: '#estudio', type: 'relax', block: 'C' },
      ],
      [tk]: [
        { id: 'd7', title: 'Reunión con equipo',          done: false, subtasks: [], actual: '0:00:00', timerSecs: 0, timerRunning: false, planned: '1:00:00', category: '#trabajo', type: 'intense', block: 'A' },
        { id: 'd8', title: 'Comprar despensa',            done: false, subtasks: [], actual: '0:00:00', timerSecs: 0, timerRunning: false, planned: '0:45:00', category: '#casa', type: 'relax', block: 'B' },
      ],
    };
  }

  /* ── FILTER ── */
  W.applyFilter = function (taskList) {
    if (W.state.filter === 'pending') return taskList.filter(t => !t.done);
    if (W.state.filter === 'done')    return taskList.filter(t => t.done);
    return taskList;
  };

  W.applyMode = function (taskList) {
    const m = W.state.mode;
    if (m === 'normal') return taskList;
    return [...taskList].sort((a, b) => {
      const av = a.type === 'intense' ? 0 : (a.type === 'relax' ? 2 : 1);
      const bv = b.type === 'intense' ? 0 : (b.type === 'relax' ? 2 : 1);
      return m === 'intense' ? av - bv : bv - av;
    });
  };

  /* ── EVENTS ── */
  const listeners = {};
  W.on = function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); };
  W.emit = function (evt, ...args) { (listeners[evt] || []).forEach(fn => fn(...args)); };

  /* ── THEME ── */
  W.applyTheme = function (theme) {
    W.state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    W.saveState();
    W.emit('theme', theme);
  };

  /* ── TOAST ── */
  let toastTO;
  W.toast = function (msg) {
    clearTimeout(toastTO);
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-visible');
    toastTO = setTimeout(() => el.classList.remove('is-visible'), 2400);
  };

  /* ── VIEWPORT ── */
  W.isMobile = function () { return window.matchMedia('(max-width: 768px)').matches; };
})();

