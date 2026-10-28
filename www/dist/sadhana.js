// ═══════════════════════════════════════════════════════════════════
// sadhana.js v2 — Structured Yoga/Meditation Practice Tracker
// Self-contained IIFE. Hooks via MutationObserver + window.rebirthNavigate.
// Storage keys: rebirth_sadhana_* (preserves existing data).
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var SCHEMA_VERSION = 1;

  // ─── DOM Helpers ─────────────────────────────────────────────────
  function S$(id) { return document.getElementById(id); }
  function SQS(sel) { return document.querySelector(sel); }

  // ─── Safe Storage ───────────────────────────────────────────────
  function sGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function sSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function sGetJSON(k, def) {
    var r = sGet(k); if (!r) return def;
    try { return JSON.parse(r); } catch (e) { return def; }
  }
  function sSetJSON(k, v) { sSet(k, JSON.stringify(v)); }

  // ─── Date Helpers (LOCAL timezone, never UTC) ───────────────────
  function localToday() { return new Date(); }
  function toDateStr(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function parseDate(s) {
    var p = s.split('-');
    return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
  }
  function daysBetween(a, b) {
    // Use local noon to avoid DST edge cases
    var aa = new Date(a.getFullYear(), a.getMonth(), a.getDate(), 12);
    var bb = new Date(b.getFullYear(), b.getMonth(), b.getDate(), 12);
    return Math.round((bb - aa) / 86400000);
  }
  function isSunday(d) { return d.getDay() === 0; }
  function todayStr() { return toDateStr(localToday()); }

  // ─── SVG Icons (Android-safe, no emoji) ─────────────────────────
  var SVG = {
    sun:     '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
    breathe: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22c-4-3-8-6-8-11a8 8 0 0116 0c0 5-4 8-8 11z"/><circle cx="12" cy="11" r="3"/></svg>',
    eye:     '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>',
    beads:   '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="12" cy="3" r="2"/><circle cx="18.5" cy="6.5" r="2"/><circle cx="21" cy="12" r="2"/><circle cx="18.5" cy="17.5" r="2"/><circle cx="12" cy="21" r="2"/><circle cx="5.5" cy="17.5" r="2"/><circle cx="3" cy="12" r="2"/><circle cx="5.5" cy="6.5" r="2"/></svg>',
    sit:     '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2a2 2 0 110 4 2 2 0 010-4zm6 18h-2v-6l-2 1V9c0-1-1-2-2-2s-2 1-2 2v6l-2-1v6H6v-7l4-2V8a4 4 0 018 0v4l4 2v7z"/></svg>',
    bee:     '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="12" cy="12" r="8"/><path d="M8 12h8M8 9h8M8 15h8" stroke="#000" stroke-width="1"/></svg>',
    wave:    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/></svg>',
    chakra:  '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
    book:    '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/></svg>',
    lock:    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>',
    fire:    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>',
    moon:    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M9.37 5.51A7.35 7.35 0 009.1 7.5c0 4.08 3.32 7.4 7.4 7.4.68 0 1.35-.09 1.99-.27A7.014 7.014 0 0112 19c-3.86 0-7-3.14-7-7 0-2.93 1.81-5.45 4.37-6.49zM12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>',
    check:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
  };

  // ─── Block Definitions ──────────────────────────────────────────
  var BLOCKS = {
    surya:    { svg: SVG.sun,     label: 'Surya Namaskar', color: '#d99a3f' },
    nadi:     { svg: SVG.breathe, label: 'Nadi Shodhana',  color: '#5b8f7a' },
    trataka:  { svg: SVG.eye,     label: 'Trataka',        color: '#7b68ee' },
    japa:     { svg: SVG.beads,   label: 'Japa',           color: '#9e6b32' },
    sit:      { svg: SVG.sit,     label: 'Silent Sit',     color: '#6b6b76' },
    bhramari: { svg: SVG.bee,     label: 'Bhramari',       color: '#8a7a5f' },
    ujjayi:   { svg: SVG.wave,    label: 'Ujjayi (gentle)',color: '#5b7a8f' },
    chakra:   { svg: SVG.chakra,  label: 'Chakra Awareness', color: '#c53347' },
    reading:  { svg: SVG.book,    label: 'Reading',        color: '#5b6b7a' }
  };

  // ─── How-To Texts ──────────────────────────────────────────────
  var HOW_TO = {
    surya: '3 slow rounds, breath synced to movement. Inhale when rising or arching back, exhale when folding forward. End with 1\u20132 minutes sitting still, watching the breath.',
    nadi: 'Alternate nostril breathing. Close right nostril, inhale left. Close left, exhale right. Inhale right, close right, exhale left. That is one round. NO breath holding. Stop if dizzy.',
    trataka: 'Place a candle at eye level, arm\u2019s length away, in a dim room with no draft. Gaze steadily at the flame tip without blinking. When eyes water, close them and hold the after-image at the point between the eyebrows. Skip if you have eye issues.',
    japa: '1 mala = 108 beads of "Om", quietly or mentally. Let each repetition be steady and unhurried.',
    sit: 'Sit still, spine upright. Watch the natural breath without controlling it.',
    bhramari: 'Close ears gently with thumbs. Inhale through the nose, exhale with a low steady humming sound. Feel the vibration in the head.',
    ujjayi: 'Gentle ocean breath: slightly constrict the throat, breathe in and out through the nose. Keep it soft and easy. No retention, no force. Stop anytime.',
    chakra: 'Bring attention to the current chakra location. 2 minutes of soft bija mantra chanting, then sit silently, keeping awareness at that spot. This is awareness only \u2014 no forced visualization or breath-holding. If you feel discomfort, open your eyes and return to natural breathing.',
    reading: 'Read a passage from a text of your choosing. Sit quietly for a moment afterward.'
  };

  // ─── Locked Techniques ──────────────────────────────────────────
  var LOCKED = [
    'Kumbhaka (Breath Retention)', 'Mula Bandha', 'Jalandhara Bandha',
    'Uddiyana Bandha', 'Kapalabhati', 'Bhastrika', 'Mudras',
    'Kundalini raising techniques'
  ];

  // ─── Yama / Niyama Rotation ─────────────────────────────────────
  var YAMA_NIYAMA = [
    { name: 'Ahimsa', meaning: 'Non-harm in thought, word, and action' },
    { name: 'Satya', meaning: 'Living in alignment with what is true' },
    { name: 'Asteya', meaning: 'Not taking what is not freely given' },
    { name: 'Brahmacharya', meaning: 'Directing energy toward growth, not distraction' },
    { name: 'Aparigraha', meaning: 'Letting go of what you do not need' },
    { name: 'Shaucha', meaning: 'Clarity and cleanliness of body and mind' },
    { name: 'Santosha', meaning: 'Contentment with what is, right now' },
    { name: 'Tapas', meaning: 'Steady discipline that burns through resistance' },
    { name: 'Svadhyaya', meaning: 'Self-study and honest self-observation' },
    { name: 'Ishvara Pranidhana', meaning: 'Surrender to something larger than the self' }
  ];

  function getYamaNiyama() {
    var today = localToday();
    var start = parseDate('2026-09-28');
    if (today < start) return null;
    var d = daysBetween(start, today);
    var idx = Math.floor(d / 14) % YAMA_NIYAMA.length;
    return { theme: YAMA_NIYAMA[idx], dayInCycle: (d % 14) + 1, totalDays: 14 };
  }

  // ═══════════════════════════════════════════════════════════════
  //  PHASE ENGINE — Correct seed data
  // ═══════════════════════════════════════════════════════════════
  var EPOCH = '2026-09-21'; // Day 1

  function getDayIndex() {
    return daysBetween(parseDate(EPOCH), localToday()) + 1;
  }

  function p0Blocks(dayIndex) {
    if (dayIndex <= 3) {
      return {
        total: 30,
        blocks: [
          { id: 'surya', type: 'surya', minutes: 10, order: 1, howto: HOW_TO.surya },
          { id: 'nadi',  type: 'nadi',  minutes: 7,  order: 2, howto: HOW_TO.nadi, detail: '4:4' },
          { id: 'japa',  type: 'japa',  minutes: 10, order: 3, howto: HOW_TO.japa, detail: '1 mala' },
          { id: 'sit',   type: 'sit',   minutes: 3,  order: 4, howto: HOW_TO.sit }
        ]
      };
    }
    return {
      total: 40,
      blocks: [
        { id: 'surya',   type: 'surya',   minutes: 10, order: 1, howto: HOW_TO.surya },
        { id: 'nadi',    type: 'nadi',    minutes: 8,  order: 2, howto: HOW_TO.nadi, detail: '4:4' },
        { id: 'trataka', type: 'trataka', minutes: 5,  order: 3, howto: HOW_TO.trataka },
        { id: 'japa',    type: 'japa',    minutes: 10, order: 4, howto: HOW_TO.japa, detail: '1 mala' },
        { id: 'sit',     type: 'sit',     minutes: 7,  order: 5, howto: HOW_TO.sit }
      ]
    };
  }

  function p1Blocks() {
    return {
      total: 55,
      blocks: [
        { id: 'surya',   type: 'surya',   minutes: 10, order: 1, howto: HOW_TO.surya },
        { id: 'nadi',    type: 'nadi',    minutes: 10, order: 2, howto: HOW_TO.nadi, detail: '4:4' },
        { id: 'trataka', type: 'trataka', minutes: 5,  order: 3, howto: HOW_TO.trataka },
        { id: 'japa',    type: 'japa',    minutes: 20, order: 4, howto: HOW_TO.japa, detail: '2 malas' },
        { id: 'sit',     type: 'sit',     minutes: 10, order: 5, howto: HOW_TO.sit }
      ]
    };
  }

  function p2Blocks() {
    var weeksInNadi = Math.floor(daysBetween(parseDate('2026-09-28'), localToday()) / 7);
    var ratio = weeksInNadi >= 3 ? '4:6' : '4:4';
    return {
      total: 75,
      blocks: [
        { id: 'surya',    type: 'surya',    minutes: 10, order: 1, howto: HOW_TO.surya },
        { id: 'nadi',     type: 'nadi',     minutes: 12, order: 2, howto: HOW_TO.nadi, detail: ratio },
        { id: 'bhramari', type: 'bhramari', minutes: 3,  order: 3, howto: HOW_TO.bhramari },
        { id: 'trataka',  type: 'trataka',  minutes: 8,  order: 4, howto: HOW_TO.trataka },
        { id: 'japa',     type: 'japa',     minutes: 22, order: 5, howto: HOW_TO.japa },
        { id: 'sit',      type: 'sit',      minutes: 20, order: 6, howto: HOW_TO.sit, detail: 'Attention between the eyebrows' }
      ]
    };
  }

  function p3Morning() {
    return {
      total: 65,
      blocks: [
        { id: 'surya',    type: 'surya',    minutes: 10, order: 1, howto: HOW_TO.surya },
        { id: 'nadi',     type: 'nadi',     minutes: 10, order: 2, howto: HOW_TO.nadi, detail: '4:4' },
        { id: 'bhramari', type: 'bhramari', minutes: 3,  order: 3, howto: HOW_TO.bhramari },
        { id: 'ujjayi',   type: 'ujjayi',   minutes: 5,  order: 4, howto: HOW_TO.ujjayi },
        { id: 'trataka',  type: 'trataka',  minutes: 7,  order: 5, howto: HOW_TO.trataka },
        { id: 'japa',     type: 'japa',     minutes: 20, order: 6, howto: HOW_TO.japa },
        { id: 'chakra',   type: 'chakra',   minutes: 10, order: 7, howto: HOW_TO.chakra }
      ]
    };
  }

  function p3Evening() {
    return {
      total: 25,
      blocks: [
        { id: 'sit',     type: 'sit',     minutes: 15, order: 1, howto: HOW_TO.sit },
        { id: 'reading', type: 'reading', minutes: 10, order: 2, howto: HOW_TO.reading }
      ]
    };
  }

  function examBlocks() {
    return {
      total: 30,
      blocks: [
        { id: 'nadi', type: 'nadi', minutes: 10, order: 1, howto: HOW_TO.nadi, detail: '4:4' },
        { id: 'japa', type: 'japa', minutes: 10, order: 2, howto: HOW_TO.japa, detail: '1 mala' },
        { id: 'sit',  type: 'sit',  minutes: 10, order: 3, howto: HOW_TO.sit }
      ]
    };
  }

  function getCurrentPhase() {
    var today = localToday();
    var ts = toDateStr(today);
    var dayIndex = getDayIndex();
    var examEnd = sGet('rebirth_sadhana_exam_date') || '2027-03-15';
    var examMode = sGet('rebirth_sadhana_exam_mode') === 'true';

    if (examMode) {
      var eb = examBlocks();
      return { id: 'EXAM', name: 'Exam Mode', dayInPhase: 1, totalDays: 0, dayIndex: dayIndex, morning: eb, evening: null, sundayMax: 30 };
    }

    // Phase table
    var phases = [
      { id: 'P0', name: 'Foundation', start: '2026-09-21', end: '2026-09-27',
        morning: function(di) { return p0Blocks(di); }, evening: null, sundayMax: 0 },
      { id: 'P1', name: 'Building', start: '2026-09-28', end: '2026-10-16',
        morning: function() { return p1Blocks(); }, evening: null, sundayMax: 0 },
      { id: 'P2', name: 'Deepening', start: '2026-10-17', end: '2026-10-31',
        morning: function() { return p2Blocks(); }, evening: null, sundayMax: 0 },
      { id: 'P3', name: 'Integration', start: '2026-11-01', end: examEnd,
        morning: function() { return p3Morning(); }, evening: function() { return p3Evening(); }, sundayMax: 120 }
    ];
    // P4, P5 computed from exam date
    var exD = parseDate(examEnd);
    var p4s = new Date(exD); p4s.setDate(p4s.getDate() + 1);
    var p4e = new Date(exD); p4e.setDate(p4e.getDate() + 7);
    phases.push({ id: 'P4', name: 'Rest Week', start: toDateStr(p4s), end: toDateStr(p4e),
      morning: function() { return { total: 0, blocks: [] }; }, evening: null, sundayMax: 0, isRest: true });
    var p5s = new Date(p4e); p5s.setDate(p5s.getDate() + 1);
    phases.push({ id: 'P5', name: 'Sustained', start: toDateStr(p5s), end: '2027-09-20',
      morning: function() {
        return { total: 90, blocks: [
          { id:'surya',type:'surya',minutes:15,order:1,howto:HOW_TO.surya },
          { id:'nadi',type:'nadi',minutes:12,order:2,howto:HOW_TO.nadi,detail:'4:6' },
          { id:'bhramari',type:'bhramari',minutes:5,order:3,howto:HOW_TO.bhramari },
          { id:'ujjayi',type:'ujjayi',minutes:5,order:4,howto:HOW_TO.ujjayi },
          { id:'trataka',type:'trataka',minutes:10,order:5,howto:HOW_TO.trataka },
          { id:'japa',type:'japa',minutes:23,order:6,howto:HOW_TO.japa },
          { id:'chakra',type:'chakra',minutes:10,order:7,howto:HOW_TO.chakra },
          { id:'sit',type:'sit',minutes:10,order:8,howto:HOW_TO.sit }
        ]};
      },
      evening: function() { return p3Evening(); }, sundayMax: 180 });

    for (var i = 0; i < phases.length; i++) {
      var p = phases[i];
      var ps = parseDate(p.start), pe = parseDate(p.end);
      if (today >= ps && today <= pe) {
        var dip = daysBetween(ps, today) + 1;
        var td = daysBetween(ps, pe) + 1;
        var m = p.morning(dayIndex);
        var ev = p.evening ? p.evening() : null;
        // Dev check: validate totals
        if (m && m.blocks.length > 0) {
          var sum = m.blocks.reduce(function(a,b){return a+b.minutes;}, 0);
          if (sum !== m.total) console.warn('[Sadhana] Phase ' + p.id + ' morning total mismatch: declared=' + m.total + ' sum=' + sum);
        }
        if (ev && ev.blocks.length > 0) {
          var esum = ev.blocks.reduce(function(a,b){return a+b.minutes;}, 0);
          if (esum !== ev.total) console.warn('[Sadhana] Phase ' + p.id + ' evening total mismatch: declared=' + ev.total + ' sum=' + esum);
        }
        return { id: p.id, name: p.name, dayInPhase: dip, totalDays: td, dayIndex: dayIndex, morning: m, evening: ev, sundayMax: p.sundayMax || 0, isRest: p.isRest || false };
      }
    }
    return { id: 'NONE', name: 'Not Started', dayInPhase: 0, totalDays: 0, dayIndex: dayIndex, morning: null, evening: null, sundayMax: 0 };
  }

  // ─── Completion Log ─────────────────────────────────────────────
  function getLog() { return sGetJSON('rebirth_sadhana_log', []); }
  function saveLog(log) { sSetJSON('rebirth_sadhana_log', log); }

  function getBlocksDoneToday() {
    var today = todayStr();
    return getLog().filter(function(e) { return e.date === today; });
  }
  function isBlockDone(blockId) {
    return getBlocksDoneToday().some(function(e) { return e.blockId === blockId && e.status === 'done'; });
  }
  function isBlockSkipped(blockId) {
    return getBlocksDoneToday().some(function(e) { return e.blockId === blockId && e.status === 'skipped'; });
  }
  function markBlock(blockId, type, minutes, status) {
    var log = getLog();
    // Remove existing entry for this block today
    var today = todayStr();
    log = log.filter(function(e) { return !(e.date === today && e.blockId === blockId); });
    log.push({ date: today, blockId: blockId, type: type, minutes: minutes, status: status, timestamp: Date.now() });
    saveLog(log);
    updateStreakOnComplete();
    renderSadhanaToday();
  }

  function isMorningComplete(phase) {
    if (!phase || !phase.morning || phase.morning.blocks.length === 0) return false;
    var done = getBlocksDoneToday();
    return phase.morning.blocks.every(function(b) {
      return done.some(function(e) { return e.blockId === b.id && (e.status === 'done' || e.status === 'skipped'); });
    });
  }

  // ─── Streak ─────────────────────────────────────────────────────
  function getStreak() { return sGetJSON('rebirth_sadhana_streak', { lastDate: '', streak: 0, forgiven: false }); }
  function saveStreak(s) { sSetJSON('rebirth_sadhana_streak', s); }
  function updateStreakOnComplete() {
    var phase = getCurrentPhase();
    if (!isMorningComplete(phase)) return;
    var s = getStreak();
    var today = todayStr();
    if (s.lastDate === today) return; // already counted
    var yesterday = toDateStr(new Date(localToday().getTime() - 86400000));
    if (s.lastDate === yesterday) {
      s.streak++; s.forgiven = false;
    } else if (s.lastDate && daysBetween(parseDate(s.lastDate), localToday()) === 2 && !s.forgiven) {
      s.streak++; s.forgiven = true; // 1-day grace
    } else if (!s.lastDate) {
      s.streak = 1; s.forgiven = false;
    } else {
      s.streak = 1; s.forgiven = false;
    }
    s.lastDate = today;
    saveStreak(s);
  }

  // ─── Bottom Sheet ───────────────────────────────────────────────
  function showBlockSheet(block) {
    closeSheet();
    var bt = BLOCKS[block.type] || { svg: '', label: block.type, color: '#666' };
    var done = isBlockDone(block.id);
    var skipped = isBlockSkipped(block.id);

    var backdrop = document.createElement('div');
    backdrop.className = 'sadhana-sheet-backdrop';
    backdrop.id = 'sadhana-sheet-backdrop';

    var sheet = document.createElement('div');
    sheet.className = 'sadhana-sheet';
    sheet.id = 'sadhana-sheet';

    var statusMsg = '';
    if (done) statusMsg = '<p class="sadhana-sheet-status sadhana-sheet-done">' + SVG.check + ' Marked done today</p>';
    else if (skipped) statusMsg = '<p class="sadhana-sheet-status sadhana-sheet-skipped">Skipped today</p>';

    sheet.innerHTML =
      '<div class="sadhana-sheet-handle"></div>' +
      '<div class="sadhana-sheet-header">' +
        '<span class="sadhana-sheet-icon" style="color:' + bt.color + '">' + bt.svg + '</span>' +
        '<div><h3 class="sadhana-sheet-title">' + bt.label + '</h3>' +
        '<span class="sadhana-sheet-time">' + block.minutes + ' min' + (block.detail ? ' \u00B7 ' + block.detail : '') + '</span></div>' +
      '</div>' +
      '<p class="sadhana-sheet-howto">' + (block.howto || HOW_TO[block.type] || '') + '</p>' +
      statusMsg +
      '<div class="sadhana-sheet-actions">' +
        '<button class="sadhana-sheet-btn sadhana-sheet-btn-done" data-action="done">' + SVG.check + ' Mark Done</button>' +
        '<button class="sadhana-sheet-btn sadhana-sheet-btn-skip" data-action="skipped">Skipped</button>' +
      '</div>';

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);

    // Animate in
    requestAnimationFrame(function() {
      backdrop.classList.add('active');
      sheet.classList.add('active');
    });

    // Event delegation on sheet
    sheet.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      markBlock(block.id, block.type, block.minutes, action);
      closeSheet();
    });

    backdrop.addEventListener('click', closeSheet);
  }

  function closeSheet() {
    var bd = S$('sadhana-sheet-backdrop');
    var sh = S$('sadhana-sheet');
    if (bd) { bd.classList.remove('active'); setTimeout(function() { if (bd.parentNode) bd.parentNode.removeChild(bd); }, 300); }
    if (sh) { sh.classList.remove('active'); setTimeout(function() { if (sh.parentNode) sh.parentNode.removeChild(sh); }, 300); }
  }

  // ─── Guard: close sheet on route change ─────────────────────────
  function cleanupOverlays() { closeSheet(); }

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════
  function renderSadhanaToday() {
    var container = S$('sadhana-today-content');
    if (!container) return;

    var phase = getCurrentPhase();
    var streak = getStreak();
    var morningDone = isMorningComplete(phase);
    var yama = getYamaNiyama();
    var today = localToday();
    var showEvening = phase.evening && today >= parseDate('2026-11-01');
    var html = '';

    // Phase header
    html += '<div class="sadhana-phase-header glass-card">';
    html += '<div class="sadhana-phase-badge">' + phase.id + '</div>';
    html += '<div class="sadhana-phase-info">';
    html += '<h2 class="sadhana-phase-name">' + phase.name + '</h2>';
    if (phase.totalDays > 0) {
      html += '<p class="sadhana-phase-progress">Day ' + phase.dayInPhase + ' of ' + phase.totalDays;
      if (phase.morning && phase.morning.total) html += ' &middot; ' + phase.morning.total + ' min today';
      html += '</p>';
    }
    html += '</div></div>';

    // Rest week
    if (phase.isRest) {
      html += '<div class="glass-card sadhana-rest-card"><h3>Rest Week</h3><p>No requirements. Rest, recover, integrate.</p></div>';
    }

    // Morning session blocks
    if (phase.morning && phase.morning.blocks.length > 0) {
      html += '<div class="sadhana-session-section">';
      html += '<div class="sadhana-session-header">' + SVG.sun + '<span class="sadhana-session-label">Morning Session</span><span class="sadhana-session-time">' + phase.morning.total + ' min</span>';
      if (morningDone) html += '<span class="sadhana-done-badge">' + SVG.check + '</span>';
      html += '</div>';
      phase.morning.blocks.forEach(function(block) {
        html += renderBlockRow(block);
      });
      html += '</div>';
    }

    // Evening (from Nov 1 only)
    if (showEvening && phase.evening && phase.evening.blocks.length > 0) {
      var evDone = phase.evening.blocks.every(function(b) { return isBlockDone(b.id) || isBlockSkipped(b.id); });
      html += '<div class="sadhana-session-section">';
      html += '<div class="sadhana-session-header">' + SVG.moon + '<span class="sadhana-session-label">Evening Session</span><span class="sadhana-session-time">' + phase.evening.total + ' min</span>';
      if (evDone) html += '<span class="sadhana-done-badge">' + SVG.check + '</span>';
      html += '</div>';
      phase.evening.blocks.forEach(function(block) { html += renderBlockRow(block); });
      html += '</div>';
    }

    // Sunday note
    if (isSunday(today) && phase.sundayMax > 0) {
      html += '<div class="glass-card sadhana-sunday-card"><p>Sunday: extended practice up to ' + phase.sundayMax + ' min</p></div>';
    }

    // Breathe entry (SVG icon, not emoji)
    html += '<div class="sadhana-session-section">';
    html += '<div class="sadhana-session-header">' + SVG.breathe + '<span class="sadhana-session-label">Breathe</span></div>';
    html += '<button class="sadhana-block-btn glass-card" data-action-breathe="true">';
    html += '<span class="sadhana-block-icon" style="color:#d99a3f">' + SVG.breathe + '</span>';
    html += '<span class="sadhana-block-label">4-7-8 Breathing</span>';
    html += '<span class="sadhana-block-detail">Standalone session</span>';
    html += '<span class="sadhana-block-time">&rarr;</span>';
    html += '</button></div>';

    // Yama/Niyama
    if (yama) {
      html += '<div class="glass-card sadhana-yama-card">';
      html += '<div class="sadhana-yama-header">' + SVG.sparkle + '<span class="sadhana-yama-cycle">This fortnight: Day ' + yama.dayInCycle + '/' + yama.totalDays + '</span></div>';
      html += '<h3 class="sadhana-yama-name">' + yama.theme.name + '</h3>';
      html += '<p class="sadhana-yama-meaning">' + yama.theme.meaning + '</p></div>';
    }

    // Streak
    html += '<div class="glass-card sadhana-streak-card">';
    html += '<span class="sadhana-streak-icon">' + SVG.fire + '</span>';
    html += '<span class="sadhana-streak-value">' + (streak.streak || 0) + '</span>';
    html += '<span class="sadhana-streak-label">day streak</span>';
    if (morningDone) html += '<span class="sadhana-streak-today">' + SVG.check + ' Today</span>';
    html += '</div>';

    // Locked
    html += '<div class="glass-card sadhana-locked-card">';
    html += '<div class="sadhana-locked-header">' + SVG.lock + '<span class="sadhana-locked-title">Teacher-Led Practices</span></div>';
    html += '<p class="sadhana-locked-note">These require guidance from an experienced, in-person teacher.</p>';
    html += '<div class="sadhana-locked-list">' + LOCKED.map(function(t) { return '<span class="sadhana-locked-item">' + t + '</span>'; }).join('') + '</div></div>';

    // Exam mode indicator
    if (sGet('rebirth_sadhana_exam_mode') === 'true') {
      html += '<div class="glass-card sadhana-exam-card"><p>Exam Mode active &mdash; 30 min morning floor</p>' +
        '<button class="btn-ghost btn-sm" data-action-exam-off="true">Disable Exam Mode</button></div>';
    }

    container.innerHTML = html;
  }

  function renderBlockRow(block) {
    var bt = BLOCKS[block.type] || { svg: SVG.sit, label: block.type, color: '#666' };
    var done = isBlockDone(block.id);
    var skipped = isBlockSkipped(block.id);
    var cls = 'sadhana-block-btn glass-card';
    if (done) cls += ' sadhana-block-done';
    if (skipped) cls += ' sadhana-block-skipped';
    var h = '<button class="' + cls + '" data-block-id="' + block.id + '">';
    h += '<span class="sadhana-block-order">' + block.order + '</span>';
    h += '<span class="sadhana-block-icon" style="color:' + bt.color + '">' + bt.svg + '</span>';
    h += '<span class="sadhana-block-label">' + bt.label + '</span>';
    if (block.detail) h += '<span class="sadhana-block-detail">' + block.detail + '</span>';
    h += '<span class="sadhana-block-time">' + block.minutes + 'm</span>';
    if (done) h += '<span class="sadhana-block-status">' + SVG.check + '</span>';
    h += '</button>';
    return h;
  }

  // ═══════════════════════════════════════════════════════════════
  //  EVENT DELEGATION (single listener, survives re-render)
  // ═══════════════════════════════════════════════════════════════
  function setupDelegation() {
    var container = S$('sadhana-today-content');
    if (!container) return;

    container.addEventListener('click', function(e) {
      // Block row
      var blockBtn = e.target.closest('[data-block-id]');
      if (blockBtn) {
        var blockId = blockBtn.getAttribute('data-block-id');
        var phase = getCurrentPhase();
        var allBlocks = [];
        if (phase.morning) allBlocks = allBlocks.concat(phase.morning.blocks);
        if (phase.evening) allBlocks = allBlocks.concat(phase.evening.blocks);
        var block = allBlocks.find(function(b) { return b.id === blockId; });
        if (block) showBlockSheet(block);
        return;
      }

      // Breathe button
      if (e.target.closest('[data-action-breathe]')) {
        if (window.rebirthNavigate) {
          window.rebirthNavigate('screen-breathe-free');
        }
        return;
      }

      // Exam off
      if (e.target.closest('[data-action-exam-off]')) {
        sSet('rebirth_sadhana_exam_mode', 'false');
        renderSadhanaToday();
        return;
      }
    });
  }

  // ─── Schema Migration ──────────────────────────────────────────
  function migrateIfNeeded() {
    var stored = sGetJSON('rebirth_sadhana_schema', { version: 0 });
    if (stored.version < SCHEMA_VERSION) {
      // v0 → v1: ensure log and streak exist with defaults
      if (!sGet('rebirth_sadhana_log')) sSetJSON('rebirth_sadhana_log', []);
      if (!sGet('rebirth_sadhana_streak')) sSetJSON('rebirth_sadhana_streak', { lastDate: '', streak: 0, forgiven: false });
      sSetJSON('rebirth_sadhana_schema', { version: SCHEMA_VERSION });
    }
  }

  // ─── Observer ──────────────────────────────────────────────────
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      var el = m.target;
      if (!el.classList.contains('screen')) return;
      // Clean up overlays on any route change
      cleanupOverlays();
      if (el.id === 'screen-sadhana' && el.classList.contains('active')) {
        renderSadhanaToday();
      }
    });
  });

  // ─── Init ──────────────────────────────────────────────────────
  function init() {
    try {
      migrateIfNeeded();
      setupDelegation();
      document.querySelectorAll('.screen').forEach(function(s) {
        observer.observe(s, { attributes: true, attributeFilter: ['class'] });
      });
      var ss = S$('screen-sadhana');
      if (ss && ss.classList.contains('active')) renderSadhanaToday();
    } catch (err) {
      console.error('[Sadhana] Init error:', err);
      var c = S$('sadhana-today-content');
      if (c) c.innerHTML = '<div class="glass-card" style="text-align:center;padding:2rem"><h3>Sadhana failed to load</h3><p style="color:var(--text-secondary)">' + err.message + '</p><button onclick="location.reload()" class="btn-ghost">Reload</button></div>';
    }
  }

  // ─── Dynamic CSS ───────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = [
    '/* ═══ Sadhana Module v2 ═══ */',
    '.sadhana-phase-header{display:flex;align-items:center;gap:var(--space-md);margin-bottom:var(--space-md)}',
    '.sadhana-phase-badge{background:var(--accent-primary);color:#fff;font-family:var(--font-display);font-weight:700;font-size:var(--font-xs);padding:4px 10px;border-radius:var(--radius-full);letter-spacing:.05em;text-transform:uppercase}',
    '.sadhana-phase-info{flex:1}',
    '.sadhana-phase-name{font-family:var(--font-display);font-size:var(--font-xl);color:var(--text-primary);margin:0}',
    '.sadhana-phase-progress{font-size:var(--font-sm);color:var(--text-secondary);margin:2px 0 0}',
    '.sadhana-session-section{margin-bottom:var(--space-lg)}',
    '.sadhana-session-header{display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-sm);padding:0 var(--space-xs)}',
    '.sadhana-session-header svg{flex-shrink:0}',
    '.sadhana-session-label{font-family:var(--font-display);font-size:var(--font-base);color:var(--text-primary);flex:1;text-transform:uppercase;letter-spacing:.04em}',
    '.sadhana-session-time{font-size:var(--font-sm);color:var(--text-tertiary)}',
    '.sadhana-done-badge{color:var(--color-success)}',
    '.sadhana-block-btn{display:flex;align-items:center;gap:var(--space-sm);width:100%;text-align:left;border:none;cursor:pointer;touch-action:manipulation;margin-bottom:var(--space-xs);padding:var(--space-md) var(--space-lg);min-height:48px;transition:transform .15s,box-shadow .15s}',
    '.sadhana-block-btn:active{transform:scale(.98)}',
    '.sadhana-block-order{font-family:var(--font-display);font-size:var(--font-xs);color:var(--text-tertiary);width:18px;text-align:center;flex-shrink:0}',
    '.sadhana-block-icon{flex-shrink:0;width:24px;display:flex;align-items:center;justify-content:center}',
    '.sadhana-block-label{flex:1;font-size:var(--font-base);color:var(--text-primary)}',
    '.sadhana-block-detail{font-size:var(--font-xs);color:var(--text-secondary);background:rgba(255,255,255,.05);padding:2px 8px;border-radius:var(--radius-full)}',
    '.sadhana-block-time{font-family:var(--font-display);font-size:var(--font-sm);color:var(--text-tertiary);min-width:28px;text-align:right}',
    '.sadhana-block-status{color:var(--color-success);flex-shrink:0}',
    '.sadhana-block-done{opacity:.6;border-left:3px solid var(--color-success)}',
    '.sadhana-block-skipped{opacity:.4}',
    '.sadhana-yama-card{text-align:center;margin-bottom:var(--space-md)}',
    '.sadhana-yama-header{display:flex;align-items:center;justify-content:center;gap:var(--space-sm);margin-bottom:var(--space-xs)}',
    '.sadhana-yama-cycle{font-size:var(--font-xs);color:var(--text-tertiary)}',
    '.sadhana-yama-name{font-family:var(--font-display);font-size:var(--font-lg);color:var(--accent-breathe);margin:var(--space-xs) 0}',
    '.sadhana-yama-meaning{font-size:var(--font-sm);color:var(--text-secondary);margin:0;font-style:italic}',
    '.sadhana-streak-card{display:flex;align-items:center;gap:var(--space-md);margin-bottom:var(--space-md)}',
    '.sadhana-streak-icon svg{color:var(--accent-focus-end)}',
    '.sadhana-streak-value{font-family:var(--font-display);font-size:var(--font-3xl);color:var(--text-primary)}',
    '.sadhana-streak-label{font-size:var(--font-sm);color:var(--text-secondary)}',
    '.sadhana-streak-today{font-size:var(--font-xs);color:var(--color-success);margin-left:auto;display:flex;align-items:center;gap:4px}',
    '.sadhana-locked-card{opacity:.7;margin-bottom:var(--space-md)}',
    '.sadhana-locked-header{display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-sm)}',
    '.sadhana-locked-title{font-family:var(--font-display);font-size:var(--font-base);color:var(--text-primary);text-transform:uppercase;letter-spacing:.04em}',
    '.sadhana-locked-note{font-size:var(--font-sm);color:var(--text-secondary);margin:0 0 var(--space-sm)}',
    '.sadhana-locked-list{display:flex;flex-wrap:wrap;gap:var(--space-xs)}',
    '.sadhana-locked-item{font-size:var(--font-xs);color:var(--text-tertiary);background:rgba(255,255,255,.03);padding:4px 10px;border-radius:var(--radius-full);border:1px solid rgba(255,255,255,.06)}',
    '.sadhana-rest-card{text-align:center;padding:var(--space-2xl)}',
    '.sadhana-rest-card h3{font-family:var(--font-display);color:var(--text-primary);margin:0 0 var(--space-sm)}',
    '.sadhana-rest-card p{color:var(--text-secondary);font-size:var(--font-sm);margin:0}',
    '.sadhana-exam-card{text-align:center;border:1px solid rgba(217,154,63,.3)}',
    '.sadhana-exam-card p{font-size:var(--font-sm);color:var(--accent-breathe);margin:0 0 var(--space-sm)}',
    '.sadhana-sunday-card{text-align:center;border:1px solid rgba(107,143,113,.3);margin-bottom:var(--space-md)}',
    '.sadhana-sunday-card p{font-size:var(--font-sm);color:var(--color-success);margin:0}',
    '/* Bottom Sheet */',
    '.sadhana-sheet-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;opacity:0;transition:opacity .3s;pointer-events:auto}',
    '.sadhana-sheet-backdrop.active{opacity:1}',
    '.sadhana-sheet{position:fixed;bottom:0;left:0;right:0;max-width:480px;margin:0 auto;background:var(--bg-elevated);border-radius:var(--radius-xl) var(--radius-xl) 0 0;padding:var(--space-lg) var(--space-xl) var(--space-2xl);z-index:501;transform:translateY(100%);transition:transform .3s cubic-bezier(.4,0,.2,1)}',
    '.sadhana-sheet.active{transform:translateY(0)}',
    '.sadhana-sheet-handle{width:40px;height:4px;background:rgba(255,255,255,.15);border-radius:2px;margin:0 auto var(--space-lg)}',
    '.sadhana-sheet-header{display:flex;align-items:center;gap:var(--space-md);margin-bottom:var(--space-md)}',
    '.sadhana-sheet-icon{flex-shrink:0}',
    '.sadhana-sheet-title{font-family:var(--font-display);font-size:var(--font-lg);color:var(--text-primary);margin:0}',
    '.sadhana-sheet-time{font-size:var(--font-sm);color:var(--text-secondary)}',
    '.sadhana-sheet-howto{font-size:var(--font-sm);color:var(--text-secondary);line-height:1.6;margin:0 0 var(--space-lg)}',
    '.sadhana-sheet-status{font-size:var(--font-sm);display:flex;align-items:center;gap:6px;margin:0 0 var(--space-md)}',
    '.sadhana-sheet-done{color:var(--color-success)}',
    '.sadhana-sheet-skipped{color:var(--text-tertiary)}',
    '.sadhana-sheet-actions{display:flex;gap:var(--space-md)}',
    '.sadhana-sheet-btn{flex:1;padding:var(--space-md);border:none;border-radius:var(--radius-lg);font-family:var(--font-display);font-size:var(--font-base);cursor:pointer;touch-action:manipulation;min-height:48px;display:flex;align-items:center;justify-content:center;gap:6px;transition:transform .15s}',
    '.sadhana-sheet-btn:active{transform:scale(.97)}',
    '.sadhana-sheet-btn-done{background:var(--color-success);color:#fff}',
    '.sadhana-sheet-btn-skip{background:rgba(255,255,255,.08);color:var(--text-secondary)}'
  ].join('\n');
  document.head.appendChild(css);

  // ─── Boot ──────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
