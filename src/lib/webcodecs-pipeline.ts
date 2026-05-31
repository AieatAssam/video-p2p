/**
 * WebCodecs-based export pipeline using <video> + Canvas2D + MediaRecorder.
 *
 * How it works:
 *   1. Play the source video (GPU-decoded via <video>) into a hidden canvas
 *   2. Apply Canvas2D effects (crop, resize, color grade, blur, text, etc.)
 *   3. canvas.captureStream() feeds frames to a MediaRecorder
 *   4. MediaRecorder encodes + muxes into MP4 natively (browser handles H.264)
 *
 * Limitations:
 *   - Runs at real-time playback speed (a 10s video takes ~10s to export)
 *   - No GIF output (use hybrid/ffmpeg for that)
 *   - Audio may be dropped (separate pipeline needed for audio)
 *   - Can't do speed/reverse easily (needs frame-level control)
 */
import type { EffectInput } from '@/lib/effects';
import type { LogEntry } from '@/types';

const DEFAULT_FPS = 30;
const DEFAULT_OUTPUT_BITRATE = 5_000_000; // 5 Mbps

/** Map from filter preset names to CSS filter strings for Canvas2D rendering */
const FILTER_PRESET_CSS: Record<string, string> = {
  grayscale: 'grayscale(1)',
  sepia: 'sepia(1)',
  invert: 'invert(1)',
};

export interface WebCodecsExportOptions {
  videoUrl: string;           // blob: URL of the source
  effects: EffectInput[];      // Canvas2D-compatible effects only
  trimStart: number;
  trimEnd: number;
  outputWidth?: number;
  outputHeight?: number;
  outputBitrate?: number;
  mimeType?: string;           // e.g. 'video/mp4' or 'video/webm;codecs=vp9'
  addLog: (level: LogEntry['level'], message: string) => void;
  onProgress?: (event: { percent: number }) => void;
}

/**
 * Exports a video segment using the browser's native MediaRecorder pipeline.
 * Returns a Blob (MP4 or WebM depending on browser support).
 */
