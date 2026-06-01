// Minimal module worker — tests if module Worker evaluation works at all
// Top-level postMessage to confirm module evaluation starts
self.postMessage({ type: 'LOG', data: { type: 'ffmpeg', message: '[ALIVE] Module worker top-level code ran!' } });

self.onmessage = function(msg) {
  self.postMessage({ type: 'LOG', data: { type: 'ffmpeg', message: '[ALIVE] onmessage fired, data type=' + msg.data.type } });
};
