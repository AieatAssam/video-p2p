/** Video file information extracted after loading */
export interface VideoInfo {
  width: number;
  height: number;
  duration: number;
  fps: number;
  fileSize: number;
  hasAudio: boolean;
  codec: string;
  name: string;
}

export interface TrimParams {
  start: number;
  end: number;
}

export interface CropParams {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResizeParams {
  width: number;
  height: number;
  keepAspect: boolean;
}

export interface ColorGradeParams {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  gamma?: number;
}

export type FilterPreset =
  | 'grayscale'
  | 'sepia'
  | 'invert'
  | 'vintage'
  | 'vignette'
  | 'night-vision';

export interface BlurParams {
  radius: number;
}

export interface PixelateParams {
  blockSize: number;
}

export interface TextOverlayParams {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  font?: string;
}

export interface ImageOverlayParams {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

export interface ChromaKeyParams {
  color: string;
  similarity: number;
  blend: number;
}

export interface SpeedParams {
  factor: number;
}

/** All available effect types — browser-native only (Canvas2D / WebCodecs) */
export type EffectType =
  | 'trim'
  | 'crop'
  | 'resize'
  | 'speed'
  | 'reverse'
  | 'color-grade'
  | 'filter'
  | 'blur'
  | 'pixelate'
  | 'text-overlay'
  | 'image-overlay'
  | 'chroma-key'
  | 'vignette'
  | 'glitch';

export interface Effect {
  id: string;
  type: EffectType;
  params: Record<string, unknown>;
  enabled: boolean;
}

export interface ProgressEvent {
  percent: number;
  frames: number;
  speed: string;
  time: number;
}

export interface ProcessResult {
  outputName: string;
  data?: Uint8Array;
  duration: number;
  messages?: string[];
}

export type ConnectionState =
  | 'idle'
  | 'creating-offer'
  | 'waiting-answer'
  | 'connecting'
  | 'connected'
  | 'receiving'
  | 'complete'
  | 'error';

export interface TransferProgress {
  bytes: number;
  total: number;
  speed: number;
  eta: number;
  state: ConnectionState;
  error?: string;
}

export interface MediaFile {
  name: string;
  data: ArrayBuffer;
  type: string;
  size: number;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}