export async function exportWithMediaRecorder(
  options: WebCodecsExportOptions
): Promise<Blob> {
  const {
    videoUrl,
    effects,
    trimStart,
    trimEnd,
    outputWidth,
    outputHeight,
    outputBitrate = DEFAULT_OUTPUT_BITRATE,
    mimeType = pickMimeType(),
    addLog,
    onProgress,
  } = options;

  addLog('info', `📺 MediaRecorder export: ${mimeType}`);

  // ── 1. Set up source video element ──
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Video load timed out')), 30000);
    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(timeout);
      const mediaError = video.error;
      const detail = mediaError
        ? `[${['', 'ABORTED', 'NETWORK', 'DECODE', 'SRC_NOT_SUPPORTED'][mediaError.code] || mediaError.code}]${mediaError.message ? ': ' + mediaError.message : ''}`
        : '(no error details)';
      reject(new Error(`Video failed to load ${detail}`));
    };
    // Check if already loaded
    if (video.readyState >= 2) {
      clearTimeout(timeout);
      resolve();
    }
  });

  const srcWidth = video.videoWidth;
  const srcHeight = video.videoHeight;
  const duration = trimEnd - trimStart;
  addLog(
    'debug',
    `  Source: ${srcWidth}x${srcHeight}, ${duration.toFixed(1)}s (trim ${trimStart.toFixed(1)}s → ${trimEnd.toFixed(1)}s)`
  );

  // ── 2. Determine output resolution ──
  let outW = outputWidth ?? srcWidth;
  let outH = outputHeight ?? srcHeight;

  // Apply resize effect if present
  const resizeEffect = effects.find((e) => e.type === 'resize');
  if (resizeEffect?.params) {
    const p = resizeEffect.params as { width?: number; height?: number; keepAspect?: boolean };
    if (p.width) outW = p.width;
    if (p.height) {
      outH = p.height;
    } else if (p.keepAspect) {
      outH = Math.round((outW / srcWidth) * srcHeight);
    }
  }

  // Apply crop effect — adjust canvas draw region
  const cropEffect = effects.find((e) => e.type === 'crop');

  // ── 3. Set up canvas + capture stream ──
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  addLog('debug', `  Output: ${outW}x${outH}`);

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Failed to get 2D context');

  // ── 4. Start MediaRecorder ──
  let recorder: MediaRecorder | null = null;
  try {
    const stream = canvas.captureStream(DEFAULT_FPS);
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: outputBitrate,
    });
  } catch (err) {
    // Fallback: let browser choose default
    addLog('warn', `  ${mimeType} not supported — trying browser default`);
    const stream = canvas.captureStream(DEFAULT_FPS);
    recorder = new MediaRecorder(stream, {
      videoBitsPerSecond: outputBitrate,
    });
  }

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordDone = new Promise<void>((resolve, reject) => {
    if (!recorder) return reject(new Error('Recorder not initialized'));
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('Recorder error'));
  });

  recorder.start(100); // collect data every 100ms for progress

  // ── 5. Render loop — seek and draw each frame ──
  const fps = 30;
  const totalFrames = Math.ceil(duration * fps);

  addLog('info', `  Rendering ${totalFrames} frames...`);

  for (let i = 0; i < totalFrames; i++) {
    const targetTime = trimStart + i / fps;

    // Seek
    video.currentTime = targetTime;
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        // Double rAF ensures frame is composited
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      };
      video.addEventListener('seeked', onSeeked, { once: true });
      // If already at the right position
      if (Math.abs(video.currentTime - targetTime) < 0.01) {
        video.removeEventListener('seeked', onSeeked);
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }
    });

    // Draw frame to canvas with effects
    ctx.clearRect(0, 0, outW, outH);

    // Crop: draw a sub-region of the source into the full output
    if (cropEffect?.params) {
      const cp = cropEffect.params as { x: number; y: number; width: number; height: number };
      ctx.drawImage(
        video,
        cp.x, cp.y, cp.width, cp.height, // source rect
        0, 0, outW, outH                   // dest rect (fill canvas)
      );
    } else {
      // Scale to fit
      ctx.drawImage(video, 0, 0, outW, outH);
    }

    // Apply color grade (basic brightness/contrast/saturation/gamma via CSS filter)
    const colorEffect = effects.find((e) => e.type === 'colorGrade');
    if (colorEffect?.params) {
      const cp = colorEffect.params as {
        brightness?: number;
        contrast?: number;
        saturation?: number;
        gamma?: number;
      };
      // Build CSS filter string
      const filters: string[] = [];
      if (cp.brightness !== undefined && cp.brightness !== 0) {
        filters.push(`brightness(${1 + cp.brightness})`);
      }
      if (cp.contrast !== undefined && cp.contrast !== 0) {
        filters.push(`contrast(${1 + cp.contrast})`);
      }
      if (cp.saturation !== undefined && cp.saturation !== 0) {
        filters.push(`saturate(${1 + cp.saturation})`);
      }
      if (filters.length > 0) {
        ctx.filter = filters.join(' ');
        // Redraw with filter
        ctx.drawImage(video, 0, 0, outW, outH);
        ctx.filter = 'none';
      }
    }

    // Apply blur
    const blurEffect = effects.find((e) => e.type === 'blur');
    if (blurEffect?.params) {
      const bp = blurEffect.params as { radius?: number };
      const radius = bp.radius ?? 5;
      ctx.filter = `blur(${radius}px)`;
      ctx.drawImage(video, 0, 0, outW, outH);
      ctx.filter = 'none';
    }

    // Apply filter preset (grayscale, sepia, invert via CSS)
    const filterEffect = effects.find((e) => e.type === 'filter');
    if (filterEffect?.params) {
      const fp = filterEffect.params as { preset?: string };
      const cssFilter = FILTER_PRESET_CSS[fp.preset ?? ''];
      if (cssFilter) {
        ctx.filter = cssFilter;
        ctx.drawImage(video, 0, 0, outW, outH);
        ctx.filter = 'none';
      }
    }

    // Apply pixelate (blocky effect via canvas scaling trick)
    const pixelateEffect = effects.find((e) => e.type === 'pixelate');
    if (pixelateEffect?.params) {
      const pp = pixelateEffect.params as { blockSize?: number };
      const blockSize = pp.blockSize ?? 10;
      if (blockSize > 1) {
        // Scale DOWN to block resolution, then scale back up with nearest-neighbor
        const bw = Math.max(1, Math.round(outW / blockSize));
        const bh = Math.max(1, Math.round(outH / blockSize));
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = bw;
        tempCanvas.height = bh;
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.imageSmoothingEnabled = false;
        tempCtx.drawImage(video, 0, 0, bw, bh);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, 0, 0, outW, outH);
        ctx.imageSmoothingEnabled = true;
      }
    }

    // Chroma key (pixel-level — slow, use sparingly)
    const chromaEffect = effects.find((e) => e.type === 'chromaKey');
    if (chromaEffect?.params) {
      const cp = chromaEffect.params as {
        color?: string;
        similarity?: number;
        blend?: number;
      };
      const keyColor = cp.color ?? '0x00ff00';
      const similarity = cp.similarity ?? 0.4;
      const blend = cp.blend ?? 0.1;
      applyChromaKey(ctx, outW, outH, keyColor, similarity, blend);
    }

    // Text overlay
    const textEffect = effects.find((e) => e.type === 'textOverlay');
    if (textEffect?.params) {
      const tp = textEffect.params as {
        text?: string;
        x?: number;
        y?: number;
        fontSize?: number;
        color?: string;
      };
      if (tp.text) {
        ctx.font = `${tp.fontSize ?? 24}px sans-serif`;
        ctx.fillStyle = tp.color ?? '#ffffff';
        ctx.fillText(tp.text, tp.x ?? 10, tp.y ?? 30);
      }
    }

    // Progress
    if (onProgress) {
      onProgress({ percent: ((i + 1) / totalFrames) * 100 });
    }
  }

  // ── 6. Done — stop recorder ──
  recorder?.stop();
  await recordDone;

  const blob = new Blob(chunks, { type: mimeType });
  addLog(
    'info',
    `  Export complete: ${(blob.size / 1024 / 1024).toFixed(1)} MB`
  );
  return blob;
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

/** Pick the best MP4 mime type the browser supports */
function pickMimeType(): string {
  const candidates = [
    'video/mp4;codecs=avc1.64001F', // H.264 High
    'video/mp4;codecs=avc1.42E01E', // H.264 Baseline
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return 'video/mp4'; // last resort
}

/** Pixel-level chroma key on a canvas */
function applyChromaKey(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hexColor: string,
  similarity: number,
  blend: number
) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Parse hex color (e.g. '0x00ff00' or '#00ff00')
  const hex = hexColor.replace('0x', '#');
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - r;
    const dg = data[i + 1] - g;
    const db = data[i + 2] - b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db) / 441; // normalize to ~0-1

    if (dist < similarity) {
      // Within key range — apply alpha
      const alpha = Math.max(0, Math.min(1, (dist - similarity + blend) / blend));
      data[i + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
