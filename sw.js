// Service Worker for Re-birth PWA — v6
const CACHE_NAME = 'rebirth-v7';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon.svg',
    './icon-192.png',
    './icon-512.png'
];

// ─── State ────────────────────────────────────────────────────
let hourlyCheckInterval = null;
let lastNotifiedHour = -1;
let focusDoneTimeout = null;

// ─── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// ─── Fetch (Network-first, cache fallback) ────────────────────
self.addEventListener('fetch', (event) => {
    // Skip non-GET and cross-origin
    if (event.request.method !== 'GET') return;
    
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request)
                    .then((cached) => cached || caches.match('./index.html'));
            })
    );
});

// ─── Message Handler (from main app) ──────────────────────────
self.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || !data.type) return;

    switch (data.type) {
        case 'START_HOURLY':
            startHourlyCheck();
            break;

        case 'STOP_HOURLY':
            stopHourlyCheck();
            break;

        case 'SCHEDULE_FOCUS_DONE':
            scheduleFocusDone(data);
            break;

        case 'CANCEL_FOCUS_DONE':
            cancelFocusDone();
            break;

        case 'SHOW_NOTIFICATION':
            showAppNotification(data.title, data.body, data.tag, data.requireInteraction);
            break;
    }
});

// ─── Hourly Notification Check ────────────────────────────────
function startHourlyCheck() {
    stopHourlyCheck();
    // Check every 30 seconds — service workers can stay alive for this
    hourlyCheckInterval = setInterval(() => {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();

        // Only notify between 6 AM and 11 PM
        if (hour < 6 || hour > 23) return;

        // Fire at the top of each hour (within first 2 minutes)
        if (minute <= 1 && lastNotifiedHour !== hour) {
            lastNotifiedHour = hour;
            showAppNotification(
                'Re-birth ⏰ New Hour!',
                'A new hour has begun! Start a new focus block.',
                'hourly-reminder',
                false
            );
        }
    }, 30000);
}

function stopHourlyCheck() {
    if (hourlyCheckInterval) {
        clearInterval(hourlyCheckInterval);
        hourlyCheckInterval = null;
    }
}

// ─── Focus Timer Completion Notification ──────────────────────
function scheduleFocusDone(data) {
    cancelFocusDone();
    const delay = Math.max(0, data.delayMs || 0);
    focusDoneTimeout = setTimeout(() => {
        showAppNotification(
            data.title || 'Re-birth ✅ Focus Complete!',
            data.body || 'Your focus block is done. Time to rate your session!',
            'focus-complete',
            true
        );
        focusDoneTimeout = null;
    }, delay);
}

function cancelFocusDone() {
    if (focusDoneTimeout) {
        clearTimeout(focusDoneTimeout);
        focusDoneTimeout = null;
    }
}

// ─── Show Notification (central) ──────────────────────────────
function showAppNotification(title, body, tag, requireInteraction) {
    self.registration.showNotification(title, {
        body: body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [100, 50, 100, 50, 100],
        tag: tag || 'rebirth-general',
        requireInteraction: requireInteraction || false,
        silent: false,
        data: { url: './' }
    }).catch(() => { /* notification failed silently */ });
}

// ─── Notification Click Handler ───────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus existing window if available
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if ('focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open a new window
            return clients.openWindow(event.notification.data?.url || './');
        })
    );
});
