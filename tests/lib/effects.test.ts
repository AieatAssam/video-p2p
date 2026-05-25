import { describe, it, expect } from 'vitest';
import {
  buildTrimCommand,
  buildCropCommand,
  buildResizeCommand,
  buildSpeedCommand,
  buildReverseCommand,
  buildColorGradeCommand,
  buildBlurCommand,
  buildPixelateCommand,
  buildTextOverlayCommand,
  buildChromaKeyCommand,
  buildGIFCommand,
  buildSplitScreenCommand,
  buildGlitchCommand,
  buildStabilizeCommand,
  buildAudioExtractCommand,
  buildAudioReplaceCommand,
  chainEffects,
  type EffectInput,
} from '../../src/lib/effects';

describe('Effects Pipeline', () => {
  describe('buildTrimCommand', () => {
    it('generates correct trim args', () => {
      const args = buildTrimCommand({ start: 10, end: 20 });
      expect(args).toEqual(['-ss', '10', '-to', '20']);
    });
  });

  describe('buildCropCommand', () => {
    it('generates correct crop filter', () => {
      const args = buildCropCommand({ x: 10, y: 20, width: 640, height: 480 });
      expect(args.join(' ')).toContain('crop=640:480:10:20');
    });
  });

  describe('buildResizeCommand', () => {
    it('generates scale filter without aspect preservation', () => {
      const args = buildResizeCommand({ width: 320, height: 240, keepAspect: false });
      expect(args.join(' ')).toContain('scale=320:240');
      expect(args.join(' ')).not.toContain('force_original_aspect_ratio');
    });

    it('adds aspect ratio preservation when requested', () => {
      const args = buildResizeCommand({ width: 320, height: 240, keepAspect: true });
      expect(args.join(' ')).toContain('force_original_aspect_ratio=decrease');
    });
  });

  describe('buildSpeedCommand', () => {
    it('handles 1x speed (no change)', () => {
      const args = buildSpeedCommand({ factor: 1 });
      expect(args.join(' ')).toContain('setpts=1.000*PTS');
    });

    it('handles 2x speed', () => {
      const args = buildSpeedCommand({ factor: 2 });
      expect(args.join(' ')).toContain('setpts=0.500*PTS');
      expect(args.join(' ')).toContain('atempo=2.000');
    });

    it('handles 0.5x slow motion', () => {
      const args = buildSpeedCommand({ factor: 0.5 });
      expect(args.join(' ')).toContain('setpts=2.000*PTS');
      expect(args.join(' ')).toContain('atempo=0.500');
    });

    it('handles 3x speed with chained atempo', () => {
      const args = buildSpeedCommand({ factor: 3 });
      expect(args.join(' ')).toContain('setpts=0.333*PTS');
      const atempoStr = args.join(' ');
      const atempoIdx = atempoStr.indexOf('atempo=');
      expect(atempoIdx).not.toBe(-1);
      const atempoParts = args.join(' ').match(/atempo=[\d.]+/g);
      const product = atempoParts!.reduce((acc, p) => acc * parseFloat(p.split('=')[1]), 1);
      expect(product).toBeCloseTo(3, 0);
    });

    it('chains atempo correctly for 4x speed', () => {
      const args = buildSpeedCommand({ factor: 4 });
      const atempoParts = args.join(' ').match(/atempo=[\d.]+/g);
      expect(atempoParts).not.toBeNull();
      if (atempoParts) {
        const product = atempoParts.reduce((acc, p) => acc * parseFloat(p.split('=')[1]), 1);
        expect(product).toBeCloseTo(4, 0);
      }
    });

    it('chains atempo correctly for 2.5x speed', () => {
      const args = buildSpeedCommand({ factor: 2.5 });
      const atempoParts = args.join(' ').match(/atempo=[\d.]+/g);
      expect(atempoParts).not.toBeNull();
      if (atempoParts) {
        const product = atempoParts.reduce((acc, p) => acc * parseFloat(p.split('=')[1]), 1);
        expect(product).toBeCloseTo(2.5, 1);
      }
    });
  });

  describe('buildReverseCommand', () => {
    it('generates reverse filter for video', () => {
      const args = buildReverseCommand();
      expect(args).toContain('-vf');
      expect(args).toContain('reverse');
    });

    it('generates areverse filter for audio', () => {
      const args = buildReverseCommand();
      expect(args).toContain('-af');
      expect(args).toContain('areverse');
    });
  });

  describe('buildColorGradeCommand', () => {
    it('generates eq filter with all params', () => {
      const args = buildColorGradeCommand({ brightness: 0.1, contrast: 1.2, saturation: 0.8, gamma: 1.1 });
      expect(args.join(' ')).toContain('brightness=0.1');
      expect(args.join(' ')).toContain('contrast=1.2');
      expect(args.join(' ')).toContain('saturation=0.8');
      expect(args.join(' ')).toContain('gamma=1.1');
    });

    it('omits undefined params', () => {
      const args = buildColorGradeCommand({ brightness: 0.1 });
      expect(args.join(' ')).toContain('brightness=0.1');
      expect(args.join(' ')).not.toContain('contrast=');
      expect(args.join(' ')).not.toContain('saturation=');
      expect(args.join(' ')).not.toContain('gamma=');
    });
  });

  describe('buildBlurCommand', () => {
    it('uses gblur with correct sigma', () => {
      const args = buildBlurCommand({ radius: 5 });
      expect(args.join(' ')).toContain('gblur=sigma=5');
    });
  });

  describe('buildPixelateCommand', () => {
    it('generates pixelize filter', () => {
      const args = buildPixelateCommand({ blockSize: 10 });
      expect(args.join(' ')).toContain('pixelize=10');
    });
  });

  describe('buildTextOverlayCommand', () => {
    it('generates drawtext with all params', () => {
      const args = buildTextOverlayCommand({ text: 'Hello', x: 10, y: 20, fontSize: 24, color: '#ffffff' });
      const cmd = args.join(' ');
      expect(cmd).toContain("text='Hello'");
      expect(cmd).toContain('x=10');
      expect(cmd).toContain('y=20');
      expect(cmd).toContain('fontsize=24');
      expect(cmd).toContain("fontcolor='#ffffff'");
    });
  });

  describe('buildChromaKeyCommand', () => {
    it('generates colorkey filter', () => {
      const args = buildChromaKeyCommand({ color: '#00ff00', similarity: 0.1, blend: 0.05 });
      expect(args.join(' ')).toContain('colorkey=#00ff00:0.1:0.1');
    });
  });

  describe('buildGIFCommand', () => {
    it('generates palettegen filter', () => {
      const result = buildGIFCommand({ fps: 10, width: 480, dither: true });
      expect(result.pass1Filter).toContain('palettegen');
      expect(result.pass1Filter).toContain('fps=10');
      expect(result.pass1Filter).toContain('scale=480:-1');
    });

    it('generates paletteuse filter', () => {
      const result = buildGIFCommand({ fps: 10, width: 480, dither: true });
      expect(result.pass2Filter).toContain('paletteuse');
      expect(result.pass2Filter).toContain('fps=10');
      expect(result.pass2Filter).toContain('scale=480:-1');
    });

    it('includes dither in pass2 when enabled', () => {
      const result = buildGIFCommand({ fps: 10, width: 480, dither: true });
      expect(result.pass2Filter).toContain('bayer');
    });

    it('omits dither in pass2 when disabled', () => {
      const result = buildGIFCommand({ fps: 10, width: 480, dither: false });
      expect(result.pass2Filter).not.toContain('bayer');
    });
  });

  describe('chainEffects', () => {
    it('starts with -i input', () => {
      const args = chainEffects('input.mp4', [], 'output.mp4');
      expect(args[0]).toBe('-i');
      expect(args[1]).toBe('input.mp4');
    });

    it('ends with output file', () => {
      const args = chainEffects('input.mp4', [], 'out.mp4');
      expect(args[args.length - 1]).toBe('out.mp4');
    });

    it('chains multiple filter effects into one filter_complex', () => {
      const effects: EffectInput[] = [
        { type: 'blur', params: { radius: 3 } },
        { type: 'colorGrade', params: { brightness: 0.1 } },
      ];
      const args = chainEffects('input.mp4', effects, 'output.mp4');
      const cmd = args.join(' ');
      expect(cmd).toContain('-filter_complex');
      expect(cmd).toContain('gblur=sigma=3');
      expect(cmd).toContain('brightness=0.1');
      // Should be one filter_complex, not two
      expect(cmd.split('-filter_complex').length - 1).toBe(1);
    });

    it('does NOT put -af audio filters into the video filter_complex chain', () => {
      // Reverse has BOTH -vf reverse and -af areverse
      // These MUST NOT be joined into a single filter_complex chain
      const effects: EffectInput[] = [
        { type: 'reverse', params: {} },
      ];
      const args = chainEffects('input.mp4', effects, 'output.mp4');
      const cmd = args.join(' ');
      // The video filter should be in -filter_complex
      expect(cmd).toContain('reverse');
      // The audio filter should NOT be in the same filter_complex
      const fcMatch = cmd.match(/-filter_complex ([^\s]+)/);
      if (fcMatch) {
        expect(fcMatch[1]).not.toContain('areverse');
      }
      // The audio filter should be in a separate -af flag
      expect(cmd).toContain('-af');
      expect(cmd).toContain('areverse');
    });

    it('keeps speed video/audio filters separate', () => {
      const effects: EffectInput[] = [
        { type: 'speed', params: { factor: 2 } },
      ];
      const args = chainEffects('input.mp4', effects, 'output.mp4');
      const cmd = args.join(' ');
      // setpts is video → goes to -filter_complex
      expect(cmd).toContain('setpts=');
      // atempo is audio → goes to -af
      expect(cmd).toContain('-af');
      expect(cmd).toContain('atempo=');
      // atempo should NOT be in filter_complex
      const fcMatch = cmd.match(/-filter_complex ([^\s]+)/);
      if (fcMatch) {
        expect(fcMatch[1]).not.toContain('atempo');
      }
    });

    it('handles trim + crop combination', () => {
      const effects: EffectInput[] = [
        { type: 'trim', params: { start: 5, end: 10 } },
        { type: 'crop', params: { x: 0, y: 0, width: 640, height: 480 } },
      ];
      const args = chainEffects('input.mp4', effects, 'output.mp4');
      const cmd = args.join(' ');
      expect(cmd).toContain('-ss 5');
      expect(cmd).toContain('-to 10');
      expect(cmd).toContain('crop=640:480:0:0');
    });

    it('handles trim + reverse combination', () => {
      const effects: EffectInput[] = [
        { type: 'trim', params: { start: 5, end: 15 } },
        { type: 'reverse', params: {} },
      ];
      const args = chainEffects('input.mp4', effects, 'output.mp4');
      const cmd = args.join(' ');
      expect(cmd).toContain('-ss 5');
      expect(cmd).toContain('-to 15');
      expect(cmd).toContain('reverse');
      expect(cmd).toContain('areverse');
    });

    it('skips GIF effect in chainEffects (handled separately in Editor)', () => {
      const effects: EffectInput[] = [
        { type: 'gif', params: { fps: 10, width: 480, dither: true } },
      ];
      const args = chainEffects('input.mp4', effects, 'output.gif');
      const cmd = args.join(' ');
      // chainEffects should NOT include any GIF-specific args
      expect(cmd).not.toContain('palettegen');
      expect(cmd).not.toContain('paletteuse');
      expect(cmd).not.toContain('palette.png');
      // Should just be a pass-through with input and output
      expect(cmd).toBe('-i input.mp4 output.gif');
    });

    it('handles blur + colorGrade chain', () => {
      const effects: EffectInput[] = [
        { type: 'blur', params: { radius: 5 } },
        { type: 'colorGrade', params: { brightness: 0.2, contrast: 1.5 } },
      ];
      const args = chainEffects('input.mp4', effects, 'output.mp4');
      const cmd = args.join(' ');
      // Both filters should be in one -filter_complex
      expect(cmd).toContain('gblur=sigma=5');
      expect(cmd).toContain('brightness=0.2');
      expect(cmd).toContain('contrast=1.5');
    });

    it('preserves trim as input args, not filters', () => {
      const effects: EffectInput[] = [
        { type: 'trim', params: { start: 10, end: 20 } },
      ];
      const args = chainEffects('input.mp4', effects, 'output.mp4');
      const cmd = args.join(' ');
      // Trim should NOT be in a filter
      expect(cmd).not.toContain('-filter_complex');
      // Trim should be -ss and -to flags
      expect(cmd).toContain('-ss 10');
      expect(cmd).toContain('-to 20');
    });

    it('handles empty effects list', () => {
      const args = chainEffects('input.mp4', [], 'output.mp4');
      expect(args).toEqual(['-i', 'input.mp4', 'output.mp4']);
    });
  });
});
