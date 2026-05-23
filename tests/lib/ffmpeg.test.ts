import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FFmpegEngine } from '../../src/lib/ffmpeg';

// Mock the ffmpeg.wasm library since it requires browser APIs
vi.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
    terminated: false,
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
  })),
}));

vi.mock('@ffmpeg/util', () => ({
  toBlobURL: vi.fn().mockResolvedValue('blob:test'),
  fetchFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5])),
}));

describe('FFmpegEngine', () => {
  let engine: FFmpegEngine;

  beforeEach(() => {
    engine = new FFmpegEngine();
  });

  describe('initial state', () => {
    it('starts as not loaded', () => {
      expect(engine.isLoaded()).toBe(false);
    });

    it('starts with no errors', () => {
      expect(engine.getLastError()).toBeNull();
    });
  });

  describe('load()', () => {
    it('loads ffmpeg.wasm and sets loaded state', async () => {
      await engine.load();
      expect(engine.isLoaded()).toBe(true);
    });

    it('does not throw when loading twice', async () => {
      await engine.load();
      await expect(engine.load()).resolves.not.toThrow();
    });

    it('reports error if ffmpeg fails to load', async () => {
      // Make this specific engine's load fail
      const badEngine = new FFmpegEngine();
      // Override the internal ffmpeg.load to reject
      (badEngine as any).ffmpeg.load = vi.fn().mockRejectedValue(new Error('Core not found'));
      await expect(badEngine.load()).rejects.toThrow('Core not found');
      expect(badEngine.getLastError()).toContain('Core not found');
    });
  });

  describe('execCommand()', () => {
    it('throws if not loaded', async () => {
      await expect(engine.execCommand(['-version'])).rejects.toThrow('not loaded');
    });

    it('executes ffmpeg commands successfully', async () => {
      await engine.load();
      await engine.execCommand(['-i', 'input.mp4', 'output.mp4']);
      // Should not throw
    });

    it('accepts a progress callback', async () => {
      await engine.load();
      const onProgress = vi.fn();
      await engine.execCommand(
        ['-i', 'input.mp4', 'output.mp4'],
        onProgress
      );
      // Should not throw
    });
  });

  describe('file operations', () => {
    beforeEach(async () => {
      await engine.load();
    });

    it('writes files to the virtual filesystem', async () => {
      await engine.writeFile('test.mp4', new Uint8Array([1, 2, 3]));
      // Should not throw
    });

    it('reads files from the virtual filesystem', async () => {
      const data = await engine.readFile('test.mp4');
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBeGreaterThan(0);
    });

    it('deletes files from the virtual filesystem', async () => {
      await engine.writeFile('temp.mp4', new Uint8Array([1, 2, 3]));
      await engine.deleteFile('temp.mp4');
      // Should not throw
    });

    it('loads an external file via fetchFile', async () => {
      const data = await engine.loadFile('https://example.com/video.mp4');
      expect(data).toBeInstanceOf(Uint8Array);
    });
  });

  describe('lifecycle', () => {
    it('can be terminated', async () => {
      await engine.load();
      engine.terminate();
      expect(engine.isLoaded()).toBe(false);
    });

    it('can be reset after termination', async () => {
      await engine.load();
      engine.terminate();
      await engine.load();
      expect(engine.isLoaded()).toBe(true);
    });
  });
});
