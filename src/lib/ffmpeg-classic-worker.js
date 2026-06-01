// Classic worker test — no imports, no ESM, just postMessage
self.postMessage({ type: 'LOG', data: { type: 'ffmpeg', message: '[CLASSIC] Classic worker top-level code ran!' } });

self.onmessage = function(msg) {
  self.postMessage({ type: 'LOG', data: { type: 'ffmpeg', message: '[CLASSIC] onmessage fired, data type=' + msg.data.type } });
};
