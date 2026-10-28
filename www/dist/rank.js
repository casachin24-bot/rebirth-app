// ═══════════════════════════════════════════════════════════════════
// rank.js — Rank Preparation Module (M1+M2)
// Self-contained IIFE. Reads rebirth_topics, rebirth_subjects, rebirth_blocks.
// Writes rebirth_rank_goal, rebirth_rank_schema. Additively migrates topics.
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var RANK_SCHEMA = 2; // bump when topic fields change

  // ─── Safe Storage ──────────────────────────────────────────────
  function rGet(k)       { try { return localStorage.getItem(k); }            catch (e) { return null; } }
  function rSet(k, v)    { try { localStorage.setItem(k, v); }               catch (e) {} }
  function rJSON(k, def) { var r = rGet(k); if (!r) return def; try { return JSON.parse(r); } catch (e) { return def; } }
  function rSaveJSON(k, v) { rSet(k, JSON.stringify(v)); }

  // ─── Date helpers (local, never UTC) ───────────────────────────
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function parseDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
  function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function diffDays(a, b) { return Math.round((b - a) / 86400000); }

  // ─── Rank Goal ─────────────────────────────────────────────────
  var DEFAULT_GOAL = {
    examName: 'CA Final', targetRank: 50, examDate: '2027-05-15',
    dailyHours: 8, weeklyTestDay: 'sunday'
  };

  function getGoal()   { return rJSON('rebirth_rank_goal', DEFAULT_GOAL); }
  function saveGoal(g) { rSaveJSON('rebirth_rank_goal', g); }

  // ─── Topic Migration (additive, idempotent) ────────────────────
  var TOPIC_DEFAULTS = {
    chapter: '', status: 'not_started', priority: 'medium', weightage: 0,
    confidence: 0, estimatedHours: 0, actualHours: 0,
    lastStudied: null, nextRevision: null,
    questionsCorrect: 0, questionsWrong: 0
  };

  function migrateTopics() {
    var stored = rJSON('rebirth_rank_schema', { version: 0 });
    if (stored.version >= RANK_SCHEMA) return;

    var topics = rJSON('rebirth_topics', []);
    var changed = false;
    topics.forEach(function (t) {
      Object.keys(TOPIC_DEFAULTS).forEach(function (k) {
        if (t[k] === undefined) { t[k] = TOPIC_DEFAULTS[k]; changed = true; }
      });
    });
    if (changed) rSaveJSON('rebirth_topics', topics);
    rSaveJSON('rebirth_rank_schema', { version: RANK_SCHEMA });
  }

  // ─── Revision Engine ──────────────────────────────────────────
  var INTERVALS = [0, 1, 3, 7, 14, 30];

  function computeNextRevision(topic) {
    if (!topic.lastStudied) return null;
    var studied = parseDate(topic.lastStudied);
    // Find which interval we're at based on how many times revised
    var revCount = (topic._revCount || 0);
    var idx = Math.min(revCount, INTERVALS.length - 1);
    var gap = INTERVALS[idx];
    // Shorten if low confidence or poor accuracy
    if (topic.confidence <= 2 && gap > 1) gap = Math.max(1, Math.floor(gap * 0.5));
    var total = topic.questionsCorrect + topic.questionsWrong;
    if (total > 0) {
      var acc = topic.questionsCorrect / total;
      if (acc < 0.5 && gap > 1) gap = Math.max(1, Math.floor(gap * 0.5));
    }
    return addDays(studied, gap);
  }

  function getRevisionQueue() {
    var topics = rJSON('rebirth_topics', []);
    var today = new Date();
    today.setHours(0,0,0,0);
    var due = [];
    topics.forEach(function (t) {
      if (t.status === 'not_started' || t.status === 'complete') return;
      if (!t.lastStudied) return;
      var next = computeNextRevision(t);
      if (!next) return;
      next.setHours(0,0,0,0);
      if (next <= today) {
        due.push({ topic: t, dueDate: next, overdueDays: diffDays(next, today) });
      }
    });
    // Sort: most overdue first, then high weightage
    due.sort(function (a, b) {
      if (b.overdueDays !== a.overdueDays) return b.overdueDays - a.overdueDays;
      return (b.topic.weightage || 0) - (a.topic.weightage || 0);
    });
    return due.slice(0, 10);
  }

  // ─── Dashboard Stats ──────────────────────────────────────────
  function getSubjects() { return rJSON('rebirth_subjects', []); }

  function getDashboardData() {
    var goal = getGoal();
    var topics = rJSON('rebirth_topics', []);
    var blocks = rJSON('rebirth_blocks', []);
    var today = todayStr();

    // Days remaining
    var examDate = parseDate(goal.examDate);
    var now = new Date(); now.setHours(0,0,0,0);
    var daysRemaining = Math.max(0, diffDays(now, examDate));

    // Syllabus completion
    var totalTopics = topics.length;
    var started = topics.filter(function (t) { return t.status && t.status !== 'not_started'; }).length;
    var completionPct = totalTopics > 0 ? Math.round((started / totalTopics) * 100) : 0;

    // Revision due
    var revQueue = getRevisionQueue();
    var revDue = revQueue.length;

    // Today's study hours (from blocks)
    var todayBlocks = blocks.filter(function (b) {
      var bDate = new Date(b.id || b.startTime || 0);
      var bd = bDate.getFullYear() + '-' + String(bDate.getMonth()+1).padStart(2,'0') + '-' + String(bDate.getDate()).padStart(2,'0');
      return bd === today;
    });
    var completedMins = 0;
    todayBlocks.forEach(function (b) { completedMins += (b.focusMinutes || 0); });
    var completedHours = (completedMins / 60).toFixed(1);
    var plannedHours = goal.dailyHours;

    // Status
    var status = 'on_track';
    if (daysRemaining <= 0) status = 'replan';
    else if (revDue > 5 || completionPct < (100 - (daysRemaining / 3))) status = 'attention';
    else if (parseFloat(completedHours) < plannedHours * 0.3 && new Date().getHours() > 16) status = 'attention';

    return {
      daysRemaining: daysRemaining,
      completionPct: completionPct,
      revDue: revDue,
      completedHours: completedHours,
      plannedHours: plannedHours,
      status: status,
      examName: goal.examName,
      revQueue: revQueue
    };
  }

  // ─── Render Dashboard Cards ────────────────────────────────────
  function renderRankDashboard() {
    var container = document.getElementById('rank-dashboard');
    if (!container) return;

    var d = getDashboardData();
    var statusLabels = {
      on_track: { text: 'On track', cls: 'rank-status-ok' },
      attention: { text: 'Needs attention', cls: 'rank-status-warn' },
      replan: { text: 'Replan today', cls: 'rank-status-danger' }
    };
    var st = statusLabels[d.status] || statusLabels.on_track;

    var html = '<div class="rank-cards-row">';
    // Days remaining
    html += '<div class="rank-card"><span class="rank-card-value">' + d.daysRemaining + '</span><span class="rank-card-label">Days left</span></div>';
    // Syllabus %
    html += '<div class="rank-card"><span class="rank-card-value">' + d.completionPct + '%</span><span class="rank-card-label">Syllabus</span></div>';
    // Revision due
    html += '<div class="rank-card' + (d.revDue > 0 ? ' rank-card-alert' : '') + '"><span class="rank-card-value">' + d.revDue + '</span><span class="rank-card-label">Revision due</span></div>';
    html += '</div>';

    // Hours bar
    var pct = d.plannedHours > 0 ? Math.min(100, Math.round((parseFloat(d.completedHours) / d.plannedHours) * 100)) : 0;
    html += '<div class="rank-hours-row">';
    html += '<span class="rank-hours-label">' + d.completedHours + 'h / ' + d.plannedHours + 'h today</span>';
    html += '<div class="rank-hours-bar"><div class="rank-hours-fill" style="width:' + pct + '%"></div></div>';
    html += '</div>';

    // Status
    html += '<div class="rank-status ' + st.cls + '">' + st.text + '</div>';

    // Revision queue preview (top 3)
    if (d.revQueue.length > 0) {
      html += '<div class="rank-rev-preview">';
      html += '<span class="rank-rev-title">Revision due</span>';
      d.revQueue.slice(0, 3).forEach(function (r) {
        var subjs = rJSON('rebirth_subjects', []);
        var subjName = '';
        for (var i = 0; i < subjs.length; i++) { if (subjs[i].id === r.topic.subjectId) { subjName = subjs[i].name; break; } }
        html += '<div class="rank-rev-item">';
        html += '<span class="rank-rev-topic">' + (r.topic.name || 'Untitled') + '</span>';
        html += '<span class="rank-rev-subj">' + subjName + '</span>';
        if (r.overdueDays > 0) html += '<span class="rank-rev-overdue">' + r.overdueDays + 'd overdue</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    container.innerHTML = html;
  }

  // ─── Render Rank Settings ──────────────────────────────────────
  function syncRankSettings() {
    var g = getGoal();
    var el = function(id) { return document.getElementById(id); };
    var exam = el('rank-exam-name');     if (exam) exam.value = g.examName;
    var target = el('rank-target');      if (target) target.value = g.targetRank;
    var date = el('rank-exam-date');     if (date) date.value = g.examDate;
    var hours = el('rank-daily-hours');  if (hours) hours.value = g.dailyHours;
    var day = el('rank-test-day');       if (day) day.value = g.weeklyTestDay;
  }

  function bindSettingsSave() {
    var btn = document.getElementById('btn-save-rank');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var el = function(id) { return document.getElementById(id); };
      var g = getGoal();
      var exam = el('rank-exam-name');    if (exam) g.examName = exam.value.trim() || g.examName;
      var target = el('rank-target');     if (target) g.targetRank = parseInt(target.value) || g.targetRank;
      var date = el('rank-exam-date');    if (date && date.value) g.examDate = date.value;
      var hours = el('rank-daily-hours'); if (hours) g.dailyHours = parseFloat(hours.value) || g.dailyHours;
      var day = el('rank-test-day');      if (day && day.value) g.weeklyTestDay = day.value;
      saveGoal(g);
      btn.textContent = 'Saved!';
      setTimeout(function () { btn.textContent = 'Save'; }, 1500);
      renderRankDashboard();
    });
  }

  // ─── Observer (renders when dashboard/settings become active) ──
  var obs = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      var el = m.target;
      if (!el.classList.contains('screen')) return;
      if (el.id === 'screen-dashboard' && el.classList.contains('active')) {
        renderRankDashboard();
      }
      if (el.id === 'screen-settings' && el.classList.contains('active')) {
        syncRankSettings();
      }
    });
  });

  // ─── Init ──────────────────────────────────────────────────────
  function init() {
    try {
      migrateTopics();
      bindSettingsSave();
      document.querySelectorAll('.screen').forEach(function (s) {
        obs.observe(s, { attributes: true, attributeFilter: ['class'] });
      });
      // Initial render if dashboard is active
      var dash = document.getElementById('screen-dashboard');
      if (dash && dash.classList.contains('active')) renderRankDashboard();
      var settings = document.getElementById('screen-settings');
      if (settings && settings.classList.contains('active')) syncRankSettings();
    } catch (err) {
      console.error('[Rank] Init error:', err);
    }
  }

  // ─── CSS ───────────────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = [
    '.rank-cards-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-sm);margin-bottom:var(--space-sm)}',
    '.rank-card{text-align:center;padding:var(--space-md) var(--space-sm);background:var(--bg-surface);border-radius:var(--radius-lg)}',
    '.rank-card-value{display:block;font-family:var(--font-display);font-size:var(--font-2xl);color:var(--text-primary)}',
    '.rank-card-label{font-size:var(--font-xs);color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em}',
    '.rank-card-alert{border:1px solid rgba(217,154,63,.35)}',
    '.rank-card-alert .rank-card-value{color:var(--accent-breathe)}',
    '.rank-hours-row{display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-sm)}',
    '.rank-hours-label{font-size:var(--font-xs);color:var(--text-secondary);white-space:nowrap;min-width:90px}',
    '.rank-hours-bar{flex:1;height:6px;background:var(--bg-surface);border-radius:3px;overflow:hidden}',
    '.rank-hours-fill{height:100%;background:var(--color-success);border-radius:3px;transition:width .3s}',
    '.rank-status{text-align:center;font-family:var(--font-display);font-size:var(--font-sm);padding:var(--space-xs) var(--space-md);border-radius:var(--radius-full);margin-bottom:var(--space-sm)}',
    '.rank-status-ok{background:rgba(107,143,113,.15);color:var(--color-success)}',
    '.rank-status-warn{background:rgba(217,154,63,.15);color:var(--accent-breathe)}',
    '.rank-status-danger{background:rgba(197,51,71,.15);color:var(--color-danger)}',
    '.rank-rev-preview{margin-top:var(--space-xs)}',
    '.rank-rev-title{font-family:var(--font-display);font-size:var(--font-xs);color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:var(--space-xs)}',
    '.rank-rev-item{display:flex;align-items:center;gap:var(--space-sm);padding:var(--space-xs) 0;border-bottom:1px solid var(--bg-surface)}',
    '.rank-rev-item:last-child{border:none}',
    '.rank-rev-topic{flex:1;font-size:var(--font-sm);color:var(--text-primary)}',
    '.rank-rev-subj{font-size:var(--font-xs);color:var(--text-tertiary)}',
    '.rank-rev-overdue{font-size:var(--font-xs);color:var(--accent-breathe)}',
    '.rank-settings-row{display:flex;flex-direction:column;gap:var(--space-xs);margin-bottom:var(--space-sm)}',
    '.rank-settings-row label{font-size:var(--font-sm);color:var(--text-secondary)}',
    '.rank-settings-row input,.rank-settings-row select{background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);padding:var(--space-sm) var(--space-md);border-radius:var(--radius-md);font-size:var(--font-base);font-family:inherit;touch-action:manipulation}',
    '.rank-settings-row input:focus,.rank-settings-row select:focus{outline:none;border-color:var(--accent-primary)}'
  ].join('\n');
  document.head.appendChild(css);

  // ─── Boot ──────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
