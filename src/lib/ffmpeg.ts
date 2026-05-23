import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import type { ProgressEvent } from '../types';

const BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';

export class FFmpegEngine {
  private ffmpeg: FFmpeg;
  private loaded = false;
  private lastError: string | null = null;
  private progressCallback: ((event: ProgressEvent) => void) | null = null;

  constructor() {
    this.ffmpeg = new FFmpeg();
    this.setupProgressHandler();
  }

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

  isLoaded(): boolean {
    return this.loaded;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const coreURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, 'application/wasm');
      const workerURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript');

      await this.ffmpeg.load({ coreURL, wasmURL, workerURL });
      this.loaded = true;
      this.lastError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error loading ffmpeg';
      this.lastError = message;
      throw error;
    }
  }

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

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    await this.ffmpeg.writeFile(path, data);
  }

  async readFile(path: string): Promise<Uint8Array> {
    const data = await this.ffmpeg.readFile(path);
    return data as Uint8Array;
  }

  async deleteFile(path: string): Promise<void> {
    await this.ffmpeg.deleteFile(path);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.ffmpeg.rename(oldPath, newPath);
  }

  async loadFile(source: string | File | Blob): Promise<Uint8Array> {
    return await fetchFile(source);
  }

  terminate(): void {
    this.ffmpeg.terminate();
    this.loaded = false;
    this.lastError = null;
  }
}
