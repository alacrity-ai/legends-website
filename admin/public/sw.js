// Minimal service worker: exists so the PWA is installable. Deliberately no
// caching — the console is one small bundle, and a stale sign-in screen or a
// stale roster at the door is worse than a network round-trip. Also sidesteps
// the "network-first defeated by the HTTP cache" trap.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
