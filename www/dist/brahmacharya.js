// ═══════════════════════════════════════════════════════════════════
// brahmacharya.js — Optional Discipline Module (M5)
// Injected into Sadhana screen. Hideable via Settings toggle.
// All local-only. No shame, no punishment, no fear.
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function rJSON(k, d) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } }
  function rSave(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function el(id) { return document.getElementById(id); }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }

  var TRIGGERS = ['Boredom','Stress','Fatigue','Loneliness','Scrolling'];
  var REPLACEMENTS = ['Walk','Movement','Japa / Meditation','Reading','Shower','Sleep','5-min study task'];
  var LAPSE_MSG = 'No self-punishment. Notice the trigger, remove it, and restart with one clean action.';

  // ─── Data ──────────────────────────────────────────────────────
  function isVisible() { return localStorage.getItem('rebirth_brahmacharya_visible') !== 'false'; }
  function getData() { return rJSON('rebirth_brahmacharya', { days: {} }); }
  function saveData(d) { rSave('rebirth_brahmacharya', d); }

  function getToday() {
    var data = getData();
    var today = todayStr();
    if (!data.days[today]) {
      data.days[today] = {
        sankalpa: '', wakeTime: '', prayerDone: false, movementDone: false,
        studyStartTime: '', sleepPrepDone: false, screenDiscipline: false,
        studyComplete: false, tomorrowTask: '', noPhoneStudy: false,
        socialMediaMins: 0, redirects: []
      };
      saveData(data);
    }
    return data.days[today];
  }

  function updateToday(updates) {
    var data = getData();
    var today = todayStr();
    if (!data.days[today]) data.days[today] = {};
    Object.keys(updates).forEach(function (k) { data.days[today][k] = updates[k]; });
    saveData(data);
  }

  // ─── Dashboard Stats ──────────────────────────────────────────
  function getWeekStats() {
    var data = getData();
    var now = new Date();
    var stats = { sleepTimes: [], movementDays: 0, screenDays: 0, totalDays: 0 };
    for (var i = 0; i < 7; i++) {
      var d = new Date(now); d.setDate(d.getDate() - i);
      var key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      var day = data.days[key];
      if (day) {
        stats.totalDays++;
        if (day.wakeTime) stats.sleepTimes.push(day.wakeTime);
        if (day.movementDone) stats.movementDays++;
        if (day.screenDiscipline) stats.screenDays++;
      }
    }
    return stats;
  }

  // ─── Render ────────────────────────────────────────────────────
  function render() {
    if (!isVisible()) return;
    var container = el('sadhana-today-content');
    if (!container) return;

    // Don't inject if already there
    if (el('brahmacharya-section')) return;

    var today = getToday();
    var stats = getWeekStats();

    var html = '<div id="brahmacharya-section" class="bc-section">';
    html += '<div class="bc-header"><span class="bc-title">Discipline Practice</span></div>';

    // Sankalpa
    html += '<div class="bc-card">';
    html += '<label class="bc-label">Today\'s Sankalpa</label>';
    html += '<input type="text" id="bc-sankalpa" class="bc-input" value="' + (today.sankalpa || '').replace(/"/g,'&quot;') + '" placeholder="One intention..." maxlength="120">';
    html += '</div>';

    // Morning Routine
    html += '<div class="bc-card"><span class="bc-card-title">Morning</span>';
    html += '<div class="bc-row"><label class="bc-check-label"><input type="checkbox" id="bc-prayer" ' + (today.prayerDone ? 'checked' : '') + '> Prayer / quiet reflection</label></div>';
    html += '<div class="bc-row"><label class="bc-check-label"><input type="checkbox" id="bc-movement" ' + (today.movementDone ? 'checked' : '') + '> Movement done</label></div>';
    html += '<div class="bc-row"><label class="bc-label-sm">Wake time</label><input type="time" id="bc-wake" class="bc-input-sm" value="' + (today.wakeTime || '') + '"></div>';
    html += '<div class="bc-row"><label class="bc-label-sm">Study start</label><input type="time" id="bc-study-start" class="bc-input-sm" value="' + (today.studyStartTime || '') + '"></div>';
    html += '</div>';

    // Evening Review
    html += '<div class="bc-card"><span class="bc-card-title">Evening</span>';
    html += '<div class="bc-row"><label class="bc-check-label"><input type="checkbox" id="bc-sleep-prep" ' + (today.sleepPrepDone ? 'checked' : '') + '> Sleep preparation</label></div>';
    html += '<div class="bc-row"><label class="bc-check-label"><input type="checkbox" id="bc-screen-disc" ' + (today.screenDiscipline ? 'checked' : '') + '> Screen discipline</label></div>';
    html += '<div class="bc-row"><label class="bc-check-label"><input type="checkbox" id="bc-study-done" ' + (today.studyComplete ? 'checked' : '') + '> Study completed</label></div>';
    html += '<div class="bc-row"><label class="bc-label-sm">Tomorrow\'s first task</label><input type="text" id="bc-tomorrow" class="bc-input" value="' + (today.tomorrowTask || '').replace(/"/g,'&quot;') + '" placeholder="First thing..." maxlength="100"></div>';
    html += '</div>';

    // Digital Boundaries
    html += '<div class="bc-card"><span class="bc-card-title">Digital Boundaries</span>';
    html += '<div class="bc-row"><label class="bc-check-label"><input type="checkbox" id="bc-nophone" ' + (today.noPhoneStudy ? 'checked' : '') + '> No-phone study block today</label></div>';
    html += '<div class="bc-row"><label class="bc-label-sm">Social media (min)</label><input type="number" id="bc-social" class="bc-input-sm" value="' + (today.socialMediaMins || 0) + '" min="0" max="999"></div>';
    html += '</div>';

    // Redirect Now
    html += '<div class="bc-card bc-redirect-card">';
    html += '<button id="btn-redirect-now" class="bc-redirect-btn">Redirect Now</button>';
    html += '<p class="bc-lapse-msg">' + LAPSE_MSG + '</p>';
    html += '</div>';

    // Week Stats
    html += '<div class="bc-card"><span class="bc-card-title">This Week</span>';
    html += '<div class="bc-stats-row">';
    html += '<div class="bc-stat"><span class="bc-stat-val">' + stats.sleepTimes.length + '/7</span><span class="bc-stat-lbl">Wake logged</span></div>';
    html += '<div class="bc-stat"><span class="bc-stat-val">' + stats.movementDays + '/7</span><span class="bc-stat-lbl">Movement</span></div>';
    html += '<div class="bc-stat"><span class="bc-stat-val">' + stats.screenDays + '/7</span><span class="bc-stat-lbl">Screen disc.</span></div>';
    html += '</div></div>';

    // Save button
    html += '<button id="btn-bc-save" class="bc-save-btn">Save Discipline Log</button>';
    html += '</div>';

    container.insertAdjacentHTML('beforeend', html);
    bindEvents();
  }

  // ─── Redirect Now Overlay ─────────────────────────────────────
  function showRedirect() {
    if (el('bc-redirect-overlay')) return;
    var ov = document.createElement('div');
    ov.id = 'bc-redirect-overlay';
    ov.className = 'mk-overlay';
    var html = '<div class="mk-sheet">';
    html += '<div class="mk-header"><button class="mk-close" id="bc-redirect-close">&larr;</button><h2 class="mk-title">Redirect Now</h2></div>';

    // Step 1: Breathe
    html += '<div class="bc-card"><p style="text-align:center;color:var(--text-secondary);font-size:var(--font-lg)">Pause. Take 3 slow breaths.</p></div>';

    // Step 2: Trigger
    html += '<div class="bc-card"><span class="bc-card-title">What pulled you away?</span>';
    html += '<div class="bc-trigger-grid">';
    TRIGGERS.forEach(function (t) {
      html += '<button class="bc-trigger-btn" data-trigger="' + t + '">' + t + '</button>';
    });
    html += '</div></div>';

    // Step 3: Replacement
    html += '<div class="bc-card"><span class="bc-card-title">Choose a replacement</span>';
    html += '<div class="bc-trigger-grid">';
    REPLACEMENTS.forEach(function (r) {
      html += '<button class="bc-replace-btn" data-replace="' + r + '">' + r + '</button>';
    });
    html += '</div></div>';

    // Step 4: Return
    html += '<div class="bc-card" style="text-align:center">';
    html += '<p class="bc-lapse-msg">' + LAPSE_MSG + '</p>';
    html += '<button id="bc-redirect-done" class="btn-primary" style="margin-top:var(--space-md);touch-action:manipulation">Return to next task</button>';
    html += '</div>';

    html += '</div>';
    ov.innerHTML = html;
    document.body.appendChild(ov);

    // Bindings
    el('bc-redirect-close').addEventListener('click', closeRedirect);
    el('bc-redirect-done').addEventListener('click', function () {
      // Log the redirect
      var trigger = ov.querySelector('.bc-trigger-btn.bc-active');
      var replace = ov.querySelector('.bc-replace-btn.bc-active');
      if (trigger || replace) {
        var today = getToday();
        if (!today.redirects) today.redirects = [];
        today.redirects.push({
          time: new Date().toISOString(),
          trigger: trigger ? trigger.getAttribute('data-trigger') : '',
          replacement: replace ? replace.getAttribute('data-replace') : ''
        });
        updateToday({ redirects: today.redirects });
      }
      closeRedirect();
    });

    // Toggle active
    ov.addEventListener('click', function (e) {
      var tb = e.target.closest('.bc-trigger-btn');
      if (tb) {
        ov.querySelectorAll('.bc-trigger-btn').forEach(function (b) { b.classList.remove('bc-active'); });
        tb.classList.add('bc-active');
      }
      var rb = e.target.closest('.bc-replace-btn');
      if (rb) {
        ov.querySelectorAll('.bc-replace-btn').forEach(function (b) { b.classList.remove('bc-active'); });
        rb.classList.add('bc-active');
      }
    });
  }

  function closeRedirect() {
    var ov = el('bc-redirect-overlay');
    if (ov) ov.remove();
  }

  // ─── Events ────────────────────────────────────────────────────
  function bindEvents() {
    var redirectBtn = el('btn-redirect-now');
    if (redirectBtn) redirectBtn.addEventListener('click', showRedirect);

    var saveBtn = el('btn-bc-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        updateToday({
          sankalpa: (el('bc-sankalpa') || {}).value || '',
          wakeTime: (el('bc-wake') || {}).value || '',
          prayerDone: el('bc-prayer') ? el('bc-prayer').checked : false,
          movementDone: el('bc-movement') ? el('bc-movement').checked : false,
          studyStartTime: (el('bc-study-start') || {}).value || '',
          sleepPrepDone: el('bc-sleep-prep') ? el('bc-sleep-prep').checked : false,
          screenDiscipline: el('bc-screen-disc') ? el('bc-screen-disc').checked : false,
          studyComplete: el('bc-study-done') ? el('bc-study-done').checked : false,
          tomorrowTask: (el('bc-tomorrow') || {}).value || '',
          noPhoneStudy: el('bc-nophone') ? el('bc-nophone').checked : false,
          socialMediaMins: parseInt((el('bc-social') || {}).value) || 0
        });
        saveBtn.textContent = 'Saved!';
        setTimeout(function () { saveBtn.textContent = 'Save Discipline Log'; }, 1500);
      });
    }
  }

  // ─── CSS ───────────────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = [
    '.bc-section{margin-top:var(--space-lg);border-top:1px solid var(--bg-surface);padding-top:var(--space-md)}',
    '.bc-header{margin-bottom:var(--space-md)}',
    '.bc-title{font-family:var(--font-display);font-size:var(--font-lg);color:var(--text-primary)}',
    '.bc-card{background:var(--bg-surface);border-radius:var(--radius-lg);padding:var(--space-md);margin-bottom:var(--space-sm)}',
    '.bc-card-title{font-family:var(--font-display);font-size:var(--font-sm);color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:var(--space-sm)}',
    '.bc-label{font-size:var(--font-sm);color:var(--text-secondary);display:block;margin-bottom:var(--space-xs)}',
    '.bc-label-sm{font-size:var(--font-xs);color:var(--text-tertiary);min-width:80px}',
    '.bc-input{width:100%;padding:var(--space-sm);background:var(--bg-base);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md);font-size:var(--font-base);font-family:inherit}',
    '.bc-input-sm{padding:var(--space-xs) var(--space-sm);background:var(--bg-base);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-sm);font-size:var(--font-sm);width:auto}',
    '.bc-row{display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-xs)}',
    '.bc-check-label{display:flex;align-items:center;gap:var(--space-xs);font-size:var(--font-sm);color:var(--text-secondary);cursor:pointer}',
    '.bc-check-label input[type=checkbox]{width:18px;height:18px;accent-color:var(--color-success)}',
    '.bc-redirect-btn{width:100%;padding:var(--space-md);background:var(--accent-breathe);color:#fff;border:none;border-radius:var(--radius-md);font-family:var(--font-display);font-size:var(--font-base);cursor:pointer;touch-action:manipulation}',
    '.bc-redirect-card{text-align:center}',
    '.bc-lapse-msg{font-size:var(--font-xs);color:var(--text-tertiary);font-style:italic;margin-top:var(--space-sm)}',
    '.bc-stats-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-sm);text-align:center}',
    '.bc-stat-val{display:block;font-family:var(--font-display);font-size:var(--font-xl);color:var(--text-primary)}',
    '.bc-stat-lbl{font-size:var(--font-xs);color:var(--text-tertiary)}',
    '.bc-save-btn{width:100%;padding:var(--space-md);background:var(--bg-surface);color:var(--text-primary);border:1px solid rgba(255,250,245,.15);border-radius:var(--radius-md);font-size:var(--font-base);cursor:pointer;touch-action:manipulation;margin-bottom:80px}',
    '.bc-trigger-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-xs)}',
    '.bc-trigger-btn,.bc-replace-btn{padding:var(--space-sm);background:var(--bg-base);border:1px solid rgba(255,250,245,.1);color:var(--text-secondary);border-radius:var(--radius-md);font-size:var(--font-sm);cursor:pointer;touch-action:manipulation;text-align:center}',
    '.bc-trigger-btn.bc-active,.bc-replace-btn.bc-active{background:rgba(107,143,113,.2);color:var(--color-success);border-color:var(--color-success)}'
  ].join('\n');
  document.head.appendChild(css);

  // ─── Observer ──────────────────────────────────────────────────
  var obs = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      var s = m.target;
      if (s.id === 'screen-sadhana' && s.classList.contains('active')) {
        // Remove old section if re-entering
        var old = el('brahmacharya-section');
        if (old) old.remove();
        render();
      }
    });
  });

  function init() {
    try {
      document.querySelectorAll('.screen').forEach(function (s) {
        obs.observe(s, { attributes: true, attributeFilter: ['class'] });
      });
    } catch (err) { console.error('[Brahmacharya] Init error:', err); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
