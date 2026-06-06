import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import type { ProgressEvent, LogEntry } from '../types';

/** Internal callback for diagnostic logging from the engine itself. */
type EngineLogger = (level: LogEntry['level'], message: string) => void;

/**
 * CDN base URLs for ffmpeg.wasm core files.
 *
 * Strategy: try multi-thread (core-mt) first for faster processing with
 * pthreads + SharedArrayBuffer. If that hangs (known issue on WebKit where
 * pthread worker creation silently fails inside createFFmpegCore), fall
 * back to single-thread (core) which doesn't use pthreads.
 *
 * - core-mt: ~31 MB WASM, pthread parallelism, growable SharedArrayBuffer
 * - core:    ~9.3 MB WASM, no pthreads, 256 MB ArrayBuffer limit
 */
const CORE_MT_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/umd';
const CORE_ST_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';

/**
 * Wraps the ffmpeg.wasm FFmpeg instance with lifecycle management,
 * error tracking, and progress reporting.
 *
 * Design notes:
 * - Three-part fix for GitHub Pages + WebKit: UMD build, toBlobURL for
 *   same-origin blob URLs, and postbuild strips {type:"module"} from Workers
 * - Single-thread fallback when core-mt pthread worker creation hangs
 * - Pre-flight Worker diagnostic test verifies Worker infrastructure
 * - Progress events are forwarded via a pluggable callback
 */
export class FFmpegEngine {
  private ffmpeg: FFmpeg;
  private loaded = false;
  private lastError: string | null = null;
  private progressCallback: ((event: ProgressEvent) => void) | null = null;
  private logCallback: ((message: string) => void) | null = null;
  private diagLog: EngineLogger | null = null;
  /** Which core was loaded: 'mt' (multi-thread) or 'st' (single-thread) */
  private coreType: 'mt' | 'st' | null = null;

  constructor() {
    this.ffmpeg = new FFmpeg();
    this.setupProgressHandler();
    this.setupLogHandler();
  }

  /** Sets a callback for ffmpeg log/stderr output. */
  setLogCallback(cb: ((message: string) => void) | null): void {
    this.logCallback = cb;
  }

  /** Sets a diagnostic logger for tracking the load process. */
  setDiagLogger(logger: EngineLogger | null): void {
    this.diagLog = logger;
  }

  /** Returns which core variant was loaded. */
  getCoreType(): 'mt' | 'st' | null {
    return this.coreType;
  }

  /** Registers the ffmpeg log/stderr listener. */
  private setupLogHandler(): void {
    this.ffmpeg.on('log', ({ message }) => {
      if (this.logCallback && message) {
        this.logCallback(message);
      }
    });
  }

  /** Registers the ffmpeg progress listener that forwards to the current callback. */
  private setupProgressHandler(): void {
    this.ffmpeg.on('progress', ({ progress, time }) => {
      if (this.progressCallback) {
        this.progressCallback({
          percent: Math.round(progress * 100),
          frames: 0,
          speed: '',
          time,
        });
      }
    });
  }

  /** Returns true if ffmpeg.wasm has been initialized and is ready. */
  isLoaded(): boolean {
    return this.loaded;
  }

