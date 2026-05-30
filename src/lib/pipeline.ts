/**
 * Pipeline selector — decides the fastest export pipeline for a given
 * combination of effects and browser acceleration capabilities.
 *
 * Pipeline tiers (fastest → slowest):
 *   webcodecs — Canvas2D + MediaRecorder (GPU decode/encode, no WASM)
 *   hybrid   — WebCodecs decode + ffmpeg encode (GPU decode, ffmpeg filter)
 *   ffmpeg   — ffmpeg.wasm only (software decode, full filter graph)
 */
import type { EffectInput } from '@/lib/effects';
import type { LogEntry } from '@/types';

// ──────────────────────────────────────────
// Effect classification
// ──────────────────────────────────────────

/** Effects that can be done entirely in the browser via Canvas2D + MediaRecorder */
const WEBCodecs_COMPATIBLE = new Set<string>([
  'trim',
  'crop',
  'resize',
  'colorGrade',
  'blur',
  'pixelate',
  'textOverlay',
  'chromaKey',
  'splitScreen',
  'glitch',
  'stabilize',
  'filter',
]);

/** Effects that REQUIRE ffmpeg (or hybrid) — no browser-native equivalent */
const FFMPEG_ONLY = new Set<string>([
  'gif',
  'audioExtract',
  'audioReplace',
  'concat',
  'speed',
  'reverse',
]);

// Non-effect flags that affect pipeline choice
const EXPORT_FORMATS: Record<string, 'webcodecs' | 'ffmpeg-only'> = {
  mp4: 'webcodecs',
  gif: 'ffmpeg-only',
  audio: 'ffmpeg-only',
};

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

export type PipelineType = 'webcodecs' | 'ffmpeg' | 'hybrid';

export interface PipelineDecision {
  pipeline: PipelineType;
  reason: string;
  usedEffects: string[];
  skippedEffects: string[];
  audioHandling: 'preserved' | 'dropped' | 'ffmpeg-only';
  /** Effects that forced the fallback to ffmpeg */
  forcedBy: string[];
}

// ──────────────────────────────────────────
// Probe cache — populated once at app init
// ──────────────────────────────────────────

export interface AccelerationProbe {
  system: { cores: number; ramGb?: number; isolated: boolean };
  gpu: { vendor: string; renderer: string } | null;
  webgpu: boolean;
  codecs: Record<string, { supported: boolean; hw: boolean }>;
}

let _probeCache: AccelerationProbe | null = null;

export function getProbeCache(): AccelerationProbe | null {
  return _probeCache;
}

/**
 * Runs the full acceleration probe and caches the result.
 * Called once from Editor's initFfmpeg.
 */
