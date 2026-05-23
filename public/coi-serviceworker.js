/* coi-serviceworker.js
 * Cross-Origin Isolation Service Worker
 * 
 * Injects COOP/COEP headers into all same-origin responses at the browser level.
 * This is necessary because GitHub Pages CDN strips these headers from HTTP responses,
 * but a Service Worker can add them after the CDN delivers the response.
 *
 * Based on: https://github.com/gzuidhof/coi-serviceworker (MIT)
 *
 * Without this, SharedArrayBuffer (required by ffmpeg.wasm) is unavailable,
 * and the app falls back to showing an error message to the user.
 */

'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

self.addEventListener('fetch', function (e) {
  const request = e.request;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  // Only intercept same-origin requests
  if (request.url.startsWith(self.location.origin)) {
    e.respondWith(
      fetch(request)
        .then((response) => {
          const newHeaders = new Headers(response.headers);
          newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
          newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
          newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch(() => new Response('', { status: 503 }))
    );
  }
});
