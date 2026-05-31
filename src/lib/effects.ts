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
  | 'gif'
  | 'concat'
  | 'splitScreen'
  | 'glitch'
  | 'stabilize'
  | 'audioExtract'
  | 'audioReplace'
  | 'frameExtract';

/** An effect as consumed by the ffmpeg pipeline — type and parameters. */
export interface EffectInput {
  type: EffectType;
  params: Record<string, unknown>;
}

/**
 * Builds ffmpeg arguments for trimming video by start/end time.
 * Uses input seeking (-ss) for fast pre-roll and -to for end cut.
 */
export function buildTrimCommand(params: { start: number; end: number }): string[] {
  return ['-ss', String(params.start), '-to', String(params.end)];
}

/**
 * Builds ffmpeg arguments for cropping a region of the video.
 * Uses the crop filter: crop=width:height:x:y
 */
export function buildCropCommand(params: { x: number; y: number; width: number; height: number }): string[] {
  return ['-vf', `crop=${params.width}:${params.height}:${params.x}:${params.y}`];
}

/**
 * Builds ffmpeg arguments for resizing video dimensions.
 * Optionally preserves aspect ratio via force_original_aspect_ratio=decrease.
 */
export function buildResizeCommand(params: { width: number; height: number; keepAspect: boolean }): string[] {
  const { width, height, keepAspect } = params;
  let filter = `scale=${width}:${height}`;
  if (keepAspect) {
    filter += ':force_original_aspect_ratio=decrease';
  }
  return ['-vf', filter];
}

/**
 * Builds ffmpeg arguments for speed adjustment with audio pitch correction.
 *
 * Video: uses setpts=N*PTS where N = 1/factor
 * Audio: uses atempo filter (capped at 2x per instance; chains multiple for >2x)
 *
 * The chaining approach works around ffmpeg's single-atempo limit of [0.5, 2.0].
 */
export function buildSpeedCommand(params: { factor: number }): string[] {
  const { factor } = params;
  const ptsFactor = (1 / factor).toFixed(3);
  const setpts = `setpts=${ptsFactor}*PTS`;

  let atempoFilter: string;
  if (factor > 2) {
    // Chain atempo filters: first (n-1) atempo=2.0, last = factor / 2^(n-1)
    // Each atempo is capped at [0.5, 2.0] by ffmpeg.
    // Examples:
    //   3x  → atempo=2.0,atempo=1.5  (2.0 × 1.5 = 3.0)
    //   2.5 → atempo=2.0,atempo=1.25 (2.0 × 1.25 = 2.5)
    //   4x  → atempo=2.0,atempo=2.0  (2.0 × 2.0 = 4.0)
    const numFull = Math.floor(Math.log(factor) / Math.log(2));
    const remaining = factor / Math.pow(2, numFull);
    const parts: string[] = [];
    for (let i = 0; i < numFull; i++) {
      parts.push('atempo=2.0');
    }
    if (remaining > 1.001) {
      parts.push(`atempo=${remaining.toFixed(3)}`);
    }
    atempoFilter = parts.join(',');
  } else {
    atempoFilter = `atempo=${factor.toFixed(3)}`;
  }

  return ['-vf', setpts, '-af', atempoFilter];
}

export function buildReverseCommand(): string[] {
  return ['-vf', 'reverse', '-af', 'areverse'];
}

export function buildColorGradeCommand(params: { brightness?: number; contrast?: number; saturation?: number; gamma?: number }): string[] {
  const parts: string[] = [];
  if (params.brightness !== undefined) parts.push(`brightness=${params.brightness}`);
  if (params.contrast !== undefined) parts.push(`contrast=${params.contrast}`);
  if (params.saturation !== undefined) parts.push(`saturation=${params.saturation}`);
  if (params.gamma !== undefined) parts.push(`gamma=${params.gamma}`);
  return ['-vf', `eq=${parts.join(':')}`];
}

export function buildFilterCommand(preset: string): string[] {
  switch (preset) {
    case 'grayscale':
      return ['-vf', 'colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3'];
    case 'sepia':
      return ['-vf', 'colorchannelmixer=0.393:0.769:0.189:0:0.349:0.686:0.168:0:0.272:0.534:0.131'];
    case 'invert':
      return ['-vf', 'negate'];
    case 'vintage':
      // Warm/brown tone: boost red/green, reduce blue, add slight contrast
      return ['-vf', 'colorchannelmixer=0.5:0.4:0.1:0:0.3:0.5:0.2:0:0.1:0.2:0.3,eq=contrast=1.2:saturation=0.6'];
    case 'vignette':
      return ['-vf', 'vignette=PI/4:max_eval=frame'];
    case 'night-vision':
      // Green monochrome tint + brightness boost
      return ['-vf', 'colorchannelmixer=0:0:0:0:0.4:0.6:0:0:0:0:0:0,eq=brightness=0.2:contrast=1.5'];
    case 'none':
    case '':
      return []; // No-op
    default:
      throw new Error(`Unknown filter preset: ${preset}`);
  }
}

