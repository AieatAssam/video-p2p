/**
 * Pipeline selection — always routes to WebCodecs (Canvas2D + MediaRecorder).
 *
 * ffmpeg.wasm was removed: it doesn't work on WebKit (Safari) even after
 * extensive debugging, and the browser-native pipeline handles all effects
 * via Canvas2D compositing with GPU-accelerated video decode.
 */
import type { EffectInput } from '@/lib/effects';
import type { LogEntry } from '@/types';

export type PipelineType = 'webcodecs';

export interface PipelineDecision {
  pipeline: PipelineType;
  reason: string;
  forcedBy: string[];
  audioHandling: 'preserved' | 'dropped';
}

/** Hardware acceleration probe result */
export interface AccelerationProbe {
  h264: boolean;
  hevc: boolean;
  vp9: boolean;
  av1: boolean;
  gpu: string;
  webgpu: boolean;
  codecDetails: Record<string, string>;
}

/** Codec information from file probe */
export type FileCodecProbe = { codec: string; hw: boolean }[];

/**
 * Selects the pipeline for export. Since ffmpeg was removed, always
 * returns webcodecs. Audio handling: dropped (MediaRecorder captures
 * canvas only — no audio track).
 */
export function selectPipeline(
  _effects: EffectInput[],
  format: string,
  _hasAudio: boolean,
  _probeCache?: AccelerationProbe | null,
  _fileCodecProbe?: FileCodecProbe
): PipelineDecision {
  return {
    pipeline: 'webcodecs',
    reason: `Browser-native WebCodecs pipeline (${format})`,
    forcedBy: [],
    audioHandling: 'dropped',
  };
}

/**
 * Runs a hardware acceleration probe using the browser's MediaCapabilities API.
 * Logs detailed codec support information for diagnostics.
 */
export async function runAccelerationProbe(
  addLog: (level: LogEntry['level'], message: string) => void
): Promise<AccelerationProbe> {
  const probe: AccelerationProbe = {
    h264: false,
    hevc: false,
    vp9: false,
    av1: false,
    gpu: 'unknown',
    webgpu: false,
    codecDetails: {},
  };

  // Detect GPU
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext & {
        getExtension(name: 'WEBGL_debug_renderer_info'): { UNMASKED_RENDERER_WEBGL: number } | null;
      }).getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = (gl as WebGLRenderingContext & {
          getParameter(pname: number): string;
        }).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        probe.gpu = renderer;
      }
    }
  } catch {
    probe.gpu = 'unavailable';
  }

  addLog('info', `🎮 GPU: ${probe.gpu}`);

  // WebGPU
  probe.webgpu = 'gpu' in navigator;
  addLog('info', `⚡ WebGPU: ${probe.webgpu ? 'available' : 'unavailable'}`);

  // Test codec support via MediaCapabilities
  if ('mediaCapabilities' in navigator) {
    const mc = navigator.mediaCapabilities as {
      decodingInfo(config: MediaDecodingConfiguration): Promise<MediaCapabilitiesDecodingInfo>;
    };

    const testConfigs: { label: string; codec: string; width: number; height: number }[] = [
      { label: 'H.264', codec: 'avc1.64001F', width: 1920, height: 1080 },
      { label: 'H.264-4K', codec: 'avc1.640033', width: 3840, height: 2160 },
      { label: 'HEVC', codec: 'hev1.1.6.L150.90', width: 1920, height: 1080 },
      { label: 'HEVC-4K', codec: 'hev1.2.4.L150.90', width: 3840, height: 2160 },
      { label: 'VP9', codec: 'vp09.00.10.08', width: 1920, height: 1080 },
      { label: 'AV1', codec: 'av01.0.04M.08', width: 1920, height: 1080 },
    ];

    for (const tc of testConfigs) {
      try {
        const info = await mc.decodingInfo({
          type: 'file',
          video: {
            contentType: `video/mp4;codecs=${tc.codec}`,
            width: tc.width,
            height: tc.height,
            bitrate: 10_000_000,
            framerate: 30,
          },
        });
        const hw = info.powerEfficient && info.supported;
        probe.codecDetails[tc.label] = hw ? '🟢 HW decode' : info.supported ? '🟡 SW decode' : '🔴 No';
        if (tc.label === 'H.264') probe.h264 = hw;
        else if (tc.label === 'HEVC') probe.hevc = hw;
        else if (tc.label === 'VP9') probe.vp9 = hw;
        else if (tc.label === 'AV1') probe.av1 = hw;
        addLog('debug', `  Codec ${tc.label}: ${probe.codecDetails[tc.label]}`);
      } catch {
        probe.codecDetails[tc.label] = '❌ Error';
      }
    }
  }

  // canPlayType fallback
  const video = document.createElement('video');
  const canPlay = (mime: string): string => video.canPlayType(mime);
  addLog(
    'debug',
    `📺 canPlayType: H.264=${canPlay('video/mp4;codecs=avc1.64001F')}, ` +
      `HEVC=${canPlay('video/mp4;codecs=hev1.1.6.L150.90')}, ` +
      `VP9=${canPlay('video/webm;codecs=vp9')}, ` +
      `AV1=${canPlay('video/mp4;codecs=av01.0.04M.08')}`
  );

  return probe;
}

/**
 * Probes a file's codec to determine hardware acceleration support.
 */
export function probeFileAcceleration(
  video: HTMLVideoElement,
  probe: AccelerationProbe
): FileCodecProbe {
  const results: FileCodecProbe = [];
  // Simple heuristic: check video metadata
  if (video.videoWidth > 0) {
    // Most browsers use H.264 for MP4
    results.push({ codec: 'h264', hw: probe.h264 });
  }
  return results;
}
