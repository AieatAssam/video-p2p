/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

const CORE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd/ffmpeg-core.js';

const FFMessageType = {
  LOAD: 'LOAD',
  EXEC: 'EXEC',
  FFPROBE: 'FFPROBE',
  WRITE_FILE: 'WRITE_FILE',
  READ_FILE: 'READ_FILE',
  DELETE_FILE: 'DELETE_FILE',
  RENAME: 'RENAME',
  CREATE_DIR: 'CREATE_DIR',
  LIST_DIR: 'LIST_DIR',
  DELETE_DIR: 'DELETE_DIR',
  ERROR: 'ERROR',
  DOWNLOAD: 'DOWNLOAD',
  PROGRESS: 'PROGRESS',
  LOG: 'LOG',
  MOUNT: 'MOUNT',
  UNMOUNT: 'UNMOUNT',
};

const ERROR_TERMINATED = new Error('called FFmpeg.terminate()');
const ERROR_NOT_LOADED = new Error('ffmpeg is not loaded, call `await ffmpeg.load()` first');
const ERROR_IMPORT_FAILURE = new Error('failed to import ffmpeg-core.js');
const ERROR_UNKNOWN_MESSAGE_TYPE = new Error('unknown message type');

let ffmpeg = null;

function diag(msg) {
  self.postMessage({
    type: FFMessageType.LOG,
    data: { type: 'ffmpeg', message: '[DIAG] ' + msg },
  });
}

const load = async ({ coreURL: _coreURL, wasmURL: _wasmURL, workerURL: _workerURL }) => {
  const first = !ffmpeg;
  diag('load() called, coreURL=' + (_coreURL ? _coreURL.substring(0, 80) + '...' : '(none)'));

  try {
    if (!_coreURL) _coreURL = CORE_URL;
    diag('step 1: importScripts()...');
    importScripts(_coreURL);
    diag('step 1 done: importScripts succeeded');
  } catch (e) {
    diag('step 1 catch: ' + String(e).substring(0, 120));
  }

  const importStart = performance.now();
  diag('step 2: dynamic import() of core ESM module...');
  try {
    if (!_coreURL || _coreURL === CORE_URL)
      _coreURL = CORE_URL.replace('/umd/', '/esm/');
    self.createFFmpegCore = (await import(_coreURL)).default;
    if (!self.createFFmpegCore)
      throw ERROR_IMPORT_FAILURE;
    diag('step 2 done: import() resolved in ' + (performance.now() - importStart).toFixed(0) + 'ms');
  } catch (e) {
    diag('step 2 ERROR: ' + String(e).substring(0, 200));
    throw e;
  }

  const coreURL = _coreURL;
  const wasmURL = _wasmURL || _coreURL.replace(/.js$/g, '.wasm');
  const workerURL = _workerURL || _coreURL.replace(/.js$/g, '.worker.js');

  const initStart = performance.now();
  diag('step 3: self.createFFmpegCore(mainScriptUrlOrBlob)... wasm=' + wasmURL.substring(0, 80) + '...');
  try {
    ffmpeg = await self.createFFmpegCore({
      mainScriptUrlOrBlob: coreURL + '#' + btoa(JSON.stringify({ wasmURL, workerURL })),
    });
    diag('step 3 done: createFFmpegCore resolved in ' + (performance.now() - initStart).toFixed(0) + 'ms');
  } catch (e) {
    diag('step 3 ERROR: ' + String(e).substring(0, 200));
    throw e;
  }

  diag('step 4: setting log/progress handlers...');
  ffmpeg.setLogger((data) =>
    self.postMessage({ type: FFMessageType.LOG, data })
  );
  ffmpeg.setProgress((data) =>
    self.postMessage({ type: FFMessageType.PROGRESS, data })
  );

  diag('load() complete — sending LOAD response');
  return first;
};

const exec = ({ args, timeout = -1 }) => {
  ffmpeg.setTimeout(timeout);
  ffmpeg.exec(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  return ret;
};

const ffprobe = ({ args, timeout = -1 }) => {
  ffmpeg.setTimeout(timeout);
  ffmpeg.ffprobe(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  return ret;
};

const writeFile = ({ path, data }) => {
  ffmpeg.FS.writeFile(path, data);
  return true;
};

const readFile = ({ path, encoding }) => ffmpeg.FS.readFile(path, { encoding });

const deleteFile = ({ path }) => {
  ffmpeg.FS.unlink(path);
  return true;
};

const rename = ({ oldPath, newPath }) => {
  ffmpeg.FS.rename(oldPath, newPath);
  return true;
};

const createDir = ({ path }) => {
  ffmpeg.FS.mkdir(path);
  return true;
};

const listDir = ({ path }) => {
  const names = ffmpeg.FS.readdir(path);
  const nodes = [];
  for (const name of names) {
    const stat = ffmpeg.FS.stat(path + '/' + name);
    const isDir = ffmpeg.FS.isDir(stat.mode);
    nodes.push({ name, isDir });
  }
  return nodes;
};

const deleteDir = ({ path }) => {
  ffmpeg.FS.rmdir(path);
  return true;
};

const mount = ({ fsType, options, mountPoint }) => {
  const fs = ffmpeg.FS.filesystems[fsType];
  if (!fs) return false;
  ffmpeg.FS.mount(fs, options, mountPoint);
  return true;
};

const unmount = ({ mountPoint }) => {
  ffmpeg.FS.unmount(mountPoint);
  return true;
};

self.onmessage = async ({ data: { id, type, data: _data } }) => {
  const trans = [];
  let data;
  try {
    if (type !== FFMessageType.LOAD && !ffmpeg)
      throw ERROR_NOT_LOADED;
    switch (type) {
      case FFMessageType.LOAD:
        diag('onmessage: LOAD received, calling load()...');
        data = await load(_data);
        diag('onmessage: load() returned, posting LOAD response');
        break;
      case FFMessageType.EXEC:
        data = exec(_data);
        break;
      case FFMessageType.FFPROBE:
        data = ffprobe(_data);
        break;
      case FFMessageType.WRITE_FILE:
        data = writeFile(_data);
        break;
      case FFMessageType.READ_FILE:
        data = readFile(_data);
        break;
      case FFMessageType.DELETE_FILE:
        data = deleteFile(_data);
        break;
      case FFMessageType.RENAME:
        data = rename(_data);
        break;
      case FFMessageType.CREATE_DIR:
        data = createDir(_data);
        break;
      case FFMessageType.LIST_DIR:
        data = listDir(_data);
        break;
      case FFMessageType.DELETE_DIR:
        data = deleteDir(_data);
        break;
      case FFMessageType.MOUNT:
        data = mount(_data);
        break;
      case FFMessageType.UNMOUNT:
        data = unmount(_data);
        break;
      default:
        throw ERROR_UNKNOWN_MESSAGE_TYPE;
    }
  } catch (e) {
    diag('onmessage ERROR: ' + String(e).substring(0, 200));
    self.postMessage({ id, type: FFMessageType.ERROR, data: String(e) });
    return;
  }
  if (data instanceof Uint8Array) {
    trans.push(data.buffer);
  }
  self.postMessage({ id, type, data }, trans);
};
