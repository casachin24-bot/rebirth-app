// ═══════════════════════════════════════════════════════════════════
// polish.js — Gita Context Reflections + Export/Import + UX Polish (M6)
// Extends existing features without modifying gita.js.
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function rJSON(k, d) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } }
  function rSave(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function el(id) { return document.getElementById(id); }

  // ─── Gita-Inspired Context Reflections ─────────────────────────
  // These are practice reflections, not invented scripture.
  var REFLECTIONS = {
    low_mock: [
      'Return to the work in front of you.',
      'One exam does not define you. Correct, adapt, continue.',
      'Consistency is built by returning, not by perfection.'
    ],
    bad_day: [
      'Your next right action matters more than a bad moment.',
      'Even the steadiest minds waver. Return without drama.',
      'A difficult day does not erase what you have built.'
    ],
    overdue_revision: [
      'What is neglected today compounds tomorrow. Begin with one topic.',
      'Small consistent effort defeats sporadic intensity.'
    ],
    high_streak: [
      'Steady practice is its own reward. Stay grounded.',
      'Do not cling to the streak. Focus on today\'s quality.'
    ],
    morning: [
      'Set your mind on the work, not the fruit of the work.',
      'Begin with clarity. One task, full attention.',
      'This day is an offering. Give it your honest effort.'
    ],
    recovery: [
      'Rest is not defeat. Recovery restores capacity.',
      'Even warriors pause between battles.'
    ]
  };

  function getContextReflection() {
    var mocks = rJSON('rebirth_mocks', []);
    var blocks = rJSON('rebirth_blocks', []);
    var topics = rJSON('rebirth_topics', []);

    // Determine context
    var context = 'morning';
    var hour = new Date().getHours();

    // Low mock score?
    if (mocks.length > 0) {
      var last = mocks[mocks.length - 1];
      if (last.accuracy < 40) context = 'low_mock';
    }

    // Many overdue revisions?
    var overdue = 0;
    var today = new Date(); today.setHours(0,0,0,0);
    topics.forEach(function (t) {
      if (t.nextRevision) {
        var nr = new Date(t.nextRevision); nr.setHours(0,0,0,0);
        if (nr <= today) overdue++;
      }
    });
    if (overdue > 5) context = 'overdue_revision';

    // Bad day (last block rated < -2)?
    if (blocks.length > 0) {
      var lastBlock = blocks[blocks.length - 1];
      if (lastBlock.sentiment !== undefined && lastBlock.sentiment < -2) context = 'bad_day';
    }

    // High streak
    var opens = rJSON('rebirth_opens', []);
    if (opens.length > 14) context = 'high_streak';

    // Evening → recovery
    if (hour >= 21) context = 'recovery';

    var pool = REFLECTIONS[context] || REFLECTIONS.morning;
    var reflection = pool[Math.floor(Math.random() * pool.length)];
    return { text: reflection, label: 'Gita-inspired practice reflection' };
  }

  // Show reflection on dashboard
  function renderReflection() {
    var container = el('rank-dashboard');
    if (!container) return;
    if (el('gita-reflection-card')) return;

    var r = getContextReflection();
    var card = document.createElement('div');
    card.id = 'gita-reflection-card';
    card.style.cssText = 'text-align:center;padding:var(--space-md) var(--space-sm);margin-top:var(--space-sm);border-top:1px solid var(--bg-surface)';
    card.innerHTML = '<p style="color:var(--text-secondary);font-style:italic;font-size:var(--font-sm);margin:0">"' + r.text + '"</p>' +
      '<span style="font-size:var(--font-xs);color:var(--text-tertiary)">' + r.label + '</span>';
    container.appendChild(card);
  }

  // ─── Export/Import ─────────────────────────────────────────────
  var EXPORT_KEYS = [
    'rebirth_blocks','rebirth_settings','rebirth_subjects','rebirth_topics',
    'rebirth_study_log','rebirth_study_streak','rebirth_opens','rebirth_foundations',
    'rebirth_your_why','rebirth_ifthen_plan','rebirth_category_budgets',
    'rebirth_freshstart','rebirth_prefocus_count',
    'rebirth_gita_breath_pattern','rebirth_gita_gunas','rebirth_gita_reflections',
    'rebirth_sadhana_log','rebirth_sadhana_streak','rebirth_sadhana_schema',
    'rebirth_sadhana_exam_date','rebirth_sadhana_exam_mode',
    'rebirth_rank_goal','rebirth_rank_schema',
    'rebirth_daily_plan','rebirth_focus_log',
    'rebirth_mocks','rebirth_mistakes',
    'rebirth_brahmacharya','rebirth_brahmacharya_visible',
    'rebirth_error_log'
  ];

  function exportAllData() {
    var data = {};
    EXPORT_KEYS.forEach(function (k) {
      var v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    });
    data._exportDate = new Date().toISOString();
    data._version = window.REBIRTH_VERSION || '3.0.0';

    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'rebirth-backup-' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  function importData(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var data = JSON.parse(e.target.result);
          var imported = 0;
          Object.keys(data).forEach(function (k) {
            if (k.startsWith('rebirth_')) {
              localStorage.setItem(k, data[k]);
              imported++;
            }
          });
          resolve(imported);
        } catch (err) { reject(err); }
      };
      reader.onerror = function () { reject(new Error('Failed to read file')); };
      reader.readAsText(file);
    });
  }

  // ─── Inject Export/Import into Settings ────────────────────────
  function injectExportImport() {
    var exportBtn = el('btn-export-data');
    if (!exportBtn || exportBtn._polishHooked) return;
    exportBtn._polishHooked = true;

    // Replace the basic export with our comprehensive one
    exportBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      if (exportAllData()) {
        exportBtn.textContent = 'Exported!';
        setTimeout(function () { exportBtn.textContent = 'Export Data'; }, 2000);
      }
    }, true);

    // Add import button if not exists
    if (!el('btn-import-data')) {
      var importBtn = document.createElement('button');
      importBtn.id = 'btn-import-data';
      importBtn.className = 'btn-ghost btn-sm';
      importBtn.textContent = 'Import Backup';
      importBtn.style.cssText = 'margin-left:var(--space-sm);touch-action:manipulation';
      exportBtn.parentElement.appendChild(importBtn);

      var fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';
      fileInput.style.display = 'none';
      fileInput.id = 'import-file-input';
      exportBtn.parentElement.appendChild(fileInput);

      importBtn.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        if (!fileInput.files[0]) return;
        importData(fileInput.files[0]).then(function (count) {
          importBtn.textContent = count + ' keys imported!';
          setTimeout(function () { importBtn.textContent = 'Import Backup'; location.reload(); }, 2000);
        }).catch(function (err) {
          importBtn.textContent = 'Error: ' + err.message;
          setTimeout(function () { importBtn.textContent = 'Import Backup'; }, 3000);
        });
      });
    }

    // Add Brahmacharya toggle if not exists
    if (!el('bc-toggle-setting')) {
      var settingsContent = document.querySelector('.settings-content');
      if (!settingsContent) return;
      var diagSection = document.querySelector('.diagnostics-section');
      if (!diagSection) return;

      var toggleDiv = document.createElement('div');
      toggleDiv.id = 'bc-toggle-setting';
      toggleDiv.className = 'settings-group glass-card';
      var isVis = localStorage.getItem('rebirth_brahmacharya_visible') !== 'false';
      toggleDiv.innerHTML = '<h3 class="settings-group-title">Discipline Practice</h3>' +
        '<p class="settings-group-desc">Show the optional Brahmacharya discipline section in Sadhana.</p>' +
        '<label style="display:flex;align-items:center;gap:var(--space-sm);font-size:var(--font-sm);color:var(--text-secondary);cursor:pointer">' +
        '<input type="checkbox" id="bc-visible-toggle" ' + (isVis ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:var(--color-success)"> Show Discipline Practice</label>';
      diagSection.parentElement.insertBefore(toggleDiv, diagSection);

      el('bc-visible-toggle').addEventListener('change', function () {
        localStorage.setItem('rebirth_brahmacharya_visible', this.checked ? 'true' : 'false');
      });
    }
  }

  // ─── Empty States Enhancement ──────────────────────────────────
  function addEmptyStates() {
    // Rank dashboard empty state
    var rankDash = el('rank-dashboard');
    if (rankDash && rankDash.innerHTML.trim() === '') {
      rankDash.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);padding:var(--space-md);font-size:var(--font-sm)">Set your rank goal in Settings to see dashboard cards.</p>';
    }

    // Daily plan empty state
    var planContainer = el('daily-plan-container');
    if (planContainer && planContainer.innerHTML.trim() === '') {
      planContainer.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);padding:var(--space-sm);font-size:var(--font-sm)">Add topics to generate a daily plan.</p>';
    }
  }

  // ─── Version label sync ────────────────────────────────────────
  function syncVersionLabel() {
    var lbl = el('app-version-label');
    if (lbl && window.REBIRTH_VERSION) lbl.textContent = 'v' + window.REBIRTH_VERSION;
  }

  // ─── Observer ──────────────────────────────────────────────────
  var obs = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      var s = m.target;
      if (!s.classList.contains('screen') || !s.classList.contains('active')) return;
      if (s.id === 'screen-dashboard') { renderReflection(); addEmptyStates(); }
      if (s.id === 'screen-settings') { injectExportImport(); syncVersionLabel(); }
    });
  });

  function init() {
    try {
      document.querySelectorAll('.screen').forEach(function (s) {
        obs.observe(s, { attributes: true, attributeFilter: ['class'] });
      });
      var dash = el('screen-dashboard');
      if (dash && dash.classList.contains('active')) { renderReflection(); addEmptyStates(); }
    } catch (err) { console.error('[Polish] Init error:', err); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
