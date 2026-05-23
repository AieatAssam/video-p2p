import { describe, it, expect } from 'vitest';
import {
  buildTrimCommand,
  buildCropCommand,
  buildResizeCommand,
  buildSpeedCommand,
  buildReverseCommand,
  buildColorGradeCommand,
  buildFilterCommand,
  buildBlurCommand,
  buildPixelateCommand,
  buildTextOverlayCommand,
  buildChromaKeyCommand,
  buildGIFCommand,
  buildConcatCommand,
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
    it('returns ffmpeg args for trimming start and end', () => {
      const args = buildTrimCommand({ start: 5, end: 15 });
      expect(args).toContain('-ss');
      expect(args).toContain('5');
      expect(args).toContain('-to');
      expect(args).toContain('15');
    });

    it('handles zero start', () => {
      const args = buildTrimCommand({ start: 0, end: 10 });
      expect(args).toContain('-ss');
      expect(args).toContain('0');
    });
  });

  describe('buildCropCommand', () => {
    it('returns crop filter string with correct dimensions', () => {
      const args = buildCropCommand({ x: 10, y: 20, width: 300, height: 200 });
      const filterStr = args.join(' ');
      expect(filterStr).toContain('crop=300:200:10:20');
    });
  });

  describe('buildResizeCommand', () => {
    it('returns scale filter with exact dimensions', () => {
      const args = buildResizeCommand({ width: 640, height: 480, keepAspect: false });
      const filterStr = args.join(' ');
      expect(filterStr).toContain('scale=640:480');
    });

    it('uses force_original_aspect_ratio when keepAspect is true', () => {
      const args = buildResizeCommand({ width: 640, height: 0, keepAspect: true });
      const filterStr = args.join(' ');
      expect(filterStr).toContain('force_original_aspect_ratio');
    });
  });

  describe('buildSpeedCommand', () => {
    it('generates setpts and atempo filters for 2x speed', () => {
      const args = buildSpeedCommand({ factor: 2 });
      const filterStr = args.join(' ');
      expect(filterStr).toContain('setpts=0.5*PTS');
      expect(filterStr).toContain('atempo=2.0');
    });

    it('generates slower setpts for 0.5x speed', () => {
      const args = buildSpeedCommand({ factor: 0.5 });
      const filterStr = args.join(' ');
      expect(filterStr).toContain('setpts=2.0*PTS');
    });

    it('handles atempo values > 2 by chaining', () => {
      const args = buildSpeedCommand({ factor: 4 });
      const filterStr = args.join(' ');
      expect(filterStr).toContain('atempo=2.0,atempo=2.0');
    });
  });

  describe('buildReverseCommand', () => {
    it('uses the reverse video filter', () => {
      const args = buildReverseCommand();
      const filterStr = args.join(' ');
      expect(filterStr).toContain('reverse');
    });

    it('uses areverse for audio', () => {
      const args = buildReverseCommand();
      const filterStr = args.join(' ');
      expect(filterStr).toContain('areverse');
    });
  });

  describe('buildColorGradeCommand', () => {
    it('builds eq filter with brightness, contrast, saturation, gamma', () => {
      const args = buildColorGradeCommand({
        brightness: 0.1,
        contrast: 1.2,
        saturation: 1.5,
        gamma: 0.9,
      });
      const filterStr = args.join(' ');
      expect(filterStr).toContain('eq=');
      expect(filterStr).toContain('brightness=0.1');
      expect(filterStr).toContain('contrast=1.2');
      expect(filterStr).toContain('saturation=1.5');
      expect(filterStr).toContain('gamma=0.9');
    });

    it('skips undefined parameters', () => {
      const args = buildColorGradeCommand({ brightness: 0.5 });
      const filterStr = args.join(' ');
      expect(filterStr).not.toContain('contrast');
      expect(filterStr).toContain('brightness');
    });
  });

  describe('buildFilterCommand', () => {
    it('generates grayscale filter', () => {
      const args = buildFilterCommand('grayscale');
      const filterStr = args.join(' ');
      expect(filterStr).toContain('colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3');
    });

    it('generates sepia filter', () => {
      const args = buildFilterCommand('sepia');
      const filterStr = args.join(' ');
      expect(filterStr).toContain('colorchannelmixer=');
      expect(filterStr).toContain('0.393');
    });

    it('generates invert filter', () => {
      const args = buildFilterCommand('invert');
      const filterStr = args.join(' ');
      expect(filterStr).toContain('negate');
    });

    it('throws for unknown preset', () => {
      expect(() => buildFilterCommand('unknown' as any)).toThrow('Unknown filter preset');
    });
  });

  describe('buildBlurCommand', () => {
    it('generates gblur filter with correct radius', () => {
      const args = buildBlurCommand({ radius: 5 });
      const filterStr = args.join(' ');
      expect(filterStr).toContain('gblur=sigma=5');
    });
  });

  describe('buildPixelateCommand', () => {
    it('generates pixelize filter with block size', () => {
      const args = buildPixelateCommand({ blockSize: 8 });
      const filterStr = args.join(' ');
      expect(filterStr).toContain('pixelize=8');
    });
  });

  describe('buildTextOverlayCommand', () => {
    it('builds drawtext filter with position and styling', () => {
      const args = buildTextOverlayCommand({
        text: 'Hello',
        x: 100,
        y: 50,
        fontSize: 24,
        color: 'white',
      });
      const filterStr = args.join(' ');
      expect(filterStr).toContain("drawtext=text='Hello'");
      expect(filterStr).toContain('x=100');
      expect(filterStr).toContain('y=50');
      expect(filterStr).toContain('fontsize=24');
      expect(filterStr).toContain("fontcolor='white'");
    });

    it('handles font family', () => {
      const args = buildTextOverlayCommand({
        text: 'Test',
        x: 0,
        y: 0,
        fontSize: 16,
        color: 'black',
        font: 'Arial',
      });
      expect(args.join(' ')).toContain("font='Arial'");
    });
  });

  describe('buildChromaKeyCommand', () => {
    it('generates colorkey filter with params', () => {
      const args = buildChromaKeyCommand({
        color: '0x00FF00',
        similarity: 0.1,
        blend: 0.0,
      });
      const filterStr = args.join(' ');
      expect(filterStr).toContain('colorkey=0x00FF00');
      expect(filterStr).toContain('0.1');
      expect(filterStr).toContain('0.0');
    });
  });

  describe('buildGIFCommand', () => {
    it('generates palette and GIF conversion arguments', () => {
      const args = buildGIFCommand({ fps: 10, width: 320, dither: true });
      const cmd = args.join(' ');
      // Should include palettegen
      expect(cmd).toContain('palettegen');
      // Should include paletteuse
      expect(cmd).toContain('paletteuse');
      // Should set fps
      expect(cmd).toContain('fps=10');
    });

    it('skips dither when disabled', () => {
      const args = buildGIFCommand({ fps: 15, width: 400, dither: false });
      expect(args.join(' ')).not.toContain('dither');
    });
  });

  describe('buildConcatCommand', () => {
    it('generates concat command with file list', () => {
      const args = buildConcatCommand({ files: ['a.mp4', 'b.mp4'] });
      const cmd = args.join(' ');
      expect(cmd).toContain('concat:');
    });

    it('adds fade transition when specified', () => {
      const args = buildConcatCommand({
        files: ['a.mp4', 'b.mp4'],
        transition: { type: 'fade', duration: 1 },
      });
      expect(args.join(' ')).toContain('fade');
    });
  });

  describe('buildSplitScreenCommand', () => {
    it('generates hstack for side-by-side', () => {
      const args = buildSplitScreenCommand({
        layout: 'side-by-side',
      });
      const filterStr = args.join(' ');
      expect(filterStr).toContain('hstack');
    });

    it('generates overlay for picture-in-picture', () => {
      const args = buildSplitScreenCommand({
        layout: 'pip',
        position: 'br',
        size: 25,
      });
      const filterStr = args.join(' ');
      expect(filterStr).toContain('overlay=');
    });
  });

  describe('buildGlitchCommand', () => {
    it('generates glitch effects with intensity', () => {
      const args = buildGlitchCommand({ intensity: 5, chromatic: true, scanlines: true });
      const filterStr = args.join(' ');
      expect(filterStr).toContain('freezeframes');
    });
  });

  describe('buildStabilizeCommand', () => {
    it('generates vidstabdetect and transform', () => {
      const args = buildStabilizeCommand({ smoothness: 5 });
      const cmd = args.join(' ');
      expect(cmd).toContain('vidstabdetect');
      expect(cmd).toContain('vidstabtransform');
    });
  });

  describe('buildAudioExtractCommand', () => {
    it('returns args to extract audio without video stream', () => {
      const args = buildAudioExtractCommand({ format: 'mp3', bitrate: 192 });
      expect(args).toContain('-vn');
      expect(args).toContain('-acodec');
      expect(args).toContain('libmp3lame');
      expect(args).toContain('192k');
    });
  });

  describe('buildAudioReplaceCommand', () => {
    it('returns args to replace audio track', () => {
      const args = buildAudioReplaceCommand({ matchVideo: true });
      const cmd = args.join(' ');
      expect(cmd).toContain('-map');
      expect(cmd).toContain('-shortest');
    });
  });

  describe('chainEffects', () => {
    it('chains multiple filter effects into one filter string', () => {
      const effects: EffectInput[] = [
        { type: 'filter', params: { preset: 'grayscale' } },
        { type: 'blur', params: { radius: 3 } },
      ];
      const args = chainEffects('input.mp4', effects, 'output.mp4');
      const cmd = args.join(' ');
      expect(cmd).toContain('-i');
      expect(cmd).toContain('input.mp4');
      expect(cmd).toContain('-filter_complex');
      // Should contain both filter strings
      expect(cmd).toContain('colorchannelmixer');
      expect(cmd).toContain('gblur');
      expect(cmd).toContain('output.mp4');
    });

    it('handles single effect', () => {
      const effects: EffectInput[] = [
        { type: 'reverse', params: {} },
      ];
      const args = chainEffects('input.mp4', effects, 'output.mp4');
      expect(args.join(' ')).toContain('reverse');
    });
  });
});
