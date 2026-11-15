// Service Worker: macht den Stundenzettel offline nutzbar. Keine Daten werden gesendet.
const VERSION = '94273e42fb';
const CACHE = 'stundenzettel-fuk-' + VERSION;
const FILES = ["./","./app.css","./app.js","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./index.html","./manifest.webmanifest","./vorlage.pdf"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('stundenzettel-fuk-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html', { cacheName: CACHE }).then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true, cacheName: CACHE }).then(r => r || fetch(req)));
});

// --- Erinnerung (nur wenn der Browser periodische Hintergrund-Synchronisation erlaubt: Chrome/Edge, installierte App)
const pad = n => String(n).padStart(2, '0');
function idbGet() {
  return new Promise(ok => {
    const r = indexedDB.open('stundenzettel-fuk', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => ok(null);
    r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('reminder'); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); };
  });
}
function idbPut(v) {
  return new Promise(ok => { const r = indexedDB.open('stundenzettel-fuk', 1); r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, 'reminder'); t.oncomplete = () => ok(); }; r.onerror = () => ok(); });
}
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
}
function holidayName(year, month, day) {
  if (month === 1 && day === 1) return 'Neujahr';
  if (month === 5 && day === 1) return 'Tag der Arbeit';
  if (month === 10 && day === 3) return 'Tag der Deutschen Einheit';
  if (month === 11 && day === 1) return 'Allerheiligen';
  if (month === 12 && day === 25) return '1. Weihnachtstag';
  if (month === 12 && day === 26) return '2. Weihnachtstag';
  const e = easter(year), off = [-2, 1, 39, 50, 60];
  const n = ['Karfreitag', 'Ostermontag', 'Christi Himmelfahrt', 'Pfingstmontag', 'Fronleichnam'];
  for (let i = 0; i < off.length; i++) {
    const c = new Date(e + off[i] * 86400000);
    if (c.getUTCMonth() + 1 === month && c.getUTCDate() === day) return n[i];
  }
  return null;
}


self.addEventListener('periodicsync', e => {
  if (e.tag !== 'erinnerung') return;
  e.waitUntil((async () => {
    const st = await idbGet();
    if (!st || !st.settings || !st.settings.on) return;
    const s = st.settings, now = new Date(), key = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const due = new Date(now); due.setHours(s.h, s.m, 0, 0);
    const wd = now.getDay();
    if (now < due || st.notified === key || st.filled?.[key]) return;
    if (s.weekdaysOnly && (wd === 0 || wd === 6)) return;
    if (s.skipHolidays && holidayName(now.getFullYear(), now.getMonth() + 1, now.getDate())) return;
    const wds = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    await self.registration.showNotification('Stundenzettel FuK', { body: `Bitte trage die Arbeitszeit für heute (${wds[wd]}, ${pad(now.getDate())}.${pad(now.getMonth() + 1)}.) ein.`, tag: 'erinnerung', icon: './icons/icon-192.png', data: { url: './?tag=' + key } });
    st.notified = key; await idbPut(st);
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
