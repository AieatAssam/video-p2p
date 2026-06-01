// Minimal worker to verify Worker creation works
self.postMessage({
  type: 'LOG',
  data: { type: 'ffmpeg', message: '[PING] Diagnostic worker started at ' + Date.now() },
});

self.onmessage = async ({ data }) => {
  self.postMessage({
    type: 'LOG',
    data: { type: 'ffmpeg', message: '[PING] onmessage received type=' + data.type + ' id=' + data.id },
  });

  if (data.type === 'LOAD') {
    self.postMessage({
      type: 'LOG',
      data: { type: 'ffmpeg', message: '[PING] LOAD data keys: ' + Object.keys(data.data || {}).join(', ') },
    });

    // Respond with LOAD success so the main thread doesn't hang
    self.postMessage({
      id: data.id,
      type: 'LOAD',
      data: true,
    });
  }
};
