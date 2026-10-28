// ═══════════════════════════════════════════════════════════════════
// mock.js — Mock Tests, Mistake Notebook, Question Practice (M4)
// Sub-screens accessible from Study tab.
// Writes: rebirth_mocks, rebirth_mistakes
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function rJSON(k, d) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } }
  function rSave(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function el(id) { return document.getElementById(id); }
  function uid() { return 'm_' + Date.now() + '_' + Math.floor(Math.random()*1000); }

  // ─── Data ──────────────────────────────────────────────────────
  function getMocks() { return rJSON('rebirth_mocks', []); }
  function saveMock(m) { var all = getMocks(); all.push(m); rSave('rebirth_mocks', all); }
  function getMistakes() { return rJSON('rebirth_mistakes', []); }
  function saveMistake(m) { var all = getMistakes(); all.push(m); rSave('rebirth_mistakes', all); }
  function updateMistake(id, updates) {
    var all = getMistakes();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) { Object.keys(updates).forEach(function (k) { all[i][k] = updates[k]; }); break; }
    }
    rSave('rebirth_mistakes', all);
  }

  // ─── Question Practice: update topic stats ─────────────────────
  function updateTopicQuestions(topicId, correct, wrong, skipped) {
    if (!topicId) return;
    var topics = rJSON('rebirth_topics', []);
    for (var i = 0; i < topics.length; i++) {
      if (topics[i].id === topicId) {
        topics[i].questionsCorrect = (topics[i].questionsCorrect || 0) + correct;
        topics[i].questionsWrong = (topics[i].questionsWrong || 0) + wrong;
        if (topics[i]._skipped === undefined) topics[i]._skipped = 0;
        topics[i]._skipped += skipped;
        rSave('rebirth_topics', topics);
        break;
      }
    }
  }

  // ─── Inject Study Sub-Screens Nav ──────────────────────────────
  function injectStudyNav() {
    var studyScreen = el('screen-study');
    if (!studyScreen || el('study-tools-nav')) return;

    var nav = document.createElement('div');
    nav.id = 'study-tools-nav';
    nav.className = 'glass-card';
    nav.style.cssText = 'margin-top:var(--space-md);padding:var(--space-sm)';
    nav.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-xs)">' +
        '<button class="mk-nav-btn" data-mk-screen="mock">📊<br><span style="font-size:var(--font-xs)">Mock Test</span></button>' +
        '<button class="mk-nav-btn" data-mk-screen="mistakes">📝<br><span style="font-size:var(--font-xs)">Mistakes</span></button>' +
        '<button class="mk-nav-btn" data-mk-screen="qpractice">✏️<br><span style="font-size:var(--font-xs)">Q Practice</span></button>' +
      '</div>';

    var grid = el('study-subjects-grid');
    if (grid) grid.parentElement.insertBefore(nav, grid.nextSibling);

    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-mk-screen]');
      if (!btn) return;
      showSubScreen(btn.getAttribute('data-mk-screen'));
    });
  }

  // ─── Sub-Screen Overlay ────────────────────────────────────────
  var activeOverlay = null;

  function showSubScreen(type) {
    closeSubScreen();
    var overlay = document.createElement('div');
    overlay.id = 'mk-overlay';
    overlay.className = 'mk-overlay';

    var html = '<div class="mk-sheet">';
    html += '<div class="mk-header"><button class="mk-close" id="mk-close-btn">&larr;</button><h2 class="mk-title">';

    if (type === 'mock') {
      html += 'Mock Test</h2></div>';
      html += renderMockForm();
      html += renderMockHistory();
    } else if (type === 'mistakes') {
      html += 'Mistake Notebook</h2></div>';
      html += renderMistakeForm();
      html += renderMistakeList();
    } else if (type === 'qpractice') {
      html += 'Question Practice</h2></div>';
      html += renderQPractice();
    }

    html += '</div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    // Close button
    el('mk-close-btn').addEventListener('click', closeSubScreen);
    // Bind forms
    if (type === 'mock') bindMockForm();
    if (type === 'mistakes') bindMistakeForm();
    if (type === 'qpractice') bindQPractice();
  }

  function closeSubScreen() {
    if (activeOverlay) { activeOverlay.remove(); activeOverlay = null; }
  }

  // ─── Mock Test Form ────────────────────────────────────────────
  function renderMockForm() {
    var subjects = rJSON('rebirth_subjects', []);
    var subjFields = '';
    subjects.forEach(function (s) {
      subjFields += '<div class="rank-settings-row" style="display:flex;gap:var(--space-xs);align-items:center">' +
        '<label style="min-width:50px">' + s.name + '</label>' +
        '<input type="number" class="mk-subj-score" data-subj="' + s.id + '" placeholder="Score" min="0" style="flex:1;padding:var(--space-xs);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-sm)">' +
        '<input type="number" class="mk-subj-total" data-subj="' + s.id + '" placeholder="Total" min="0" style="flex:1;padding:var(--space-xs);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-sm)">' +
        '</div>';
    });

    return '<div class="mk-form" id="mock-form">' +
      '<div class="rank-settings-row"><label>Date</label><input type="date" id="mk-date" value="' + todayStr() + '" style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)"></div>' +
      '<div style="display:flex;gap:var(--space-sm)">' +
        '<div class="rank-settings-row" style="flex:1"><label>Score</label><input type="number" id="mk-score" min="0" style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)"></div>' +
        '<div class="rank-settings-row" style="flex:1"><label>Total Marks</label><input type="number" id="mk-total" min="1" style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)"></div>' +
      '</div>' +
      '<div class="rank-settings-row"><label>Time Spent (min)</label><input type="number" id="mk-time" min="0" style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)"></div>' +
      '<details style="margin-top:var(--space-sm)"><summary style="color:var(--text-secondary);cursor:pointer;font-size:var(--font-sm)">Subject-wise scores</summary>' + subjFields + '</details>' +
      '<details style="margin-top:var(--space-sm)"><summary style="color:var(--text-secondary);cursor:pointer;font-size:var(--font-sm)">Error Analysis</summary>' +
        '<div class="rank-settings-row"><label>Careless</label><input type="number" id="mk-err-careless" min="0" value="0" style="width:80px;padding:var(--space-xs);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-sm)"></div>' +
        '<div class="rank-settings-row"><label>Concept</label><input type="number" id="mk-err-concept" min="0" value="0" style="width:80px;padding:var(--space-xs);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-sm)"></div>' +
        '<div class="rank-settings-row"><label>Time Pressure</label><input type="number" id="mk-err-time" min="0" value="0" style="width:80px;padding:var(--space-xs);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-sm)"></div>' +
        '<div class="rank-settings-row"><label>Strategy</label><input type="number" id="mk-err-strategy" min="0" value="0" style="width:80px;padding:var(--space-xs);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-sm)"></div>' +
      '</details>' +
      '<div class="rank-settings-row" style="margin-top:var(--space-sm)"><label>Corrective Action</label><input type="text" id="mk-corrective" maxlength="200" placeholder="What to change next time..." style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)"></div>' +
      '<button id="btn-save-mock" class="btn-primary" style="width:100%;margin-top:var(--space-md);touch-action:manipulation">Save Mock</button>' +
    '</div>';
  }

  function renderMockHistory() {
    var mocks = getMocks();
    if (mocks.length === 0) return '<p style="color:var(--text-tertiary);text-align:center;margin-top:var(--space-md);font-size:var(--font-sm)">No mocks logged yet.</p>';

    var html = '<div style="margin-top:var(--space-lg)">';
    html += '<h3 style="font-size:var(--font-sm);color:var(--text-tertiary);margin-bottom:var(--space-sm)">History</h3>';

    // Simple bar chart of accuracy
    var maxW = 100;
    mocks.slice(-10).reverse().forEach(function (m) {
      var acc = m.accuracy || 0;
      var color = acc >= 60 ? 'var(--color-success)' : (acc >= 40 ? 'var(--accent-breathe)' : 'var(--color-danger)');
      html += '<div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:6px">';
      html += '<span style="font-size:var(--font-xs);color:var(--text-tertiary);min-width:60px">' + m.date + '</span>';
      html += '<div style="flex:1;height:8px;background:var(--bg-surface);border-radius:4px;overflow:hidden"><div style="width:' + Math.min(acc, 100) + '%;height:100%;background:' + color + ';border-radius:4px"></div></div>';
      html += '<span style="font-size:var(--font-xs);color:var(--text-secondary);min-width:35px;text-align:right">' + acc + '%</span>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function bindMockForm() {
    var btn = el('btn-save-mock');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var score = parseInt(el('mk-score').value) || 0;
      var total = parseInt(el('mk-total').value) || 0;
      if (total <= 0) { btn.textContent = 'Enter total marks'; setTimeout(function(){ btn.textContent = 'Save Mock'; }, 1500); return; }

      // Collect subject scores
      var subjScores = [];
      document.querySelectorAll('.mk-subj-score').forEach(function (inp) {
        var sid = inp.getAttribute('data-subj');
        var stotal = inp.parentElement.querySelector('.mk-subj-total');
        var ss = parseInt(inp.value) || 0;
        var st = stotal ? parseInt(stotal.value) || 0 : 0;
        if (ss > 0 || st > 0) subjScores.push({ subjectId: sid, score: ss, total: st });
      });

      var mock = {
        id: uid(),
        date: el('mk-date').value || todayStr(),
        score: score, totalMarks: total,
        accuracy: Math.round((score / total) * 100),
        timeSpent: parseInt(el('mk-time').value) || 0,
        subjectScores: subjScores,
        carelessErrors: parseInt(el('mk-err-careless').value) || 0,
        conceptErrors: parseInt(el('mk-err-concept').value) || 0,
        timePressureErrors: parseInt(el('mk-err-time').value) || 0,
        strategyErrors: parseInt(el('mk-err-strategy').value) || 0,
        correctiveAction: el('mk-corrective').value.trim()
      };
      saveMock(mock);
      btn.textContent = 'Saved!';
      setTimeout(function () { showSubScreen('mock'); }, 800);
    });
  }

  // ─── Mistake Notebook ──────────────────────────────────────────
  function renderMistakeForm() {
    var topics = rJSON('rebirth_topics', []);
    var topicOpts = '<option value="">— select topic —</option>';
    topics.forEach(function (t) { topicOpts += '<option value="' + t.id + '">' + (t.name || 'Untitled') + '</option>'; });

    return '<div class="mk-form" id="mistake-form">' +
      '<div class="rank-settings-row"><label>Topic</label><select id="mis-topic" style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)">' + topicOpts + '</select></div>' +
      '<div class="rank-settings-row"><label>Error Type</label><select id="mis-type" style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)"><option value="careless">Careless</option><option value="concept">Concept Gap</option><option value="time">Time Pressure</option><option value="strategy">Strategy</option><option value="reading">Misread Question</option></select></div>' +
      '<div class="rank-settings-row"><label>Lesson Learned</label><input type="text" id="mis-lesson" maxlength="200" placeholder="What to remember..." style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)"></div>' +
      '<div class="rank-settings-row"><label>Corrective Action</label><input type="text" id="mis-action" maxlength="200" placeholder="What to do differently..." style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)"></div>' +
      '<label style="display:flex;align-items:center;gap:var(--space-sm);margin-top:var(--space-sm);font-size:var(--font-sm);color:var(--text-secondary)"><input type="checkbox" id="mis-redo" checked> Redo before next mock</label>' +
      '<button id="btn-save-mistake" class="btn-primary" style="width:100%;margin-top:var(--space-md);touch-action:manipulation">Add Mistake</button>' +
    '</div>';
  }

  function renderMistakeList() {
    var mistakes = getMistakes();
    if (mistakes.length === 0) return '<p style="color:var(--text-tertiary);text-align:center;margin-top:var(--space-md);font-size:var(--font-sm)">No mistakes logged yet.</p>';

    var html = '<div style="margin-top:var(--space-lg)">';
    html += '<h3 style="font-size:var(--font-sm);color:var(--text-tertiary);margin-bottom:var(--space-sm)">Mistakes (' + mistakes.length + ')</h3>';

    mistakes.slice(-20).reverse().forEach(function (m) {
      var topics = rJSON('rebirth_topics', []);
      var tName = '';
      for (var i = 0; i < topics.length; i++) { if (topics[i].id === m.topicId) { tName = topics[i].name; break; } }

      var resolved = m.resolved ? ' style="opacity:0.5;text-decoration:line-through"' : '';
      html += '<div class="dp-item"' + resolved + '>';
      html += '<div class="dp-left"><div class="dp-info">';
      html += '<span class="dp-topic">' + (tName || 'Unknown') + ' — ' + m.errorType + '</span>';
      html += '<span class="dp-subj">' + m.lesson + '</span>';
      if (m.correctiveAction) html += '<span class="dp-reason">' + m.correctiveAction + '</span>';
      html += '</div></div>';
      if (!m.resolved) {
        html += '<button class="dp-btn dp-done-btn mk-resolve-btn" data-mis-id="' + m.id + '">Done</button>';
      }
      if (m.redoBeforeNextMock && !m.resolved) {
        html += '<span style="font-size:10px;color:var(--accent-breathe);margin-left:4px">REDO</span>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function bindMistakeForm() {
    var btn = el('btn-save-mistake');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var topicId = el('mis-topic').value;
      var lesson = el('mis-lesson').value.trim();
      if (!lesson) { btn.textContent = 'Enter a lesson'; setTimeout(function(){ btn.textContent = 'Add Mistake'; }, 1500); return; }

      saveMistake({
        id: uid(), date: todayStr(), topicId: topicId,
        errorType: el('mis-type').value,
        lesson: lesson,
        correctiveAction: el('mis-action').value.trim(),
        redoBeforeNextMock: el('mis-redo').checked,
        resolved: false
      });
      btn.textContent = 'Added!';
      setTimeout(function () { showSubScreen('mistakes'); }, 800);
    });

    // Delegate resolve clicks
    var overlay = el('mk-overlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        var resolveBtn = e.target.closest('.mk-resolve-btn');
        if (!resolveBtn) return;
        updateMistake(resolveBtn.getAttribute('data-mis-id'), { resolved: true });
        showSubScreen('mistakes');
      });
    }
  }

  // ─── Question Practice ─────────────────────────────────────────
  function renderQPractice() {
    var topics = rJSON('rebirth_topics', []);
    var subjects = rJSON('rebirth_subjects', []);

    var html = '<div class="mk-form" id="qpractice-form">';
    html += '<div class="rank-settings-row"><label>Subject</label><select id="qp-subject" style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)"><option value="">— select —</option>';
    subjects.forEach(function (s) { html += '<option value="' + s.id + '">' + s.name + '</option>'; });
    html += '</select></div>';
    html += '<select id="qp-topic" style="width:100%;padding:var(--space-sm);margin-top:var(--space-xs);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md);display:none"><option value="">— topic —</option></select>';
    html += '<div id="qp-stats" style="margin-top:var(--space-md)"></div>';
    html += '<div style="display:flex;gap:var(--space-sm);margin-top:var(--space-md)">';
    html += '<div class="rank-settings-row" style="flex:1"><label>Correct</label><input type="number" id="qp-correct" min="0" value="0" style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)"></div>';
    html += '<div class="rank-settings-row" style="flex:1"><label>Wrong</label><input type="number" id="qp-wrong" min="0" value="0" style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)"></div>';
    html += '<div class="rank-settings-row" style="flex:1"><label>Skipped</label><input type="number" id="qp-skipped" min="0" value="0" style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)"></div>';
    html += '</div>';
    html += '<button id="btn-save-qp" class="btn-primary" style="width:100%;margin-top:var(--space-md);touch-action:manipulation">Save</button>';

    // Redo-wrong queue
    var wrongTopics = topics.filter(function (t) { return (t.questionsWrong || 0) > 0; });
    if (wrongTopics.length > 0) {
      html += '<div style="margin-top:var(--space-lg)"><h3 style="font-size:var(--font-sm);color:var(--text-tertiary);margin-bottom:var(--space-sm)">Redo Wrong Queue</h3>';
      wrongTopics.sort(function (a, b) { return (b.questionsWrong || 0) - (a.questionsWrong || 0); });
      wrongTopics.slice(0, 10).forEach(function (t) {
        var total = (t.questionsCorrect || 0) + (t.questionsWrong || 0);
        var acc = total > 0 ? Math.round((t.questionsCorrect / total) * 100) : 0;
        html += '<div class="dp-item"><div class="dp-left"><div class="dp-info">';
        html += '<span class="dp-topic">' + (t.name || 'Untitled') + '</span>';
        html += '<span class="dp-subj">' + t.questionsWrong + ' wrong · ' + acc + '% accuracy</span>';
        html += '</div></div></div>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function bindQPractice() {
    var subjSel = el('qp-subject');
    var topicSel = el('qp-topic');
    var statsDiv = el('qp-stats');

    if (subjSel) {
      subjSel.addEventListener('change', function () {
        var sid = subjSel.value;
        if (!sid) { topicSel.style.display = 'none'; return; }
        var topics = rJSON('rebirth_topics', []).filter(function (t) { return t.subjectId === sid; });
        var opts = '<option value="">— topic —</option>';
        topics.forEach(function (t) { opts += '<option value="' + t.id + '">' + (t.name || 'Untitled') + '</option>'; });
        topicSel.innerHTML = opts;
        topicSel.style.display = 'block';
      });
    }

    if (topicSel) {
      topicSel.addEventListener('change', function () {
        if (!topicSel.value || !statsDiv) return;
        var t = null;
        var topics = rJSON('rebirth_topics', []);
        for (var i = 0; i < topics.length; i++) { if (topics[i].id === topicSel.value) { t = topics[i]; break; } }
        if (!t) return;
        var total = (t.questionsCorrect || 0) + (t.questionsWrong || 0) + (t._skipped || 0);
        var acc = total > 0 ? Math.round(((t.questionsCorrect || 0) / total) * 100) : 0;
        statsDiv.innerHTML = '<div class="glass-card" style="padding:var(--space-sm);text-align:center">' +
          '<span style="color:var(--color-success)">' + (t.questionsCorrect || 0) + ' correct</span> · ' +
          '<span style="color:var(--color-danger)">' + (t.questionsWrong || 0) + ' wrong</span> · ' +
          '<span style="color:var(--text-tertiary)">' + (t._skipped || 0) + ' skipped</span><br>' +
          '<span style="font-size:var(--font-lg);color:var(--text-primary)">' + acc + '% accuracy</span>' +
          '</div>';
      });
    }

    var btn = el('btn-save-qp');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var topicId = topicSel ? topicSel.value : '';
      if (!topicId) { btn.textContent = 'Select a topic'; setTimeout(function(){ btn.textContent = 'Save'; }, 1500); return; }
      var c = parseInt(el('qp-correct').value) || 0;
      var w = parseInt(el('qp-wrong').value) || 0;
      var s = parseInt(el('qp-skipped').value) || 0;
      if (c + w + s === 0) { btn.textContent = 'Enter questions'; setTimeout(function(){ btn.textContent = 'Save'; }, 1500); return; }
      updateTopicQuestions(topicId, c, w, s);
      btn.textContent = 'Saved!';
      setTimeout(function () { showSubScreen('qpractice'); }, 800);
    });
  }

  // ─── CSS ───────────────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = [
    '.mk-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:5000;background:var(--bg-base);overflow-y:auto;-webkit-overflow-scrolling:touch}',
    '.mk-sheet{max-width:480px;margin:0 auto;padding:var(--space-md) var(--space-md) 80px}',
    '.mk-header{display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-lg)}',
    '.mk-close{background:none;border:none;color:var(--text-primary);font-size:24px;cursor:pointer;padding:var(--space-xs);touch-action:manipulation}',
    '.mk-title{font-family:var(--font-display);font-size:var(--font-xl);color:var(--text-primary);margin:0}',
    '.mk-nav-btn{background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md);padding:var(--space-md) var(--space-sm);font-size:20px;cursor:pointer;touch-action:manipulation;text-align:center;line-height:1.4}',
    '.mk-nav-btn:active{background:var(--bg-elevated)}',
    '.mk-form{background:var(--bg-surface);border-radius:var(--radius-lg);padding:var(--space-md)}'
  ].join('\n');
  document.head.appendChild(css);

  // ─── Observer ──────────────────────────────────────────────────
  var obs = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      var s = m.target;
      if (!s.classList.contains('screen') || !s.classList.contains('active')) return;
      if (s.id === 'screen-study') injectStudyNav();
      // Close sub-screen when leaving study
      if (s.id !== 'screen-study' && activeOverlay) closeSubScreen();
    });
  });

  function init() {
    try {
      document.querySelectorAll('.screen').forEach(function (s) {
        obs.observe(s, { attributes: true, attributeFilter: ['class'] });
      });
      var study = el('screen-study');
      if (study && study.classList.contains('active')) injectStudyNav();
    } catch (err) { console.error('[Mock] Init error:', err); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
