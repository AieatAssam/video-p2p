import { describe, it, expect } from 'vitest';
import { type EffectInput, type EffectType } from '../../src/lib/effects';

describe('Effects module', () => {
  describe('EffectType', () => {
    it('has the expected browser-native effect types', () => {
      const validTypes: EffectType[] = [
        'trim', 'crop', 'resize', 'speed', 'reverse',
        'colorGrade', 'filter', 'blur', 'pixelate',
        'textOverlay', 'chromaKey', 'vignette', 'glitch',
      ];
      // All should be valid EffectType values (type-check passes)
      expect(validTypes.length).toBe(13);
    });
  });

  describe('EffectInput', () => {
    it('creates valid effect inputs', () => {
      const effect: EffectInput = {
        type: 'blur',
        params: { radius: 5 },
      };
      expect(effect.type).toBe('blur');
      expect(effect.params.radius).toBe(5);
    });

    it('accepts crop effect params', () => {
      const effect: EffectInput = {
        type: 'crop',
        params: { x: 10, y: 20, width: 640, height: 480 },
      };
      expect(effect.type).toBe('crop');
    });

    it('accepts resize effect params', () => {
      const effect: EffectInput = {
        type: 'resize',
        params: { width: 320, height: 240, keepAspect: true },
      };
      expect(effect.type).toBe('resize');
    });

    it('accepts colorGrade effect params', () => {
      const effect: EffectInput = {
        type: 'colorGrade',
        params: { brightness: 0.1, contrast: 1.2, saturation: 0.8 },
      };
      expect(effect.type).toBe('colorGrade');
    });

    it('accepts filter effect params', () => {
      const effect: EffectInput = {
        type: 'filter',
        params: { preset: 'grayscale' },
      };
      expect(effect.type).toBe('filter');
    });

    it('accepts textOverlay effect params', () => {
      const effect: EffectInput = {
        type: 'textOverlay',
        params: { text: 'Hello', x: 10, y: 20, fontSize: 24, color: '#fff' },
      };
      expect(effect.type).toBe('textOverlay');
    });

    it('accepts chromaKey effect params', () => {
      const effect: EffectInput = {
        type: 'chromaKey',
        params: { color: '#00ff00', similarity: 0.1, blend: 0.1 },
      };
      expect(effect.type).toBe('chromaKey');
    });

    it('accepts pixelate effect params', () => {
      const effect: EffectInput = {
        type: 'pixelate',
        params: { blockSize: 10 },
      };
      expect(effect.type).toBe('pixelate');
    });

    it('accepts trim effect params', () => {
      const effect: EffectInput = {
        type: 'trim',
        params: { start: 10, end: 20 },
      };
      expect(effect.type).toBe('trim');
    });

    it('accepts speed effect params', () => {
      const effect: EffectInput = {
        type: 'speed',
        params: { factor: 2 },
      };
      expect(effect.type).toBe('speed');
    });

    it('accepts reverse effect params', () => {
      const effect: EffectInput = {
        type: 'reverse',
        params: {},
      };
      expect(effect.type).toBe('reverse');
    });

    it('accepts vignette effect params', () => {
      const effect: EffectInput = {
        type: 'vignette',
        params: { radius: 0.5, softness: 0.3 },
      };
      expect(effect.type).toBe('vignette');
    });

    it('accepts glitch effect params', () => {
      const effect: EffectInput = {
        type: 'glitch',
        params: { intensity: 5 },
      };
      expect(effect.type).toBe('glitch');
    });
  });
});
