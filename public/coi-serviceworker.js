/* Cross-Origin Isolation Service Worker
 * Injects COOP/COEP headers at the browser level.
 *
 * GitHub Pages strips custom HTTP headers, so we can't use _headers file
 * to set Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy.
 * This SW intercepts all network requests and adds the required headers
 * to enable SharedArrayBuffer for ffmpeg.wasm.
 *
 * License: MIT — adapted from https://github.com/gzuidhof/coi-serviceworker
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Only intercept same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Inject COOP/COEP headers on navigation (document) requests
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((response) => {
        const headers = new Headers(response.headers);
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      })
    );
  }
});