/**
 * Builds ffmpeg arguments for frame extraction.
 * Extracts still frames at regular intervals or specific timestamps.
 */
export function buildFrameExtractCommand(params: { everyNth?: number; format: string; maxWidth?: number }): string[] {
  const { everyNth = 1, format = 'png', maxWidth } = params;
  const args: string[] = [];
  // Frame selection: extract every Nth frame
  if (everyNth > 1) {
    args.push('-vf', `select=not(mod(n\\,${everyNth}))`);
  }
  // Output format
  if (maxWidth) {
    args.push('-vf', `scale=${maxWidth}:-1`);
  }
  args.push('-vsync', 'vfr', '-frame_pts', '1');
  // Use PNG or JPEG codec
  if (format === 'jpg' || format === 'jpeg') {
    args.push('-c:v', 'mjpeg', '-q:v', '2');
  } else {
    args.push('-c:v', 'png');
  }
  return args;
}

export function buildBlurCommand(params: { radius: number }): string[] {
  return ['-vf', `gblur=sigma=${params.radius}`];
}

export function buildPixelateCommand(params: { blockSize: number }): string[] {
  return ['-vf', `pixelize=${params.blockSize}`];
}

export function buildTextOverlayCommand(params: { text: string; x: number; y: number; fontSize: number; color: string; font?: string }): string[] {
  const parts: string[] = [];
  // Escape single quotes for ffmpeg drawtext: replace ' with '\'' (end quote,
  // escaped quote, resume quote). Also wrap in double quotes to handle spaces.
  const escapedText = params.text.replace(/'/g, "'\\\\''");
  parts.push(`text='${escapedText}'`);
  parts.push(`x=${params.x}`);
  parts.push(`y=${params.y}`);
  parts.push(`fontsize=${params.fontSize}`);
  parts.push(`fontcolor='${params.color}'`);
  if (params.font) {
    parts.push(`font='${params.font}'`);
  }
  return ['-vf', `drawtext=${parts.join(':')}`];
}

/**
 * Builds ffmpeg arguments for chroma key / green screen removal.
 * Uses the colorkey filter: colorkey=color:similarity:blend
 * - similarity: how close a pixel must match (lower = stricter)
 * - blend: smoothing at the edge of the keyed area
 */
export function buildChromaKeyCommand(params: { color: string; similarity: number; blend: number }): string[] {
  return ['-vf', `colorkey=${params.color}:${params.similarity}:${params.blend.toFixed(1)}`];
}

/**
 * Builds ffmpeg arguments for GIF export using two-pass palette generation.
 *
 * Two-pass workflow (TWO separate execCommand calls — palette.png lives in VFS):
 *   Pass 1: fps=N,scale=W:-1:flags=lanczos,palettegen  — generate optimized 256-color palette
 *   Pass 2: paletteuse=dither=bayer:bayer_scale=5       — encode with optional dithering
 *
 * Returns separate pass arrays because ffmpeg opens ALL inputs before writing ANY output,
 * so a single combined command would fail: '-i palette.png' can't exist yet.
 */
export function buildGIFCommand(params: { fps: number; width: number; dither: boolean }): {
  /** Filter string for pass 1 (palettegen): to be appended to the video filter chain.
   *  e.g. 'fps=10,scale=480:-1:flags=lanczos,palettegen' */
  pass1Filter: string;
  /** Filter string for pass 2 (paletteuse): uses stream labels [v] and [1:v].
   *  Requires -filter_complex with -i palette.png as the second input. */
  pass2Filter: string;
  /** The scaling + fps prefix (without palette logic).
   *  Should be prepended BEFORE other filters so effects run on
   *  scaled-down frames instead of 4K originals — much faster. */
  scaleFilter: string;
} {
  const { fps, width, dither } = params;
  const baseFilter = `fps=${fps},scale=${width}:-1:flags=lanczos`;
  const paletteGen = `${baseFilter},palettegen`;
  const paletteUse = dither
    ? `${baseFilter}[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=5`
    : `${baseFilter}[v];[v][1:v]paletteuse`;

  return {
    pass1Filter: paletteGen,
    pass2Filter: paletteUse,
    scaleFilter: baseFilter,
  };
}

export function buildConcatCommand(params: { files: string[]; transition?: { type: string; duration: number } }): string[] {
  const { files, transition } = params;
  const args: string[] = ['-i', `concat:${files.join('|')}`, '-c', 'copy'];

  if (transition) {
    args.push('-vf', `fade=t=${transition.type}:d=${transition.duration}`);
  }

  return args;
}

/**
 * Builds ffmpeg arguments for side-by-side or picture-in-picture split screen.
 *
 * - side-by-side: uses hstack (horizontal stack of 2 inputs)
 * - picture-in-picture: uses overlay filter with positional parameters
 *   (W-w:H-h for bottom-right, 0:0 for top-left, etc.)
 */
export function buildSplitScreenCommand(params: { layout: string; position?: string; size?: number }): string[] {
  const { layout, position } = params;

  if (layout === 'side-by-side') {
    return ['-filter_complex', 'hstack=inputs=2'];
  }

  if (layout === 'pip') {
    let overlayPos: string;
    switch (position) {
      case 'tl':
        overlayPos = '0:0';
        break;
      case 'tr':
        overlayPos = 'W-w:0';
        break;
      case 'bl':
        overlayPos = '0:H-h';
        break;
      case 'br':
      default:
        overlayPos = 'W-w:H-h';
        break;
    }
    return ['-filter_complex', `overlay=${overlayPos}`];
  }

  return ['-filter_complex', 'hstack=inputs=2'];
}

export function buildGlitchCommand(params: { intensity: number; chromatic?: boolean; scanlines?: boolean }): string[] {
  const filters: string[] = [];
  // Noise (static/interference) — higher intensity = more noise
  const noiseLevel = Math.min(30, Math.round(params.intensity * 3));
  filters.push(`noise=alls=${noiseLevel}:allf=t+u`);
  // Saturation boost for VHS feel
  filters.push(`eq=saturation=${1 + params.intensity * 0.1}`);

  if (params.scanlines) {
    // Draw alternating horizontal lines for CRT scanline effect
    filters.push(`drawbox=w=iw:h=1:t=fill:c=black@${(0.08 + params.intensity * 0.02).toFixed(2)}`);
    // Second darker line offset
    filters.push(`drawbox=w=iw:h=1:y=2:t=fill:c=black@${(0.04 + params.intensity * 0.01).toFixed(2)}`);
  }

  return ['-vf', filters.join(',')];
}

/**
 * Builds ffmpeg arguments for video stabilization.
 *
 * Uses the deshake filter (single-pass) instead of vidstabdetect+vidstabtransform
 * (two-pass) because chainEffects produces a single ffmpeg command.
 * Deshake is less sophisticated but compatible with a single filter chain.
 */
export function buildStabilizeCommand(params: { smoothness: number }): string[] {
  return ['-vf', `deshake=rx=0:ry=0:edge=blank:blocksize=${Math.max(4, Math.round(32 / params.smoothness))}`];
}

export function buildAudioExtractCommand(params: { format: string; bitrate: number }): string[] {
  const formatCodecMap: Record<string, string> = {
    mp3: 'libmp3lame',
    wav: 'pcm_s16le',
    aac: 'aac',
    ogg: 'libvorbis',
    flac: 'flac',
  };
  const codec = formatCodecMap[params.format] ?? 'libmp3lame';
  return ['-vn', '-acodec', codec, '-b:a', `${params.bitrate}k`];
}

export function buildAudioReplaceCommand(_params: { matchVideo: boolean }): string[] {
  return ['-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-shortest'];
}

/**
 * Extracted filter info from an effect builder's arguments.
 * Video and audio filters are kept separate so they can be applied
 * via -filter_complex (video) and -af (audio) independently.
 */
interface ExtractedFilters {
  /** Video filters to chain via -filter_complex */
  video: string[];
  /** Audio filters to chain via -af */
  audio: string[];
  /** Complex filter strings (from -filter_complex) for multi-input filters */
  complex: string[];
}

/**
 * Extract filter strings from effect builder result, separating
 * -vf (video), -af (audio), and -filter_complex (complex) args.
 */
function extractFilterStrings(args: string[]): ExtractedFilters {
  const filters: ExtractedFilters = { video: [], audio: [], complex: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-vf' && i + 1 < args.length) {
      filters.video.push(args[i + 1]);
      i++;
    } else if (args[i] === '-af' && i + 1 < args.length) {
      filters.audio.push(args[i + 1]);
      i++;
    } else if (args[i] === '-filter_complex' && i + 1 < args.length) {
      filters.complex.push(args[i + 1]);
      i++;
    }
  }
  return filters;
}

