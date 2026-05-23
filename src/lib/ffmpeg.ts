import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import type { ProgressEvent } from '../types';

/**
 * CDN base URL for ffmpeg.wasm core files.
 * Fetched dynamically to avoid bundling 31MB+ of WebAssembly.
 */
const BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';

/**
 * Wraps the ffmpeg.wasm FFmpeg instance with lifecycle management,
 * error tracking, and progress reporting.
 *
 * Design notes:
 * - Uses toBlobURL() to avoid CORS issues with importScripts() inside the worker
 * - Progress events are forwarded via a pluggable callback (set per execCommand call)
 * - The virtual filesystem (MEMFS) is ephemeral — all files must be written,
 *   processed, and read back within a single session
 */
export class FFmpegEngine {
  private ffmpeg: FFmpeg;
  private loaded = false;
  private lastError: string | null = null;
  private progressCallback: ((event: ProgressEvent) => void) | null = null;

  constructor() {
    this.ffmpeg = new FFmpeg();
    this.setupProgressHandler();
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
   * Downloads and initializes ffmpeg.wasm from the CDN.
   * Idempotent — safe to call multiple times.
   * Throws if the core files cannot be fetched or the WASM runtime fails.
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const coreURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, 'application/wasm');

      await this.ffmpeg.load({ coreURL, wasmURL });
      this.loaded = true;
      this.lastError = null;
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