export async function runAccelerationProbe(
  addLog: (level: LogEntry['level'], message: string) => void
): Promise<AccelerationProbe> {
  const info: AccelerationProbe = {
    system: {
      cores: navigator.hardwareConcurrency,
      ramGb: (navigator as unknown as { deviceMemory?: number }).deviceMemory,
      isolated: crossOriginIsolated,
    },
    gpu: null,
    webgpu: typeof navigator.gpu !== 'undefined',
    codecs: {},
  };

  // System info
  addLog(
    'debug',
    `🔧 System: ${info.system.cores} logical cores${info.system.ramGb ? `, ${info.system.ramGb} GB RAM` : ''}, crossOriginIsolated=${info.system.isolated}`
  );

  // GPU probe
  const c = document.createElement('canvas');
  const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
  if (gl) {
    info.gpu = {
      vendor: String(gl.getParameter(gl.VENDOR)),
      renderer: String(gl.getParameter(gl.RENDERER)),
    };
    addLog('info', `🎮 GPU: ${info.gpu.vendor} — ${info.gpu.renderer}`);
  } else {
    addLog('warn', '🎮 GPU: WebGL not available');
  }

  // WebGPU
  addLog('info', `⚡ WebGPU: ${info.webgpu ? 'available' : 'not available'}`);

  // MediaCapabilities probe — only checks codecs, not per-file
  const codecTests = [
    { name: 'H.264', ctype: 'video/mp4; codecs="avc1.42E01E"', w: 1920, h: 1080, br: 5000 },
    { name: 'H.264-4K', ctype: 'video/mp4; codecs="avc1.42E01E"', w: 3840, h: 2160, br: 20000 },
    { name: 'HEVC', ctype: 'video/mp4; codecs="hev1.1.6.L120.90"', w: 1920, h: 1080, br: 5000 },
    { name: 'HEVC-4K', ctype: 'video/mp4; codecs="hev1.1.6.L150.90"', w: 3840, h: 2160, br: 20000 },
    { name: 'VP9', ctype: 'video/webm; codecs="vp09.00.10.08"', w: 1920, h: 1080, br: 5000 },
    { name: 'AV1', ctype: 'video/webm; codecs="av01.0.01M.08"', w: 1920, h: 1080, br: 5000 },
  ];

  if (navigator.mediaCapabilities) {
    for (const test of codecTests) {
      try {
        const result = await navigator.mediaCapabilities.decodingInfo({
          type: 'file',
          video: {
            contentType: test.ctype,
            width: test.w,
            height: test.h,
            bitrate: test.br,
            framerate: 30,
          },
        });
        info.codecs[test.name] = { supported: result.supported, hw: result.powerEfficient };
        const label = result.powerEfficient
          ? '🟢 HW'
          : result.supported
            ? '🟡 SW'
            : '🔴 unsupported';
        addLog('debug', `  Codec ${test.name}: ${label} decode`);
      } catch {
        addLog('debug', `  Codec ${test.name}: ⚪ skipped`);
      }
    }
  } else {
    addLog('warn', '📺 MediaCapabilities API not available');
  }

  // Fallback canPlayType sniff
  const v = document.createElement('video');
  const sniff = [
    { name: 'H.264', type: 'video/mp4; codecs="avc1.42E01E"' },
    { name: 'HEVC', type: 'video/mp4; codecs="hev1.1.6.L120.90"' },
    { name: 'VP9', type: 'video/webm; codecs="vp9"' },
    { name: 'AV1', type: 'video/webm; codecs="av01.0.01M.08"' },
  ];
  const results = sniff
    .map((t) => {
      const r = v.canPlayType(t.type);
      return r ? `${t.name}=${r}` : null;
    })
    .filter(Boolean)
    .join(', ');
  if (results) addLog('debug', `📺 canPlayType: ${results}`);

  _probeCache = info;
  return info;
}

/**
 * Probes acceleration for a specific loaded file.
 * Returns the codec names tested and their HW/SW status.
 */
export async function probeFileAcceleration(
  file: File,
  addLog: (level: LogEntry['level'], message: string) => void
): Promise<{ codec: string; hw: boolean }[]> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const candidates: { name: string; ctype: string }[] = [];

  if (ext === 'mp4' || ext === 'mov' || ext === 'm4v') {
    candidates.push(
      { name: 'HEVC', ctype: 'video/mp4; codecs="hev1.1.6.L120.90"' },
      { name: 'H.264', ctype: 'video/mp4; codecs="avc1.42E01E"' }
    );
  } else if (ext === 'webm') {
    candidates.push(
      { name: 'VP9', ctype: 'video/webm; codecs="vp09.00.10.08"' },
      { name: 'AV1', ctype: 'video/webm; codecs="av01.0.01M.08"' }
    );
  }

  const results: { codec: string; hw: boolean }[] = [];
  if (!navigator.mediaCapabilities || candidates.length === 0) return results;

  for (const c of candidates) {
    try {
      const info = await navigator.mediaCapabilities.decodingInfo({
        type: 'file',
        video: { contentType: c.ctype, width: 1920, height: 1080, bitrate: 10000, framerate: 30 },
      });
      results.push({ codec: c.name, hw: info.powerEfficient });
      const label = info.powerEfficient ? '🟢 HW' : info.supported ? '🟡 SW' : '🔴 unsupported';
      addLog('info', `📺 ${c.name} decode for this file: ${label}`);
    } catch {
      // skip
    }
  }
  return results;
}

// ──────────────────────────────────────────
// Pipeline selection logic
// ──────────────────────────────────────────

