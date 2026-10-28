(function() {
  // DOM Helpers
  function gita$(id) { return document.getElementById(id); }
  function gitaQS(sel) { return document.querySelector(sel); }
  function gitaQSA(sel) { return document.querySelectorAll(sel); }

  // Safe localStorage helpers
  function gitaGetItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function gitaSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error('Gita Module: LocalStorage error', e);
    }
  }

  function gitaGetJSON(key, defaultVal) {
    var val = gitaGetItem(key);
    if (!val) return defaultVal;
    try {
      return JSON.parse(val);
    } catch (e) {
      return defaultVal;
    }
  }

  function gitaSetJSON(key, value) {
    gitaSetItem(key, JSON.stringify(value));
  }

  // Feature 1: Nishkama Karma Reframe
  var reframes = [
    "You showed up. The effort itself is the victory, not the outcome.",
    "Mastery comes from steady practice, not from judging each result.",
    "Let go of the score. The discipline of sitting down is what transforms.",
    "Do your duty without attachment. The work is yours, the fruit is not.",
    "A steady mind sees effort, not just the fleeting success or failure.",
    "True balance is remaining equal in both pleasant and unpleasant outcomes.",
    "Focus on the action, not on the anxiety of the result.",
    "Your right is to the work alone. Keep moving forward.",
    "The disciplined mind is untouched by temporary setbacks.",
    "Release the desire for immediate reward and find peace in the attempt.",
    "Consistency over intensity. Your daily presence is enough.",
    "The work itself purifies. Don't be disturbed by a single low rating."
  ];

  function handleRateScreenActive(rateScreen) {
    // Check if reframe already exists
    if (gitaQS('.gita-reframe')) return;
    
    // Find rating value (assuming there are active rating buttons or input)
    var activeRatingBtn = rateScreen.querySelector('.rating-btn.active');
    var ratingVal = 5; // default high
    if (activeRatingBtn) {
       var text = activeRatingBtn.textContent || activeRatingBtn.innerText;
       var num = parseInt(text, 10);
       if (!isNaN(num)) ratingVal = num;
       else if (activeRatingBtn.dataset.value) ratingVal = parseInt(activeRatingBtn.dataset.value, 10);
    }

    if (ratingVal <= 2) {
      var reframeIdx = Math.floor(Math.random() * reframes.length);
      var reframeText = reframes[reframeIdx];
      var yourWhy = gitaGetItem('rebirth_your_why');

      var reframeDiv = document.createElement('div');
      reframeDiv.className = 'gita-reframe glass-card';
      reframeDiv.innerHTML = '<p class="reframe-text">"' + reframeText + '"</p>';
      
      if (yourWhy) {
        reframeDiv.innerHTML += '<div class="reframe-why-divider"></div><p class="reframe-why-label">Your Why:</p><p class="reframe-why-text">' + yourWhy + '</p>';
      }

      var ratingSection = rateScreen.querySelector('.rating-section') || rateScreen.querySelector('.rating-container');
      if (ratingSection && ratingSection.parentNode) {
        ratingSection.parentNode.insertBefore(reframeDiv, ratingSection.nextSibling);
      } else {
        rateScreen.appendChild(reframeDiv);
      }
    }
  }

  // Feature 2: Three Gunas Tagging
  var selectedGuna = null;

  function injectGunaChips(rateScreen) {
    if (gitaQS('.guna-chips-container')) return;

    var categoryChips = rateScreen.querySelector('.category-chips');
    if (!categoryChips) return;

    var gunaContainer = document.createElement('div');
    gunaContainer.className = 'guna-chips-container';
    gunaContainer.innerHTML = '<p class="guna-label">Mind State</p><div class="guna-chips"></div>';
    
    var chipsDiv = gunaContainer.querySelector('.guna-chips');

    var gunas = [
      { id: 'sattva', label: 'Clear & steady', color: '#6b8f71' },
      { id: 'rajas', label: 'Driven & restless', color: '#d99a3f' },
      { id: 'tamas', label: 'Foggy & avoidant', color: '#9e1b32' }
    ];

    gunas.forEach(function(guna) {
      var chip = document.createElement('button');
      chip.className = 'guna-chip';
      chip.textContent = guna.label;
      chip.dataset.guna = guna.id;
      chip.style.borderColor = guna.color;
      chip.onclick = function(e) {
        e.preventDefault();
        var allChips = chipsDiv.querySelectorAll('.guna-chip');
        for (var i=0; i<allChips.length; i++) {
          allChips[i].classList.remove('active');
          allChips[i].style.backgroundColor = 'transparent';
          allChips[i].style.color = 'var(--text-primary)';
        }
        chip.classList.add('active');
        chip.style.backgroundColor = guna.color;
        chip.style.color = '#fff';
        selectedGuna = guna.id;
        
        // Save to temporary storage for block saving interception
        gitaSetItem('rebirth_gita_pending_guna', selectedGuna);
      };
      chipsDiv.appendChild(chip);
    });

    categoryChips.parentNode.insertBefore(gunaContainer, categoryChips.nextSibling);
  }

  function handleWeeklyScreenActive(weeklyScreen) {
    // Feature 2: Gunas Chart
    if (!gitaQS('.guna-chart-card')) {
      var blocks = gitaGetJSON('rebirth_blocks', []);
      var gunasData = gitaGetJSON('rebirth_gita_gunas', {});
      
      // Calculate for this week (simplified: just take last 7 days of blocks)
      var now = Date.now();
      var oneWeek = 7 * 24 * 60 * 60 * 1000;
      var sattvaCount = 0, rajasCount = 0, tamasCount = 0;

      for (var i=0; i<blocks.length; i++) {
        var b = blocks[i];
        if (now - b.timestamp <= oneWeek) {
          var guna = gunasData[b.timestamp] || b.guna; // check separate storage or block property
          if (guna === 'sattva') sattvaCount++;
          if (guna === 'rajas') rajasCount++;
          if (guna === 'tamas') tamasCount++;
        }
      }

      var total = sattvaCount + rajasCount + tamasCount;
      if (total > 0) {
        var sattvaPct = (sattvaCount / total) * 100;
        var rajasPct = (rajasCount / total) * 100;
        var tamasPct = (tamasCount / total) * 100;

        var chartCard = document.createElement('div');
        chartCard.className = 'guna-chart-card glass-card';
        chartCard.innerHTML = '<p class="guna-chart-title">Mind States This Week</p>' +
          '<div class="guna-chart-bar">' +
          '<div class="guna-segment sattva-bg" style="width:' + sattvaPct + '%"></div>' +
          '<div class="guna-segment rajas-bg" style="width:' + rajasPct + '%"></div>' +
          '<div class="guna-segment tamas-bg" style="width:' + tamasPct + '%"></div>' +
          '</div>' +
          '<div class="guna-chart-legend">' +
          '<span><span class="dot sattva-dot"></span> Sattva (' + sattvaCount + ')</span>' +
          '<span><span class="dot rajas-dot"></span> Rajas (' + rajasCount + ')</span>' +
          '<span><span class="dot tamas-dot"></span> Tamas (' + tamasCount + ')</span>' +
          '</div>';
        
        weeklyScreen.appendChild(chartCard);
      }
    }

    // Feature 4: Steady-Mind Weekly Reflection
    if (!gitaQS('.reflection-card')) {
      var d = new Date();
      // Simple week identifier
      var weekOf = d.getFullYear() + '-W' + Math.ceil((d.getDate() + 6 - d.getDay()) / 7);
      
      var reflections = gitaGetJSON('rebirth_gita_reflections', []);
      var hasReflectedThisWeek = false;
      for (var j=0; j<reflections.length; j++) {
        if (reflections[j].weekOf === weekOf) {
          hasReflectedThisWeek = true;
          break;
        }
      }

      if (!hasReflectedThisWeek) {
        var rCard = document.createElement('div');
        rCard.className = 'reflection-card glass-card';
        rCard.innerHTML = '<h3 class="reflection-title">Steady-Mind Reflection</h3>' +
          '<div class="reflection-q"><label>Were you equally okay with a good day and a hard day this week?</label><input type="text" id="ref-q1" class="input-base"></div>' +
          '<div class="reflection-q"><label>Did you act from intention, or react from impulse?</label><input type="text" id="ref-q2" class="input-base"></div>' +
          '<div class="reflection-q"><label>Could you let go of something you wanted but didn\'t need?</label><input type="text" id="ref-q3" class="input-base"></div>' +
          '<div class="reflection-q"><label>Did you stay steady when things didn\'t go your way?</label><input type="text" id="ref-q4" class="input-base"></div>' +
          '<button id="btn-save-reflection" class="btn-primary" style="margin-top:var(--space-md);">Save Reflection</button>';
        
        weeklyScreen.appendChild(rCard);

        gita$('btn-save-reflection').onclick = function() {
          var ans1 = gita$('ref-q1').value;
          var ans2 = gita$('ref-q2').value;
          var ans3 = gita$('ref-q3').value;
          var ans4 = gita$('ref-q4').value;
          
          reflections.push({
            weekOf: weekOf,
            timestamp: Date.now(),
            answers: [ans1, ans2, ans3, ans4]
          });
          gitaSetJSON('rebirth_gita_reflections', reflections);
          
          rCard.innerHTML = '<p class="reflection-saved">Your reflection has been saved. Rest well.</p>';
        };
      }
    }
  }

  // Intercept block saves to capture guna
  var originalSetItem = localStorage.setItem;
  localStorage.setItem = function(key, value) {
    originalSetItem.apply(this, arguments);
    if (key === 'rebirth_blocks') {
      try {
        var pendingGuna = gitaGetItem('rebirth_gita_pending_guna');
        if (pendingGuna) {
          var blocks = JSON.parse(value);
          if (blocks && blocks.length > 0) {
            var latestBlock = blocks[blocks.length - 1];
            var gunasData = gitaGetJSON('rebirth_gita_gunas', {});
            gunasData[latestBlock.timestamp] = pendingGuna;
            // Use original to avoid infinite loop
            originalSetItem.call(this, 'rebirth_gita_gunas', JSON.stringify(gunasData));
          }
          localStorage.removeItem('rebirth_gita_pending_guna');
          selectedGuna = null;
        }
      } catch (e) {
        console.error('Gita block save intercept error', e);
      }
    }
  };


  // Feature 3: Three Gates Nudge Enrichment
  function enrichNudgeCard() {
    var nudgeCard = gita$('ifthen-nudge-card');
    if (nudgeCard && !nudgeCard.classList.contains('hidden')) {
      if (!nudgeCard.querySelector('.gita-nudge-q')) {
        var q = document.createElement('p');
        q.className = 'gita-nudge-q';
        q.textContent = "Notice what pulled you away — restlessness, frustration, or chasing a quick reward?";
        nudgeCard.insertBefore(q, nudgeCard.firstChild);
      }
    }
  }

  // Feature 5: Box Breathing Pattern
  function injectBreathingSettings(settingsScreen) {
    if (gitaQS('.gita-breathing-settings')) return;

    var container = document.createElement('div');
    container.className = 'settings-group gita-breathing-settings';
    container.innerHTML = '<h3>Breathing Pattern</h3>' +
      '<select id="breathing-pattern-select" class="input-base">' +
      '<option value="478">4-7-8 Calming (Default)</option>' +
      '<option value="box">Box Breath 4-4-4-4 (Equal)</option>' +
      '</select>';

    var groups = settingsScreen.querySelectorAll('.settings-group');
    if (groups.length > 0) {
      groups[groups.length - 1].parentNode.insertBefore(container, groups[groups.length - 1].nextSibling);
    } else {
      settingsScreen.appendChild(container);
    }

    var selectEl = gita$('breathing-pattern-select');
    var currentPattern = gitaGetItem('rebirth_gita_breath_pattern') || '478';
    selectEl.value = currentPattern;

    selectEl.onchange = function() {
      gitaSetItem('rebirth_gita_breath_pattern', selectEl.value);
    };
  }

  function updateBreatheInstructions() {
    var instr = gitaQS('#screen-breathe-free .breathe-instructions');
    if (instr) {
      var currentPattern = gitaGetItem('rebirth_gita_breath_pattern') || '478';
      var patternText = currentPattern === 'box' ? 'Box Breath (4-4-4-4)' : 'Calming (4-7-8)';
      if (!instr.querySelector('.gita-pattern-label')) {
         instr.innerHTML += '<br><span class="gita-pattern-label" style="font-size:0.85em; opacity:0.8;">Active: ' + patternText + '</span>';
      } else {
         instr.querySelector('.gita-pattern-label').textContent = 'Active: ' + patternText;
      }
    }
  }

  // Feature 7: Contextual Verse Engine
  var verses = [
    { text: "The mind that wanders returns stronger when you gently guide it back.", context: 'pre-focus' },
    { text: "Prepare the soil. The seed of focus grows in quiet dedication.", context: 'pre-focus' },
    { text: "Withdraw the senses like a tortoise drawing in its limbs.", context: 'pre-focus' },
    { text: "A steady flame does not flicker in a windless place.", context: 'pre-focus' },
    { text: "Unite intention and action. Begin the work now.", context: 'pre-focus' },

    { text: "A stumble is not a fall. Begin again with today's single step.", context: 'post-failure' },
    { text: "Do not mourn what has passed. The present action is yours alone.", context: 'post-failure' },
    { text: "Failure reveals the attachment. Let go, and rise once more.", context: 'post-failure' },
    { text: "Even the wise waver. True wisdom is returning to the path.", context: 'post-failure' },
    { text: "Equanimity in defeat is a greater victory than success.", context: 'post-failure' },

    { text: "A small start builds the foundation. Consistency is the true yoga.", context: 'low-streak' },
    { text: "Every day is a new birth. Set aside yesterday's inaction.", context: 'low-streak' },
    { text: "Do what you can today. Imperfect action beats perfect hesitation.", context: 'low-streak' },
    { text: "The mountain is climbed step by step. Just take one.", context: 'low-streak' },
    { text: "Momentum is built through quiet, repeated acts of will.", context: 'low-streak' },

    { text: "Dawn brings fresh energy. Dedicate this day's effort.", context: 'morning' },
    { text: "Awake and cast off lethargy. The morning is ripe for action.", context: 'morning' },
    { text: "Begin with a clear mind, free from yesterday's shadows.", context: 'morning' },
    { text: "Greet the sun with discipline and steady purpose.", context: 'morning' },
    { text: "The morning mind is quiet; plant seeds of focus now.", context: 'morning' },

    { text: "Rest your mind. The day's duties are done.", context: 'evening' },
    { text: "Release the day's actions. Find peace in the evening stillness.", context: 'evening' },
    { text: "The sun sets, and so should your striving. Replenish your strength.", context: 'evening' },
    { text: "Reflect without judgment on what was done today.", context: 'evening' },
    { text: "Find sanctuary in the evening. Let go of the world's noise.", context: 'evening' },

    { text: "Do not let pride cloud your vision. The work continues.", context: 'high-productivity' },
    { text: "Success is a pleasant passing breeze. Remain steady in your center.", context: 'high-productivity' },
    { text: "Enjoy the harvest, but remember you are not the doer.", context: 'high-productivity' },
    { text: "Maintain balance. Do not swing high with joy, nor low with sorrow.", context: 'high-productivity' },
    { text: "A productive day is a tool, not a measure of your worth.", context: 'high-productivity' }
  ];

  function getContextVerse() {
    var hour = new Date().getHours();
    var context = 'pre-focus'; // default fallback

    if (hour < 12) {
      context = 'morning';
    } else if (hour >= 18) {
      context = 'evening';
    }

    var streak = parseInt(gitaGetItem('rebirth_study_streak') || '0', 10);
    if (streak < 2) {
      context = 'low-streak';
    }

    var blocks = gitaGetJSON('rebirth_blocks', []);
    if (blocks.length > 0) {
      var lastBlock = blocks[blocks.length - 1];
      if (lastBlock.rating && lastBlock.rating <= 2) {
        context = 'post-failure';
      } else if (lastBlock.rating && lastBlock.rating >= 4) {
        context = 'high-productivity';
      }
    }

    var matchingVerses = verses.filter(function(v) { return v.context === context; });
    if (matchingVerses.length === 0) {
      matchingVerses = verses.filter(function(v) { return v.context === 'pre-focus'; });
    }
    
    var idx = Math.floor(Math.random() * matchingVerses.length);
    return matchingVerses[idx].text;
  }

  function handlePrefocusScreenActive() {
    var counterKey = 'rebirth_prefocus_why_count';
    var count = parseInt(gitaGetItem(counterKey) || '0', 10);
    count++;
    gitaSetItem(counterKey, count.toString());

    var prefocusWhy = gita$('prefocus-why');
    if (prefocusWhy) {
      if (count % 4 === 0) {
        // Show verse
        prefocusWhy.innerHTML = '<em>"' + getContextVerse() + '"</em>';
      } else {
        // Restore why
        var why = gitaGetItem('rebirth_your_why');
        if (why) {
          prefocusWhy.textContent = why;
        }
      }
    }
  }

  // Feature 7b: Journal Study Logs
  function handleJournalScreenActive(journalScreen) {
    setTimeout(function() {
      // Remove any existing study log section
      var existing = gitaQS('.journal-study-section');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

      // Get the current journal date from the date display
      var journalDateEl = gita$('journal-date');
      if (!journalDateEl) return;

      // Parse the displayed date to match log.date (YYYY-MM-DD format)
      var studyLogs = gitaGetJSON('rebirth_study_log', []);
      if (studyLogs.length === 0) return;

      // Try to get date string in YYYY-MM-DD from the displayed journal date
      var displayText = journalDateEl.textContent || '';
      var dateStr = '';
      try {
        var d = new Date(displayText);
        if (!isNaN(d.getTime())) {
          dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }
      } catch (e) {}

      // If we can't parse, use today
      if (!dateStr) {
        var now = new Date();
        dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      }

      var todaysLogs = studyLogs.filter(function(log) {
        return log.date === dateStr;
      });

      if (todaysLogs.length > 0) {
        var section = document.createElement('div');
        section.className = 'journal-study-section glass-card';
        var html = '<h3 class="journal-study-title">Study Activity</h3><div class="journal-study-list">';

        todaysLogs.forEach(function(log) {
          html += '<div class="journal-study-entry">' +
            '<span class="journal-study-subject">' + (log.subjectName || 'Study') + '</span>' +
            (log.topicName ? '<span class="journal-study-topic">' + log.topicName + '</span>' : '') +
            '<span class="journal-study-pages">Page ' + ((log.pageIndex || 0) + 1) + '</span>' +
            '</div>';
        });

        html += '</div>';
        section.innerHTML = html;

        var journalEntries = gita$('journal-entries');
        if (journalEntries) {
          journalEntries.appendChild(section);
        }
      }
    }, 150);
  }

  // Main Observer
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        var el = mutation.target;
        
        // Check screens becoming active
        if (el.classList.contains('screen') && el.classList.contains('active')) {
          if (el.id === 'screen-rate') {
            handleRateScreenActive(el);
            injectGunaChips(el);
          } else if (el.id === 'screen-weekly') {
            handleWeeklyScreenActive(el);
          } else if (el.id === 'screen-settings') {
            injectBreathingSettings(el);
          } else if (el.id === 'screen-breathe-free') {
            updateBreatheInstructions();
          } else if (el.id === 'screen-prefocus') {
            handlePrefocusScreenActive();
          } else if (el.id === 'screen-journal') {
            handleJournalScreenActive(el);
          }
        }

        // Check nudge card
        if (el.id === 'ifthen-nudge-card') {
          enrichNudgeCard();
        }
      }
    });
  });

  // Start observing once DOM is ready
  function init() {
    var screens = document.querySelectorAll('.screen');
    screens.forEach(function(s) {
      observer.observe(s, { attributes: true });
    });
    
    var nudgeCard = document.getElementById('ifthen-nudge-card');
    if (nudgeCard) {
      observer.observe(nudgeCard, { attributes: true });
    }

    // Initialize state if app started on a specific screen
    var activeScreen = document.querySelector('.screen.active');
    if (activeScreen) {
      if (activeScreen.id === 'screen-rate') {
        handleRateScreenActive(activeScreen);
        injectGunaChips(activeScreen);
      } else if (activeScreen.id === 'screen-settings') {
        injectBreathingSettings(activeScreen);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Inject CSS
  var gitaStyle = document.createElement('style');
  gitaStyle.textContent = `
    /* Gita module styles */
    .gita-reframe {
      margin-top: var(--space-md);
      padding: var(--space-md);
      text-align: center;
      animation: fadeIn 0.5s ease;
    }
    .reframe-text {
      font-style: italic;
      color: var(--text-primary);
      margin-bottom: var(--space-sm);
    }
    .reframe-why-divider {
      height: 1px;
      background: rgba(255,255,255,0.1);
      margin: var(--space-sm) 0;
    }
    .reframe-why-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      opacity: 0.6;
    }
    .reframe-why-text {
      font-weight: 500;
      color: var(--accent-breathe);
    }

    .guna-chips-container {
      margin-top: var(--space-md);
      text-align: left;
    }
    .guna-label {
      font-size: 0.85rem;
      opacity: 0.7;
      margin-bottom: var(--space-xs);
    }
    .guna-chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs);
    }
    .guna-chip {
      background: transparent;
      border: 1px solid;
      border-radius: var(--radius-lg);
      padding: 0.4rem 0.8rem;
      font-size: 0.85rem;
      color: var(--text-primary);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .guna-chart-card {
      margin-top: var(--space-md);
      padding: var(--space-md);
    }
    .guna-chart-title {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: var(--space-sm);
    }
    .guna-chart-bar {
      display: flex;
      height: 12px;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: var(--space-sm);
      background: rgba(255,255,255,0.05);
    }
    .guna-segment {
      height: 100%;
      transition: width 0.3s ease;
    }
    .sattva-bg { background-color: #6b8f71; }
    .rajas-bg { background-color: #d99a3f; }
    .tamas-bg { background-color: #9e1b32; }
    
    .guna-chart-legend {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      opacity: 0.8;
    }
    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 4px;
    }
    .sattva-dot { background-color: #6b8f71; }
    .rajas-dot { background-color: #d99a3f; }
    .tamas-dot { background-color: #9e1b32; }

    .reflection-card {
      margin-top: var(--space-md);
      padding: var(--space-md);
    }
    .reflection-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: var(--space-md);
    }
    .reflection-q {
      margin-bottom: var(--space-sm);
    }
    .reflection-q label {
      display: block;
      font-size: 0.9rem;
      margin-bottom: var(--space-xs);
      opacity: 0.9;
    }
    .reflection-saved {
      color: var(--accent-breathe);
      font-weight: 500;
      text-align: center;
      padding: var(--space-sm);
    }

    .gita-nudge-q {
      font-weight: 500;
      font-style: italic;
      color: var(--accent-breathe);
      margin-bottom: var(--space-sm);
      border-left: 2px solid var(--accent-breathe);
      padding-left: var(--space-sm);
    }
  `;
  document.head.appendChild(gitaStyle);

})();
