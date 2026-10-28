(function () {
  'use strict';

  // ─── App Version ────────────────────────────────────────────────────
  var APP_VERSION = '3.2.0';
  window.REBIRTH_VERSION = APP_VERSION;

  // ─── Global Error Capture ───────────────────────────────────────────
  var _errorLog = [];
  function captureError(msg, src, line, col, err) {
    var entry = { ts: new Date().toISOString(), msg: String(msg), src: String(src || ''), line: line || 0 };
    if (err && err.stack) entry.stack = err.stack.substring(0, 300);
    _errorLog.push(entry);
    if (_errorLog.length > 20) _errorLog.shift();
    try { localStorage.setItem('rebirth_error_log', JSON.stringify(_errorLog)); } catch (e) {}
  }
  window.onerror = function (msg, src, line, col, err) { captureError(msg, src, line, col, err); };
  window.addEventListener('unhandledrejection', function (ev) {
    captureError('UnhandledRejection: ' + (ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason)));
  });
  window._rebirthErrorLog = _errorLog;

  // ─── State ───────────────────────────────────────────────────────────
  const state = {
    currentScreen: 'screen-dashboard',
    currentBlock: null,        // active block being worked on
    selectedDuration: null,    // 1,2,3,4 hours
    taskText: '',

    // Breathing — timestamp-based (survives background/tab close)
    breatheTimer: null,        // setInterval ID for UI ticks
    breatheStartedAt: null,    // Date.now() when breathing started
    breathePhase: 'inhale',    // inhale | hold | exhale (for change detection)
    breathePhaseTime: 0,       // computed from timestamp
    breatheElapsed: 0,         // computed from timestamp

    // Focus — timestamp-based
    focusTimer: null,          // setInterval ID for UI ticks
    focusTotalSeconds: 0,
    focusRemaining: 0,         // computed from timestamp
    focusStartedAt: null,      // Date.now() when focus started
    focusPausedAt: null,       // Date.now() when paused (null = running)
    focusPausedAccum: 0,       // total ms accumulated while paused
    focusPaused: false,

    // Journal
    journalDate: null,         // Date object for journal view

    // Weekly
    weekStart: null,           // Date object (Monday) for weekly view

    // Settings
    settings: {
      hourlyNotify: true,
      sound: true,
      vibration: true
    },

    // Category (new)
    selectedCategory: 'work',

    // Study
    studySubjectId: null,
    studyTopicId: null,
    studyPageIndex: 0,
    studyConversation: [],
    studyRating: 0,
    studySessionActive: false,

    // Intervals
    planClockInterval: null,
    dashboardClockInterval: null,
    particlesCreated: false,
    wakeLock: null
  };

  // ─── Categories ──────────────────────────────────────────────────────
  var CATEGORIES = [
    { id: 'study', label: 'Study', icon: '📚', color: '#5b6b7a' },
    { id: 'work', label: 'Work', icon: '💼', color: '#9e1b32' },
    { id: 'personal', label: 'Personal', icon: '🌱', color: '#6b8f71' },
    { id: 'other', label: 'Other', icon: '✳️', color: '#8a8378' }
  ];

  function getCategoryInfo(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i];
    }
    return CATEGORIES[CATEGORIES.length - 1];
  }

  // ─── Constants ───────────────────────────────────────────────────────
  const BREATHE_TOTAL = 300;
  var PHASE_DURATIONS_478 = { inhale: 4, hold: 7, exhale: 8 };
  var PHASE_DURATIONS_BOX = { inhale: 4, hold: 4, exhale: 4, holdOut: 4 };
  function getBreathPattern() {
    try { var p = localStorage.getItem('rebirth_gita_breath_pattern'); return p === 'box' ? 'box' : '478'; }
    catch (e) { return '478'; }
  }
  function getPhaseDurations() { return getBreathPattern() === 'box' ? PHASE_DURATIONS_BOX : PHASE_DURATIONS_478; }
  function getCycleLength() { return getBreathPattern() === 'box' ? 16 : 19; }
  // Keep backward-compatible refs
  var PHASE_DURATIONS = PHASE_DURATIONS_478;
  var CYCLE_LENGTH = 19;
  const FOCUS_RING_CIRCUMFERENCE = 2 * Math.PI * 90; // ~565.49
  const BREATHE_RING_CIRCUMFERENCE = 2 * Math.PI * 54;
  const SENTIMENT_MAP = {
    '-5': { emoji: '💀', label: 'Wasted', color: '#5c1f27' },
    '-4': { emoji: '😡', label: 'Terrible', color: '#6e2530' },
    '-3': { emoji: '😕', label: 'Distracted', color: '#7a3a2e' },
    '-2': { emoji: '😒', label: 'Unfocused', color: '#8a4a35' },
    '-1': { emoji: '😐', label: 'Meh', color: '#8f7a4a' },
    '0':  { emoji: '⚖️', label: 'Neutral', color: '#6b6b76' },
    '1':  { emoji: '🙂', label: 'Okay', color: '#7a8c72' },
    '2':  { emoji: '😊', label: 'Good', color: '#6b8f71' },
    '3':  { emoji: '💪', label: 'Productive', color: '#b98a3f' },
    '4':  { emoji: '🔥', label: 'Great', color: '#d99a3f' },
    '5':  { emoji: '🚀', label: 'Locked In!', color: '#c53347' }
  };

  function sentimentToProductivity(sentiment) {
    // Convert -5..+5 to 0..100 for backward compatibility
    return Math.round(((sentiment + 5) / 10) * 100);
  }

  function productivityToSentiment(productivity) {
    // Convert 0..100 back to -5..+5
    return Math.round((productivity / 100) * 10 - 5);
  }

  const FOCUS_MINUTES_MAP = { 1: 50, 2: 110, 3: 170, 4: 230, tiny: 10, 20: 20, 30: 30 };

  function getDurationLabel(durHours) {
    if (durHours === 'tiny') return 'Tiny Start';
    if (durHours === 20) return '20min break';
    if (durHours === 30) return '30min break';
    return durHours + 'h block';
  }

  var DEFAULT_SUBJECTS = [
    { id: 'subj_fr', name: 'FR', icon: '📊', color: '#5b6b7a' },
    { id: 'subj_afm', name: 'AFM', icon: '📈', color: '#9e1b32' },
    { id: 'subj_audit', name: 'Audit', icon: '🔍', color: '#d99a3f' },
    { id: 'subj_dt', name: 'DT', icon: '📋', color: '#6b8f71' },
    { id: 'subj_idt', name: 'IDT', icon: '🏛️', color: '#7b68ee' }
  ];

  // Self-compassion micro-copy (used on low-mood ratings — never celebratory, never shaming)
  var LOW_MOOD_MESSAGES = [
    'Some nights are like that.',
    'No verdict tonight. Start again when ready.',
    'Showing up counted, even here.',
    'One block doesn\u2019t write the whole case file.'
  ];

  // Welcome-back copy for gaps (never guilt-based)
  var WELCOME_BACK_MESSAGES = [
    'Good to have you back.',
    'No explanation needed. Let\u2019s go.',
    'You\u2019re here now. That\u2019s the start.'
  ];

  // ─── Helpers ─────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function $$(sel, ctx) { return (ctx || document).querySelectorAll(sel); }
  function $one(sel, ctx) { return (ctx || document).querySelector(sel); }

  function pad(n) { return String(n).padStart(2, '0'); }

  function formatMMSS(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return pad(m) + ':' + pad(s);
  }

  function formatTime(date) {
    let h = date.getHours();
    const m = pad(date.getMinutes());
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + m + ' ' + ampm;
  }

  function formatDate(date) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return days[date.getDay()] + ', ' + months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
  }

  function formatDateShort(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[date.getMonth()] + ' ' + date.getDate();
  }

  function toDateString(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function getGreeting(hour) {
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    if (hour < 21) return 'Good Evening';
    return 'Good Night';
  }

  function getTimeOfDay(hour) {
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
  }

  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  // ─── Storage ─────────────────────────────────────────────────────────
  function loadBlocks() {
    try {
      const raw = localStorage.getItem('rebirth_blocks');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveBlocks(blocks) {
    localStorage.setItem('rebirth_blocks', JSON.stringify(blocks));
  }

  function addBlock(block) {
    const blocks = loadBlocks();
    blocks.push(block);
    saveBlocks(blocks);
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem('rebirth_settings');
      if (raw) {
        state.settings = Object.assign({}, state.settings, JSON.parse(raw));
      }
    } catch (e) { /* use defaults */ }
  }

  function saveSettings() {
    localStorage.setItem('rebirth_settings', JSON.stringify(state.settings));
  }

  function getBlocksForDate(dateStr) {
    return loadBlocks().filter(function (b) { return b.date === dateStr; });
  }

  // ─── Category Budgets ────────────────────────────────────────────────
  function loadCategoryBudgets() {
    try {
      var raw = localStorage.getItem('rebirth_category_budgets');
      var defaults = { study: 120, work: 240, personal: 60, other: 60 };
      return raw ? Object.assign({}, defaults, JSON.parse(raw)) : defaults;
    } catch (e) {
      return { study: 120, work: 240, personal: 60, other: 60 };
    }
  }

  function saveCategoryBudgets(budgets) {
    localStorage.setItem('rebirth_category_budgets', JSON.stringify(budgets));
  }

  // ─── Foundations Checklist (binary, no scoring) ──────────────────────
  function loadFoundations() {
    try {
      var raw = localStorage.getItem('rebirth_foundations');
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function getTodayFoundations() {
    var all = loadFoundations();
    var today = toDateString(new Date());
    return all[today] || { wake: false, move: false, meal: false, tiny: false };
  }

  function toggleFoundation(key) {
    var all = loadFoundations();
    var today = toDateString(new Date());
    var day = all[today] || { wake: false, move: false, meal: false, tiny: false };
    day[key] = !day[key];
    all[today] = day;
    localStorage.setItem('rebirth_foundations', JSON.stringify(all));
    return day;
  }

  // ─── Opens Streak (rewards showing up, separate from completion) ─────
  function registerAppOpen() {
    try {
      var raw = localStorage.getItem('rebirth_opens');
      var data = raw ? JSON.parse(raw) : { lastOpenDate: null, streak: 0 };
      var today = toDateString(new Date());
      if (data.lastOpenDate === today) {
        return data; // already counted today
      }
      var yesterday = toDateString(addDays(new Date(), -1));
      if (data.lastOpenDate === yesterday) {
        data.streak = (data.streak || 0) + 1;
      } else {
        data.streak = 1; // reset silently, no shame copy anywhere
      }
      data.lastOpenDate = today;
      localStorage.setItem('rebirth_opens', JSON.stringify(data));
      return data;
    } catch (e) {
      return { lastOpenDate: null, streak: 0 };
    }
  }

  function getOpensData() {
    try {
      var raw = localStorage.getItem('rebirth_opens');
      return raw ? JSON.parse(raw) : { lastOpenDate: null, streak: 0 };
    } catch (e) { return { lastOpenDate: null, streak: 0 }; }
  }

  // Returns how many days ago the app was last opened, before today's open was registered.
  // Used only to show a gentle welcome-back message — never a guilt trigger.
  function getGapDays(dataBeforeRegister) {
    if (!dataBeforeRegister || !dataBeforeRegister.lastOpenDate) return 0;
    var last = new Date(dataBeforeRegister.lastOpenDate + 'T00:00:00');
    var today = new Date(toDateString(new Date()) + 'T00:00:00');
    var diffMs = today - last;
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  // ─── Completion Streak (consecutive days with >=1 completed block) ───
  function getCompletionStreak() {
    var blocks = loadBlocks();
    var dateSet = {};
    blocks.forEach(function (b) { if (b.completed) dateSet[b.date] = true; });

    var streak = 0;
    var cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    // If nothing completed today, streak counts back from yesterday instead
    // (so opening the app today doesn't zero out an intact streak before you've had a chance to act)
    if (!dateSet[toDateString(cursor)]) {
      cursor = addDays(cursor, -1);
    }

    while (dateSet[toDateString(cursor)]) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  // ─── Fresh Start (temporal landmark reset — never deletes data) ──────
  function getFreshStartDate() {
    var raw = localStorage.getItem('rebirth_freshstart');
    if (raw) return raw;
    // Default to the date of the earliest recorded block, or today if none
    var blocks = loadBlocks();
    if (blocks.length > 0) {
      var earliest = blocks.reduce(function (a, b) { return a.date < b.date ? a : b; });
      return earliest.date;
    }
    return toDateString(new Date());
  }

  function setFreshStart() {
    localStorage.setItem('rebirth_freshstart', toDateString(new Date()));
  }

  function getDaysSinceFreshStart() {
    var start = new Date(getFreshStartDate() + 'T00:00:00');
    var today = new Date(toDateString(new Date()) + 'T00:00:00');
    var diff = Math.round((today - start) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diff);
  }

  // ─── Your Why (private intrinsic-motivation anchor) ──────────────────
  function getYourWhy() {
    try {
      return localStorage.getItem('rebirth_your_why') || '';
    } catch (e) { return ''; }
  }

  function setYourWhy(text) {
    try {
      localStorage.setItem('rebirth_your_why', text.trim().substring(0, 200));
    } catch (e) { /* ignore */ }
  }

  // ─── If-Then Lapse Plan ───────────────────────────────────────────────
  function getIfThenPlan() {
    try {
      return localStorage.getItem('rebirth_ifthen_plan') || '';
    } catch (e) { return ''; }
  }

  function setIfThenPlan(text) {
    try {
      localStorage.setItem('rebirth_ifthen_plan', text.trim().substring(0, 200));
    } catch (e) { /* ignore */ }
  }

  // ─── Session Persistence (survive tab close / reload) ───────────────
  function saveSession() {
    try {
      var session = {
        currentBlock: state.currentBlock,
        currentScreen: state.currentScreen,
        breatheStartedAt: state.breatheStartedAt,
        focusStartedAt: state.focusStartedAt,
        focusPausedAt: state.focusPausedAt,
        focusPausedAccum: state.focusPausedAccum,
        focusTotalSeconds: state.focusTotalSeconds,
        savedAt: Date.now()
      };
      localStorage.setItem('rebirth_active_session', JSON.stringify(session));
    } catch (e) { /* storage full or unavailable */ }
  }

  function loadSession() {
    try {
      var raw = localStorage.getItem('rebirth_active_session');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clearSession() {
    localStorage.removeItem('rebirth_active_session');
  }

  function restoreSession() {
    var session = loadSession();
    if (!session || !session.currentBlock) return false;

    // Don't restore sessions older than 8 hours (stale)
    if (Date.now() - session.savedAt > 8 * 60 * 60 * 1000) {
      clearSession();
      return false;
    }

    state.currentBlock = session.currentBlock;
    state.focusTotalSeconds = session.focusTotalSeconds || 0;

    // Determine which screen to restore to
    var screenToRestore = session.currentScreen;

    if (screenToRestore === 'screen-breathe' && session.breatheStartedAt) {
      var breatheElapsed = Math.floor((Date.now() - session.breatheStartedAt) / 1000);
      if (breatheElapsed >= BREATHE_TOTAL) {
        // Breathing already finished while away → go to focus
        state.breatheStartedAt = null;
        state.focusStartedAt = Date.now();
        state.focusPausedAt = null;
        state.focusPausedAccum = 0;
        screenToRestore = 'screen-focus';
      } else {
        state.breatheStartedAt = session.breatheStartedAt;
      }
    } else if (screenToRestore === 'screen-focus' && session.focusStartedAt) {
      state.focusStartedAt = session.focusStartedAt;
      state.focusPausedAt = session.focusPausedAt;
      state.focusPausedAccum = session.focusPausedAccum || 0;

      var remaining = getFocusRemaining();
      if (remaining <= 0) {
        // Focus already finished while away → go to rate
        screenToRestore = 'screen-rate';
      }
    } else if (screenToRestore === 'screen-rate') {
      // Fine, go to rate
    } else {
      // Unknown screen or plan screen — don't restore
      clearSession();
      return false;
    }

    navigateTo(screenToRestore);
    return true;
  }

  // ─── Audio (Web Audio API) ──────────────────────────────────────────
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playChime() {
    if (!state.settings.sound) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      // A soft two-tone chime
      const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
      freqs.forEach(function (freq, i) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.15);
        gain.gain.setValueAtTime(0, now + i * 0.15);
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.15 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.8);
      });
    } catch (e) { /* audio not available */ }
  }

  function playPhaseTone(phase) {
    if (!state.settings.sound) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      const freq = phase === 'inhale' ? 396 : phase === 'hold' ? 432 : 528;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) { /* audio not available */ }
  }

  function vibrate(pattern) {
    if (!state.settings.vibration) return;
    if (navigator.vibrate) {
      navigator.vibrate(pattern || 50);
    }
  }

  // ─── Wake Lock ──────────────────────────────────────────────────────
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        state.wakeLock = await navigator.wakeLock.request('screen');
        state.wakeLock.addEventListener('release', function () {
          state.wakeLock = null;
        });
      }
    } catch (e) { /* wake lock not available */ }
  }

  function releaseWakeLock() {
    if (state.wakeLock) {
      state.wakeLock.release();
      state.wakeLock = null;
    }
  }

  // ─── Notifications (Service Worker based) ──────────────────────────
  function requestNotificationPermission() {
    if (window.__rebirthCapacitorNotifications) { window.__rebirthRequestNotificationPermission(); return; }
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(function(result) {
        if (result === 'granted') {
          startHourlyNotifications();
        }
      });
    }
  }

  function sendToSW(message) {
    if (window.__rebirthCapacitorNotifications) return;
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
  }

  function showNotification(title, body, tag) {
    if (window.__rebirthCapacitorNotifications) { window.__rebirthShowNotification(title, body, tag); return; }
    // Try SW notification first (works in background), fallback to main thread
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      sendToSW({ type: 'SHOW_NOTIFICATION', title: title, body: body, tag: tag || 'rebirth' });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body: body, icon: 'icon-192.png' }); }
      catch (e) { /* fallback failed */ }
    }
  }

  function startHourlyNotifications() {
    if (!state.settings.hourlyNotify) return;
    if (window.__rebirthCapacitorNotifications) { window.__rebirthStartHourlyNotifications(); return; }
    if ('Notification' in window && Notification.permission !== 'granted') return;
    sendToSW({ type: 'START_HOURLY' });
  }

  function stopHourlyNotifications() {
    if (window.__rebirthCapacitorNotifications) { window.__rebirthStopHourlyNotifications(); return; }
    sendToSW({ type: 'STOP_HOURLY' });
  }

  function scheduleFocusDoneNotification() {
    // Tell the SW to fire a notification when focus time expires
    // This works even if the tab is killed
    var remaining = getFocusRemaining();
    if (window.__rebirthCapacitorNotifications && remaining > 0) {
      window.__rebirthScheduleFocusDone(remaining * 1000, 'Re-birth \u2705 Focus Complete!', 'Your focus block is done! Time to rate your session.');
      return;
    }
    if (remaining <= 0) return;
    sendToSW({
      type: 'SCHEDULE_FOCUS_DONE',
      delayMs: remaining * 1000,
      title: 'Re-birth ✅ Focus Complete!',
      body: 'Your focus block is done! Time to rate your session.'
    });
  }

  function cancelFocusDoneNotification() {
    if (window.__rebirthCapacitorNotifications) { window.__rebirthCancelFocusDone(); return; }
    sendToSW({ type: 'CANCEL_FOCUS_DONE' });
  }

  // ─── Dashboard Live Clock ──────────────────────────────────────────
  function startDashboardClock() {
    stopDashboardClock();
    updateLiveClock();
    state.dashboardClockInterval = setInterval(function () {
      updateLiveClock();
      // Also refresh greeting if hour changed (e.g. morning → afternoon)
      updateGreeting();
    }, 1000);
  }

  function stopDashboardClock() {
    if (state.dashboardClockInterval) {
      clearInterval(state.dashboardClockInterval);
      state.dashboardClockInterval = null;
    }
  }

  function updateLiveClock() {
    const el = $('live-clock');
    if (!el) return;
    const now = new Date();
    el.textContent = formatTime(now);
  }

  // ─── Particles ──────────────────────────────────────────────────────
  function createParticles() {
    if (state.particlesCreated) return;
    const container = $('particles-container') || document.getElementById('particles-container');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 15; i++) {
      const dot = document.createElement('div');
      dot.className = 'particle';
      dot.style.left = Math.random() * 100 + '%';
      dot.style.top = Math.random() * 100 + '%';
      dot.style.width = dot.style.height = (Math.random() * 4 + 2) + 'px';
      dot.style.animationDelay = (Math.random() * 6) + 's';
      dot.style.animationDuration = (Math.random() * 8 + 8) + 's';
      dot.style.opacity = String(Math.random() * 0.5 + 0.1);
      container.appendChild(dot);
    }
    state.particlesCreated = true;
  }

  // ─── Screen Navigation ──────────────────────────────────────────────
  function navigateTo(screenId) {
    // Normalize: allow both 'dashboard' and 'screen-dashboard'
    if (screenId && screenId.indexOf('screen-') !== 0) {
      screenId = 'screen-' + screenId;
    }
    const screens = $$('.screen');
    screens.forEach(function (s) {
      s.classList.remove('active');
    });
    const target = $(screenId);
    if (target) {
      target.classList.add('active');
    }
    state.currentScreen = screenId;

    // Update bottom nav: show/hide and highlight active tab
    var mainNav = $('main-bottom-nav');
    if (mainNav) {
      var navScreens = ['screen-dashboard', 'screen-journal', 'screen-weekly', 'screen-study', 'screen-sadhana', 'screen-settings'];
      var showNav = navScreens.indexOf(screenId) !== -1;
      if (showNav) {
        mainNav.classList.remove('nav-hidden');
      } else {
        mainNav.classList.add('nav-hidden');
      }
      $$('#main-bottom-nav .nav-item').forEach(function (navBtn) {
        var navScreen = navBtn.getAttribute('data-screen');
        if (navScreen) {
          var fullId = navScreen.indexOf('screen-') === 0 ? navScreen : 'screen-' + navScreen;
          if (fullId === screenId) {
            navBtn.classList.add('active');
          } else {
            navBtn.classList.remove('active');
          }
        }
      });
    }

    // Lifecycle hooks
    switch (screenId) {
      case 'screen-dashboard':
        onDashboardEnter();
        break;
      case 'screen-plan':
        onPlanEnter();
        break;
      case 'screen-breathe':
        onBreatheEnter();
        break;
      case 'screen-prefocus':
        onPrefocusEnter();
        break;
      case 'screen-focus':
        onFocusEnter();
        break;
      case 'screen-rate':
        onRateEnter();
        break;
      case 'screen-journal':
        onJournalEnter();
        break;
      case 'screen-weekly':
        onWeeklyEnter();
        break;
      case 'screen-settings':
        onSettingsEnter();
        break;
      case 'screen-study':
        onStudyEnter();
        break;
      case 'screen-study-subject':
        onStudySubjectEnter();
        break;
      case 'screen-study-session':
        onStudySessionEnter();
        break;
      case 'screen-sadhana':
        // Sadhana module renders itself via MutationObserver
        break;
      case 'screen-sadhana-runner':
        // Sadhana runner renders via MutationObserver
        break;
      case 'screen-breathe-free':
        onBreatheFreeEnter();
        break;
      default:
        // Route safety: unknown routes redirect to Home
        console.warn('[Re-birth] Unknown route: ' + screenId + ', redirecting to dashboard');
        navigateTo('screen-dashboard');
        return;
    }

    // Clean up when leaving screens
    if (screenId !== 'screen-plan') {
      stopPlanClock();
    }
    if (screenId !== 'screen-breathe') {
      stopBreathing();
    }
    if (screenId !== 'screen-breathe-free') {
      stopBreatheFree();
    }
    if (screenId !== 'screen-breathe' && screenId !== 'screen-focus' && screenId !== 'screen-breathe-free') {
      releaseWakeLock();
    }
    if (screenId !== 'screen-dashboard') {
      stopDashboardClock();
    }
  }

  // ─── Dashboard ──────────────────────────────────────────────────────
  function onDashboardEnter() {
    createParticles();
    updateGreeting();
    updateDashboardStats();
    renderBlocksList();
    updateActiveBlockCard();
    renderStreaksCard();
    renderCategoryBudgets();
    renderFoundationsChecklist();
    renderTodaysMotion();
    renderWelcomeBack();
    renderIfThenNudge();
    startDashboardClock();
  }

  function renderWelcomeBack() {
    var card = $('welcome-back-card');
    var textEl = $('welcome-back-text');
    if (!card || !textEl) return;

    if (state.gapDaysOnLaunch >= 2) {
      textEl.textContent = WELCOME_BACK_MESSAGES[Math.floor(Math.random() * WELCOME_BACK_MESSAGES.length)];
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
    // Only show once per app load, regardless of how many times Home is revisited
    state.gapDaysOnLaunch = 0;
  }

  // ─── If-Then Lapse Plan Nudge ─────────────────────────────────────────
  // Surfaces the user's own pre-written recovery sentence, only when a gap
  // is actually detected — never as a guilt trigger, purely a reminder of
  // what they already decided to do while calm.
  function detectGap() {
    var now = new Date();
    var today = toDateString(now);
    var yesterday = toDateString(addDays(now, -1));

    var yesterdayBlocks = getBlocksForDate(yesterday);
    var todayBlocks = getBlocksForDate(today);

    // A full day passed with nothing logged at all
    if (yesterdayBlocks.length === 0) return true;

    // It's mid-afternoon or later and nothing has been started today yet
    if (now.getHours() >= 13 && todayBlocks.length === 0) return true;

    return false;
  }

  function renderIfThenNudge() {
    var card = $('ifthen-nudge-card');
    var textEl = $('ifthen-nudge-text');
    if (!card || !textEl) return;

    var plan = getIfThenPlan();
    if (!plan || state.ifThenDismissedThisSession || !detectGap()) {
      card.classList.add('hidden');
      return;
    }

    textEl.textContent = plan;
    card.classList.remove('hidden');
  }

  function updateGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const greetEl = $('greeting-text');
    const dateEl = $('greeting-date');
    if (greetEl) greetEl.textContent = getGreeting(hour);
    if (dateEl) dateEl.textContent = formatDate(now);

    // Time-of-day body class for CSS gradient shifts
    var tod = getTimeOfDay(hour);
    document.body.classList.remove('morning', 'afternoon', 'evening', 'night');
    document.body.classList.add(tod);

    // Fresh-Start day counter (temporal landmark — never implies past days failed)
    var dayCountEl = $('freshstart-day-count');
    if (dayCountEl) {
      dayCountEl.textContent = 'Day ' + getDaysSinceFreshStart();
    }
  }

  // ─── Streaks (Opens + Completion) ────────────────────────────────────
  function renderStreaksCard() {
    var opensData = getOpensData();
    var completionStreak = getCompletionStreak();

    var opensEl = $('opens-streak-value');
    var opensLabelEl = $('opens-streak-label');
    var compEl = $('completion-streak-value');
    var compLabelEl = $('completion-streak-label');

    if (opensEl) opensEl.textContent = opensData.streak || 0;
    if (opensLabelEl) {
      var os = opensData.streak || 0;
      opensLabelEl.textContent = os >= 1 ? 'days shown up' : 'Show up today';
    }
    if (compEl) compEl.textContent = completionStreak;
    if (compLabelEl) {
      compLabelEl.textContent = completionStreak >= 1
        ? (completionStreak === 1 ? 'day protected' : 'days protected')
        : 'Complete one to start';
    }
  }

  // ─── Category Budgets (Today, per category) ─────────────────────────
  function renderCategoryBudgets() {
    var container = $('category-budgets-list');
    if (!container) return;

    var budgets = loadCategoryBudgets();
    var today = toDateString(new Date());
    var blocks = getBlocksForDate(today);

    var minutesByCategory = { study: 0, work: 0, personal: 0, other: 0 };
    blocks.forEach(function (b) {
      var cat = b.category || 'other';
      minutesByCategory[cat] = (minutesByCategory[cat] || 0) + (b.focusMinutes || 0);
    });

    container.innerHTML = '';
    CATEGORIES.forEach(function (cat) {
      var mins = minutesByCategory[cat.id] || 0;
      var target = budgets[cat.id] || 60;
      var pct = Math.min(100, Math.round((mins / target) * 100));

      var row = document.createElement('div');
      row.className = 'category-budget-row';
      row.innerHTML =
        '<div class="category-budget-header">' +
          '<span class="category-budget-name">' + cat.icon + ' ' + cat.label + '</span>' +
          '<span class="category-budget-amount">' + mins + 'm / ' + target + 'm</span>' +
        '</div>' +
        '<div class="category-budget-track">' +
          '<div class="category-budget-fill" style="width:' + pct + '%;background:' + cat.color + '"></div>' +
        '</div>';
      container.appendChild(row);
    });
  }

  // ─── Foundations Checklist ────────────────────────────────────────────
  var FOUNDATIONS_LABELS = {
    wake: 'Woke up around the same time today',
    move: 'Moved my body today (any amount)',
    meal: 'Ate one meal without added sugar / ultra-processed food',
    tiny: 'Did the smallest possible unit of today\u2019s task'
  };

  function renderFoundationsChecklist() {
    var container = $('foundations-list');
    if (!container) return;
    var today = getTodayFoundations();
    container.innerHTML = '';

    Object.keys(FOUNDATIONS_LABELS).forEach(function (key) {
      var row = document.createElement('div');
      row.className = 'foundation-row';
      var checked = !!today[key];
      row.innerHTML =
        '<label class="foundation-check">' +
          '<input type="checkbox" data-foundation="' + key + '"' + (checked ? ' checked' : '') + '>' +
          '<span class="foundation-box"></span>' +
          '<span class="foundation-text">' + FOUNDATIONS_LABELS[key] + '</span>' +
        '</label>';
      container.appendChild(row);
    });

    // Bind checkboxes (re-bound each render since container is rebuilt)
    $$('#foundations-list input[data-foundation]').forEach(function (input) {
      input.addEventListener('change', function () {
        toggleFoundation(this.getAttribute('data-foundation'));
        renderTodaysMotion();
      });
    });
  }

  // ─── Today's Motion (Progress Principle — continuous micro-progress) ──
  function renderTodaysMotion() {
    var bar = $('todays-motion-fill');
    if (!bar) return;

    var today = toDateString(new Date());
    var blocks = getBlocksForDate(today);
    var foundations = getTodayFoundations();

    var points = 0;
    var maxPoints = 10;

    points += 1; // opened the app today — always at least this much motion
    points += Object.keys(foundations).filter(function (k) { return foundations[k]; }).length; // up to 4
    points += Math.min(blocks.length, 5); // up to 5 for blocks (any size, including Tiny Start)

    var pct = Math.min(100, Math.round((points / maxPoints) * 100));
    bar.style.width = pct + '%';
  }

  function updateDashboardStats() {
    const today = toDateString(new Date());
    const blocks = getBlocksForDate(today);

    const totalBlocks = blocks.length;
    let totalProd = 0;
    let totalFocusMin = 0;

    blocks.forEach(function (b) {
      totalProd += (b.productivity || 0);
      totalFocusMin += (b.focusMinutes || 0);
    });

    const avgProd = totalBlocks > 0 ? Math.round(totalProd / totalBlocks) : 0;
    const totalHours = (totalFocusMin / 60).toFixed(1);

    const prodEl = $('stat-productivity');
    const blocksEl = $('stat-blocks');
    const focusEl = $('stat-focus');

    if (prodEl) prodEl.textContent = avgProd + '%';
    if (blocksEl) blocksEl.textContent = totalBlocks;
    if (focusEl) focusEl.textContent = totalHours + 'h';
  }

  function renderBlocksList() {
    const container = $('blocks-list');
    const emptyState = $('empty-state');
    if (!container) return;

    const today = toDateString(new Date());
    const blocks = getBlocksForDate(today);

    container.innerHTML = '';

    if (blocks.length === 0) {
      if (emptyState) emptyState.style.display = '';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    blocks.sort(function (a, b) {
      return (b.id || 0) - (a.id || 0);
    });

    blocks.forEach(function (block) {
      const card = document.createElement('div');
      card.className = 'block-card';

      const sentLabel = getSentimentLabel(block);
      const prodPercent = block.productivity || 0;

      // Mood-colored left border
      card.style.borderLeft = '4px solid ' + sentLabel.color;

      var catInfo = getCategoryInfo(block.category || 'other');
      var durationLabel = getDurationLabel(block.durationHours);
      var wanderNote = (block.wanderCount > 0)
        ? '<span>Mind wandered ~' + block.wanderCount + '</span>'
        : '';

      card.innerHTML =
        '<div class="block-card-header">' +
          '<span class="block-card-time">' + escapeHtml(block.startTime || '') + '</span>' +
          '<span class="block-card-category-badge" style="color:' + catInfo.color + '">' + catInfo.icon + ' ' + catInfo.label + '</span>' +
          '<span class="block-card-prod" style="color:' + sentLabel.color + '">' + sentLabel.emoji + ' ' + escapeHtml(sentLabel.text) + '</span>' +
        '</div>' +
        '<div class="block-card-task">' + escapeHtml(block.task || '') + '</div>' +
        '<div class="block-card-bar-track">' +
          '<div class="block-card-bar-fill" style="width:' + prodPercent + '%;background:' + sentLabel.color + '"></div>' +
        '</div>' +
        '<div class="block-card-meta">' +
          '<span>' + durationLabel + '</span>' +
          '<span>' + (block.focusMinutes || 0) + ' min focus</span>' +
          wanderNote +
        '</div>';

      container.appendChild(card);
    });
  }

  function updateActiveBlockCard() {
    const card = $('active-block-card');
    if (!card) return;

    if (!state.currentBlock) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';
    const phaseBadge = $('active-phase-badge');
    const timerEl = $('active-timer');
    const taskEl = $('active-task-text');
    const resumeBtn = $('btn-resume-block');

    if (taskEl) taskEl.textContent = state.currentBlock.task || '';
    if (phaseBadge) {
      var resumeTarget = getActiveBlockResumeScreen();
      if (resumeTarget === 'screen-breathe') {
        phaseBadge.textContent = 'Breathing';
      } else if (resumeTarget === 'screen-focus') {
        phaseBadge.textContent = 'Focusing';
      } else {
        phaseBadge.textContent = 'Ready to focus';
      }
    }

    if (resumeBtn) {
      resumeBtn.onclick = function () {
        navigateTo(getActiveBlockResumeScreen());
      };
    }
  }

  // Determines which screen an in-progress block should resume to, based on
  // which timestamps are set — needed because "Not yet" on the pre-focus gate
  // returns to dashboard while the block stays active in the background.
  function getActiveBlockResumeScreen() {
    if (state.focusStartedAt) return 'screen-focus';
    if (state.breatheStartedAt) return 'screen-breathe';
    return 'screen-prefocus';
  }

  function getProductivityColor(val) {
    if (val <= 20) return '#5c1f27';
    if (val <= 40) return '#7a3a2e';
    if (val <= 60) return '#6b6b76';
    if (val <= 80) return '#6b8f71';
    return '#d99a3f';
  }

  function getSentimentLabel(block) {
    var sentiment = (typeof block.sentiment === 'number') ? block.sentiment : productivityToSentiment(block.productivity || 0);
    var info = SENTIMENT_MAP[String(sentiment)] || SENTIMENT_MAP['0'];
    var prefix = sentiment > 0 ? '+' : '';
    return { text: prefix + sentiment + ' ' + info.label, color: info.color, emoji: info.emoji, sentiment: sentiment };
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ─── Plan Screen ───────────────────────────────────────────────────
  function onPlanEnter() {
    state.taskText = '';
    const taskInput = $('task-input');
    if (taskInput) {
      taskInput.value = '';
      taskInput.focus();
    }
    updateCharCount();

    // Pre-select default duration: last used, or 1 hour
    var defaultDur = 1;
    try {
      var lastBlocks = loadBlocks();
      if (lastBlocks.length > 0) {
        var lastDur = lastBlocks[lastBlocks.length - 1].durationHours;
        if (lastDur >= 1 && lastDur <= 4) defaultDur = lastDur;
      }
    } catch (e) { /* use default */ }
    selectDuration(defaultDur);

    // Pre-select last-used category, defaulting to 'work'
    var defaultCat = 'work';
    try {
      var catBlocks = loadBlocks();
      if (catBlocks.length > 0) {
        var lastCat = catBlocks[catBlocks.length - 1].category;
        if (lastCat) defaultCat = lastCat;
      }
    } catch (e) { /* use default */ }
    selectCategory(defaultCat);

    startPlanClock();
  }

  function startPlanClock() {
    stopPlanClock();
    updatePlanClock();
    state.planClockInterval = setInterval(updatePlanClock, 1000);
  }

  function stopPlanClock() {
    if (state.planClockInterval) {
      clearInterval(state.planClockInterval);
      state.planClockInterval = null;
    }
  }

  function updatePlanClock() {
    const el = $('plan-current-time');
    if (el) el.textContent = formatTime(new Date());
  }

  function updateCharCount() {
    const input = $('task-input');
    const countEl = $('char-count');
    if (input && countEl) {
      countEl.textContent = input.value.length + '/80';
    }
  }

  function clearDurationSelection() {
    $$('.duration-btn').forEach(function (btn) {
      btn.classList.remove('active');
    });
  }

  function selectDuration(value) {
    // value is either a number (1-4 hours) or the string 'tiny'
    state.selectedDuration = value;
    $$('.duration-btn').forEach(function (btn) {
      const btnVal = btn.getAttribute('data-duration');
      const isMatch = (btnVal === 'tiny') ? (value === 'tiny') : (parseInt(btnVal, 10) === value);
      btn.classList.toggle('active', isMatch);
    });
    updateDurationBreakdown();
    updateBeginButton();
  }

  function updateDurationBreakdown() {
    const el = $('duration-breakdown');
    if (!el) return;
    if (state.selectedDuration === null || state.selectedDuration === undefined) {
      el.textContent = 'Select a duration to see the breakdown';
      return;
    }
    if (state.selectedDuration === 'tiny') {
      el.textContent = 'Just 10 focused minutes \u2014 straight to focus, no breathing step';
      return;
    }
    if (state.selectedDuration === 20) {
      el.textContent = '20 min short break \u2014 straight to focus, no breathing step';
      return;
    }
    if (state.selectedDuration === 30) {
      el.textContent = '30 min break \u2014 straight to focus, no breathing step';
      return;
    }
    const h = state.selectedDuration;
    const focusMin = FOCUS_MINUTES_MAP[h] || 50;
    el.textContent = '2 min plan + 5 min breathe + ' + focusMin + ' min focus + 1 min rate';
  }

  function updateBeginButton() {
    const btn = $('btn-begin-breathing');
    if (!btn) return;
    const hasTask = state.taskText.trim().length > 0;
    const hasDuration = state.selectedDuration !== null;
    btn.disabled = !(hasTask && hasDuration);
  }

  function selectCategory(catId) {
    state.selectedCategory = catId;
    $$('.category-chip').forEach(function (chip) {
      chip.classList.toggle('active', chip.getAttribute('data-category') === catId);
    });
  }

  function beginBlock() {
    const now = new Date();
    state.currentBlock = {
      id: Date.now(),
      date: toDateString(now),
      startTime: pad(now.getHours()) + ':' + pad(now.getMinutes()),
      task: state.taskText.trim(),
      category: state.selectedCategory || 'work',
      durationHours: state.selectedDuration,
      focusMinutes: FOCUS_MINUTES_MAP[state.selectedDuration] || 50,
      productivity: 0,
      note: '',
      wanderCount: 0,
      completed: false
    };

    // Reset timestamp trackers for fresh block
    state.breatheStartedAt = null;
    state.focusStartedAt = null;
    state.focusPausedAt = null;
    state.focusPausedAccum = 0;

    // Tiny Start blocks skip breathing entirely — the whole point is near-zero friction to begin
    if (state.selectedDuration === 'tiny' || state.selectedDuration === 20 || state.selectedDuration === 30) {
      navigateTo('screen-prefocus');
    } else {
      navigateTo('screen-breathe');
    }
  }

  // ─── Breathing Screen (Timestamp-based) ────────────────────────────
  function onBreatheEnter() {
    requestWakeLock();

    // Show task info
    const taskEl = $('breathe-next-task');
    const durEl = $('breathe-next-duration');
    if (taskEl && state.currentBlock) taskEl.textContent = state.currentBlock.task;
    if (durEl && state.currentBlock) durEl.textContent = getDurationLabel(state.currentBlock.durationHours);

    // Start timestamp if not resuming a saved session
    if (!state.breatheStartedAt) {
      state.breatheStartedAt = Date.now();
    }
    state.breathePhase = ''; // force first update to detect phase

    updateBreathingFromTimestamp();
    startBreathingTick();
    saveSession();
  }

  function getBreathingElapsed() {
    if (!state.breatheStartedAt) return 0;
    return Math.floor((Date.now() - state.breatheStartedAt) / 1000);
  }

  function computeBreathingPhase(elapsed) {
    var pd = getPhaseDurations();
    var cl = getCycleLength();
    var pattern = getBreathPattern();
    var cyclePos = elapsed % cl;
    if (pattern === 'box') {
      if (cyclePos < pd.inhale) {
        return { phase: 'inhale', phaseTime: cyclePos };
      } else if (cyclePos < pd.inhale + pd.hold) {
        return { phase: 'hold', phaseTime: cyclePos - pd.inhale };
      } else if (cyclePos < pd.inhale + pd.hold + pd.exhale) {
        return { phase: 'exhale', phaseTime: cyclePos - pd.inhale - pd.hold };
      } else {
        return { phase: 'holdOut', phaseTime: cyclePos - pd.inhale - pd.hold - pd.exhale };
      }
    } else {
      if (cyclePos < pd.inhale) {
        return { phase: 'inhale', phaseTime: cyclePos };
      } else if (cyclePos < pd.inhale + pd.hold) {
        return { phase: 'hold', phaseTime: cyclePos - pd.inhale };
      } else {
        return { phase: 'exhale', phaseTime: cyclePos - pd.inhale - pd.hold };
      }
    }
  }

  function startBreathingTick() {
    stopBreathing();
    // 250ms ticks for smooth UI; actual time always from timestamps
    state.breatheTimer = setInterval(function () {
      updateBreathingFromTimestamp();
    }, 250);
  }

  function updateBreathingFromTimestamp() {
    var elapsed = getBreathingElapsed();

    // Check if breathing is done
    if (elapsed >= BREATHE_TOTAL) {
      stopBreathing();
      state.breatheStartedAt = null;
      playChime();
      vibrate([100, 50, 100, 50, 100]);
      setTimeout(function () {
        navigateTo('screen-prefocus');
      }, 500);
      return;
    }

    // Compute current phase from elapsed time
    var phaseInfo = computeBreathingPhase(elapsed);

    // Detect phase change for audio/haptic feedback
    // Only fire feedback if we're in the foreground (not catching up from background)
    if (phaseInfo.phase !== state.breathePhase && state.breathePhase !== '') {
      vibrate(30);
      playPhaseTone(phaseInfo.phase);
    }

    state.breatheElapsed = elapsed;
    state.breathePhase = phaseInfo.phase;
    state.breathePhaseTime = phaseInfo.phaseTime;

    updateBreatheTimeRemaining();
    updateBreathingUI();
  }

  function stopBreathing() {
    if (state.breatheTimer) {
      clearInterval(state.breatheTimer);
      state.breatheTimer = null;
    }
  }

  function updateBreatheTimeRemaining() {
    const remaining = Math.max(0, BREATHE_TOTAL - state.breatheElapsed);
    const el = $('breathe-time-remaining');
    if (el) el.textContent = formatMMSS(remaining);
  }

  function updateBreathingUI() {
    const phase = state.breathePhase;
    const phaseTime = state.breathePhaseTime;
    const phaseDur = getPhaseDurations()[phase];
    if (!phaseDur) return; // safety check
    const phaseProgress = phaseTime / phaseDur; // 0 → 1

    // Theme class on breathe screen
    const screen = $('screen-breathe');
    if (screen) {
      screen.classList.remove('phase-inhale', 'phase-hold', 'phase-exhale');
      screen.classList.add('phase-' + phase);
    }

    // Phase label
    const labelEl = $('phase-label');
    if (labelEl) {
      labelEl.textContent = phase.charAt(0).toUpperCase() + phase.slice(1);
    }

    // Countdown for current phase
    const countdownEl = $('countdown');
    if (countdownEl) {
      countdownEl.textContent = Math.max(0, phaseDur - phaseTime);
    }

    // Instruction text
    const instrEl = $('instruction');
    if (instrEl) {
      if (phase === 'inhale') instrEl.textContent = 'Breathe in slowly through your nose';
      else if (phase === 'hold') instrEl.textContent = 'Hold your breath gently';
      else instrEl.textContent = 'Exhale slowly through your mouth';
    }

    // Circle animation scale
    let scale = 1;
    if (phase === 'inhale') {
      scale = 0.75 + (1.15 - 0.75) * phaseProgress;
    } else if (phase === 'hold') {
      // Gentle pulse at 1.15
      scale = 1.15 + Math.sin(phaseProgress * Math.PI * 2) * 0.03;
    } else {
      scale = 1.15 - (1.15 - 0.75) * phaseProgress;
    }

    const circle = $('breathing-circle');
    if (circle) {
      circle.style.transform = 'scale(' + scale.toFixed(3) + ')';
    }

    // Progress ring
    const progressCircle = $('progress-circle');
    if (progressCircle) {
      const totalProgress = state.breatheElapsed / BREATHE_TOTAL;
      const offset = BREATHE_RING_CIRCUMFERENCE * (1 - totalProgress);
      progressCircle.style.strokeDasharray = BREATHE_RING_CIRCUMFERENCE;
      progressCircle.style.strokeDashoffset = offset;
    }

    // Phase dots
    const dotsContainer = $('phase-dots');
    if (dotsContainer) {
      const dots = dotsContainer.querySelectorAll('.phase-dot');
      const phases = ['inhale', 'hold', 'exhale'];
      dots.forEach(function (dot, i) {
        dot.classList.toggle('active', phases[i] === phase);
      });
    }
  }

  function skipBreathing() {
    stopBreathing();
    state.breatheStartedAt = null;
    navigateTo('screen-prefocus');
  }

  // ─── Pre-Focus Gate ─────────────────────────────────────────────────
  // The one deliberate friction point in the app: a half-second pause
  // between "ready to start" and the timer actually running.
  var WHY_SHOWN_COUNTER_KEY = 'rebirth_prefocus_count';

  function onPrefocusEnter() {
    var taskEl = $('prefocus-task-text');
    if (taskEl && state.currentBlock) taskEl.textContent = state.currentBlock.task || '';

    var whyEl = $('prefocus-why');
    var promptEl = $one('.prefocus-prompt');
    var count = 0;
    try {
      count = parseInt(localStorage.getItem(WHY_SHOWN_COUNTER_KEY) || '0', 10);
    } catch (e) { /* ignore */ }
    count++;
    try { localStorage.setItem(WHY_SHOWN_COUNTER_KEY, String(count)); } catch (e) { /* ignore */ }

    var why = getYourWhy();
    // Surface "Your Why" only occasionally (every 4th time) so it doesn't lose effect through habituation
    if (why && count % 4 === 0) {
      if (promptEl) promptEl.style.display = 'none';
      if (whyEl) {
        whyEl.style.display = '';
        whyEl.textContent = '\u201c' + why + '\u201d';
      }
    } else {
      if (promptEl) promptEl.style.display = '';
      if (whyEl) whyEl.style.display = 'none';
    }
  }

  function confirmPrefocusReady() {
    navigateTo('screen-focus');
  }

  function prefocusNotYet() {
    // Returns to dashboard without penalty — the block is still saved as "active" and resumable
    saveSession();
    navigateTo('screen-dashboard');
  }

  // ─── Focus Screen (Timestamp-based) ────────────────────────────────

  // Compute elapsed focus seconds accounting for pauses
  function getFocusElapsed() {
    if (!state.focusStartedAt) return 0;
    var now = Date.now();
    var pauseTime = state.focusPausedAccum || 0;
    // If currently paused, add the ongoing pause duration
    if (state.focusPausedAt) {
      pauseTime += (now - state.focusPausedAt);
    }
    return Math.floor((now - state.focusStartedAt - pauseTime) / 1000);
  }

  function getFocusRemaining() {
    return Math.max(0, state.focusTotalSeconds - getFocusElapsed());
  }

  function onFocusEnter() {
    requestWakeLock();

    if (!state.currentBlock) return;

    // Only initialize if not resuming from saved session
    if (!state.focusStartedAt) {
      state.focusTotalSeconds = state.currentBlock.focusMinutes * 60;
      state.focusStartedAt = Date.now();
      state.focusPausedAt = null;
      state.focusPausedAccum = 0;
    }

    state.focusPaused = !!state.focusPausedAt;

    // Show task text
    const taskEl = $('focus-task-text');
    if (taskEl) taskEl.textContent = state.currentBlock.task;

    // Restore wander-count badge if resuming a session
    var wanderBadge = $('wander-count-badge');
    if (wanderBadge) {
      var wc = state.currentBlock.wanderCount || 0;
      if (wc > 0) {
        wanderBadge.textContent = wc;
        wanderBadge.style.display = '';
      } else {
        wanderBadge.style.display = 'none';
      }
    }

    // Update pause button
    updatePauseButton();
    updateFocusFromTimestamp();
    startFocusTick();
    saveSession();

    // Schedule SW notification for when focus completes (background safety)
    if (!state.focusPausedAt) {
      scheduleFocusDoneNotification();
    }
  }

  function startFocusTick() {
    stopFocusTimer();
    // 500ms ticks for UI smoothness; actual time from timestamps
    state.focusTimer = setInterval(function () {
      if (state.focusPausedAt) return; // don't update UI while paused
      updateFocusFromTimestamp();
    }, 500);
  }

  function updateFocusFromTimestamp() {
    var remaining = getFocusRemaining();
    state.focusRemaining = remaining;
    updateFocusUI();

    // Goal-gradient effect: intensify glow in final 10%
    var timerRing = $one('.focus-timer-ring');
    if (timerRing && state.focusTotalSeconds > 0) {
      var progress = 1 - (remaining / state.focusTotalSeconds);
      if (progress >= 0.9 && remaining > 0) {
        timerRing.classList.add('goal-gradient');
      } else {
        timerRing.classList.remove('goal-gradient');
      }
    }

    if (remaining <= 0) {
      stopFocusTimer();
      cancelFocusDoneNotification();
      playChime();
      vibrate([200, 100, 200, 100, 200]);
      showNotification('Re-birth \u2705 Focus Complete!', 'Your focus block is done! Time to rate.', 'focus-done');
      setTimeout(function () {
        navigateTo('screen-rate');
      }, 800);
    }
  }

  function stopFocusTimer() {
    if (state.focusTimer) {
      clearInterval(state.focusTimer);
      state.focusTimer = null;
    }
  }

  function updateFocusUI() {
    const remaining = Math.max(0, state.focusRemaining);
    const timeEl = $('focus-time-remaining');
    if (timeEl) timeEl.textContent = formatMMSS(remaining);

    // Ring progress
    const ringEl = $('focus-ring-progress');
    if (ringEl && state.focusTotalSeconds > 0) {
      const progress = 1 - (remaining / state.focusTotalSeconds);
      const offset = FOCUS_RING_CIRCUMFERENCE * (1 - progress);
      ringEl.setAttribute('stroke-dasharray', FOCUS_RING_CIRCUMFERENCE);
      ringEl.setAttribute('stroke-dashoffset', offset);
    }

    // Update active block card timer if visible
    const activeTimer = $('active-timer');
    if (activeTimer) {
      activeTimer.textContent = formatMMSS(remaining);
    }
  }

  function logMindWandered() {
    if (!state.currentBlock) return;
    state.currentBlock.wanderCount = (state.currentBlock.wanderCount || 0) + 1;
    var badge = $('wander-count-badge');
    if (badge) {
      badge.textContent = state.currentBlock.wanderCount;
      badge.style.display = '';
    }
    // Deliberately silent otherwise — no popup, no interruption, timer keeps running.
    // This is observation, not judgment: the count is only ever shown back to the
    // user later as neutral data (Journal), never during the block itself as a score.
  }

  function togglePause() {
    if (state.focusPausedAt) {
      // RESUMING — accumulate the paused duration and clear pause marker
      state.focusPausedAccum += (Date.now() - state.focusPausedAt);
      state.focusPausedAt = null;
      state.focusPaused = false;
      // Re-schedule SW notification with new remaining time
      scheduleFocusDoneNotification();
    } else {
      // PAUSING — record when we paused
      state.focusPausedAt = Date.now();
      state.focusPaused = true;
      // Cancel SW notification (timer is paused)
      cancelFocusDoneNotification();
    }
    updatePauseButton();
    saveSession();
  }

  function updatePauseButton() {
    const btn = $('btn-pause-focus');
    if (!btn) return;
    btn.textContent = state.focusPaused ? '▶ Resume' : '⏸ Pause';
  }

  function endEarly() {
    stopFocusTimer();
    cancelFocusDoneNotification();
    // Calculate actual focus time used from timestamps
    var elapsed = getFocusElapsed();
    if (state.currentBlock) {
      state.currentBlock.focusMinutes = Math.round(elapsed / 60);
    }
    navigateTo('screen-rate');
  }

  // ─── Rate Screen ──────────────────────────────────────────────────
  // Rotating micro-copy for block completion
  var COMPLETE_MESSAGES = [
    'Block complete.',
    'Work done in the dark.',
    'Momentum holds.',
    'Ground gained.',
    'Another hour claimed.'
  ];

  function onRateEnter() {
    releaseWakeLock();

    if (!state.currentBlock) return;

    // Rotating completion micro-copy
    var titleEl = $one('.rate-title');
    if (titleEl) {
      titleEl.textContent = COMPLETE_MESSAGES[Math.floor(Math.random() * COMPLETE_MESSAGES.length)];
    }

    const taskNameEl = $('rate-task-name');
    const taskDurEl = $('rate-task-duration');
    if (taskNameEl) taskNameEl.textContent = state.currentBlock.task;
    if (taskDurEl) {
      var durLabel = getDurationLabel(state.currentBlock.durationHours);
      taskDurEl.textContent = durLabel + ' \u00b7 ' + state.currentBlock.focusMinutes + ' min focused';
    }

    // Reset slider to neutral (0)
    const slider = $('productivity-slider');
    if (slider) slider.value = 0;
    updateRateDisplay(0);

    // Reset note
    const noteEl = $('rate-note');
    if (noteEl) noteEl.value = '';
  }

  function updateRateDisplay(sentiment) {
    const valEl = $('rate-value');
    const emojiEl = $('rate-emoji');
    const fillEl = $('sentiment-bar-fill');
    const barContainer = $one('.sentiment-bar-container');
    const ticks = $$('.sentiment-tick');

    const info = SENTIMENT_MAP[String(sentiment)] || SENTIMENT_MAP['0'];

    if (valEl) {
      var displayText = info.label;
      if (sentiment > 0) displayText = '+' + sentiment + ' ' + displayText;
      else if (sentiment < 0) displayText = sentiment + ' ' + displayText;
      valEl.textContent = displayText;
      valEl.style.color = info.color;
    }
    if (emojiEl) emojiEl.textContent = info.emoji;

    // Update fill bar
    if (fillEl) {
      fillEl.className = 'sentiment-bar-fill';
      if (sentiment > 0) {
        fillEl.classList.add('positive-fill');
        fillEl.style.width = (sentiment / 5 * 50) + '%';
        fillEl.style.left = '50%';
        fillEl.style.right = 'auto';
      } else if (sentiment < 0) {
        fillEl.classList.add('negative-fill');
        fillEl.style.width = (Math.abs(sentiment) / 5 * 50) + '%';
        fillEl.style.right = '50%';
        fillEl.style.left = 'auto';
      } else {
        fillEl.classList.add('neutral-fill');
        fillEl.style.width = '0%';
      }
    }

    // Update thumb position
    if (barContainer) {
      var percent = ((sentiment + 5) / 10) * 100;
      barContainer.style.setProperty('--thumb-left', percent + '%');
    }

    // Update active tick
    var tickIndex = sentiment + 5; // -5 => 0, 0 => 5, +5 => 10
    for (var i = 0; i < ticks.length; i++) {
      if (i === tickIndex) {
        ticks[i].classList.add('active');
      } else {
        ticks[i].classList.remove('active');
      }
    }
  }

  function saveRating() {
    if (!state.currentBlock) return;

    const slider = $('productivity-slider');
    const noteEl = $('rate-note');

    var sentiment = slider ? parseInt(slider.value, 10) : 0;
    state.currentBlock.sentiment = sentiment;
    state.currentBlock.productivity = sentimentToProductivity(sentiment);
    state.currentBlock.note = noteEl ? noteEl.value.trim() : '';
    state.currentBlock.completed = true;

    addBlock(state.currentBlock);
    state.currentBlock = null;

    // Clear all session state — block is done
    state.breatheStartedAt = null;
    state.focusStartedAt = null;
    state.focusPausedAt = null;
    state.focusPausedAccum = 0;
    clearSession();

    playChime();
    vibrate([50, 30, 50]);

    navigateTo('screen-dashboard');
  }

  // ─── Journal Screen ───────────────────────────────────────────────
  function onJournalEnter() {
    if (!state.journalDate) {
      state.journalDate = new Date();
      state.journalDate.setHours(0, 0, 0, 0);
    }
    renderJournal();
  }

  function renderJournal() {
    const dateStr = toDateString(state.journalDate);
    const blocks = getBlocksForDate(dateStr);

    // Date display
    const dateEl = $('journal-date');
    if (dateEl) dateEl.textContent = formatDate(state.journalDate);

    // Stats
    let totalProd = 0;
    let totalFocus = 0;
    const totalBlocks = blocks.length;
    const totalBreathe = totalBlocks * 5; // 5 min per block

    blocks.forEach(function (b) {
      totalProd += (b.productivity || 0);
      totalFocus += (b.focusMinutes || 0);
    });

    const avgProd = totalBlocks > 0 ? Math.round(totalProd / totalBlocks) : 0;

    const percentEl = $('journal-day-percent');
    const blocksEl = $('journal-day-blocks');
    const focusEl = $('journal-day-focus');
    const breatheEl = $('journal-day-breathe');

    if (percentEl) percentEl.textContent = avgProd + '%';
    if (blocksEl) blocksEl.textContent = totalBlocks;
    if (focusEl) focusEl.textContent = (totalFocus / 60).toFixed(1) + 'h';
    if (breatheEl) breatheEl.textContent = totalBreathe + 'min';

    // Entries
    const container = $('journal-entries');
    if (!container) return;
    container.innerHTML = '';

    if (blocks.length === 0) {
      container.innerHTML =
        '<div class="empty-state empty-journal">' +
          '<div class="empty-icon">\ud83d\udcd6</div>' +
          '<p class="empty-title">Nothing here yet</p>' +
          '<p class="empty-subtitle">Blocks you complete will appear on this day.</p>' +
        '</div>';
      return;
    }

    blocks.sort(function (a, b) { return (a.id || 0) - (b.id || 0); });

    blocks.forEach(function (block) {
      const entry = document.createElement('div');
      entry.className = 'journal-entry';
      const sentLabel = getSentimentLabel(block);

      // Mood-colored left border for timeline style
      entry.style.borderLeftColor = sentLabel.color;

      var jCatInfo = getCategoryInfo(block.category || 'other');
      var jDurLabel = getDurationLabel(block.durationHours);
      var jWanderNote = (block.wanderCount > 0) ? '<span>Mind wandered ~' + block.wanderCount + '</span>' : '';

      entry.innerHTML =
        '<div class="journal-entry-header">' +
          '<span class="journal-entry-time">' + escapeHtml(block.startTime || '') + '</span>' +
          '<span class="journal-entry-category-badge" style="color:' + jCatInfo.color + '">' + jCatInfo.icon + '</span>' +
          '<span class="journal-entry-prod" style="color:' + sentLabel.color + '">' + sentLabel.emoji + ' ' + escapeHtml(sentLabel.text) + '</span>' +
        '</div>' +
        '<div class="journal-entry-task">' + escapeHtml(block.task || '') + '</div>' +
        '<div class="journal-entry-meta">' +
          '<span>' + jDurLabel + '</span>' +
          '<span>' + (block.focusMinutes || 0) + ' min focus</span>' +
          jWanderNote +
        '</div>' +
        (block.note ? '<div class="journal-entry-note">' + escapeHtml(block.note) + '</div>' : '');

      container.appendChild(entry);
    });
  }

  function journalPrev() {
    state.journalDate = addDays(state.journalDate, -1);
    renderJournal();
  }

  function journalNext() {
    state.journalDate = addDays(state.journalDate, 1);
    renderJournal();
  }

  // ─── Weekly Stats Screen ─────────────────────────────────────────
  function onWeeklyEnter() {
    if (!state.weekStart) {
      state.weekStart = getMonday(new Date());
    }
    renderWeekly();
  }

  function renderWeekly() {
    const monday = state.weekStart;
    const sunday = addDays(monday, 6);

    // Week range text
    const rangeEl = $('week-range');
    if (rangeEl) {
      rangeEl.textContent = formatDateShort(monday) + ' – ' + formatDateShort(sunday);
    }

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayData = [];
    let weekTotalProd = 0;
    let weekTotalBlocks = 0;
    let weekTotalFocus = 0;
    let weekTotalBreathe = 0;
    let daysWithBlocks = 0;
    let bestDay = null;
    let bestDayAvg = -1;

    for (let i = 0; i < 7; i++) {
      const dayDate = addDays(monday, i);
      const dateStr = toDateString(dayDate);
      const blocks = getBlocksForDate(dateStr);

      let dayProd = 0;
      let dayFocus = 0;
      blocks.forEach(function (b) {
        dayProd += (b.productivity || 0);
        dayFocus += (b.focusMinutes || 0);
      });

      const dayAvg = blocks.length > 0 ? Math.round(dayProd / blocks.length) : 0;
      const dayBreathe = blocks.length * 5;

      dayData.push({
        name: dayNames[i],
        avg: dayAvg,
        blocks: blocks.length,
        focus: dayFocus,
        breathe: dayBreathe
      });

      weekTotalBlocks += blocks.length;
      weekTotalFocus += dayFocus;
      weekTotalBreathe += dayBreathe;
      if (blocks.length > 0) {
        weekTotalProd += dayAvg;
        daysWithBlocks++;
        if (dayAvg > bestDayAvg) {
          bestDayAvg = dayAvg;
          bestDay = dayNames[i];
        }
      }
    }

    const weekAvg = daysWithBlocks > 0 ? Math.round(weekTotalProd / daysWithBlocks) : 0;

    // Previous week comparison
    const prevMonday = addDays(monday, -7);
    let prevWeekTotalProd = 0;
    let prevDaysWithBlocks = 0;
    for (let i = 0; i < 7; i++) {
      const dateStr = toDateString(addDays(prevMonday, i));
      const blocks = getBlocksForDate(dateStr);
      if (blocks.length > 0) {
        let dp = 0;
        blocks.forEach(function (b) { dp += (b.productivity || 0); });
        prevWeekTotalProd += Math.round(dp / blocks.length);
        prevDaysWithBlocks++;
      }
    }
    const prevWeekAvg = prevDaysWithBlocks > 0 ? Math.round(prevWeekTotalProd / prevDaysWithBlocks) : 0;

    // Update DOM
    const avgEl = $('weekly-avg-percent');
    if (avgEl) avgEl.textContent = weekAvg + '%';

    const compEl = $('weekly-comparison');
    if (compEl) {
      const diff = weekAvg - prevWeekAvg;
      if (diff > 0) {
        compEl.textContent = '↑' + diff + '% vs last week';
        compEl.className = 'comparison-up';
      } else if (diff < 0) {
        compEl.textContent = '↓' + Math.abs(diff) + '% vs last week';
        compEl.className = 'comparison-down';
      } else {
        compEl.textContent = 'Same as last week';
        compEl.className = 'comparison-same';
      }
    }

    // Chart bars
    const chartContainer = $('weekly-chart-bars');
    if (chartContainer) {
      chartContainer.innerHTML = '';
      dayData.forEach(function (d, i) {
        const col = document.createElement('div');
        col.className = 'chart-day';

        // Mark today's bar
        var todayDayIndex = (new Date().getDay() + 6) % 7; // Mon=0
        var isCurrentWeek = toDateString(monday) === toDateString(getMonday(new Date()));
        if (isCurrentWeek && i === todayDayIndex) col.classList.add('today');

        var barContainer = document.createElement('div');
        barContainer.className = 'chart-bar-container';

        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        bar.style.height = Math.max(d.avg, 4) + '%';

        // Mood-gradient colors: cool blue (low) → warm amber (high)
        if (d.blocks === 0) {
          bar.style.height = '4%';
          bar.style.background = 'rgba(255,255,255,0.06)';
        } else {
          // Interpolate between mood-gradient-start (#4a4e57, steel gray) and accent-focus-end (#c53347, oxblood)
          var t = Math.min(d.avg / 100, 1);
          var r = Math.round(74 + (197 - 74) * t);
          var g = Math.round(78 + (51 - 78) * t);
          var b = Math.round(87 + (71 - 87) * t);
          bar.style.background = 'rgb(' + r + ',' + g + ',' + b + ')';
        }

        const label = document.createElement('span');
        label.className = 'chart-day-label';
        label.textContent = d.name.charAt(0);

        barContainer.appendChild(bar);
        col.appendChild(barContainer);
        col.appendChild(label);
        chartContainer.appendChild(col);
      });
    }

    // Stats
    const bestEl = $('weekly-best-day');
    const totalBlocksEl = $('weekly-total-blocks');
    const totalFocusEl = $('weekly-total-focus');
    const totalBreatheEl = $('weekly-total-breathe');

    if (bestEl) bestEl.textContent = bestDay || '—';
    if (totalBlocksEl) totalBlocksEl.textContent = weekTotalBlocks;
    if (totalFocusEl) totalFocusEl.textContent = (weekTotalFocus / 60).toFixed(1) + 'h';
    if (totalBreatheEl) totalBreatheEl.textContent = weekTotalBreathe + 'min';

    renderWeeklyCategoryBreakdown(monday);
  }

  function renderWeeklyCategoryBreakdown(monday) {
    var container = $('weekly-category-list');
    if (!container) return;

    var minutesByCategory = { study: 0, work: 0, personal: 0, other: 0 };
    for (var i = 0; i < 7; i++) {
      var dateStr = toDateString(addDays(monday, i));
      var dayBlocks = getBlocksForDate(dateStr);
      dayBlocks.forEach(function (b) {
        var cat = b.category || 'other';
        minutesByCategory[cat] = (minutesByCategory[cat] || 0) + (b.focusMinutes || 0);
      });
    }

    var totalMinutes = Object.keys(minutesByCategory).reduce(function (sum, k) { return sum + minutesByCategory[k]; }, 0);

    container.innerHTML = '';
    CATEGORIES.forEach(function (cat) {
      var mins = minutesByCategory[cat.id] || 0;
      var pct = totalMinutes > 0 ? Math.round((mins / totalMinutes) * 100) : 0;
      var hrs = (mins / 60).toFixed(1);

      var row = document.createElement('div');
      row.className = 'category-budget-row';
      row.innerHTML =
        '<div class="category-budget-header">' +
          '<span class="category-budget-name">' + cat.icon + ' ' + cat.label + '</span>' +
          '<span class="category-budget-amount">' + hrs + 'h</span>' +
        '</div>' +
        '<div class="category-budget-track">' +
          '<div class="category-budget-fill" style="width:' + pct + '%;background:' + cat.color + '"></div>' +
        '</div>';
      container.appendChild(row);
    });
  }

  function weekPrev() {
    state.weekStart = addDays(state.weekStart, -7);
    renderWeekly();
  }

  function weekNext() {
    state.weekStart = addDays(state.weekStart, 7);
    renderWeekly();
  }

  // ─── Settings Screen ─────────────────────────────────────────────
  function onSettingsEnter() {
    syncSettingsUI();
    populateDiagnostics();
  }

  function populateDiagnostics() {
    var el = $('diagnostics-content');
    if (!el) return;
    var lines = [];
    lines.push('<b>APP_VERSION:</b> ' + APP_VERSION);
    lines.push('<b>Schema (sadhana):</b> ' + (localStorage.getItem('rebirth_sadhana_schema') || 'none'));

    // SW state
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      lines.push('<b>SW:</b> active (state=' + navigator.serviceWorker.controller.state + ')');
    } else {
      lines.push('<b>SW:</b> no controller');
    }

    // Cached version
    if (typeof caches !== 'undefined') {
      caches.keys().then(function (keys) {
        var cached = keys.filter(function (k) { return k.indexOf('rebirth') !== -1; });
        var cacheEl = document.createElement('p');
        cacheEl.innerHTML = '<b>Caches:</b> ' + (cached.length ? cached.join(', ') : 'none');
        el.appendChild(cacheEl);
      });
    }

    // Error log
    var errLog = [];
    try { errLog = JSON.parse(localStorage.getItem('rebirth_error_log') || '[]'); } catch (e) {}
    lines.push('<b>Errors (' + errLog.length + '):</b>');
    el.innerHTML = lines.map(function (l) { return '<p style="margin:4px 0">' + l + '</p>'; }).join('');
    if (errLog.length > 0) {
      var errHtml = errLog.map(function (e) {
        return '<div style="border-left:2px solid #c53347;padding-left:8px;margin:6px 0"><small>' + e.ts + '</small><br>' + e.msg + '</div>';
      }).join('');
      el.innerHTML += errHtml;
    }
  }

  function syncSettingsUI() {
    const hourlyEl = $('setting-hourly-notify');
    const soundEl = $('setting-sound');
    const vibEl = $('setting-vibration');

    if (hourlyEl) hourlyEl.checked = state.settings.hourlyNotify;
    if (soundEl) soundEl.checked = state.settings.sound;
    if (vibEl) vibEl.checked = state.settings.vibration;

    var whyEl = $('setting-your-why');
    if (whyEl) whyEl.value = getYourWhy();

    var ifThenEl = $('setting-ifthen-plan');
    if (ifThenEl) ifThenEl.value = getIfThenPlan();

    var budgets = loadCategoryBudgets();
    var bStudy = $('budget-study');
    var bWork = $('budget-work');
    var bPersonal = $('budget-personal');
    var bOther = $('budget-other');
    if (bStudy) bStudy.value = budgets.study;
    if (bWork) bWork.value = budgets.work;
    if (bPersonal) bPersonal.value = budgets.personal;
    if (bOther) bOther.value = budgets.other;
  }

  function exportData() {
    const blocks = loadBlocks();
    const json = JSON.stringify(blocks, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rebirth-data-' + toDateString(new Date()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function clearData() {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      localStorage.removeItem('rebirth_blocks');
      vibrate(50);
      // Refresh dashboard if we navigate back
      if (state.currentScreen === 'screen-settings') {
        alert('All data cleared.');
      }
    }
  }

  // ── Breathe-Free back button (returns to Sadhana) ──
  var bfBackBtn = $('bf-back-btn');
  if (bfBackBtn) {
    bfBackBtn.addEventListener('click', function () {
      stopBreatheFree();
      navigateTo('screen-sadhana');
    });
  }

  // ─── Service Worker ───────────────────────────────────────────────
  function registerServiceWorker() {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {
        // Service worker registration failed – not critical
      });
    }
  }

  // ─── Standalone Breathe Screen (Always-On 4-7-8) ─────────────────
  var breatheFreeTimer = null;
  var breatheFreeStartedAt = null;
  var breatheFreePhase = '';
  var breatheFreeCycles = 0;

  function onBreatheFreeEnter() {
    requestWakeLock();
    breatheFreeStartedAt = Date.now();
    breatheFreePhase = '';
    breatheFreeCycles = 0;
    var cycleEl = $('bf-cycle-count');
    if (cycleEl) cycleEl.textContent = '0';

    updateBreatheFreeUI();
    startBreatheFree();
  }

  function startBreatheFree() {
    stopBreatheFree();
    breatheFreeTimer = setInterval(function () {
      updateBreatheFreeUI();
    }, 250);
  }

  function stopBreatheFree() {
    if (breatheFreeTimer) {
      clearInterval(breatheFreeTimer);
      breatheFreeTimer = null;
    }
  }

  function updateBreatheFreeUI() {
    if (!breatheFreeStartedAt) return;
    var elapsed = Math.floor((Date.now() - breatheFreeStartedAt) / 1000);
    var phaseInfo = computeBreathingPhase(elapsed);

    // Count cycles (each full cycle = 19 seconds)
    var currentCycle = Math.floor(elapsed / getCycleLength());
    if (currentCycle > breatheFreeCycles) {
      breatheFreeCycles = currentCycle;
      var cycleEl = $('bf-cycle-count');
      if (cycleEl) cycleEl.textContent = breatheFreeCycles;
      vibrate(30);
    }

    // Phase change feedback
    if (phaseInfo.phase !== breatheFreePhase && breatheFreePhase !== '') {
      playPhaseTone(phaseInfo.phase);
    }
    breatheFreePhase = phaseInfo.phase;

    var phase = phaseInfo.phase;
    var phaseTime = phaseInfo.phaseTime;
    var phaseDur = getPhaseDurations()[phase];
    if (!phaseDur) return;
    var phaseProgress = phaseTime / phaseDur;

    // Screen theme class
    var screen = $('screen-breathe-free');
    if (screen) {
      screen.classList.remove('phase-inhale', 'phase-hold', 'phase-exhale');
      screen.classList.add('phase-' + phase);
    }

    // Phase label
    var labelEl = $('bf-phase-label');
    if (labelEl) labelEl.textContent = phase.charAt(0).toUpperCase() + phase.slice(1);

    // Countdown
    var countdownEl = $('bf-countdown');
    if (countdownEl) countdownEl.textContent = Math.max(0, phaseDur - phaseTime);

    // Instruction
    var instrEl = $('bf-instruction');
    if (instrEl) {
      if (phase === 'inhale') instrEl.textContent = 'Breathe in slowly through your nose';
      else if (phase === 'hold') instrEl.textContent = 'Hold your breath gently';
      else instrEl.textContent = 'Exhale slowly through your mouth';
    }

    // Circle animation scale
    var scale = 1;
    if (phase === 'inhale') {
      scale = 0.75 + (1.15 - 0.75) * phaseProgress;
    } else if (phase === 'hold') {
      scale = 1.15 + Math.sin(phaseProgress * Math.PI * 2) * 0.03;
    } else {
      scale = 1.15 - (1.15 - 0.75) * phaseProgress;
    }

    var circle = $('bf-breathing-circle');
    if (circle) circle.style.transform = 'scale(' + scale.toFixed(3) + ')';

    // Progress ring — shows progress through current cycle (not overall)
    var progressCircle = $('bf-progress-circle');
    if (progressCircle) {
      var cycleProgress = (elapsed % getCycleLength()) / getCycleLength();
      var circumference = 2 * Math.PI * 140;
      var offset = circumference * (1 - cycleProgress);
      progressCircle.style.strokeDasharray = circumference;
      progressCircle.style.strokeDashoffset = offset;
    }

    // Phase dots
    var dotsContainer = $('bf-phase-dots');
    if (dotsContainer) {
      var dots = dotsContainer.querySelectorAll('.phase-dot');
      var phases = ['inhale', 'hold', 'exhale'];
      dots.forEach(function (dot, i) {
        dot.classList.toggle('active', phases[i] === phase);
      });
    }
  }

  // ─── Study Mode — IndexedDB ──────────────────────────────────────
  var studyDB = null;

  function openStudyDB() {
    return new Promise(function (resolve, reject) {
      if (studyDB) { resolve(studyDB); return; }
      var req = indexedDB.open('rebirth_study', 2);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('pages')) {
          db.createObjectStore('pages');
        }
      };
      req.onsuccess = function (e) { studyDB = e.target.result; resolve(studyDB); };
      req.onerror = function () { reject(new Error('IndexedDB failed')); };
    });
  }

  function savePageImage(topicId, pageIndex, blob) {
    return openStudyDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('pages', 'readwrite');
        var store = tx.objectStore('pages');
        store.put(blob, topicId + '_page_' + pageIndex);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(new Error('Save failed')); };
      });
    });
  }

  function getPageImage(topicId, pageIndex) {
    return openStudyDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('pages', 'readonly');
        var store = tx.objectStore('pages');
        var req = store.get(topicId + '_page_' + pageIndex);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(new Error('Read failed')); };
      });
    });
  }

  function deleteTopicPages(topicId) {
    return openStudyDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('pages', 'readwrite');
        var store = tx.objectStore('pages');
        var cursorReq = store.openCursor();
        var prefix = topicId + '_page_';
        cursorReq.onsuccess = function (e) {
          var cursor = e.target.result;
          if (cursor) {
            if (typeof cursor.key === 'string' && cursor.key.indexOf(prefix) === 0) cursor.delete();
            cursor.continue();
          }
        };
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(new Error('Delete failed')); };
      });
    });
  }

  // ─── Study Mode — Subjects (Fixed, localStorage) ────────────────
  function ensureSubjects() {
    var raw = localStorage.getItem('rebirth_subjects');
    if (!raw) {
      localStorage.setItem('rebirth_subjects', JSON.stringify(DEFAULT_SUBJECTS));
      return DEFAULT_SUBJECTS.slice();
    }
    var subjects = JSON.parse(raw);
    var ids = subjects.map(function (s) { return s.id; });
    DEFAULT_SUBJECTS.forEach(function (ds) {
      var existingIndex = ids.indexOf(ds.id);
      if (existingIndex === -1) {
        subjects.push(ds);
      } else if (!subjects[existingIndex].icon || /[ðâ]/.test(subjects[existingIndex].icon)) {
        // Refresh icons saved by older versions that used the wrong encoding.
        subjects[existingIndex].icon = ds.icon;
      }
    });
    localStorage.setItem('rebirth_subjects', JSON.stringify(subjects));
    return subjects;
  }

  function getSubjectById(id) {
    var subjects = ensureSubjects();
    for (var i = 0; i < subjects.length; i++) {
      if (subjects[i].id === id) return subjects[i];
    }
    return null;
  }

  // ─── Study Mode — Topics (localStorage) ────────────────────────
  function loadTopics() {
    try {
      var raw = localStorage.getItem('rebirth_topics');
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveTopics(topics) {
    localStorage.setItem('rebirth_topics', JSON.stringify(topics));
  }

  function getTopicById(id) {
    var topics = loadTopics();
    for (var i = 0; i < topics.length; i++) {
      if (topics[i].id === id) return topics[i];
    }
    return null;
  }

  function updateTopic(updated) {
    var topics = loadTopics();
    for (var i = 0; i < topics.length; i++) {
      if (topics[i].id === updated.id) {
        topics[i] = updated;
        saveTopics(topics);
        return;
      }
    }
  }

  function getTopicsForSubject(subjectId) {
    return loadTopics().filter(function (t) { return t.subjectId === subjectId; });
  }

  function getSubjectStats(subjectId) {
    var topics = getTopicsForSubject(subjectId);
    var totalTopics = topics.length;
    var totalPages = 0;
    var masteredPages = 0;
    topics.forEach(function (t) {
      totalPages += (t.totalPages || 0);
      masteredPages += (t.completedPages || 0);
    });
    return { totalTopics: totalTopics, totalPages: totalPages, masteredPages: masteredPages };
  }

  // ─── Study Mode — Study Log (for Journal) ──────────────────────
  function logStudyActivity(subjectId, topicId, pageIndex) {
    try {
      var raw = localStorage.getItem('rebirth_study_log');
      var logs = raw ? JSON.parse(raw) : [];
      var subj = getSubjectById(subjectId);
      var topic = getTopicById(topicId);
      logs.push({
        date: toDateString(new Date()),
        subjectId: subjectId,
        subjectName: subj ? subj.name : 'Unknown',
        topicId: topicId,
        topicName: topic ? topic.name : 'Unknown',
        pageIndex: pageIndex,
        timestamp: Date.now()
      });
      localStorage.setItem('rebirth_study_log', JSON.stringify(logs));
    } catch (e) { /* ignore */ }
  }

  function getStudyLogsForDate(dateStr) {
    try {
      var raw = localStorage.getItem('rebirth_study_log');
      var logs = raw ? JSON.parse(raw) : [];
      return logs.filter(function (l) { return l.date === dateStr; });
    } catch (e) { return []; }
  }

  // ─── Study Mode — Gemini API ──────────────────────────────────
  function callGemini(imageBlob, conversationHistory, mode) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var base64 = reader.result.split(',')[1];
        var mimeType = imageBlob.type || 'image/jpeg';
        var contents = [];

        if (mode === 'first_question') {
          contents.push({
            role: 'user',
            parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: 'You are an expert tutor. Look at this study material carefully. Ask ONE in-depth conceptual question about it that tests deep understanding, not surface recall. The question should require the student to think critically and demonstrate real comprehension. Be specific to the content shown. Ask only the question, nothing else.' }
            ]
          });
        } else if (mode === 'evaluate_answer') {
          contents.push({
            role: 'user',
            parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: 'You are an expert tutor examining a student on this material. I will show you the conversation so far.' }
            ]
          });
          contents.push({ role: 'model', parts: [{ text: 'I understand. Please show me the conversation.' }] });
          for (var i = 0; i < conversationHistory.length; i++) {
            var msg = conversationHistory[i];
            contents.push({ role: msg.role === 'ai' ? 'model' : 'user', parts: [{ text: msg.text }] });
          }
          contents.push({
            role: 'user',
            parts: [{ text: 'Based on the student\'s latest answer and the material shown in the image, do ONE of these:\n1. If the student has NOT yet demonstrated sufficient depth of understanding, ask a follow-up probing question to dig deeper. Just ask the question.\n2. If the student HAS demonstrated strong understanding across enough aspects of the material, respond with EXACTLY this text and nothing else: [MASTERY_CONFIRMED]\n\nBe rigorous but fair. Typically require 2-4 good answers before confirming mastery.' }]
          });
        }

        var body = {
          contents: contents,
          generationConfig: {
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingLevel: 'minimal' }
          }
        };

        fetch('/api/gemini', {  // Capacitor: will fail offline, caught below
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        .then(function (resp) {
          if (!resp.ok) {
            return resp.json().then(function (err) {
              throw new Error((err && err.error) || 'API error ' + resp.status);
            });
          }
          return resp.json();
        })
        .then(function (data) {
          var text = '';
          try {
            text = data.candidates[0].content.parts[0].text;
            var finishReason = data.candidates[0].finishReason;
            if (finishReason === 'MAX_TOKENS' && (!text || text.trim().length === 0)) {
              throw new Error('Response was cut off before any answer text was produced. Please try again.');
            }
          } catch (e) {
            if (e instanceof Error && /cut off/.test(e.message)) throw e;
            text = 'Unable to generate a question. Please try again.';
          }
          resolve(text.trim());
        })
        .catch(reject);
      };
      reader.onerror = function () { reject(new Error('Failed to read image')); };
      reader.readAsDataURL(imageBlob);
    });
  }

  // ─── Study Mode — PDF + Image Processing ──────────────────────
  function renderPDFToImages(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var typedArray = new Uint8Array(reader.result);
        var pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
        if (!pdfjsLib) { reject(new Error('PDF.js not loaded')); return; }
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        pdfjsLib.getDocument(typedArray).promise.then(function (pdf) {
          var pages = []; var numPages = pdf.numPages;
          function renderPage(pageNum) {
            if (pageNum > numPages) { resolve(pages); return; }
            pdf.getPage(pageNum).then(function (page) {
              var scale = 1.5; var viewport = page.getViewport({ scale: scale });
              var canvas = document.createElement('canvas');
              var context = canvas.getContext('2d');
              canvas.height = viewport.height; canvas.width = viewport.width;
              page.render({ canvasContext: context, viewport: viewport }).promise.then(function () {
                canvas.toBlob(function (blob) { pages.push(blob); renderPage(pageNum + 1); }, 'image/jpeg', 0.7);
              });
            });
          }
          renderPage(1);
        }).catch(reject);
      };
      reader.onerror = function () { reject(new Error('File read failed')); };
      reader.readAsArrayBuffer(file);
    });
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var maxW = 800; var scale = Math.min(1, maxW / img.width);
        var canvas = document.createElement('canvas');
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) { resolve(blob); }, 'image/jpeg', 0.5);
      };
      img.onerror = function () { reject(new Error('Image load failed')); };
      img.src = URL.createObjectURL(file);
    });
  }

  // ─── Study Mode — Streak ──────────────────────────────────────
  function registerStudyDay() {
    try {
      var raw = localStorage.getItem('rebirth_study_streak');
      var data = raw ? JSON.parse(raw) : { lastDate: null, streak: 0 };
      var today = toDateString(new Date());
      if (data.lastDate === today) return data;
      var yesterday = toDateString(addDays(new Date(), -1));
      data.streak = (data.lastDate === yesterday) ? (data.streak || 0) + 1 : 1;
      data.lastDate = today;
      localStorage.setItem('rebirth_study_streak', JSON.stringify(data));
      return data;
    } catch (e) { return { lastDate: null, streak: 0 }; }
  }

  function getStudyStreak() {
    try {
      var raw = localStorage.getItem('rebirth_study_streak');
      return raw ? JSON.parse(raw) : { lastDate: null, streak: 0 };
    } catch (e) { return { lastDate: null, streak: 0 }; }
  }

  // ─── Study Screen (Subject Grid) ──────────────────────────────
  function onStudyEnter() {
    var streakData = getStudyStreak();
    var el = $('study-streak-value');
    var labelEl = $('study-streak-label');
    if (el) el.textContent = streakData.streak || 0;
    if (labelEl) labelEl.textContent = (streakData.streak || 0) >= 1 ? 'study days' : 'Start studying!';
    renderSubjectsGrid();
  }

  function renderSubjectsGrid() {
    var container = $('study-subjects-grid');
    if (!container) return;
    var subjects = ensureSubjects();
    container.innerHTML = '';

    subjects.forEach(function (subj) {
      var stats = getSubjectStats(subj.id);
      var pct = stats.totalPages > 0 ? Math.round((stats.masteredPages / stats.totalPages) * 100) : 0;
      var tile = document.createElement('div');
      tile.className = 'study-subject-tile';
      tile.style.borderLeftColor = subj.color || 'var(--accent-primary)';
      tile.innerHTML =
        '<span class="study-subject-tile-icon">' + (subj.icon || '\u{1F4DA}') + '</span>' +
        '<div class="study-subject-tile-name">' + escapeHtml(subj.name) + '</div>' +
        '<div class="study-subject-tile-meta">' + stats.totalTopics + ' topics \u00B7 ' + stats.totalPages + ' pages</div>' +
        '<div class="study-subject-tile-progress">' +
          '<div class="study-subject-tile-fill" style="width:' + pct + '%;background:' + (subj.color || 'var(--accent-primary)') + '"></div>' +
        '</div>';
      tile.addEventListener('click', function () {
        state.studySubjectId = subj.id;
        navigateTo('screen-study-subject');
      });
      container.appendChild(tile);
    });
  }

  // ─── Subject Detail Screen (Topics List) ──────────────────────
  function onStudySubjectEnter() {
    if (!state.studySubjectId) { navigateTo('screen-study'); return; }
    var subj = getSubjectById(state.studySubjectId);
    if (!subj) { navigateTo('screen-study'); return; }

    var nameEl = $('subject-detail-name');
    if (nameEl) nameEl.textContent = subj.name;

    var stats = getSubjectStats(subj.id);
    var topicsEl = $('subject-total-topics');
    var pagesEl = $('subject-total-pages');
    var masteredEl = $('subject-mastered-pages');
    if (topicsEl) topicsEl.textContent = stats.totalTopics;
    if (pagesEl) pagesEl.textContent = stats.totalPages;
    if (masteredEl) masteredEl.textContent = stats.masteredPages;

    renderTopicsList();
  }

  function renderTopicsList() {
    var container = $('subject-topics-list');
    if (!container) return;
    var topics = getTopicsForSubject(state.studySubjectId);
    container.innerHTML = '';

    if (topics.length === 0) {
      container.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon">\u{1F4DD}</div>' +
          '<p class="empty-title">No topics yet</p>' +
          '<p class="empty-subtitle">Add your first topic to start studying this subject.</p>' +
        '</div>';
      return;
    }

    var sorted = topics.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    sorted.forEach(function (topic) {
      var completed = topic.completedPages || 0;
      var total = topic.totalPages || 0;
      var pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      var isComplete = completed >= total && total > 0;
      var dateStr = topic.createdAt ? new Date(topic.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      var nextPage = 0;
      if (topic.pagesData) {
        for (var i = 0; i < topic.pagesData.length; i++) {
          if (!topic.pagesData[i].completed) { nextPage = i; break; }
          if (i === topic.pagesData.length - 1) nextPage = i;
        }
      }

      var card = document.createElement('div');
      card.className = 'topic-card' + (isComplete ? ' topic-card-complete' : '');
      card.innerHTML =
        '<div class="topic-card-header">' +
          '<span class="topic-card-name">' + escapeHtml(topic.name) + '</span>' +
          '<span class="topic-card-badge">' + pct + '%</span>' +
        '</div>' +
        '<div class="topic-card-date">' + dateStr + '</div>' +
        '<div class="topic-card-progress">' +
          '<div class="topic-card-fill" style="width:' + pct + '%"></div>' +
        '</div>' +
        '<div class="topic-card-meta">' +
          '<span class="topic-card-stats">' + completed + ' / ' + total + ' pages</span>' +
          '<div class="topic-card-actions">' +
            '<button class="btn-study-topic" data-topic-id="' + topic.id + '" data-page="' + nextPage + '">' + (isComplete ? 'Review' : 'Continue') + '</button>' +
            '<button class="btn-delete-topic" data-delete-topic="' + topic.id + '" title="Delete">\u{1F5D1}</button>' +
          '</div>' +
        '</div>';
      container.appendChild(card);
    });

    container.querySelectorAll('.btn-study-topic').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var topicId = this.getAttribute('data-topic-id');
        var page = parseInt(this.getAttribute('data-page'), 10) || 0;
        state.studyTopicId = topicId;
        state.studyPageIndex = page;
        navigateTo('screen-study-session');
      });
    });

    container.querySelectorAll('.btn-delete-topic').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var topicId = this.getAttribute('data-delete-topic');
        if (confirm('Delete this topic and all its pages?')) {
          var topics = loadTopics().filter(function (t) { return t.id !== topicId; });
          saveTopics(topics);
          deleteTopicPages(topicId).then(function () {
            onStudySubjectEnter();
          });
        }
      });
    });

    container.querySelectorAll('.topic-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var btn = this.querySelector('.btn-study-topic');
        if (btn) btn.click();
      });
    });
  }

  // ─── Study Session Screen ─────────────────────────────────────
  function onStudySessionEnter() {
    if (!state.studyTopicId) { navigateTo('screen-study'); return; }
    var topic = getTopicById(state.studyTopicId);
    if (!topic) { navigateTo('screen-study'); return; }
    var subj = getSubjectById(topic.subjectId);

    state.studySubjectId = topic.subjectId;
    state.studyConversation = [];
    state.studyRating = 0;
    state.studySessionActive = true;

    var subjNameEl = $('study-session-subject-name');
    if (subjNameEl) subjNameEl.textContent = subj ? subj.name : '';
    var topicNameEl = $('study-session-topic-name');
    if (topicNameEl) topicNameEl.textContent = topic.name;

    updateStudyPageDisplay();
  }

  function updateStudyPageDisplay() {
    var topic = getTopicById(state.studyTopicId);
    if (!topic) return;
    var pageIdx = state.studyPageIndex;
    var total = topic.totalPages;

    var numEl = $('study-session-page-num');
    if (numEl) numEl.textContent = (pageIdx + 1) + ' / ' + total;

    var statusEl = $('study-page-status');
    var pageData = topic.pagesData && topic.pagesData[pageIdx];
    if (statusEl) {
      if (pageData && pageData.completed) {
        statusEl.textContent = '\u2705 Completed';
        statusEl.className = 'study-page-status completed';
      } else {
        statusEl.textContent = 'Not started';
        statusEl.className = 'study-page-status';
      }
    }

    var prevBtn = $('btn-study-prev-page');
    var nextBtn = $('btn-study-next-page');
    if (prevBtn) prevBtn.disabled = pageIdx <= 0;
    if (nextBtn) {
      var canGoNext = pageIdx < total - 1;
      var currentComplete = pageData && pageData.completed;
      nextBtn.disabled = !canGoNext || !currentComplete;
    }

    var imgEl = $('study-session-page-img');
    var loadingEl = $('study-page-loading');
    if (imgEl) imgEl.src = '';
    if (loadingEl) loadingEl.classList.remove('hidden');

    getPageImage(state.studyTopicId, pageIdx).then(function (blob) {
      if (loadingEl) loadingEl.classList.add('hidden');
      if (blob && imgEl) imgEl.src = URL.createObjectURL(blob);
    }).catch(function () {
      if (loadingEl) loadingEl.classList.add('hidden');
    });

    state.studyConversation = [];
    var threadEl = $('study-conversation-thread');
    if (threadEl) threadEl.innerHTML = '';
    var answerForm = $('study-answer-form');
    if (answerForm) answerForm.classList.add('hidden');
    var masteryEl = $('study-mastery-status');
    if (masteryEl) masteryEl.classList.add('hidden');
    var ratingForm = $('study-rating-form');
    if (ratingForm) ratingForm.classList.add('hidden');
    var addPagesSection = $('study-add-pages-section');
    if (addPagesSection) addPagesSection.classList.add('hidden');
    var getQBtn = $('btn-get-questions');
    if (getQBtn) {
      getQBtn.classList.remove('hidden', 'loading');
      getQBtn.disabled = false;
      getQBtn.textContent = (pageData && pageData.completed) ? '\uD83D\uDD04 Review Questions' : '\uD83E\udDE0 Get Questions from AI';
    }

    state.studyRating = 0;
    $$('#study-rating-stars .star-btn').forEach(function (s) { s.classList.remove('active'); });
    var notesEl = $('input-study-notes');
    if (notesEl) notesEl.value = '';
  }

  function studyGetQuestions() {
    var btn = $('btn-get-questions');
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }

    getPageImage(state.studyTopicId, state.studyPageIndex).then(function (blob) {
      if (!blob) throw new Error('Page image not found');
      return callGemini(blob, [], 'first_question');
    }).then(function (questionText) {
      if (btn) btn.classList.add('hidden');
      state.studyConversation.push({ role: 'ai', text: questionText });
      renderStudyConversation();
      var answerForm = $('study-answer-form');
      if (answerForm) answerForm.classList.remove('hidden');
      var answerInput = $('input-study-answer');
      if (answerInput) { answerInput.value = ''; answerInput.focus(); }
    }).catch(function (err) {
      if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      state.studyConversation.push({ role: 'ai', text: '\u26A0\uFE0F ' + err.message });
      renderStudyConversation();
    });
  }

  function studySubmitAnswer() {
    var answerInput = $('input-study-answer');
    var answer = answerInput ? answerInput.value.trim() : '';
    if (!answer) return;

    state.studyConversation.push({ role: 'user', text: answer });
    renderStudyConversation();
    if (answerInput) answerInput.value = '';

    var submitBtn = $('btn-submit-answer');
    if (submitBtn) { submitBtn.classList.add('loading'); submitBtn.disabled = true; }

    getPageImage(state.studyTopicId, state.studyPageIndex).then(function (blob) {
      if (!blob) throw new Error('Page image not found');
      return callGemini(blob, state.studyConversation, 'evaluate_answer');
    }).then(function (responseText) {
      if (submitBtn) { submitBtn.classList.remove('loading'); submitBtn.disabled = false; }

      if (responseText.indexOf('[MASTERY_CONFIRMED]') !== -1) {
        state.studyConversation.push({ role: 'ai', text: 'Excellent! You\'ve demonstrated strong understanding. \uD83C\uDF89' });
        renderStudyConversation();
        var answerForm = $('study-answer-form');
        if (answerForm) answerForm.classList.add('hidden');
        var masteryEl = $('study-mastery-status');
        if (masteryEl) masteryEl.classList.remove('hidden');
        var ratingForm = $('study-rating-form');
        if (ratingForm) ratingForm.classList.remove('hidden');
        playChime();
        vibrate([100, 50, 100]);
      } else {
        state.studyConversation.push({ role: 'ai', text: responseText });
        renderStudyConversation();
        if (answerInput) answerInput.focus();
      }
    }).catch(function (err) {
      if (submitBtn) { submitBtn.classList.remove('loading'); submitBtn.disabled = false; }
      state.studyConversation.push({ role: 'ai', text: '\u26A0\uFE0F ' + err.message });
      renderStudyConversation();
    });
  }

  function renderStudyConversation() {
    var threadEl = $('study-conversation-thread');
    if (!threadEl) return;
    threadEl.innerHTML = '';
    state.studyConversation.forEach(function (msg) {
      var div = document.createElement('div');
      div.className = 'study-msg ' + (msg.role === 'ai' ? 'study-msg-ai' : 'study-msg-user');
      div.textContent = msg.text;
      threadEl.appendChild(div);
    });
    var screen = $('screen-study-session');
    if (screen) screen.scrollTop = screen.scrollHeight;
  }

  function saveStudyRating() {
    var topic = getTopicById(state.studyTopicId);
    if (!topic) return;
    var pageIdx = state.studyPageIndex;
    var notesEl = $('input-study-notes');
    var notes = notesEl ? notesEl.value.trim() : '';

    if (!topic.pagesData) topic.pagesData = [];
    while (topic.pagesData.length <= pageIdx) {
      topic.pagesData.push({ completed: false, rating: 0, notes: '' });
    }

    var wasAlreadyComplete = topic.pagesData[pageIdx].completed;
    topic.pagesData[pageIdx].completed = true;
    topic.pagesData[pageIdx].rating = state.studyRating;
    topic.pagesData[pageIdx].notes = notes;
    if (!wasAlreadyComplete) topic.completedPages = (topic.completedPages || 0) + 1;
    updateTopic(topic);
    registerStudyDay();
    logStudyActivity(state.studySubjectId, state.studyTopicId, pageIdx);
    playChime();
    vibrate([50, 30, 50]);

    if (pageIdx < topic.totalPages - 1) {
      state.studyPageIndex = pageIdx + 1;
      updateStudyPageDisplay();
    } else {
      var addPagesSection = $('study-add-pages-section');
      if (addPagesSection) addPagesSection.classList.remove('hidden');
      var ratingForm = $('study-rating-form');
      if (ratingForm) ratingForm.classList.add('hidden');
    }
  }

  function showAddPagesSection(source) {
    if (!state.studyTopicId) return;

    var section = $('study-add-pages-section');
    if (!section) return;

    var isManualAdd = source === 'anytime';
    var iconEl = $('add-pages-icon');
    var titleEl = $('add-pages-title');
    var subEl = $('add-pages-sub');
    var closeBtn = $('btn-close-add-pages');

    if (iconEl) iconEl.textContent = isManualAdd ? '➕' : '🎉';
    if (titleEl) titleEl.textContent = isManualAdd ? 'Add more pages' : 'All pages mastered!';
    if (subEl) subEl.textContent = isManualAdd
      ? 'Choose photos or a PDF to add to this topic.'
      : 'Upload more pages to continue your journey.';
    if (closeBtn) closeBtn.classList.toggle('hidden', !isManualAdd);

    section.classList.remove('hidden');
    if (typeof section.scrollIntoView === 'function') {
      try {
        section.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {
        section.scrollIntoView();
      }
    }
  }

  // ─── Study Mode — File Processing (New Topic) ─────────────────
  var pendingTopicFiles = [];

  function handleTopicFileSelect(files) {
    pendingTopicFiles = Array.from(files);
    var textEl = $('topic-file-upload-text');
    var label = $('topic-file-upload-label');
    if (pendingTopicFiles.length === 0) {
      if (textEl) textEl.textContent = 'Tap to select files';
      if (label) label.classList.remove('has-files');
    } else {
      if (textEl) textEl.textContent = pendingTopicFiles.length + ' file(s) selected';
      if (label) label.classList.add('has-files');
    }
    checkCanSaveTopic();
  }

  function checkCanSaveTopic() {
    var nameInput = $('input-topic-name');
    var saveBtn = $('btn-save-new-topic');
    var hasName = nameInput && nameInput.value.trim().length > 0;
    var hasFiles = pendingTopicFiles.length > 0;
    if (saveBtn) saveBtn.disabled = !(hasName && hasFiles);
  }

  function saveNewTopic() {
    var nameInput = $('input-topic-name');
    var name = nameInput ? nameInput.value.trim() : '';
    if (!name || pendingTopicFiles.length === 0) return;

    var saveBtn = $('btn-save-new-topic');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Processing...'; }

    var topicId = 'topic_' + Date.now();
    var allBlobs = [];
    var processIdx = 0;

    function processNextFile() {
      if (processIdx >= pendingTopicFiles.length) { finishSaving(); return; }
      var file = pendingTopicFiles[processIdx];
      processIdx++;
      if (file.type === 'application/pdf') {
        renderPDFToImages(file).then(function (blobs) {
          allBlobs = allBlobs.concat(blobs); processNextFile();
        }).catch(function (err) { alert('Error: ' + err.message); processNextFile(); });
      } else {
        compressImage(file).then(function (blob) {
          allBlobs.push(blob); processNextFile();
        }).catch(function (err) { alert('Error: ' + err.message); processNextFile(); });
      }
    }

    function finishSaving() {
      if (allBlobs.length === 0) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Topic'; }
        alert('No pages were processed.'); return;
      }
      var savePromises = allBlobs.map(function (blob, idx) { return savePageImage(topicId, idx, blob); });
      Promise.all(savePromises).then(function () {
        var pagesData = allBlobs.map(function () { return { completed: false, rating: 0, notes: '', uploadedAt: Date.now() }; });
        var topics = loadTopics();
        topics.push({
          id: topicId, subjectId: state.studySubjectId, name: name,
          totalPages: allBlobs.length, completedPages: 0,
          pagesData: pagesData, createdAt: Date.now()
        });
        saveTopics(topics);

        if (nameInput) nameInput.value = '';
        pendingTopicFiles = [];
        var fileInput = $('input-topic-files');
        if (fileInput) fileInput.value = '';
        var textEl = $('topic-file-upload-text');
        if (textEl) textEl.textContent = 'Tap to select files';
        var label = $('topic-file-upload-label');
        if (label) label.classList.remove('has-files');
        var form = $('new-topic-form');
        if (form) form.classList.add('hidden');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Save Topic'; }

        vibrate(50);
        onStudySubjectEnter();
      }).catch(function (err) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Topic'; }
        alert('Error: ' + err.message);
      });
    }
    processNextFile();
  }

  // ─── Study Mode — Add Pages to Existing Topic ─────────────────
  var pendingAddPagesFiles = [];

  function handleAddPagesFileSelect(files) {
    pendingAddPagesFiles = Array.from(files);
    var textEl = $('add-pages-upload-text');
    var saveBtn = $('btn-add-pages-save');
    var label = $('add-pages-upload-label');
    if (pendingAddPagesFiles.length === 0) {
      if (textEl) textEl.textContent = 'Tap to select more pages';
      if (label) label.classList.remove('has-files');
      if (saveBtn) saveBtn.disabled = true;
    } else {
      if (textEl) textEl.textContent = pendingAddPagesFiles.length + ' file(s) selected';
      if (label) label.classList.add('has-files');
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function addPagesToTopic() {
    if (!state.studyTopicId || pendingAddPagesFiles.length === 0) return;
    var topic = getTopicById(state.studyTopicId);
    if (!topic) return;

    var saveBtn = $('btn-add-pages-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Processing...'; }
    var startIndex = topic.totalPages;
    var allBlobs = []; var processIdx = 0;

    function processNextFile() {
      if (processIdx >= pendingAddPagesFiles.length) { finishAdding(); return; }
      var file = pendingAddPagesFiles[processIdx]; processIdx++;
      if (file.type === 'application/pdf') {
        renderPDFToImages(file).then(function (blobs) { allBlobs = allBlobs.concat(blobs); processNextFile(); })
        .catch(function (err) { alert('Error: ' + err.message); processNextFile(); });
      } else {
        compressImage(file).then(function (blob) { allBlobs.push(blob); processNextFile(); })
        .catch(function (err) { alert('Error: ' + err.message); processNextFile(); });
      }
    }

    function finishAdding() {
      if (allBlobs.length === 0) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Upload & Continue \u2192'; }
        alert('No pages were processed.'); return;
      }
      var savePromises = allBlobs.map(function (blob, idx) { return savePageImage(state.studyTopicId, startIndex + idx, blob); });
      Promise.all(savePromises).then(function () {
        topic = getTopicById(state.studyTopicId);
        if (!topic.pagesData) topic.pagesData = [];
        for (var i = 0; i < allBlobs.length; i++) {
          topic.pagesData.push({ completed: false, rating: 0, notes: '', uploadedAt: Date.now() });
        }
        topic.totalPages = (topic.totalPages || 0) + allBlobs.length;
        updateTopic(topic);

        pendingAddPagesFiles = [];
        var fileInput = $('input-add-pages-files'); if (fileInput) fileInput.value = '';
        var anytimeFileInput = $('input-add-pages-anytime'); if (anytimeFileInput) anytimeFileInput.value = '';
        var textEl = $('add-pages-upload-text'); if (textEl) textEl.textContent = 'Tap to select more pages';
        var label = $('add-pages-upload-label'); if (label) label.classList.remove('has-files');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Upload & Continue \u2192'; }
        var addSection = $('study-add-pages-section'); if (addSection) addSection.classList.add('hidden');

        state.studyPageIndex = startIndex;
        updateStudyPageDisplay();
        vibrate([50, 30, 50]); playChime();
      }).catch(function (err) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Upload & Continue \u2192'; }
        alert('Error: ' + err.message);
      });
    }
    processNextFile();
  }

  // ─── Event Binding ────────────────────────────────────────────────
  function bindEvents() {
    // ── Start Block ──
    var btnStart = $('btn-start-block');
    if (btnStart) {
      btnStart.addEventListener('click', function () {
        navigateTo('screen-plan');
      });
    }

    // ── Settings gear ──
    var btnSettings = $('btn-settings');
    if (btnSettings) {
      btnSettings.addEventListener('click', function () {
        navigateTo('screen-settings');
      });
    }

    // ── Plan Screen ──
    var taskInput = $('task-input');
    if (taskInput) {
      taskInput.addEventListener('input', function () {
        state.taskText = this.value.substring(0, 80);
        if (this.value.length > 80) this.value = state.taskText;
        updateCharCount();
        updateBeginButton();
      });
    }

    $$('.duration-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var raw = this.getAttribute('data-duration');
        var dur = (raw === 'tiny') ? 'tiny' : parseInt(raw, 10);
        selectDuration(dur);
      });
    });

    $$('.category-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        selectCategory(this.getAttribute('data-category'));
      });
    });

    var btnBegin = $('btn-begin-breathing');
    if (btnBegin) {
      btnBegin.addEventListener('click', function () {
        if (!this.disabled) {
          beginBlock();
        }
      });
    }

    // ── Breathe Screen ──
    var btnSkip = $('btn-skip-breathing');
    if (btnSkip) {
      btnSkip.addEventListener('click', skipBreathing);
    }

    // ── Pre-Focus Gate ──
    var btnPrefocusReady = $('btn-prefocus-ready');
    if (btnPrefocusReady) btnPrefocusReady.addEventListener('click', confirmPrefocusReady);
    var btnPrefocusNotYet = $('btn-prefocus-notyet');
    if (btnPrefocusNotYet) btnPrefocusNotYet.addEventListener('click', prefocusNotYet);

    // ── Focus Screen ──
    var btnWander = $('btn-mind-wandered');
    if (btnWander) btnWander.addEventListener('click', logMindWandered);

    var btnPause = $('btn-pause-focus');
    if (btnPause) {
      btnPause.addEventListener('click', togglePause);
    }

    var btnEndEarly = $('btn-end-early');
    if (btnEndEarly) {
      btnEndEarly.addEventListener('click', endEarly);
    }

    // ── Rate Screen ──
    var slider = $('productivity-slider');
    if (slider) {
      slider.addEventListener('input', function () {
        var val = parseInt(this.value, 10);
        updateRateDisplay(val);
        // Move thumb indicator
        var barContainer = $one('.sentiment-bar-container');
        if (barContainer) {
          var pct = ((val + 5) / 10) * 100;
          barContainer.style.setProperty('--thumb-left', pct + '%');
        }
        // Self-compassion swap: on a low rating, replace the celebratory title
        // with neutral, non-judgmental copy — never punitive, never hollow-cheerful.
        var titleEl = $one('.rate-title');
        if (titleEl) {
          if (val <= -2) {
            if (!titleEl.dataset.originalText) titleEl.dataset.originalText = titleEl.textContent;
            titleEl.textContent = LOW_MOOD_MESSAGES[Math.floor(Math.random() * LOW_MOOD_MESSAGES.length)];
          } else if (titleEl.dataset.originalText) {
            titleEl.textContent = titleEl.dataset.originalText;
            delete titleEl.dataset.originalText;
          }
        }
      });
    }

    var btnSave = $('btn-save-rating');
    if (btnSave) {
      btnSave.addEventListener('click', saveRating);
    }

    // ── Journal ──
    var btnJPrev = $('btn-journal-prev');
    var btnJNext = $('btn-journal-next');
    if (btnJPrev) btnJPrev.addEventListener('click', journalPrev);
    if (btnJNext) btnJNext.addEventListener('click', journalNext);

    // ── Weekly ──
    var btnWPrev = $('btn-week-prev');
    var btnWNext = $('btn-week-next');
    if (btnWPrev) btnWPrev.addEventListener('click', weekPrev);
    if (btnWNext) btnWNext.addEventListener('click', weekNext);

    // ── Settings Toggles ──
    var hourlyEl = $('setting-hourly-notify');
    if (hourlyEl) {
      hourlyEl.addEventListener('change', function () {
        state.settings.hourlyNotify = this.checked;
        if (this.checked) {
          requestNotificationPermission();
          startHourlyNotifications();
        } else {
          stopHourlyNotifications();
        }
        saveSettings();
      });
    }

    var soundEl = $('setting-sound');
    if (soundEl) {
      soundEl.addEventListener('change', function () {
        state.settings.sound = this.checked;
        saveSettings();
      });
    }

    var vibEl = $('setting-vibration');
    if (vibEl) {
      vibEl.addEventListener('change', function () {
        state.settings.vibration = this.checked;
        saveSettings();
      });
    }

    var btnExport = $('btn-export-data');
    if (btnExport) btnExport.addEventListener('click', exportData);

    var btnClear = $('btn-clear-data');
    if (btnClear) btnClear.addEventListener('click', clearData);

    // ── Your Why ──
    var btnSaveWhy = $('btn-save-why');
    if (btnSaveWhy) {
      btnSaveWhy.addEventListener('click', function () {
        var el = $('setting-your-why');
        if (el) {
          setYourWhy(el.value);
          vibrate(30);
        }
      });
    }

    // ── If-Then Lapse Plan ──
    var btnSaveIfThen = $('btn-save-ifthen');
    if (btnSaveIfThen) {
      btnSaveIfThen.addEventListener('click', function () {
        var el = $('setting-ifthen-plan');
        if (el) {
          setIfThenPlan(el.value);
          vibrate(30);
        }
      });
    }

    // ── Category Budgets ──
    var btnSaveBudgets = $('btn-save-budgets');
    if (btnSaveBudgets) {
      btnSaveBudgets.addEventListener('click', function () {
        var bStudy = $('budget-study');
        var bWork = $('budget-work');
        var bPersonal = $('budget-personal');
        var bOther = $('budget-other');
        saveCategoryBudgets({
          study: bStudy ? Math.max(0, parseInt(bStudy.value, 10) || 0) : 120,
          work: bWork ? Math.max(0, parseInt(bWork.value, 10) || 0) : 240,
          personal: bPersonal ? Math.max(0, parseInt(bPersonal.value, 10) || 0) : 60,
          other: bOther ? Math.max(0, parseInt(bOther.value, 10) || 0) : 60
        });
        vibrate(30);
      });
    }

    // ── Fresh Start ──
    var btnFreshStart = $('btn-fresh-start');
    if (btnFreshStart) {
      btnFreshStart.addEventListener('click', function () {
        setFreshStart();
        vibrate(30);
        updateGreeting();
      });
    }

    // ── If-Then Nudge Dismiss (session-only, reappears if the gap persists next launch) ──
    var btnDismissIfThen = $('btn-dismiss-ifthen');
    if (btnDismissIfThen) {
      btnDismissIfThen.addEventListener('click', function () {
        state.ifThenDismissedThisSession = true;
        var card = $('ifthen-nudge-card');
        if (card) card.classList.add('hidden');
      });
    }

    // ── Study Mode ──
    var btnAddTopicToggle = $('btn-add-topic-toggle');
    if (btnAddTopicToggle) {
      btnAddTopicToggle.addEventListener('click', function () {
        var form = $('new-topic-form');
        if (!form) return;
        form.classList.toggle('hidden');
        if (!form.classList.contains('hidden')) {
          var topicNameInput = $('input-topic-name');
          if (topicNameInput) topicNameInput.focus();
        }
      });
    }

    var btnCancelTopic = $('btn-cancel-topic');
    if (btnCancelTopic) {
      btnCancelTopic.addEventListener('click', function () {
        var form = $('new-topic-form');
        var topicNameInput = $('input-topic-name');
        var topicFileInput = $('input-topic-files');
        var uploadText = $('topic-file-upload-text');
        var uploadLabel = $('topic-file-upload-label');
        pendingTopicFiles = [];
        if (topicNameInput) topicNameInput.value = '';
        if (topicFileInput) topicFileInput.value = '';
        if (uploadText) uploadText.textContent = 'Tap to select files';
        if (uploadLabel) uploadLabel.classList.remove('has-files');
        if (form) form.classList.add('hidden');
        checkCanSaveTopic();
      });
    }

    var topicFileInput = $('input-topic-files');
    if (topicFileInput) {
      topicFileInput.addEventListener('change', function () {
        handleTopicFileSelect(this.files);
      });
    }

    var topicNameInput = $('input-topic-name');
    if (topicNameInput) {
      topicNameInput.addEventListener('input', checkCanSaveTopic);
    }

    var btnSaveTopic = $('btn-save-new-topic');
    if (btnSaveTopic) {
      btnSaveTopic.addEventListener('click', saveNewTopic);
    }

    var btnGetQ = $('btn-get-questions');
    if (btnGetQ) {
      btnGetQ.addEventListener('click', studyGetQuestions);
    }

    var btnSubmitAnswer = $('btn-submit-answer');
    if (btnSubmitAnswer) {
      btnSubmitAnswer.addEventListener('click', studySubmitAnswer);
    }

    // Star rating
    $$('#study-rating-stars .star-btn').forEach(function (starBtn) {
      starBtn.addEventListener('click', function () {
        var val = parseInt(this.getAttribute('data-star'), 10);
        state.studyRating = val;
        $$('#study-rating-stars .star-btn').forEach(function (s, i) {
          s.classList.toggle('active', i < val);
        });
      });
    });

    var btnSaveStudyRating = $('btn-save-study-rating');
    if (btnSaveStudyRating) {
      btnSaveStudyRating.addEventListener('click', saveStudyRating);
    }

    var btnStudyPrev = $('btn-study-prev-page');
    if (btnStudyPrev) {
      btnStudyPrev.addEventListener('click', function () {
        if (state.studyPageIndex > 0) {
          state.studyPageIndex--;
          updateStudyPageDisplay();
        }
      });
    }

    var btnStudyNext = $('btn-study-next-page');
    if (btnStudyNext) {
      btnStudyNext.addEventListener('click', function () {
        var subj = getSubjectById(state.studySubjectId);
        if (subj && state.studyPageIndex < subj.totalPages - 1) {
          state.studyPageIndex++;
          updateStudyPageDisplay();
        }
      });
    }

    // Persistent "+" button in the study-session header — lets the user
    // upload the next part at any point, not just after finishing a page.
    var btnAddPagesAnytime = $('btn-add-pages-anytime');
    if (btnAddPagesAnytime) {
      btnAddPagesAnytime.addEventListener('click', function () {
        var topic = getTopicById(state.studyTopicId);
        if (!topic) return;
        state.studySubjectId = topic.subjectId;
        showAddPagesSection('anytime');
      });
      btnAddPagesAnytime.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        var anytimeFileInput = $('input-add-pages-anytime');
        if (anytimeFileInput) anytimeFileInput.click();
      });
    }

    var btnContinueNextPage = $('btn-continue-next-page');
    if (btnContinueNextPage) {
      btnContinueNextPage.addEventListener('click', function () {
        var subj = getSubjectById(state.studySubjectId);
        if (subj && state.studyPageIndex < subj.totalPages - 1) {
          state.studyPageIndex++;
          updateStudyPageDisplay(); // hides the add-pages panel as part of its reset
        }
      });
    }

    var btnCloseAddPages = $('btn-close-add-pages');
    if (btnCloseAddPages) {
      btnCloseAddPages.addEventListener('click', function () {
        var addPagesSection = $('study-add-pages-section');
        if (addPagesSection) addPagesSection.classList.add('hidden');
      });
    }

    // ── Add Pages to Existing Subject ──
    var addPagesFileInput = $('input-add-pages-files');
    if (addPagesFileInput) {
      addPagesFileInput.addEventListener('change', function () {
        handleAddPagesFileSelect(this.files);
      });
    }

    var anytimeAddPagesFileInput = $('input-add-pages-anytime');
    if (anytimeAddPagesFileInput) {
      anytimeAddPagesFileInput.addEventListener('change', function () {
        handleAddPagesFileSelect(this.files);
        if (this.files && this.files.length) showAddPagesSection('anytime');
        this.value = '';
      });
    }

    var btnAddPagesSave = $('btn-add-pages-save');
    if (btnAddPagesSave) {
      btnAddPagesSave.addEventListener('click', addPagesToTopic);
    }

    // ── Bottom Nav ──
    $$('[data-screen]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var screen = this.getAttribute('data-screen');
        if (screen) navigateTo('screen-' + screen);
      });
    });

    // ── Back Buttons ──
    $$('[data-back]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var back = this.getAttribute('data-back');
        if (back) {
          navigateTo('screen-' + back);
        } else {
          navigateTo('screen-dashboard');
        }
      });
    });

    // ── Visibility change: catch up timers + re-acquire wake lock ──
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        // Re-acquire wake lock for active screens
        if (state.currentScreen === 'screen-breathe' || state.currentScreen === 'screen-focus') {
          requestWakeLock();
        }

        // Catch up breathing timer (may have completed while in background)
        if (state.currentScreen === 'screen-breathe' && state.breatheStartedAt) {
          updateBreathingFromTimestamp();
        }

        // Catch up focus timer (may have completed while in background)
        if (state.currentScreen === 'screen-focus' && state.focusStartedAt && !state.focusPausedAt) {
          updateFocusFromTimestamp();
        }
      } else {
        // Going to background — save session state
        if (state.currentBlock) {
          saveSession();
        }
      }
    });

    // ── Before unload: persist session ──
    window.addEventListener('beforeunload', function () {
      if (state.currentBlock) {
        saveSession();
      }
    });

    // ── First user interaction: prime audio context ──
    document.addEventListener('click', function initAudio() {
      getAudioContext();
      document.removeEventListener('click', initAudio);
    }, { once: true });
  }

  // ─── Init ─────────────────────────────────────────────────────────
  function init() {
    loadSettings();
    bindEvents();
    registerServiceWorker();

    // Opens streak + gap detection (for the one-time welcome-back message).
    // Must read the OLD data before registering today's open overwrites it.
    var priorOpensData = getOpensData();
    state.gapDaysOnLaunch = getGapDays(priorOpensData);
    registerAppOpen();

    // Request notification permission on first load
    if (state.settings.hourlyNotify) {
      requestNotificationPermission();
    }

    // Wait for SW to be ready, then start hourly notifications
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(function () {
        if (state.settings.hourlyNotify) {
          startHourlyNotifications();
        }
      });
    }

    // Try to restore an active session (e.g. user closed and reopened the app)
    var restored = restoreSession();
    if (!restored) {
      navigateTo('screen-dashboard');
    }
  }

  // ─── Expose navigateTo for cross-module use ─────────────────────────
  window.rebirthNavigate = function (screenId) { navigateTo(screenId); };

  // ─── SW Update Banner ───────────────────────────────────────────────
  function listenForSWUpdate() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // New SW activated — a banner is shown from SW postMessage
    });
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'SW_UPDATE_AVAILABLE') {
        showUpdateBanner();
      }
    });
  }
  function showUpdateBanner() {
    if (document.getElementById('update-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:var(--accent-primary,#9e1b32);color:#fff;text-align:center;padding:12px;font-size:14px;cursor:pointer;touch-action:manipulation';
    banner.textContent = 'New version available \u2014 Tap to reload';
    banner.addEventListener('click', function () { location.reload(); });
    document.body.appendChild(banner);
  }

  // ─── Error-Safe Init ────────────────────────────────────────────────
  function safeBoot() {
    try {
      init();
      listenForSWUpdate();
    } catch (err) {
      console.error('[Re-birth] FATAL init error:', err);
      captureError('FATAL: ' + err.message, 'init', 0, 0, err);
      document.body.innerHTML = '<div style="padding:2rem;text-align:center;color:#fff;background:#100f0d;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center"><h2>Re-birth failed to start</h2><p style="color:#999;margin:1rem 0">' + err.message + '</p><button onclick="location.reload()" style="padding:12px 24px;background:#9e1b32;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;margin:8px">Reload</button><button onclick="localStorage.clear();location.reload()" style="padding:12px 24px;background:#333;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;margin:8px">Reset All Data</button></div>';
    }
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeBoot);
  } else {
    safeBoot();
  }

})();
