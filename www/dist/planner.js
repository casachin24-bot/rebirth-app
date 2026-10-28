// ═══════════════════════════════════════════════════════════════════
// planner.js — Daily Rank Plan + Enhanced Focus (M3)
// Reads: rebirth_rank_goal, rebirth_topics, rebirth_blocks
// Writes: rebirth_daily_plan, rebirth_focus_log
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ─── Helpers ───────────────────────────────────────────────────
  function rGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function rJSON(k, d) { var r = rGet(k); if (!r) return d; try { return JSON.parse(r); } catch (e) { return d; } }
  function rSave(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function el(id) { return document.getElementById(id); }

  // ─── Block types ───────────────────────────────────────────────
  var BLOCK_TYPES = [
    { id: 'deep_study',    label: 'Deep Study',         icon: '📖', defaultMins: 90 },
    { id: 'revision',      label: 'Revision',           icon: '🔄', defaultMins: 45 },
    { id: 'question',      label: 'Question Practice',  icon: '✏️', defaultMins: 60 },
    { id: 'mock_analysis', label: 'Mock Analysis',      icon: '📊', defaultMins: 45 },
    { id: 'recovery',      label: 'Recovery',           icon: '🌿', defaultMins: 30 }
  ];

  // ─── Daily Plan ────────────────────────────────────────────────
  function getPlan() {
    var plan = rJSON('rebirth_daily_plan', null);
    if (plan && plan.date === todayStr()) return plan;
    return null;
  }

  function savePlan(plan) { rSave('rebirth_daily_plan', plan); }

  function generatePlan() {
    var goal = rJSON('rebirth_rank_goal', { dailyHours: 8 });
    var topics = rJSON('rebirth_topics', []);
    var today = new Date(); today.setHours(0,0,0,0);
    var availMins = (goal.dailyHours || 8) * 60;

    // Score topics: overdue revision, weak+high-weight, not started
    var scored = [];
    topics.forEach(function (t) {
      var score = 0;
      if (t.status === 'complete') return;
      // Overdue revision
      if (t.nextRevision) {
        var nr = new Date(t.nextRevision); nr.setHours(0,0,0,0);
        if (nr <= today) score += 40 + Math.min(30, Math.round((today - nr) / 86400000) * 5);
      }
      // Weak status
      if (t.status === 'weak') score += 25;
      if (t.status === 'revision_due') score += 20;
      if (t.status === 'not_started' || !t.status) score += 10;
      // High weightage
      score += (t.weightage || 0) * 0.3;
      // Low confidence
      if (t.confidence !== undefined && t.confidence <= 2) score += 15;
      // Poor accuracy
      var total = (t.questionsCorrect || 0) + (t.questionsWrong || 0);
      if (total > 0 && (t.questionsCorrect / total) < 0.5) score += 10;
      if (score > 0) scored.push({ topic: t, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; });

    // Build max 3 priority items
    var items = [];
    var usedMins = 0;
    var priorities = scored.slice(0, 3);

    priorities.forEach(function (p, i) {
      var t = p.topic;
      var isOverdue = t.nextRevision && new Date(t.nextRevision) <= today;
      var blockType = isOverdue ? 'revision' : (t.status === 'weak' ? 'question' : 'deep_study');
      var bt = BLOCK_TYPES.find(function (b) { return b.id === blockType; }) || BLOCK_TYPES[0];
      var mins = Math.min(bt.defaultMins, Math.floor((availMins - usedMins) / (3 - i)));
      if (mins < 15) mins = 15;
      usedMins += mins;

      // Find subject name
      var subjs = rJSON('rebirth_subjects', []);
      var subjName = '';
      for (var j = 0; j < subjs.length; j++) { if (subjs[j].id === t.subjectId) { subjName = subjs[j].name; break; } }

      items.push({
        id: 'plan_' + Date.now() + '_' + i,
        topicId: t.id, topicName: t.name || 'Untitled', subjectName: subjName,
        blockType: blockType, minutes: mins, status: 'pending',
        reason: isOverdue ? 'Revision overdue' : (t.status === 'weak' ? 'Weak topic' : 'High priority')
      });
    });

    // Add recovery if there's leftover time
    if (usedMins < availMins && items.length > 0) {
      var leftover = Math.min(30, availMins - usedMins);
      if (leftover >= 15) {
        items.push({
          id: 'plan_recovery_' + Date.now(),
          topicId: null, topicName: 'Recovery', subjectName: '',
          blockType: 'recovery', minutes: leftover, status: 'pending',
          reason: 'Rest and recharge'
        });
      }
    }

    var plan = { date: todayStr(), items: items, generatedAt: new Date().toISOString() };
    savePlan(plan);
    return plan;
  }

  function updatePlanItem(itemId, newStatus) {
    var plan = getPlan();
    if (!plan) return;
    for (var i = 0; i < plan.items.length; i++) {
      if (plan.items[i].id === itemId) {
        plan.items[i].status = newStatus; // done, partial, rescheduled
        plan.items[i].completedAt = new Date().toISOString();
        break;
      }
    }
    savePlan(plan);
  }

  // ─── Render Daily Plan on Dashboard ────────────────────────────
  function renderDailyPlan() {
    var container = el('daily-plan-container');
    if (!container) return;

    var plan = getPlan();
    var hasItems = plan && plan.items.length > 0;

    var html = '';

    // Plan items
    if (hasItems) {
      plan.items.forEach(function (item) {
        var bt = BLOCK_TYPES.find(function (b) { return b.id === item.blockType; }) || BLOCK_TYPES[0];
        var statusCls = item.status === 'done' ? 'dp-done' : (item.status === 'partial' ? 'dp-partial' : (item.status === 'rescheduled' ? 'dp-resched' : ''));
        html += '<div class="dp-item ' + statusCls + '" data-plan-id="' + item.id + '">';
        html += '<div class="dp-left">';
        html += '<span class="dp-icon">' + bt.icon + '</span>';
        html += '<div class="dp-info"><span class="dp-topic">' + item.topicName + '</span>';
        if (item.subjectName) html += '<span class="dp-subj">' + item.subjectName + ' · ' + item.minutes + 'min</span>';
        else html += '<span class="dp-subj">' + item.minutes + 'min</span>';
        html += '<span class="dp-reason">' + item.reason + '</span></div></div>';
        if (item.status === 'pending') {
          html += '<div class="dp-actions">';
          html += '<button class="dp-btn dp-done-btn" data-plan-action="done" data-plan-id="' + item.id + '">Done</button>';
          html += '<button class="dp-btn dp-partial-btn" data-plan-action="partial" data-plan-id="' + item.id + '">Partial</button>';
          html += '<button class="dp-btn dp-resched-btn" data-plan-action="rescheduled" data-plan-id="' + item.id + '">Later</button>';
          html += '</div>';
        } else {
          html += '<span class="dp-status-badge">' + item.status + '</span>';
        }
        html += '</div>';
      });
    }

    // Bottom buttons: always show Add Task, show Generate when no items
    html += '<div class="dp-btns-row">';
    html += '<button class="dp-gen-btn dp-add-btn" data-action="show-add">+ Add Task</button>';
    if (!hasItems) {
      html += '<button class="dp-gen-btn" data-action="generate">Auto-Generate</button>';
    }
    html += '</div>';

    container.innerHTML = html;
  }

  // ─── Add Task Form (inline) ────────────────────────────────────
  function showAddForm(container) {
    // Build block type options
    var typeOpts = '';
    BLOCK_TYPES.forEach(function (bt) {
      typeOpts += '<option value="' + bt.id + '">' + bt.icon + ' ' + bt.label + '</option>';
    });

    container.innerHTML =
      '<div class="dp-add-form">' +
        '<input type="text" id="dp-add-name" placeholder="Task name..." maxlength="100" class="dp-add-input">' +
        '<div class="dp-add-row">' +
          '<select id="dp-add-type" class="dp-add-select">' + typeOpts + '</select>' +
          '<input type="number" id="dp-add-mins" value="30" min="5" max="480" class="dp-add-mins" placeholder="min">' +
        '</div>' +
        '<div class="dp-add-row">' +
          '<button class="dp-gen-btn" data-action="save-add">Add</button>' +
          '<button class="dp-btn" data-action="cancel-add">Cancel</button>' +
        '</div>' +
      '</div>';
  }

  function addManualTask(name, blockType, minutes) {
    var plan = getPlan();
    if (!plan) {
      plan = { date: todayStr(), items: [], generatedAt: new Date().toISOString() };
    }
    var bt = BLOCK_TYPES.find(function (b) { return b.id === blockType; }) || BLOCK_TYPES[0];
    plan.items.push({
      id: 'manual_' + Date.now(),
      topicId: null,
      topicName: name,
      subjectName: '',
      blockType: blockType,
      minutes: minutes,
      status: 'pending',
      reason: bt.label
    });
    savePlan(plan);
  }

  // Single persistent delegated listener (bound once in init)
  function bindPlanContainer() {
    var container = el('daily-plan-container');
    if (!container || container._planBound) return;
    container._planBound = true;
    container.addEventListener('click', function (e) {
      // Show add-task form
      var addBtn = e.target.closest('[data-action="show-add"]');
      if (addBtn) { showAddForm(container); return; }

      // Save manual task
      var saveBtn = e.target.closest('[data-action="save-add"]');
      if (saveBtn) {
        var nameEl = el('dp-add-name');
        var name = nameEl ? nameEl.value.trim() : '';
        if (!name) { nameEl.style.borderColor = 'var(--color-danger)'; nameEl.focus(); return; }
        var typeEl = el('dp-add-type');
        var minsEl = el('dp-add-mins');
        addManualTask(name, typeEl ? typeEl.value : 'deep_study', parseInt(minsEl ? minsEl.value : '30') || 30);
        renderDailyPlan();
        return;
      }

      // Cancel add form
      var cancelBtn = e.target.closest('[data-action="cancel-add"]');
      if (cancelBtn) { renderDailyPlan(); return; }

      // Auto-generate
      var genBtn = e.target.closest('[data-action="generate"]');
      if (genBtn) {
        var plan = generatePlan();
        if (!plan || plan.items.length === 0) {
          container.innerHTML = '<p style="text-align:center;padding:var(--space-md);color:var(--text-tertiary);font-size:var(--font-sm)">No study topics eligible yet. Use <strong>+ Add Task</strong> to plan manually.</p>' +
            '<div class="dp-btns-row"><button class="dp-gen-btn dp-add-btn" data-action="show-add">+ Add Task</button>' +
            '<button class="dp-gen-btn" data-action="generate">Try Again</button></div>';
        } else {
          renderDailyPlan();
        }
        return;
      }

      // Plan item actions (done/partial/rescheduled)
      var actBtn = e.target.closest('[data-plan-action]');
      if (!actBtn) return;
      var action = actBtn.getAttribute('data-plan-action');
      var id = actBtn.getAttribute('data-plan-id');
      updatePlanItem(id, action);
      renderDailyPlan();
    });
  }

  // ─── Enhanced Focus: inject study fields into Plan + Rate ──────
  function injectPlanStudyFields() {
    var planContent = document.querySelector('#screen-plan .plan-content');
    if (!planContent || el('plan-study-fields')) return;

    var subjects = rJSON('rebirth_subjects', []);
    var optionsHtml = '<option value="">— none —</option>';
    subjects.forEach(function (s) { optionsHtml += '<option value="' + s.id + '">' + s.name + '</option>'; });

    var div = document.createElement('div');
    div.id = 'plan-study-fields';
    div.className = 'glass-card';
    div.style.cssText = 'margin-top:var(--space-md)';
    div.innerHTML =
      '<label class="input-label">Study Subject (optional)</label>' +
      '<select id="plan-subject-select" class="rank-settings-row" style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md);font-size:var(--font-base);touch-action:manipulation">' + optionsHtml + '</select>' +
      '<select id="plan-topic-select" class="rank-settings-row" style="width:100%;padding:var(--space-sm);margin-top:var(--space-xs);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md);font-size:var(--font-base);touch-action:manipulation;display:none"><option value="">— topic —</option></select>' +
      '<input id="plan-intention" type="text" placeholder="One intention for this block..." maxlength="100" style="width:100%;margin-top:var(--space-xs);padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md);font-size:var(--font-base)">';

    // Insert before the Begin Breathing button
    var beginBtn = el('btn-begin-breathing');
    if (beginBtn) beginBtn.parentElement.insertBefore(div, beginBtn);

    // Subject→topic cascade
    var subjSel = el('plan-subject-select');
    var topicSel = el('plan-topic-select');
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
  }

  function injectRateStudyFields() {
    var rateContent = document.querySelector('#screen-rate .rate-content');
    if (!rateContent || el('rate-study-fields')) return;

    var div = document.createElement('div');
    div.id = 'rate-study-fields';
    div.className = 'glass-card';
    div.style.cssText = 'margin-top:var(--space-md);text-align:left';
    div.innerHTML =
      '<div class="rank-settings-row"><label>Active Recall?</label><div style="display:flex;gap:var(--space-sm)"><button class="dp-btn" id="rate-recall-yes" data-recall="yes">Yes</button><button class="dp-btn" id="rate-recall-no" data-recall="no">No</button></div></div>' +
      '<div class="rank-settings-row"><label>Questions Solved</label><input type="number" id="rate-q-solved" min="0" max="999" value="0" style="width:80px;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)"></div>' +
      '<div class="rank-settings-row"><label>Confidence (1-5)</label><input type="range" id="rate-confidence" min="1" max="5" value="3" style="width:100%"><div style="display:flex;justify-content:space-between;font-size:var(--font-xs);color:var(--text-tertiary)"><span>Low</span><span id="rate-conf-val">3</span><span>High</span></div></div>' +
      '<div class="rank-settings-row"><label>Distraction (optional)</label><select id="rate-distraction" style="width:100%;padding:var(--space-sm);background:var(--bg-surface);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md)"><option value="">None</option><option value="phone">Phone/Social</option><option value="people">People</option><option value="fatigue">Fatigue</option><option value="anxiety">Anxiety</option><option value="boredom">Boredom</option><option value="other">Other</option></select></div>';

    var saveBtn = el('btn-save-rating');
    if (saveBtn) rateContent.insertBefore(div, saveBtn);

    // Recall toggle
    div.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-recall]');
      if (!btn) return;
      var yes = el('rate-recall-yes'), no = el('rate-recall-no');
      if (btn.getAttribute('data-recall') === 'yes') {
        yes.classList.add('dp-done'); no.classList.remove('dp-done');
      } else {
        no.classList.add('dp-done'); yes.classList.remove('dp-done');
      }
    });

    // Confidence label
    var confSlider = el('rate-confidence');
    if (confSlider) {
      confSlider.addEventListener('input', function () {
        var v = el('rate-conf-val'); if (v) v.textContent = confSlider.value;
      });
    }
  }

  // ─── Save focus log + update topic ─────────────────────────────
  function saveFocusStudyData() {
    var subjSel = el('plan-subject-select');
    var topicSel = el('plan-topic-select');
    var intentionEl = el('plan-intention');
    var confEl = el('rate-confidence');
    var qSolvedEl = el('rate-q-solved');
    var distractEl = el('rate-distraction');

    var subjectId = subjSel ? subjSel.value : '';
    var topicId = topicSel ? topicSel.value : '';
    if (!subjectId) return; // No study tracking if no subject selected

    var entry = {
      date: todayStr(),
      timestamp: new Date().toISOString(),
      subjectId: subjectId,
      topicId: topicId,
      intention: intentionEl ? intentionEl.value.trim() : '',
      activeRecall: el('rate-recall-yes') && el('rate-recall-yes').classList.contains('dp-done'),
      questionsSolved: qSolvedEl ? parseInt(qSolvedEl.value) || 0 : 0,
      confidence: confEl ? parseInt(confEl.value) || 3 : 3,
      distraction: distractEl ? distractEl.value : ''
    };

    // Save to focus log
    var log = rJSON('rebirth_focus_log', []);
    log.push(entry);
    if (log.length > 500) log = log.slice(-500);
    rSave('rebirth_focus_log', log);

    // Update topic if selected
    if (topicId) {
      var topics = rJSON('rebirth_topics', []);
      for (var i = 0; i < topics.length; i++) {
        if (topics[i].id === topicId) {
          var t = topics[i];
          // Update actual hours (rough estimate from focus block)
          var blocks = rJSON('rebirth_blocks', []);
          var latestBlock = blocks.length > 0 ? blocks[blocks.length - 1] : null;
          var focusMins = latestBlock ? (latestBlock.focusMinutes || 50) : 50;
          t.actualHours = (t.actualHours || 0) + (focusMins / 60);
          t.confidence = entry.confidence;
          t.lastStudied = todayStr();
          // Update status based on confidence
          if (t.confidence >= 4) t.status = 'strong';
          else if (t.confidence <= 2) t.status = 'weak';
          else if (t.status === 'not_started') t.status = 'learning';
          else if (t.status !== 'complete') t.status = 'learning';
          // Compute next revision
          var revCount = t._revCount || 0;
          t._revCount = revCount + 1;
          var intervals = [0, 1, 3, 7, 14, 30];
          var idx = Math.min(t._revCount, intervals.length - 1);
          var gap = intervals[idx];
          if (t.confidence <= 2 && gap > 1) gap = Math.max(1, Math.floor(gap * 0.5));
          var totalQ = (t.questionsCorrect || 0) + (t.questionsWrong || 0);
          if (totalQ > 0 && (t.questionsCorrect / totalQ) < 0.5 && gap > 1) gap = Math.max(1, Math.floor(gap * 0.5));
          var nextRev = new Date();
          nextRev.setDate(nextRev.getDate() + gap);
          t.nextRevision = nextRev.getFullYear() + '-' + String(nextRev.getMonth()+1).padStart(2,'0') + '-' + String(nextRev.getDate()).padStart(2,'0');
          topics[i] = t;
          rSave('rebirth_topics', topics);
          break;
        }
      }
    }

    // Reset fields
    if (subjSel) subjSel.value = '';
    if (topicSel) { topicSel.value = ''; topicSel.style.display = 'none'; }
    if (intentionEl) intentionEl.value = '';
    if (qSolvedEl) qSolvedEl.value = '0';
    if (confEl) confEl.value = '3';
    if (distractEl) distractEl.value = '';
    var yes = el('rate-recall-yes'), no = el('rate-recall-no');
    if (yes) yes.classList.remove('dp-done');
    if (no) no.classList.remove('dp-done');
  }

  // ─── Hook into Save Rating ────────────────────────────────────
  function hookSaveRating() {
    var saveBtn = el('btn-save-rating');
    if (!saveBtn || saveBtn._plannerHooked) return;
    saveBtn._plannerHooked = true;
    saveBtn.addEventListener('click', function () {
      try { saveFocusStudyData(); } catch (err) { console.error('[Planner] Save error:', err); }
    }, true); // capture phase to run before app.js handler
  }

  // ─── CSS ───────────────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = [
    '.dp-item{display:flex;align-items:center;justify-content:space-between;padding:var(--space-sm) 0;border-bottom:1px solid var(--bg-surface)}',
    '.dp-item:last-child{border:none}',
    '.dp-left{display:flex;align-items:center;gap:var(--space-sm);flex:1;min-width:0}',
    '.dp-icon{font-size:20px;flex-shrink:0}',
    '.dp-info{display:flex;flex-direction:column;min-width:0}',
    '.dp-topic{font-size:var(--font-sm);color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.dp-subj{font-size:var(--font-xs);color:var(--text-tertiary)}',
    '.dp-reason{font-size:var(--font-xs);color:var(--accent-breathe)}',
    '.dp-actions{display:flex;gap:4px;flex-shrink:0}',
    '.dp-btn{padding:4px 10px;border:1px solid rgba(255,250,245,.15);background:transparent;color:var(--text-secondary);border-radius:var(--radius-sm);font-size:var(--font-xs);cursor:pointer;touch-action:manipulation}',
    '.dp-done-btn:hover,.dp-btn.dp-done{background:rgba(107,143,113,.2);color:var(--color-success);border-color:var(--color-success)}',
    '.dp-partial-btn:hover{background:rgba(217,154,63,.15);color:var(--accent-breathe)}',
    '.dp-resched-btn:hover{background:rgba(255,250,245,.05)}',
    '.dp-done .dp-topic{text-decoration:line-through;color:var(--text-tertiary)}',
    '.dp-partial .dp-topic{color:var(--accent-breathe)}',
    '.dp-resched .dp-topic{color:var(--text-tertiary);font-style:italic}',
    '.dp-status-badge{font-size:var(--font-xs);color:var(--text-tertiary);text-transform:capitalize;flex-shrink:0}',
    '.dp-gen-btn{width:100%;padding:var(--space-md);background:var(--bg-elevated);border:1px solid rgba(255,250,245,.15);color:var(--text-primary);border-radius:var(--radius-md);font-family:var(--font-display);font-size:var(--font-base);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:rgba(158,27,50,.3)}',
    '.dp-btns-row{display:flex;gap:var(--space-sm);margin-top:var(--space-sm)}',
    '.dp-btns-row .dp-gen-btn{flex:1}',
    '.dp-add-btn{background:var(--bg-surface)!important}',
    '.dp-add-form{display:flex;flex-direction:column;gap:var(--space-sm)}',
    '.dp-add-input{width:100%;padding:var(--space-sm);background:var(--bg-base);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md);font-size:var(--font-base);font-family:inherit}',
    '.dp-add-row{display:flex;gap:var(--space-sm)}',
    '.dp-add-select{flex:1;padding:var(--space-sm);background:var(--bg-base);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md);font-size:var(--font-sm)}',
    '.dp-add-mins{width:70px;padding:var(--space-sm);background:var(--bg-base);border:1px solid rgba(255,250,245,.1);color:var(--text-primary);border-radius:var(--radius-md);font-size:var(--font-sm);text-align:center}'
  ].join('\n');
  document.head.appendChild(css);

  // ─── Observer ──────────────────────────────────────────────────
  var obs = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      var s = m.target;
      if (!s.classList.contains('screen') || !s.classList.contains('active')) return;
      if (s.id === 'screen-dashboard') renderDailyPlan();
      if (s.id === 'screen-plan') injectPlanStudyFields();
      if (s.id === 'screen-rate') { injectRateStudyFields(); hookSaveRating(); }
    });
  });

  function init() {
    try {
      document.querySelectorAll('.screen').forEach(function (s) {
        obs.observe(s, { attributes: true, attributeFilter: ['class'] });
      });
      bindPlanContainer();
      var dash = el('screen-dashboard');
      if (dash && dash.classList.contains('active')) renderDailyPlan();
    } catch (err) { console.error('[Planner] Init error:', err); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