  /** Returns the last error message, or null if no error occurred. */
  getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Pre-flight diagnostic: creates a minimal classic Worker that tests
   * the full Worker infrastructure before attempting ffmpeg load:
   *   1. Classic Worker creation + postMessage round-trip
   *   2. fetch() of a small CDN file from inside the Worker (COEP test)
   *   3. importScripts() of a blob URL from inside the Worker
   *
   * Returns timing info or throws with the specific failure reason.
   */
  private async diagnosticWorkerTest(): Promise<string> {
    const t0 = performance.now();
    const log = this.diagLog ?? (() => {});

    // Fetch the core JS to embed in a blob for the importScripts test.
    const coreJS = await fetch(`${CORE_ST_BASE}/ffmpeg-core.js`)
      .then(r => r.text());

    const blob = new Blob([coreJS], { type: 'text/javascript' });
    const coreBlobURL = URL.createObjectURL(blob);

    // Diagnostic worker that tests fetch + importScripts + createFFmpegCore
    const workerCode = `
      var results = [];

      function fail(msg) {
        self.postMessage({ type: 'error', message: msg });
      }

      self.onerror = function(ev) {
        self.postMessage({ type: 'error', message: 'Worker error: ' + (ev.message || 'unknown') });
      };

      self.onmessage = function(e) {
        var t0 = Date.now();

        // Test 1: fetch a small CDN file (COEP test — CORP: cross-origin, CORS: *)
        var t1 = Date.now();
        fetch(e.data.fetchURL, { credentials: 'same-origin' })
          .then(function(r) {
            if (!r.ok) { fail('fetch returned ' + r.status); return; }
            return r.arrayBuffer();
          })
          .then(function(buf) {
            results.push('PASS: fetch CDN URL: ' + (Date.now() - t1) + 'ms, ' + (buf.byteLength / 1024).toFixed(0) + 'KB');

            // Test 2: importScripts of blob URL (loads Emscripten core JS)
            var t2 = Date.now();
            try {
              importScripts(e.data.blobURL);
              results.push('PASS: importScripts blob: ' + (Date.now() - t2) + 'ms, createFFmpegCore=' + (typeof self.createFFmpegCore));
            } catch (err) {
              results.push('FAIL: importScripts blob: ' + err.message);
              self.postMessage({ type: 'done', results: results });
              return;
            }

            // Test 3: pre-load WASM + call createFFmpegCore (Emscripten init)
            var t3 = Date.now();
            fetch(e.data.wasmURL)
              .then(function(r) { return r.arrayBuffer(); })
              .then(function(wasmBuf) {
                results.push('PASS: fetch WASM in Worker: ' + (Date.now() - t3) + 'ms, ' + (wasmBuf.byteLength / 1024 / 1024).toFixed(1) + 'MB');

                // Pass wasmBinary directly to createFFmpegCore().
                // The function signature is function(createFFmpegCore={})
                // which uses the argument as Module — self.Module is NOT read.
                var t4 = Date.now();
                try {
                  var promise = self.createFFmpegCore({
                    wasmBinary: wasmBuf,
                  });
                  if (promise && typeof promise.then === 'function') {
                    // Add a 10s timeout for the diagnostic
                    var timeout = setTimeout(function() {
                      fail('createFFmpegCore timed out after 10s — WASM init hangs');
                    }, 10000);

                    promise.then(function(core) {
                      clearTimeout(timeout);
                      results.push('PASS: createFFmpegCore: ' + (Date.now() - t4) + 'ms');
                      self.postMessage({ type: 'done', results: results });
                    }).catch(function(err) {
                      clearTimeout(timeout);
                      results.push('FAIL: createFFmpegCore rejected: ' + (err.message || err));
                      self.postMessage({ type: 'done', results: results });
                    });
                  } else {
                    results.push('PASS: createFFmpegCore sync: ' + (Date.now() - t4) + 'ms');
                    self.postMessage({ type: 'done', results: results });
                  }
                } catch (err) {
                  results.push('FAIL: createFFmpegCore threw: ' + (err.message || err));
                  self.postMessage({ type: 'done', results: results });
                }
              })
              .catch(function(err) {
                results.push('FAIL: fetch WASM in Worker: ' + (err.message || err));
                self.postMessage({ type: 'done', results: results });
              });
          })
          .catch(function(err) {
            fail('fetch CDN URL failed: ' + err.message);
          });
      };
    `;
    const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
    const workerBlobURL = URL.createObjectURL(workerBlob);

    // Use the worker.js CDN URL for the fetch test — small file with proper headers
    // (core-mt worker.js is ~2KB, has CORS + CORP headers)
    const fetchTestURL = `${CORE_MT_BASE}/ffmpeg-core.worker.js`;

    try {
      const result = await new Promise<string>((resolve, reject) => {
        const worker = new Worker(workerBlobURL); // classic Worker (no type option)
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error('Diagnostic Worker timed out after 10s'));
        }, 10_000);

        worker.onmessage = (ev: MessageEvent) => {
          clearTimeout(timeout);
          worker.terminate();

          if (ev.data.type === 'error') {
            reject(new Error(`Diagnostic Worker: ${ev.data.message}`));
            return;
          }

          const lines: string[] = ev.data.results || [];
          const summary = lines.join(' | ');
          log('info', `🔧 Diag Worker results: ${summary}`);
          resolve(`Worker diag: ${summary} (${(performance.now() - t0).toFixed(0)}ms total)`);
        };

        worker.onerror = (ev) => {
          clearTimeout(timeout);
          worker.terminate();
          const fields = ['message', 'filename', 'lineno', 'colno']
            .map((k) => `${k}=${(ev as unknown as Record<string, unknown>)[k] ?? 'undefined'}`)
            .join(', ');
          reject(new Error(`Diagnostic Worker failed to load: ${fields}`));
        };

        worker.postMessage({ fetchURL: fetchTestURL, blobURL: coreBlobURL, wasmURL: `${CORE_ST_BASE}/ffmpeg-core.wasm` });
      });

      URL.revokeObjectURL(workerBlobURL);
      URL.revokeObjectURL(coreBlobURL);
      return result;
    } catch (err) {
      URL.revokeObjectURL(workerBlobURL);
      URL.revokeObjectURL(coreBlobURL);
      throw err;
    }
  }

  /**
   * Fetches core files for ffmpeg.wasm initialization.
   *
   * Strategy (hybrid blob + direct CDN):
   * - coreURL: blob URL (from toBlobURL) — required for importScripts()
   *   to work on WebKit under COEP. importScripts(crossOriginURL) hangs.
   * - wasmURL: direct CDN URL — Emscripten loads WASM via fetch(), which
   *   works with CDN's cross-origin-resource-policy: cross-origin header.
   *   Blob URLs for WASM may cause WebAssembly.instantiateStreaming to
   *   fail on WebKit due to MIME/content-encoding handling differences.
   * - workerURL: direct CDN URL — same reasoning as wasmURL. Emscripten
   *   creates pthread Workers from this URL via new Worker(), which
   *   works with CDN URLs (they have proper CORS + CORP headers).
   *
   * workerURL is omitted for single-thread core (no pthreads).
   */
  private async fetchCoreFiles(
    baseURL: string,
    variant: 'mt' | 'st'
  ): Promise<{ coreURL: string; wasmURL: string; workerURL?: string }> {
    const log = this.diagLog ?? (() => {});
    const label = variant === 'mt' ? 'core-mt' : 'core';

    log('info', `⬇️ Fetching ${label} core files...`);
    const t0 = performance.now();

    // core.js: MUST be blob URL (importScripts needs same-origin on WebKit)
    const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
    log('info', `⬇️ ${label} ffmpeg-core.js (blob): ${(performance.now() - t0).toFixed(0)}ms`);

    // wasm: direct CDN URL (fetch() works with CDN CORP headers)
    const wasmURL = `${baseURL}/ffmpeg-core.wasm`;
    log('info', `⬇️ ${label} ffmpeg-core.wasm (CDN): resolved`);

    let workerURL: string | undefined;
    if (variant === 'mt') {
      // worker.js: direct CDN URL (new Worker() with CDN URL works)
      workerURL = `${baseURL}/ffmpeg-core.worker.js`;
      log('info', `⬇️ ${label} ffmpeg-core.worker.js (CDN): resolved`);
    }

    log('info', `✅ ${label} core files ready (${(performance.now() - t0).toFixed(0)}ms total)`);

    return { coreURL, wasmURL, workerURL };
  }

  /**
   * Attempts to load a specific core variant with a timeout.
   * Pre-fetches the WASM binary on the main thread and passes it to the
   * Worker so Emscripten can use Module.wasmBinary — bypassing any
   * Worker-side fetch()/WebAssembly.instantiate issues on WebKit+COEP.
   */
  private async tryLoad(
    baseURL: string,
    variant: 'mt' | 'st',
    timeoutMs: number
  ): Promise<void> {
    const log = this.diagLog ?? (() => {});
    const label = variant === 'mt' ? 'core-mt (multi-thread)' : 'core (single-thread)';

    // Fetch core files: core.js as blob (for importScripts), wasm/worker as CDN URLs.
    const { coreURL, wasmURL, workerURL } = await this.fetchCoreFiles(baseURL, variant);

    // Pre-fetch WASM binary on main thread. Emscripten checks Module.wasmBinary
    // first — if set, it skips fetch() and uses the pre-loaded ArrayBuffer.
    // This bypasses WebAssembly.instantiate(fetch(cdnURL)) issues on WebKit+COEP.
    log('info', `⬇️ Pre-fetching ${label} WASM binary (~${variant === 'mt' ? '31' : '9'} MB)...`);
    const t1 = performance.now();
    const wasmResponse = await fetch(wasmURL);
    if (!wasmResponse.ok) throw new Error(`WASM fetch failed: ${wasmResponse.status}`);
    const wasmBinary = await wasmResponse.arrayBuffer();
    log('info', `⬇️ ${label} WASM binary: ${(wasmBinary.byteLength / 1024 / 1024).toFixed(1)} MB in ${(performance.now() - t1).toFixed(0)}ms`);

    // Build load config. wasmBinary reaches the worker via structured clone
    // (copied, not transferred — acceptable overhead for 9-31 MB).
    const config: Record<string, unknown> = { coreURL, wasmURL, wasmBinary };
    if (workerURL) config.workerURL = workerURL;

    const isolated = typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false;
    const cores = navigator.hardwareConcurrency ?? 'unknown';

    log('info', `⚙️ Initializing ${label} (pre-loaded WASM, timeout: ${(timeoutMs / 1000).toFixed(0)}s)...`);
    const t2 = performance.now();

    await Promise.race([
      this.ffmpeg.load(config as Parameters<typeof this.ffmpeg.load>[0]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(
          `${label} load timed out after ${(timeoutMs / 1000).toFixed(0)}s. ` +
          `isolated=${isolated}, cores=${cores}`
        )), timeoutMs)
      ),
    ]);

    log('info', `✅ ${label} initialized in ${(performance.now() - t2).toFixed(0)}ms`);
  }

  /**
   * Loads ffmpeg.wasm from CDN using blob URLs (UMD build).
   *
   * Strategy:
   *   1. Run diagnostic Worker test (verify Worker infrastructure)
   *   2. Try core-mt (multi-thread, pthreads) with 15s timeout
   *   3. If core-mt fails, terminate + try core (single-thread) with 30s timeout
   *
   * Idempotent — safe to call multiple times.
   */
  async load(): Promise<void> {
    if (this.loaded) return;
    const log = this.diagLog ?? (() => {});
    const t0 = performance.now();

    // ── Step 0: Diagnostic Worker test ──
    try {
      const diagResult = await this.diagnosticWorkerTest();
      log('info', `🔧 Diagnostic Worker test: ${diagResult}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log('error', `❌ Diagnostic Worker test failed: ${message}`);
      this.lastError = `Worker infrastructure broken: ${message}`;
      throw err;
    }

    // ── Step 1: Try core-mt ──
    try {
      await this.tryLoad(CORE_MT_BASE, 'mt', 15_000);
      this.loaded = true;
      this.coreType = 'mt';
      this.lastError = null;
      log('info', `✅ ffmpeg.wasm (core-mt) ready in ${(performance.now() - t0).toFixed(0)}ms total`);
      return;
    } catch (mtErr) {
      const mtMsg = mtErr instanceof Error ? mtErr.message : 'Unknown error';
      log('warn', `⚠️ core-mt failed: ${mtMsg}`);
      log('info', '🔄 Falling back to single-thread core...');

      // Terminate the failed ffmpeg instance and create a fresh one.
      this.ffmpeg.terminate();
      this.ffmpeg = new FFmpeg();
      this.setupProgressHandler();
      this.setupLogHandler();
    }

    // ── Step 2: Fall back to core (single-thread) ──
    try {
      await this.tryLoad(CORE_ST_BASE, 'st', 30_000);
      this.loaded = true;
      this.coreType = 'st';
      this.lastError = null;
      log('info', `✅ ffmpeg.wasm (core, single-thread) ready in ${(performance.now() - t0).toFixed(0)}ms total`);
    } catch (stErr) {
      const message = stErr instanceof Error ? stErr.message : 'Unknown error loading ffmpeg';
      this.lastError = message;
      log('error', `❌ Both core variants failed. Last error: ${message}`);
      throw stErr;
    }
  }

  /**
   * Executes an ffmpeg command in the Web Worker's virtual filesystem.
   * All input files must already be written via writeFile().
   * Output files are read back via readFile().
   */
  async execCommand(
    args: string[],
    onProgress?: (event: ProgressEvent) => void
  ): Promise<void> {
    if (!this.loaded) {
      throw new Error('FFmpeg not loaded. Call load() first.');
    }

    this.progressCallback = onProgress ?? null;

    try {
      await this.ffmpeg.exec(args);
    } finally {
      this.progressCallback = null;
    }
  }

  /** Writes a file into ffmpeg's in-memory virtual filesystem.
   * Clones data internally to prevent ArrayBuffer detachment
   * when postMessage transfers the buffer to the Web Worker.
   */
  async writeFile(path: string, data: Uint8Array): Promise<void> {
    await this.ffmpeg.writeFile(path, new Uint8Array(data));
  }

  /** Reads a file from ffmpeg's virtual filesystem. Throws if not found. */
  async readFile(path: string): Promise<Uint8Array> {
    const data = await this.ffmpeg.readFile(path);
    return data as Uint8Array;
  }

  /** Deletes a file from the virtual filesystem. */
  async deleteFile(path: string): Promise<void> {
    await this.ffmpeg.deleteFile(path);
  }

  /** Renames a file within the virtual filesystem. */
  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.ffmpeg.rename(oldPath, newPath);
  }

  /**
   * Loads a file (URL, File, or Blob) into a Uint8Array.
   * Uses ffmpeg.wasm's fetchFile utility under the hood.
   */
  async loadFile(source: string | File | Blob): Promise<Uint8Array> {
    return await fetchFile(source);
  }

  /**
   * Terminates the ffmpeg Web Worker and clears all virtual filesystem state.
   * A new load() is required before further operations.
   */
  terminate(): void {
    this.ffmpeg.terminate();
    this.loaded = false;
    this.coreType = null;
    this.lastError = null;
  }
}
