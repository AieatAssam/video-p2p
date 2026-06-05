import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { FFmpegEngine } from '../../src/lib/ffmpeg';

// Mock Worker for diagnostic test
beforeAll(() => {
  // jsdom may not have Worker — provide a minimal mock
  if (typeof Worker === 'undefined') {
    (globalThis as unknown as Record<string, unknown>).Worker = vi.fn();
  }
});

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
    // Mock diagnosticWorker to succeed instantly (skip real Worker creation)
    vi.spyOn(FFmpegEngine.prototype as unknown as { diagnosticWorkerTest: () => Promise<string> }, 'diagnosticWorkerTest')
      .mockResolvedValue('Worker round-trip: 1ms (mocked)');
    engine = new FFmpegEngine();
  });

  describe('initial state', () => {
    it('starts as not loaded', () => {
      expect(engine.isLoaded()).toBe(false);
    });

    it('starts with no errors', () => {
      expect(engine.getLastError()).toBeNull();
    });

    it('starts with null core type', () => {
      expect(engine.getCoreType()).toBeNull();
    });
  });

  describe('load()', () => {
    it('loads ffmpeg.wasm and sets loaded state (core-mt succeeds)', async () => {
      await engine.load();
      expect(engine.isLoaded()).toBe(true);
      expect(engine.getCoreType()).toBe('mt');
    });

    it('does not throw when loading twice', async () => {
      await engine.load();
      await expect(engine.load()).resolves.not.toThrow();
    });

    it('falls back to single-thread when core-mt fails', async () => {
      // Override the internal ffmpeg.load to fail on first call, succeed on second
      const ffmpeg = (engine as unknown as { ffmpeg: { load: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> } }).ffmpeg;
      ffmpeg.load
        .mockRejectedValueOnce(new Error('core-mt timed out'))
        .mockResolvedValueOnce(undefined);

      await engine.load();
      expect(engine.isLoaded()).toBe(true);
      expect(engine.getCoreType()).toBe('st');
    });

    it('reports error if both core variants fail', async () => {
      // The fallback path creates a new FFmpeg instance, so we need both
      // instances' load to reject. Save the original mock, override,
      // then restore to prevent leaking into other tests.
      const { FFmpeg: MockFFmpeg } = await import('@ffmpeg/ffmpeg');
      const origImpl = (MockFFmpeg as ReturnType<typeof vi.fn>).getMockImplementation();

      try {
        (MockFFmpeg as ReturnType<typeof vi.fn>).mockImplementation(() => ({
          load: vi.fn().mockRejectedValue(new Error('Core not found')),
          on: vi.fn(),
          off: vi.fn(),
          terminated: false,
          writeFile: vi.fn().mockResolvedValue(undefined),
          readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
          deleteFile: vi.fn().mockResolvedValue(undefined),
          rename: vi.fn().mockResolvedValue(undefined),
          exec: vi.fn().mockResolvedValue(undefined),
          terminate: vi.fn(),
        }));

        const badEngine = new FFmpegEngine();
        await expect(badEngine.load()).rejects.toThrow();
        expect(badEngine.getLastError()).toBeTruthy();
      } finally {
        (MockFFmpeg as ReturnType<typeof vi.fn>).mockImplementation(origImpl);
      }
    });
  });

  describe('execCommand()', () => {
    it('throws if not loaded', async () => {
      await expect(engine.execCommand(['-version'])).rejects.toThrow('not loaded');
    });

    it('executes ffmpeg commands successfully', async () => {
      await engine.load();
      await engine.execCommand(['-i', 'input.mp4', 'output.mp4']);
    });

    it('accepts a progress callback', async () => {
      await engine.load();
      const onProgress = vi.fn();
      await engine.execCommand(
        ['-i', 'input.mp4', 'output.mp4'],
        onProgress
      );
    });
  });

  describe('file operations', () => {
    beforeEach(async () => {
      await engine.load();
    });

    it('writes files to the virtual filesystem', async () => {
      await engine.writeFile('test.mp4', new Uint8Array([1, 2, 3]));
    });

    it('reads files from the virtual filesystem', async () => {
      const data = await engine.readFile('test.mp4');
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBeGreaterThan(0);
    });

    it('deletes files from the virtual filesystem', async () => {
      await engine.writeFile('temp.mp4', new Uint8Array([1, 2, 3]));
      await engine.deleteFile('temp.mp4');
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
      expect(engine.getCoreType()).toBeNull();
    });

    it('can be reset after termination', async () => {
      await engine.load();
      engine.terminate();
      await engine.load();
      expect(engine.isLoaded()).toBe(true);
    });
  });
});
