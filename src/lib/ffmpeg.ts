import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { ProgressEvent } from '../types';
import type { LogEntry } from '../types';

/** Internal callback for diagnostic logging from the engine itself. */
type EngineLogger = (level: LogEntry['level'], message: string) => void;

/**
 * CDN base URL for ffmpeg.wasm core files.
 * Uses the multi-thread build (@ffmpeg/core-mt) which supports growable
 * SharedArrayBuffer memory and pthread-based parallelism for faster
 * processing of high-resolution video.
 *
 * CDN URLs are passed directly (no blob URL wrapping) since the CDN sends
 * both CORS (access-control-allow-origin: *) and CORP
 * (cross-origin-resource-policy: cross-origin) headers, satisfying the
 * COEP require-corp policy imposed by the cross-origin isolation SW.
 *
 * Multi-thread requirements:
 * - crossOriginIsolated=true (needed for SharedArrayBuffer + pthreads)
 * - workerURL for ffmpeg-core.worker.js (loaded by pthread workers)
 * - ~31 MB WASM binary (includes pthread support + extra codecs)
 */
const BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm';

/**
 * Wraps the ffmpeg.wasm FFmpeg instance with lifecycle management,
 * error tracking, and progress reporting.
 *
 * Design notes:
 * - Passes CDN URLs directly to @ffmpeg/ffmpeg (no blob URL wrapping)
 * - Progress events are forwarded via a pluggable callback (set per execCommand call)
 * - The virtual filesystem (MEMFS) is ephemeral — all files must be written,
 *   processed, and read back within a single session
 */
export class FFmpegEngine {
  private ffmpeg: FFmpeg;
  private loaded = false;
  private lastError: string | null = null;
  private progressCallback: ((event: ProgressEvent) => void) | null = null;
  private logCallback: ((message: string) => void) | null = null;
  private diagLog: EngineLogger | null = null;

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
   * Loads ffmpeg.wasm from CDN using direct URLs (multi-thread build).
   * Idempotent — safe to call multiple times.
   * Throws if the core files cannot be fetched or the WASM runtime fails.
   * Logs each step through the diag logger for debugging load failures.
   *
   * Core .js, .wasm, and .worker.js are passed as CDN URLs directly to
   * @ffmpeg/ffmpeg, which handles fetching inside the ESM Worker via
   * dynamic import() and fetch(). The multi-thread build also needs a
   * workerURL for pthread workers (ffmpeg-core.worker.js).
   *
   * No blob URL wrapping is used since CDN URLs have proper CORS headers
   * and CORP (cross-origin-resource-policy: cross-origin).
   */
  async load(): Promise<void> {
    if (this.loaded) return;
    const log = this.diagLog ?? (() => {});
    const t0 = performance.now();

    log('info', `🔌 FFmpeg load: CDN=${BASE_URL}`);

    try {
      // Core URL: ESM module loaded via dynamic import() inside @ffmpeg/ffmpeg Worker
      const coreURL = `${BASE_URL}/ffmpeg-core.js`;

      // WASM URL: fetched via fetch() inside the Worker, compiled
      // by WebAssembly.instantiateStreaming()
      const wasmURL = `${BASE_URL}/ffmpeg-core.wasm`;

      // Worker URL: loaded by pthread workers via importScripts() inside
      // the multi-thread WASM runtime. Needed for core-mt only.
      const workerURL = `${BASE_URL}/ffmpeg-core.worker.js`;

      // Use a diagnostic worker that logs each step of the load process
      // from inside the Worker, so we can see where exactly it hangs.
      const diagWorkerURL = new URL('./ffmpeg-diag-worker.js', import.meta.url).href;

      const classicWorkerURL = new URL('./ffmpeg-classic-worker.js', import.meta.url).href;

      // Test classic Worker (no type: 'module')
      try {
        log('info', `🧪 Creating CLASSIC Worker from: ${classicWorkerURL}`);
        const testWorker = new Worker(classicWorkerURL); // No type option = classic
        testWorker.onmessage = (ev) => {
          log('info', `🧪 CLASSIC WORKER ALIVE: type=${ev.data?.type} data=${JSON.stringify(ev.data?.data)?.substring(0, 200)}`);
        };
        testWorker.onerror = (ev) => {
          log('error', `🧪 CLASSIC WORKER ERROR: message=${ev.message} filename=${ev.filename} lineno=${ev.lineno} colno=${ev.colno} error=${String(ev.error)}`);
        };
        testWorker.postMessage({ type: 'PING', data: 'hello' });
      } catch (err) {
        log('error', `🧪 Failed to create classic Worker: ${err instanceof Error ? err.message : String(err)}`);
      }

      log('info', `⚙️ Initializing ffmpeg WASM runtime (core-mt, ~31 MB)...`);
      log('info', `👷 Diagnostic worker: ${diagWorkerURL}`);
      const t3 = performance.now();

      // 60s timeout: 31 MB WASM download + multi-thread compilation.
      const isolated = typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : true;
      const cores = navigator.hardwareConcurrency ?? 'unknown';
      const LOAD_TIMEOUT_MS = 60_000;
      await Promise.race([
        this.ffmpeg.load({ classWorkerURL: diagWorkerURL, coreURL, wasmURL, workerURL }), // core-mt with diag worker
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(
            `ffmpeg.wasm load timed out after ${LOAD_TIMEOUT_MS / 1000}s. ` +
            `CDN: ${BASE_URL}, isolated: ${isolated}, ` +
            `cores: ${cores}`
          )), LOAD_TIMEOUT_MS)
        ),
      ]);
      this.loaded = true;
      this.lastError = null;
      log('info', `✅ ffmpeg WASM initialized in ${(performance.now() - t0).toFixed(0)}ms total`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error loading ffmpeg';
      this.lastError = message;
      throw error;
    }
  }

  /**
   * Executes an ffmpeg command in the Web Worker's virtual filesystem.
   * All input files must already be written via writeFile().
   * Output files are read back via readFile().
   *
   * @param args - ffmpeg CLI arguments (e.g., ['-i', 'input.mp4', '-vf', 'scale=320:240', 'out.mp4'])
   * @param onProgress - Optional callback fired per progress tick with percent complete
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
    this.lastError = null;
  }
}
