(function () {
  'use strict';

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

    // Intervals
    planClockInterval: null,
    dashboardClockInterval: null,
    particlesCreated: false,
    wakeLock: null
  };

  // ─── Constants ───────────────────────────────────────────────────────
  const BREATHE_TOTAL = 300;
  const PHASE_DURATIONS = { inhale: 4, hold: 7, exhale: 8 };
  const CYCLE_LENGTH = 19; // 4+7+8
  const FOCUS_RING_CIRCUMFERENCE = 2 * Math.PI * 90; // ~565.49
  const BREATHE_RING_CIRCUMFERENCE = 2 * Math.PI * 54;
  const SENTIMENT_MAP = {
    '-5': { emoji: '💀', label: 'Wasted', color: '#ef4444' },
    '-4': { emoji: '😡', label: 'Terrible', color: '#f43f5e' },
    '-3': { emoji: '😕', label: 'Distracted', color: '#f97316' },
    '-2': { emoji: '😒', label: 'Unfocused', color: '#fb923c' },
    '-1': { emoji: '😐', label: 'Meh', color: '#eab308' },
    '0':  { emoji: '⚖️', label: 'Neutral', color: '#a3a3a3' },
    '1':  { emoji: '🙂', label: 'Okay', color: '#a3e635' },
    '2':  { emoji: '😊', label: 'Good', color: '#4ade80' },
    '3':  { emoji: '💪', label: 'Productive', color: '#22c55e' },
    '4':  { emoji: '🔥', label: 'Great', color: '#10b981' },
    '5':  { emoji: '🚀', label: 'Locked In!', color: '#06b6d4' }
  };

  function sentimentToProductivity(sentiment) {
    // Convert -5..+5 to 0..100 for backward compatibility
    return Math.round(((sentiment + 5) / 10) * 100);
  }

  function productivityToSentiment(productivity) {
    // Convert 0..100 back to -5..+5
    return Math.round((productivity / 100) * 10 - 5);
  }

  const FOCUS_MINUTES_MAP = { 1: 50, 2: 110, 3: 170, 4: 230 };

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
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
  }

  function showNotification(title, body, tag) {
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
    if ('Notification' in window && Notification.permission !== 'granted') return;
    sendToSW({ type: 'START_HOURLY' });
  }

  function stopHourlyNotifications() {
    sendToSW({ type: 'STOP_HOURLY' });
  }

  function scheduleFocusDoneNotification() {
    // Tell the SW to fire a notification when focus time expires
    // This works even if the tab is killed
    var remaining = getFocusRemaining();
    if (remaining <= 0) return;
    sendToSW({
      type: 'SCHEDULE_FOCUS_DONE',
      delayMs: remaining * 1000,
      title: 'Re-birth ✅ Focus Complete!',
      body: 'Your focus block is done! Time to rate your session.'
    });
  }

  function cancelFocusDoneNotification() {
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

    // Update bottom nav active states
    $$('.nav-item').forEach(function (navBtn) {
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
    }

    // Clean up when leaving screens
    if (screenId !== 'screen-plan') {
      stopPlanClock();
    }
    if (screenId !== 'screen-breathe') {
      stopBreathing();
    }
    if (screenId !== 'screen-breathe' && screenId !== 'screen-focus') {
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
    startDashboardClock();
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
  }

  function calculateStreak() {
    var streak = 0;
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    while (true) {
      var dateStr = toDateString(d);
      var blocks = getBlocksForDate(dateStr);
      if (blocks.length > 0) {
        streak++;
        d = addDays(d, -1);
      } else {
        break;
      }
    }
    return streak;
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

    // Streak badge
    var streak = calculateStreak();
    var streakEl = $('streak-badge');
    if (streakEl) {
      if (streak > 0) {
        streakEl.style.display = '';
        streakEl.querySelector('.streak-count').textContent = streak;
      } else {
        streakEl.style.display = 'none';
      }
    }
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

      card.innerHTML =
        '<div class="block-card-header">' +
          '<span class="block-card-time">' + escapeHtml(block.startTime || '') + '</span>' +
          '<span class="block-card-prod" style="color:' + sentLabel.color + '">' + sentLabel.emoji + ' ' + escapeHtml(sentLabel.text) + '</span>' +
        '</div>' +
        '<div class="block-card-task">' + escapeHtml(block.task || '') + '</div>' +
        '<div class="block-card-bar-track">' +
          '<div class="block-card-bar-fill" style="width:' + prodPercent + '%;background:' + sentLabel.color + '"></div>' +
        '</div>' +
        '<div class="block-card-meta">' +
          '<span>' + (block.durationHours || 0) + 'h block</span>' +
          '<span>' + (block.focusMinutes || 0) + ' min focus</span>' +
        '</div>';

      container.appendChild(card);
    });
  }

  function updateActiveBlockCard() {
    const card = $('active-block-card');
    if (!card) return;

    if (!state.currentBlock || state.currentScreen === 'screen-dashboard') {
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
      if (state.currentScreen === 'screen-breathe') {
        phaseBadge.textContent = 'Breathing';
      } else if (state.currentScreen === 'screen-focus') {
        phaseBadge.textContent = 'Focusing';
      } else {
        phaseBadge.textContent = 'Active';
      }
    }

    if (resumeBtn) {
      resumeBtn.onclick = function () {
        navigateTo(state.currentScreen);
      };
    }
  }

  function getProductivityColor(val) {
    if (val <= 20) return '#ef4444';
    if (val <= 40) return '#f97316';
    if (val <= 60) return '#eab308';
    if (val <= 80) return '#22c55e';
    return '#10b981';
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

  function selectDuration(hours) {
    state.selectedDuration = hours;
    $$('.duration-btn').forEach(function (btn) {
      const btnHours = parseInt(btn.getAttribute('data-duration'), 10);
      btn.classList.toggle('active', btnHours === hours);
    });
    updateDurationBreakdown();
    updateBeginButton();
  }

  function updateDurationBreakdown() {
    const el = $('duration-breakdown');
    if (!el) return;
    if (!state.selectedDuration) {
      el.textContent = 'Select a duration to see the breakdown';
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

  function beginBlock() {
    const now = new Date();
    state.currentBlock = {
      id: Date.now(),
      date: toDateString(now),
      startTime: pad(now.getHours()) + ':' + pad(now.getMinutes()),
      task: state.taskText.trim(),
      durationHours: state.selectedDuration,
      focusMinutes: FOCUS_MINUTES_MAP[state.selectedDuration] || 50,
      productivity: 0,
      note: '',
      completed: false
    };

    // Reset timestamp trackers for fresh block
    state.breatheStartedAt = null;
    state.focusStartedAt = null;
    state.focusPausedAt = null;
    state.focusPausedAccum = 0;

    navigateTo('screen-breathe');
  }

  // ─── Breathing Screen (Timestamp-based) ────────────────────────────
  function onBreatheEnter() {
    requestWakeLock();

    // Show task info
    const taskEl = $('breathe-next-task');
    const durEl = $('breathe-next-duration');
    if (taskEl && state.currentBlock) taskEl.textContent = state.currentBlock.task;
    if (durEl && state.currentBlock) durEl.textContent = state.currentBlock.durationHours + 'h block';

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
    // Compute which phase (inhale/hold/exhale) and time within it from total elapsed
    var cyclePos = elapsed % CYCLE_LENGTH;
    if (cyclePos < PHASE_DURATIONS.inhale) {
      return { phase: 'inhale', phaseTime: cyclePos };
    } else if (cyclePos < PHASE_DURATIONS.inhale + PHASE_DURATIONS.hold) {
      return { phase: 'hold', phaseTime: cyclePos - PHASE_DURATIONS.inhale };
    } else {
      return { phase: 'exhale', phaseTime: cyclePos - PHASE_DURATIONS.inhale - PHASE_DURATIONS.hold };
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
        navigateTo('screen-focus');
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
    const phaseDur = PHASE_DURATIONS[phase];
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
    navigateTo('screen-focus');
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
    'Block Complete!',
    'Nice deep work.',
    "That's momentum.",
    'Well protected.',
    'Another block down.'
  ];

  function getCompletionMessage() {
    // Streak-aware: if streak >= 2 and this is first block of day, celebrate streak
    var streak = calculateStreak();
    var todayBlocks = getBlocksForDate(toDateString(new Date()));
    if (streak >= 2 && todayBlocks.length === 0) {
      return streak + '-day streak \u2014 keep it alive \ud83d\udd25';
    }
    if (streak >= 2) {
      var msgs = COMPLETE_MESSAGES.concat(['Streak protected \ud83d\udd25']);
      return msgs[Math.floor(Math.random() * msgs.length)];
    }
    return COMPLETE_MESSAGES[Math.floor(Math.random() * COMPLETE_MESSAGES.length)];
  }

  function onRateEnter() {
    releaseWakeLock();

    if (!state.currentBlock) return;

    // Rotating completion micro-copy
    var titleEl = $one('.rate-title');
    if (titleEl) {
      titleEl.textContent = getCompletionMessage();
    }

    const taskNameEl = $('rate-task-name');
    const taskDurEl = $('rate-task-duration');
    if (taskNameEl) taskNameEl.textContent = state.currentBlock.task;
    if (taskDurEl) taskDurEl.textContent = state.currentBlock.durationHours + 'h block \u00b7 ' + state.currentBlock.focusMinutes + ' min focused';

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

      entry.innerHTML =
        '<div class="journal-entry-header">' +
          '<span class="journal-entry-time">' + escapeHtml(block.startTime || '') + '</span>' +
          '<span class="journal-entry-prod" style="color:' + sentLabel.color + '">' + sentLabel.emoji + ' ' + escapeHtml(sentLabel.text) + '</span>' +
        '</div>' +
        '<div class="journal-entry-task">' + escapeHtml(block.task || '') + '</div>' +
        '<div class="journal-entry-meta">' +
          '<span>' + (block.durationHours || 0) + 'h block</span>' +
          '<span>' + (block.focusMinutes || 0) + ' min focus</span>' +
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
          // Interpolate between mood-gradient-start (#6b7db3) and mood-gradient-end (#e8a455)
          var t = Math.min(d.avg / 100, 1);
          var r = Math.round(107 + (232 - 107) * t);
          var g = Math.round(125 + (164 - 125) * t);
          var b = Math.round(179 + (85 - 179) * t);
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
  }

  function syncSettingsUI() {
    const hourlyEl = $('setting-hourly-notify');
    const soundEl = $('setting-sound');
    const vibEl = $('setting-vibration');

    if (hourlyEl) hourlyEl.checked = state.settings.hourlyNotify;
    if (soundEl) soundEl.checked = state.settings.sound;
    if (vibEl) vibEl.checked = state.settings.vibration;
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

  // ─── Service Worker ───────────────────────────────────────────────
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {
        // Service worker registration failed – not critical
      });
    }
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
        var dur = parseInt(this.getAttribute('data-duration'), 10);
        selectDuration(dur);
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

    // ── Focus Screen ──
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
        updateRateDisplay(parseInt(this.value, 10));
        // Move thumb indicator
        var barContainer = $one('.sentiment-bar-container');
        if (barContainer) {
          var pct = ((parseInt(this.value, 10) + 5) / 10) * 100;
          barContainer.style.setProperty('--thumb-left', pct + '%');
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

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
