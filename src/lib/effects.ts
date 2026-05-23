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
  | 'audioReplace';

export interface EffectInput {
  type: EffectType;
  params: Record<string, unknown>;
}

export function buildTrimCommand(params: { start: number; end: number }): string[] {
  return ['-ss', String(params.start), '-to', String(params.end)];
}

export function buildCropCommand(params: { x: number; y: number; width: number; height: number }): string[] {
  return ['-vf', `crop=${params.width}:${params.height}:${params.x}:${params.y}`];
}

export function buildResizeCommand(params: { width: number; height: number; keepAspect: boolean }): string[] {
  const { width, height, keepAspect } = params;
  let filter = `scale=${width}:${height}`;
  if (keepAspect) {
    filter += ':force_original_aspect_ratio=decrease';
  }
  return ['-vf', filter];
}

export function buildSpeedCommand(params: { factor: number }): string[] {
  const { factor } = params;
  const ptsFactor = (1 / factor).toFixed(1);
  const setpts = `setpts=${ptsFactor}*PTS`;

  let atempoFilter: string;
  if (factor > 2) {
    // Chain multiple atempo=2.0 to exceed ffmpeg's single-filter limit
    const count = Math.ceil(factor / 2);
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      parts.push('atempo=2.0');
    }
    atempoFilter = parts.join(',');
  } else {
    atempoFilter = `atempo=${factor.toFixed(1)}`;
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
    default:
      throw new Error('Unknown filter preset');
  }
}

export function buildBlurCommand(params: { radius: number }): string[] {
  return ['-vf', `gblur=sigma=${params.radius}`];
}

export function buildPixelateCommand(params: { blockSize: number }): string[] {
  return ['-vf', `pixelize=${params.blockSize}`];
}

export function buildTextOverlayCommand(params: { text: string; x: number; y: number; fontSize: number; color: string; font?: string }): string[] {
  const parts: string[] = [];
  parts.push(`text='${params.text}'`);
  parts.push(`x=${params.x}`);
  parts.push(`y=${params.y}`);
  parts.push(`fontsize=${params.fontSize}`);
  parts.push(`fontcolor='${params.color}'`);
  if (params.font) {
    parts.push(`font='${params.font}'`);
  }
  return ['-vf', `drawtext=${parts.join(':')}`];
}

export function buildChromaKeyCommand(params: { color: string; similarity: number; blend: number }): string[] {
  return ['-vf', `colorkey=${params.color}:${params.similarity}:${params.blend.toFixed(1)}`];
}

export function buildGIFCommand(params: { fps: number; width: number; dither: boolean }): string[] {
  const { fps, width, dither } = params;
  const baseFilter = `fps=${fps},scale=${width}:-1:flags=lanczos`;
  const paletteGen = `${baseFilter},palettegen`;
  const paletteUse = dither
    ? `${baseFilter}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`
    : `${baseFilter}[x];[x][1:v]paletteuse`;

  return [
    '-i', 'input', '-vf', paletteGen, 'palette.png',
    '-i', 'input', '-i', 'palette.png', '-filter_complex', paletteUse,
  ];
}

export function buildConcatCommand(params: { files: string[]; transition?: { type: string; duration: number } }): string[] {
  const { files, transition } = params;
  const args: string[] = ['-i', `concat:${files.join('|')}`, '-c', 'copy'];

  if (transition) {
    args.push('-vf', `fade=t=${transition.type}:d=${transition.duration}`);
  }

  return args;
}

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
  return ['-vf', `freezeframes=duration=${params.intensity}`];
}

export function buildStabilizeCommand(params: { smoothness: number }): string[] {
  return [
    '-i', 'input', '-vf', `vidstabdetect=smoothness=${params.smoothness}`, '-f', 'null', '-',
    '-i', 'input', '-vf', `vidstabtransform=smoothness=${params.smoothness}`,
  ];
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
 * Helper to extract filter arguments string from an effect builder function result.
 * Handles both -vf and -filter_complex outputs, extracting the filter value.
 */
function extractFilterString(args: string[]): string[] {
  const filters: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-vf' && i + 1 < args.length) {
      filters.push(args[i + 1]);
      i++; // skip the value
    } else if (args[i] === '-af' && i + 1 < args.length) {
      filters.push(args[i + 1]);
      i++;
    } else if (args[i] === '-filter_complex' && i + 1 < args.length) {
      filters.push(args[i + 1]);
      i++;
    }
  }
  return filters;
}

/**
 * Build a complete ffmpeg command from an input file, a list of effects, and an output file.
 * Filters are combined into a single -filter_complex argument where possible.
 */
export function chainEffects(inputFile: string, effects: EffectInput[], outputFile: string): string[] {
  const filterParts: string[] = [];
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
        filterParts.push(...extractFilterString(args));
        break;
      }
      case 'resize': {
        const args = buildResizeCommand(effect.params as any);
        filterParts.push(...extractFilterString(args));
        break;
      }
      case 'speed': {
        const args = buildSpeedCommand(effect.params as any);
        filterParts.push(...extractFilterString(args));
        break;
      }
      case 'reverse': {
        const args = buildReverseCommand();
        filterParts.push(...extractFilterString(args));
        break;
      }
      case 'colorGrade': {
        const args = buildColorGradeCommand(effect.params as any);
        filterParts.push(...extractFilterString(args));
        break;
      }
      case 'filter': {
        const preset = effect.params.preset as string;
        const args = buildFilterCommand(preset);
        filterParts.push(...extractFilterString(args));
        break;
      }
      case 'blur': {
        const args = buildBlurCommand(effect.params as any);
        filterParts.push(...extractFilterString(args));
        break;
      }
      case 'pixelate': {
        const args = buildPixelateCommand(effect.params as any);
        filterParts.push(...extractFilterString(args));
        break;
      }
      case 'textOverlay': {
        const args = buildTextOverlayCommand(effect.params as any);
        filterParts.push(...extractFilterString(args));
        break;
      }
      case 'chromaKey': {
        const args = buildChromaKeyCommand(effect.params as any);
        filterParts.push(...extractFilterString(args));
        break;
      }
      case 'gif': {
        const args = buildGIFCommand(effect.params as any);
        extraArgs.push(...args);
        break;
      }
      case 'concat': {
        const args = buildConcatCommand(effect.params as any);
        extraArgs.push(...args);
        break;
      }
      case 'splitScreen': {
        const args = buildSplitScreenCommand(effect.params as any);
        filterParts.push(...extractFilterString(args));
        break;
      }
      case 'glitch': {
        const args = buildGlitchCommand(effect.params as any);
        filterParts.push(...extractFilterString(args));
        break;
      }
      case 'stabilize': {
        const args = buildStabilizeCommand(effect.params as any);
        extraArgs.push(...args);
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
    }
  }

  const result: string[] = ['-i', inputFile];

  if (filterParts.length > 0) {
    result.push('-filter_complex', filterParts.join(','));
  }

  result.push(...extraArgs);
  result.push(outputFile);

  return result;
}