export function selectPipeline(
  effects: EffectInput[],
  format: 'mp4' | 'gif' | 'audio',
  videoHasAudio: boolean,
  probe: AccelerationProbe | null,
  fileCodecProbe: { codec: string; hw: boolean }[]
): PipelineDecision {
  const usedEffects = effects.map((e) => e.type);
  const forcedBy: string[] = [];
  const skippedEffects: string[] = [];

  // ── Format check ──
  if (format === 'audio') {
    return {
      pipeline: 'ffmpeg',
      reason: 'Audio extraction requires ffmpeg',
      usedEffects,
      skippedEffects,
      audioHandling: 'ffmpeg-only',
      forcedBy: ['audio format'],
    };
  }

  if (format === 'gif') {
    // GIF: hybrid if HW decode available, otherwise ffmpeg
    const hevcHW = fileCodecProbe.some((p) => p.codec === 'HEVC' && p.hw)
      || (probe?.codecs['HEVC']?.hw === true)
      || (probe?.codecs['HEVC-4K']?.hw === true);
    // Also check H.264 HW as fallback
    const codecHW = fileCodecProbe.some((p) => p.hw)
      || Object.values(probe?.codecs ?? {}).some((c) => c.hw);

    if (codecHW) {
      return {
        pipeline: 'hybrid',
        reason: 'WebCodecs GPU decode + ffmpeg palettegen/paletteuse (HW decode available)',
        usedEffects,
        skippedEffects,
        audioHandling: 'dropped',
        forcedBy: ['gif format'],
      };
    }
    return {
      pipeline: 'ffmpeg',
      reason: 'No HW codec decode available — using ffmpeg.wasm for GIF',
      usedEffects,
      skippedEffects,
      audioHandling: 'dropped',
      forcedBy: ['gif format'],
    };
  }

  // ── MP4 format ──
  const ffmpegOnlyEffects = effects.filter((e) => FFMPEG_ONLY.has(e.type));
  const webcodecsEffects = effects.filter(
    (e) => WEBCodecs_COMPATIBLE.has(e.type) || e.type === 'trim' // trim is handled by range, not effect type
  );

  if (ffmpegOnlyEffects.length > 0) {
    // Some effects need ffmpeg — check if HW decode is available
    const hasHW = fileCodecProbe.some((p) => p.hw)
      || Object.values(probe?.codecs ?? {}).some((c) => c.hw);

    if (hasHW) {
      forcedBy.push(...ffmpegOnlyEffects.map((e) => e.type));
      // We can at least use WebCodecs decode + ffmpeg encode
      return {
        pipeline: 'hybrid',
        reason: `${ffmpegOnlyEffects.map((e) => e.type).join(', ')} requires ffmpeg — using hybrid (GPU decode)`,
        usedEffects,
        skippedEffects,
        audioHandling: videoHasAudio ? 'ffmpeg-only' : 'dropped',
        forcedBy,
      };
    }
    return {
      pipeline: 'ffmpeg',
      reason: `${ffmpegOnlyEffects.map((e) => e.type).join(', ')} requires ffmpeg — no HW decode available`,
      usedEffects,
      skippedEffects,
      audioHandling: videoHasAudio ? 'ffmpeg-only' : 'dropped',
      forcedBy,
    };
  }

  // ── All effects are WebCodecs-compatible ──
  if (webcodecsEffects.length >= 0) {
    // Check if the file's codec can be HW decoded
    const hasHW = fileCodecProbe.some((p) => p.hw)
      || (probe?.codecs['HEVC']?.hw === true)
      || (probe?.codecs['H.264']?.hw === true);

    if (hasHW) {
      return {
        pipeline: 'webcodecs',
        reason: 'All effects compatible with Canvas2D + MediaRecorder — GPU decode/encode',
        usedEffects,
        skippedEffects,
        audioHandling: videoHasAudio ? 'preserved' : 'dropped',
        forcedBy: [],
      };
    }

    // Even without HW, WebCodecs may still be faster than ffmpeg.wasm for simple effects
    // because Canvas2D operations are GPU-composited
    const codecName = fileCodecProbe[0]?.codec
      ?? (probe?.codecs['H.264']?.supported ? 'H.264' : probe?.codecs['HEVC']?.supported ? 'HEVC' : 'browser-native');
    const hwLabel = fileCodecProbe.some(p => p.hw) ? ' (HW)' : '';
    return {
      pipeline: 'webcodecs',
      reason: `All effects compatible with Canvas2D — using MediaRecorder (${codecName} decode${hwLabel})`,
      usedEffects,
      skippedEffects,
      audioHandling: videoHasAudio ? 'preserved' : 'dropped',
      forcedBy: [],
    };
  }

  // Fallback
  return {
    pipeline: 'ffmpeg',
    reason: 'Fallback to ffmpeg.wasm',
    usedEffects,
    skippedEffects,
    audioHandling: 'ffmpeg-only',
    forcedBy: ['unknown effects'],
  };
}
