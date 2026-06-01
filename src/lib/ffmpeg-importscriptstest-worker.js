// Test: does importScripts work with cross-origin CDN URL under COEP?
self.postMessage({ type: 'LOG', data: { type: 'ffmpeg', message: '[TEST] Worker started!' } });

try {
  self.postMessage({ type: 'LOG', data: { type: 'ffmpeg', message: '[TEST] Calling importScripts(CDN UMD url)...' } });
  importScripts('https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/umd/ffmpeg-core.js');
  self.postMessage({ type: 'LOG', data: { type: 'ffmpeg', message: '[TEST] importScripts succeeded! createFFmpegCore type=' + typeof self.createFFmpegCore } });
} catch (e) {
  self.postMessage({ type: 'LOG', data: { type: 'ffmpeg', message: '[TEST] importScripts ERROR: ' + String(e).substring(0, 200) } });
}

self.postMessage({ type: 'LOG', data: { type: 'ffmpeg', message: '[TEST] Worker still alive after importScripts' } });