/**
 * Build a complete ffmpeg command from an input file, a list of effects, and an output file.
 * Video and audio filters are kept in separate chains to avoid invalid filter graphs
 * (e.g., mixing video-only filters like reverse with audio-only filters like arevere).
 * How it works:
 * 1. Each effect builder produces ffmpeg arguments (-vf, -af, -filter_complex, or standalone args like -ss)
 * 2. Video/audio filters are extracted from -vf/-af/-filter_complex flags and concatenated with commas
 * 3. Non-filter arguments (-ss, -to, -i, codec flags) are kept as separate args
 * 4. The final command is: -i input.mp4 [-filter_complex "filter1,filter2,..."] [extra args] output.mp4
 *
 * Comma-separated filters form a linear chain where each filter's output feeds the next.
 * This avoids needing multiple ffmpeg passes — all effects apply in a single decode-encode cycle.
 */
export function chainEffects(inputFile: string, effects: EffectInput[], outputFile: string): string[] {
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];
  const complexFilters: string[] = [];
  const extraArgs: string[] = [];

  for (const effect of effects) {
    switch (effect.type) {
      case 'trim': {
        const args = buildTrimCommand(effect.params as any);
        extraArgs.push(...args);
        break;
      }
      case 'crop': {
        const args = buildCropCommand(effect.params as any);
        const extracted = extractFilterStrings(args);
        videoFilters.push(...extracted.video);
        break;
      }
      case 'resize': {
        const args = buildResizeCommand(effect.params as any);
        const extracted = extractFilterStrings(args);
        videoFilters.push(...extracted.video);
        break;
      }
      case 'speed': {
        const args = buildSpeedCommand(effect.params as any);
        const extracted = extractFilterStrings(args);
        videoFilters.push(...extracted.video);
        audioFilters.push(...extracted.audio);
        break;
      }
      case 'reverse': {
        const args = buildReverseCommand();
        const extracted = extractFilterStrings(args);
        videoFilters.push(...extracted.video);
        audioFilters.push(...extracted.audio);
        break;
      }
      case 'colorGrade': {
        const args = buildColorGradeCommand(effect.params as any);
        const extracted = extractFilterStrings(args);
        videoFilters.push(...extracted.video);
        break;
      }
      case 'filter': {
        const preset = effect.params.preset as string;
        const args = buildFilterCommand(preset);
        const extracted = extractFilterStrings(args);
        videoFilters.push(...extracted.video);
        break;
      }
      case 'blur': {
        const args = buildBlurCommand(effect.params as any);
        const extracted = extractFilterStrings(args);
        videoFilters.push(...extracted.video);
        break;
      }
      case 'pixelate': {
        const args = buildPixelateCommand(effect.params as any);
        const extracted = extractFilterStrings(args);
        videoFilters.push(...extracted.video);
        break;
      }
      case 'textOverlay': {
        const args = buildTextOverlayCommand(effect.params as any);
        const extracted = extractFilterStrings(args);
        videoFilters.push(...extracted.video);
        break;
      }
      case 'chromaKey': {
        const args = buildChromaKeyCommand(effect.params as any);
        const extracted = extractFilterStrings(args);
        videoFilters.push(...extracted.video);
        break;
      }
      case 'gif': {
        // GIF export uses two-pass palettegen/paletteuse which requires
        // TWO separate execCommand calls — handled in Editor.tsx export handler.
        break;
      }
      case 'concat': {
        const args = buildConcatCommand(effect.params as any);
        extraArgs.push(...args);
        break;
      }
      case 'splitScreen': {
        const args = buildSplitScreenCommand(effect.params as any);
        const extracted = extractFilterStrings(args);
        complexFilters.push(...extracted.complex);
        break;
      }
      case 'glitch': {
        const args = buildGlitchCommand(effect.params as any);
        const extracted = extractFilterStrings(args);
        videoFilters.push(...extracted.video);
        break;
      }
      case 'stabilize': {
        const args = buildStabilizeCommand(effect.params as any);
        const extracted = extractFilterStrings(args);
        videoFilters.push(...extracted.video);
        break;
      }
      case 'audioExtract': {
        const args = buildAudioExtractCommand(effect.params as any);
        extraArgs.push(...args);
        break;
      }
      case 'audioReplace': {
        const args = buildAudioReplaceCommand(effect.params as any);
        extraArgs.push(...args);
        break;
      }
      case 'frameExtract': {
        const args = buildFrameExtractCommand(effect.params as any);
        extraArgs.push(...args);
        break;
      }
    }
  }

  const result: string[] = ['-i', inputFile];

  if (videoFilters.length > 0) {
    result.push('-filter_complex', videoFilters.join(','));
  }
  for (const cf of complexFilters) {
    result.push('-filter_complex', cf);
  }
  if (audioFilters.length > 0) {
    result.push('-af', audioFilters.join(','));
  }

  result.push(...extraArgs);
  result.push(outputFile);

  return result;
}
