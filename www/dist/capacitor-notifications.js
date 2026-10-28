// capacitor-notifications.js - Drop-in Capacitor Local Notifications bridge
// Replaces Web Notification API + Service Worker notifications.
// Loaded BEFORE app.js so functions are available when init() runs.
(function () {
  'use strict';
  var isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (!isNative) return;
  var LocalNotifications = window.Capacitor.Plugins.LocalNotifications;
  if (!LocalNotifications) { console.warn('[Re-birth] LocalNotifications plugin not available'); return; }

  var HOURLY_BASE_ID = 1000;
  var FOCUS_DONE_ID  = 2000;
  var INSTANT_BASE   = 3000;
  var instantCounter = 0;

  // Channel Setup (Android 8+)
  function createChannels() {
    try {
      LocalNotifications.createChannel({
        id: 'hourly-reminders', name: 'Hourly Reminders',
        description: 'Reminds you at the top of each hour to start a new focus block',
        importance: 4, visibility: 1, vibration: true, sound: 'default'
      });
      LocalNotifications.createChannel({
        id: 'focus-timer', name: 'Focus Timer',
        description: 'Notifies when your focus block completes',
        importance: 4, visibility: 1, vibration: true, sound: 'default'
      });
    } catch (e) { console.warn('[Re-birth] Channel creation error:', e); }
  }

  // Request Permissions
  function requestPermission() {
    return LocalNotifications.requestPermissions().then(function (result) {
      if (result.display === 'granted') {
        createChannels();
      }
      return result;
    }).catch(function (e) { console.warn('[Re-birth] Permission error:', e); });
  }

  // Schedule hourly notifications (6 AM - 11 PM)
  function scheduleHourly() {
    // Cancel existing hourly notifications first
    var idsToCancel = [];
    for (var i = 0; i < 18; i++) { idsToCancel.push({ id: HOURLY_BASE_ID + i }); }
    return LocalNotifications.cancel({ notifications: idsToCancel }).then(function () {
      var notifications = [];
      var messages = [
        'New hour, new chance. What will you accomplish?',
        'Time check: are you on track with your plan?',
        'Focus block reminder. Breathe and begin.',
        'Stay steady. One hour at a time.',
        'Your next productive hour starts now.',
        'Discipline is freedom. Start your block.',
        'Fresh hour. Fresh start. Lets go.',
        'Check in: How was your last hour?'
      ];
      for (var hour = 6; hour <= 23; hour++) {
        notifications.push({
          id: HOURLY_BASE_ID + (hour - 6),
          title: 'Re-birth \u2728',
          body: messages[(hour - 6) % messages.length],
          channelId: 'hourly-reminders',
          schedule: {
            on: { hour: hour, minute: 0 },
            repeats: true,
            allowWhileIdle: true
          },
          smallIcon: 'ic_stat_icon',
          autoCancel: true
        });
      }
      return LocalNotifications.schedule({ notifications: notifications });
    }).catch(function (e) { console.warn('[Re-birth] Hourly schedule error:', e); });
  }

  function cancelHourly() {
    var ids = [];
    for (var i = 0; i < 18; i++) { ids.push({ id: HOURLY_BASE_ID + i }); }
    return LocalNotifications.cancel({ notifications: ids }).catch(function (e) {
      console.warn('[Re-birth] Cancel hourly error:', e);
    });
  }

  function showInstant(title, body, tag) {
    instantCounter++;
    LocalNotifications.schedule({
      notifications: [{
        id: INSTANT_BASE + (instantCounter % 100),
        title: title || 'Re-birth',
        body: body || '',
        channelId: 'focus-timer',
        smallIcon: 'ic_stat_icon',
        autoCancel: true
      }]
    }).catch(function (e) { console.warn('[Re-birth] Instant notification error:', e); });
  }

  function scheduleFocusDone(delayMs, title, body) {
    var fireAt = new Date(Date.now() + delayMs);
    LocalNotifications.schedule({
      notifications: [{
        id: FOCUS_DONE_ID,
        title: title || 'Re-birth \u2705 Focus Complete!',
        body: body || 'Your focus block is done! Time to rate your session.',
        channelId: 'focus-timer',
        schedule: { at: fireAt, allowWhileIdle: true },
        smallIcon: 'ic_stat_icon',
        autoCancel: true
      }]
    }).catch(function (e) { console.warn('[Re-birth] Focus done schedule error:', e); });
  }

  function cancelFocusDone() {
    LocalNotifications.cancel({ notifications: [{ id: FOCUS_DONE_ID }] }).catch(function (e) {
      console.warn('[Re-birth] Cancel focus done error:', e);
    });
  }

  // Expose globals that app.js will detect and call
  window.__rebirthCapacitorNotifications = true;
  window.__rebirthRequestNotificationPermission = requestPermission;
  window.__rebirthShowNotification = showInstant;
  window.__rebirthStartHourlyNotifications = scheduleHourly;
  window.__rebirthStopHourlyNotifications = cancelHourly;
  window.__rebirthScheduleFocusDone = scheduleFocusDone;
  window.__rebirthCancelFocusDone = cancelFocusDone;

  // Auto-request permission on load
  requestPermission();
})();
