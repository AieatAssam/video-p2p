/**
 * Per-frame Canvas2D effect application — shared between export pipeline
 * and live preview. Applies effects in order: crop → color grade → blur
 * → vignette → filter preset → pixelate → text overlay.
 *
 * Skip slow pixel-level effects (chroma key, glitch) in live preview mode.
 */
import type { EffectInput } from '@/lib/effects';

const FILTER_PRESET_CSS: Record<string, string> = {
  grayscale: 'grayscale(1)',
  sepia: 'sepia(1)',
  invert: 'invert(1)',
  vintage: 'sepia(0.5) contrast(1.2) saturate(0.6)',
  'night-vision': 'brightness(1.3) contrast(1.5) saturate(4) hue-rotate(60deg)',
};

export interface EffectFrameOptions {
  /** Source: HTMLVideoElement (live) or HTMLCanvasElement/ImageBitmap (export) */
  source: CanvasImageSource;
  /** Source dimensions */
  srcWidth: number;
  srcHeight: number;
  /** Output canvas 2D context */
  ctx: CanvasRenderingContext2D;
  /** Output dimensions */
  outW: number;
  outH: number;
  /** Effects to apply */
  effects: EffectInput[];
  /** Skip slow effects (chroma key, glitch pixel shifts) for real-time */
  live: boolean;
}

/**
 * Apply one frame of effects to a canvas context.
 * Draws the source, then layers effects on top cumulatively.
 */
export function applyEffectsToFrame(opts: EffectFrameOptions): void {
  const { source, srcWidth, srcHeight, ctx, outW, outH, effects, live } = opts;

  ctx.clearRect(0, 0, outW, outH);

  // ── Crop ──
  const cropEffect = effects.find((e) => e.type === 'crop');
  if (cropEffect?.params) {
    const cp = cropEffect.params as { x: number; y: number; width: number; height: number };
    ctx.drawImage(source, cp.x, cp.y, cp.width, cp.height, 0, 0, outW, outH);
  } else {
    ctx.drawImage(source, 0, 0, outW, outH);
  }

  // ── Color grade (CSS filter) ──
  const colorEffect = effects.find((e) => e.type === 'colorGrade');
  if (colorEffect?.params) {
    const cp = colorEffect.params as { brightness?: number; contrast?: number; saturation?: number };
    const filters: string[] = [];
    if (cp.brightness !== undefined && cp.brightness !== 0) filters.push(`brightness(${1 + cp.brightness})`);
    if (cp.contrast !== undefined && cp.contrast !== 0) filters.push(`contrast(${1 + cp.contrast})`);
    if (cp.saturation !== undefined && cp.saturation !== 0) filters.push(`saturate(${1 + cp.saturation})`);
    if (filters.length > 0) {
      ctx.filter = filters.join(' ');
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.filter = 'none';
    }
  }

  // ── Blur ──
  const blurEffect = effects.find((e) => e.type === 'blur');
  if (blurEffect?.params) {
    const bp = blurEffect.params as { radius?: number };
    ctx.filter = `blur(${(bp.radius ?? 5)}px)`;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = 'none';
  }

  // ── Vignette ──
  const vignetteEffect = effects.find((e) => e.type === 'vignette');
  if (vignetteEffect?.params) {
    const vp = vignetteEffect.params as { radius?: number; softness?: number };
    const r = vp.radius ?? 0.5;
    const s = vp.softness ?? 0.3;
    const cx = outW / 2, cy = outH / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);
    const gradient = ctx.createRadialGradient(cx, cy, maxR * r, cx, cy, maxR);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1 - s, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, outW, outH);
  }

  // ── Filter preset (grayscale, sepia, etc.) ──
  const filterEffect = effects.find((e) => e.type === 'filter');
  if (filterEffect?.params) {
    const fp = filterEffect.params as { preset?: string };
    const css = FILTER_PRESET_CSS[fp.preset ?? ''];
    if (css) {
      ctx.filter = css;
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.filter = 'none';
    }
  }

  // ── Pixelate ──
  const pixelateEffect = effects.find((e) => e.type === 'pixelate');
  if (pixelateEffect?.params) {
    const pp = pixelateEffect.params as { blockSize?: number };
    const bs = pp.blockSize ?? 10;
    if (bs > 1) {
      const bw = Math.max(1, Math.round(outW / bs));
      const bh = Math.max(1, Math.round(outH / bs));
      const tmp = document.createElement('canvas');
      tmp.width = bw; tmp.height = bh;
      const tctx = tmp.getContext('2d')!;
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(ctx.canvas, 0, 0, bw, bh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, outW, outH);
      ctx.imageSmoothingEnabled = true;
    }
  }

  // ── Chroma key (skip in live mode — too slow) ──
  if (!live) {
    const chromaEffect = effects.find((e) => e.type === 'chromaKey');
    if (chromaEffect?.params) {
      const cp = chromaEffect.params as { color?: string; similarity?: number; blend?: number };
      const keyColor = cp.color ?? '0x00ff00';
      const similarity = cp.similarity ?? 0.4;
      const blend = cp.blend ?? 0.1;
      applyChromaKey(ctx, outW, outH, keyColor, similarity, blend);
    }
  }

  // ── Text overlay ──
  const textEffect = effects.find((e) => e.type === 'textOverlay');
  if (textEffect?.params) {
    const tp = textEffect.params as { text?: string; x?: number; y?: number; fontSize?: number; color?: string };
    if (tp.text) {
      ctx.font = `${tp.fontSize ?? 24}px sans-serif`;
      ctx.fillStyle = tp.color ?? '#ffffff';
      ctx.fillText(tp.text, tp.x ?? 10, tp.y ?? 30);
    }
  }
}

function applyChromaKey(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  hexColor: string,
  similarity: number,
  blend: number
) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hex = hexColor.replace('0x', '#');
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db) / 441;
    if (dist < similarity) {
      d[i + 3] = Math.round(Math.max(0, Math.min(1, (dist - similarity + blend) / blend)) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}
