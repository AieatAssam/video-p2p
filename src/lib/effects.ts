/** Effect types for the pipeline — browser-native (Canvas2D / WebCodecs) only. */
export type EffectType =
  | 'trim'
  | 'crop'
  | 'resize'
  | 'speed'
  | 'reverse'
  | 'colorGrade'
  | 'filter'
  | 'blur'
  | 'pixelate'
  | 'textOverlay'
  | 'chromaKey'
  | 'vignette'
  | 'glitch';

/** An effect as consumed by the pipeline — type and parameters. */
export interface EffectInput {
  type: EffectType;
  params: Record<string, unknown>;
}
