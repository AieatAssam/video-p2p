/** Video file information extracted after loading */
export interface VideoInfo {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Duration in seconds */
  duration: number;
  /** Frames per second */
  fps: number;
  /** Original file size in bytes */
  fileSize: number;
  /** Whether the video contains an audio stream */
  hasAudio: boolean;
  /** Video codec name (e.g. 'h264') */
  codec: string;
  /** Original filename */
  name: string;
}

/** Parameters for a trim operation */
export interface TrimParams {
  /** Start time in seconds */
  start: number;
  /** End time in seconds (or duration if relative) */
  end: number;
}

/** Parameters for cropping */
export interface CropParams {
  /** X offset from left */
  x: number;
  /** Y offset from top */
  y: number;
  /** Crop width */
  width: number;
  /** Crop height */
  height: number;
}

/** Parameters for resize */
export interface ResizeParams {
  /** Target width (0 = auto) */
  width: number;
  /** Target height (0 = auto) */
  height: number;
  /** Keep aspect ratio */
  keepAspect: boolean;
}

/** Color grading parameters */
export interface ColorGradeParams {
  brightness?: number;  // -1.0 to 1.0
  contrast?: number;    // 0.0 to 2.0
  saturation?: number;  // 0.0 to 3.0
  gamma?: number;       // 0.1 to 3.0
}

/** Supported filter presets */
export type FilterPreset =
  | 'grayscale'
  | 'sepia'
  | 'invert'
  | 'vintage'
  | 'vignette'
  | 'night-vision';

/** Parameters for blur */
export interface BlurParams {
  /** Blur radius (1-50) */
  radius: number;
}

/** Parameters for pixelation */
export interface PixelateParams {
  /** Block size in pixels (2-50) */
  blockSize: number;
}

/** Parameters for text overlay */
export interface TextOverlayParams {
  /** Text content */
  text: string;
  /** X position (0 = left) */
  x: number;
  /** Y position (0 = top) */
  y: number;
  /** Font size in pixels */
  fontSize: number;
  /** Font color (hex or named) */
  color: string;
  /** Font family */
  font?: string;
}

/** Parameters for image overlay */
export interface ImageOverlayParams {
  /** Position X */
  x: number;
  /** Position Y */
  y: number;
  /** Overlay width (0 = auto) */
  width: number;
  /** Overlay height (0 = auto) */
  height: number;
  /** Opacity (0.0 - 1.0) */
  opacity: number;
}

/** Parameters for chroma key / green screen */
export interface ChromaKeyParams {
  /** Color to key out (hex, e.g. '0x00FF00') */
  color: string;
  /** Similarity threshold (0.01-1.0, lower = more strict) */
  similarity: number;
  /** Blend amount (0.0-1.0) */
  blend: number;
}

/** Parameters for GIF export */
export interface GIFParams {
  /** Frames per second (1-30) */
  fps: number;
  /** Max width (maintains aspect) */
  width: number;
  /** Dithering quality */
  dither?: boolean;
}

/** Parameters for speed change */
export interface SpeedParams {
  /** Speed factor (0.25 - 4.0) */
  factor: number;
}

/** Parameters for split screen */
export interface SplitScreenParams {
  /** Layout: side-by-side or picture-in-picture */
  layout: 'side-by-side' | 'pip';
  /** Position for PIP (top-left, top-right, bottom-left, bottom-right) */
  position?: 'tl' | 'tr' | 'bl' | 'br';
  /** PIP size as percentage of main video (10-50) */
  size?: number;
}

/** Parameters for glitch / VHS effect */
export interface GlitchParams {
  /** Intensity (1-10) */
  intensity: number;
  /** Enable chromatic aberration */
  chromatic?: boolean;
  /** Enable scan lines */
  scanlines?: boolean;
}

/** Parameters for stabilization */
export interface StabilizeParams {
  /** Smoothness (1-15, higher = smoother but more crop) */
  smoothness: number;
  /** Whether to show stabilized vs original (debug) */
  showOriginal?: boolean;
}

/** Parameters for audio extraction */
export interface AudioExtractParams {
  /** Output format */
  format: 'mp3' | 'wav' | 'aac' | 'ogg';
  /** Bitrate in kbps */
  bitrate?: number;
}

/** Parameters for audio replacement */
export interface AudioReplaceParams {
  /** Whether to keep original audio length or use replacement length */
  matchVideo: boolean;
}

/** Parameters for frame extraction */
export interface FrameExtractParams {
  /** Capture every Nth frame */
  everyNth?: number;
  /** Output format */
  format: 'png' | 'jpg';
  /** Max width for output images */
  maxWidth?: number;
}

/** Parameters for concatenating clips */
export interface ConcatParams {
  /** Filenames in order, must all have same codec/resolution */
  files: string[];
  /** Transition between clips */
  transition?: {
    type: 'none' | 'fade' | 'dissolve';
    duration: number;
  };
}

/** The result of a video processing operation */
export interface ProcessResult {
  /** Output filename in the virtual filesystem */
  outputName: string;
  /** Content as a Uint8Array (if small enough) */
  data?: Uint8Array;
  /** Duration of the processing in ms */
  duration: number;
  /** Any warnings or messages */
  messages?: string[];
}

/** Status of an ongoing ffmpeg operation */
export interface ProgressEvent {
  /** Percentage complete (0-100) */
  percent: number;
  /** Frames processed */
  frames: number;
  /** Current speed */
  speed: string;
  /** Time processed */
  time: number;
}

/** All available effect types */
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
  | 'audio-extract'
  | 'audio-replace'
  | 'gif-export'
  | 'concat'
  | 'frame-extract'
  | 'split-screen'
  | 'glitch'
  | 'stabilize';

/** A single effect in the edit timeline */
export interface Effect {
  id: string;
  type: EffectType;
  params: Record<string, unknown>;
  enabled: boolean;
}

/** WebRTC connection state */
export type ConnectionState =
  | 'idle'
  | 'creating-offer'
  | 'waiting-answer'
  | 'connecting'
  | 'connected'
  | 'receiving'
  | 'complete'
  | 'error';

/** WebRTC transfer progress */
export interface TransferProgress {
  /** Bytes transferred so far */
  bytes: number;
  /** Total bytes to transfer */
  total: number;
  /** Transfer speed in bytes/sec */
  speed: number;
  /** Estimated time remaining in seconds */
  eta: number;
  /** Current state */
  state: ConnectionState;
  /** Error message if failed */
  error?: string;
}

/** Media file info for transfer */
export interface MediaFile {
  /** File name */
  name: string;
  /** File data as ArrayBuffer */
  data: ArrayBuffer;
  /** MIME type */
  type: string;
  /** Size in bytes */
  size: number;
}
