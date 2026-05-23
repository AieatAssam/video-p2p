import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import type { Effect, EffectType } from '@/types';

interface EffectsPanelProps {
  effects: Effect[];
  onAddEffect: (type: EffectType) => void;
  onRemoveEffect: (id: string) => void;
  onUpdateEffect: (id: string, params: Record<string, unknown>) => void;
  onToggleEffect: (id: string) => void;
  className?: string;
}

const EFFECT_CATEGORIES: Record<string, { label: string; types: { value: EffectType; label: string }[] }> = {
  filter: {
    label: 'Filter',
    types: [
      { value: 'filter', label: 'Filter Preset' },
      { value: 'color-grade', label: 'Color Grade' },
      { value: 'blur', label: 'Blur' },
      { value: 'pixelate', label: 'Pixelate' },
    ],
  },
  transform: {
    label: 'Transform',
    types: [
      { value: 'crop', label: 'Crop' },
      { value: 'resize', label: 'Resize' },
      { value: 'speed', label: 'Speed' },
      { value: 'reverse', label: 'Reverse' },
    ],
  },
  overlay: {
    label: 'Overlay',
    types: [
      { value: 'text-overlay', label: 'Text Overlay' },
      { value: 'chroma-key', label: 'Chroma Key' },
    ],
  },
  audio: {
    label: 'Audio',
    types: [
      { value: 'audio-extract', label: 'Extract Audio' },
      { value: 'audio-replace', label: 'Replace Audio' },
    ],
  },
  advanced: {
    label: 'Advanced',
    types: [
      { value: 'gif-export', label: 'GIF Export' },
      { value: 'stabilize', label: 'Stabilization' },
      { value: 'trim', label: 'Trim' },
    ],
  },
};

function EffectControl({
  effect,
  onUpdate,
  onRemove,
  onToggle,
}: {
  effect: Effect;
  onUpdate: (params: Record<string, unknown>) => void;
  onRemove: () => void;
  onToggle: () => void;
}) {
  const renderControls = () => {
    switch (effect.type) {
      case 'trim': {
        const start = (effect.params.start as number) ?? 0;
        const end = (effect.params.end as number) ?? 10;
        return (
          <div className="space-y-2">
            <div>
              <Label>Start: {start.toFixed(1)}s</Label>
              <Slider
                value={[start]}
                min={0}
                max={end - 0.1}
                step={0.1}
                onValueChange={([v]) => onUpdate({ ...effect.params, start: v })}
              />
            </div>
            <div>
              <Label>End: {end.toFixed(1)}s</Label>
              <Slider
                value={[end]}
                min={start + 0.1}
                max={100}
                step={0.1}
                onValueChange={([v]) => onUpdate({ ...effect.params, end: v })}
              />
            </div>
          </div>
        );
      }
      case 'crop': {
        const x = (effect.params.x as number) ?? 0;
        const y = (effect.params.y as number) ?? 0;
        const w = (effect.params.width as number) ?? 640;
        const h = (effect.params.height as number) ?? 480;
        return (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>X</Label>
              <Input
                type="number"
                value={x}
                onChange={(e) => onUpdate({ ...effect.params, x: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Y</Label>
              <Input
                type="number"
                value={y}
                onChange={(e) => onUpdate({ ...effect.params, y: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Width</Label>
              <Input
                type="number"
                value={w}
                onChange={(e) => onUpdate({ ...effect.params, width: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Height</Label>
              <Input
                type="number"
                value={h}
                onChange={(e) => onUpdate({ ...effect.params, height: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
        );
      }
      case 'resize': {
        const w = (effect.params.width as number) ?? 640;
        const h = (effect.params.height as number) ?? 480;
        const keepAspect = (effect.params.keepAspect as boolean) ?? true;
        return (
          <div className="space-y-2">
            <div>
              <Label>Width</Label>
              <Input
                type="number"
                value={w}
                onChange={(e) => onUpdate({ ...effect.params, width: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Height</Label>
              <Input
                type="number"
                value={h}
                onChange={(e) => onUpdate({ ...effect.params, height: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={keepAspect} onCheckedChange={(v) => onUpdate({ ...effect.params, keepAspect: v })} />
              <Label>Keep Aspect Ratio</Label>
            </div>
          </div>
        );
      }
      case 'speed': {
        const factor = (effect.params.factor as number) ?? 1;
        return (
          <div>
            <Label>Speed: {factor.toFixed(2)}x</Label>
            <Slider
              value={[factor]}
              min={0.25}
              max={4}
              step={0.05}
              onValueChange={([v]) => onUpdate({ ...effect.params, factor: v })}
            />
          </div>
        );
      }
      case 'reverse': {
        return (
          <div className="flex items-center gap-2">
            <Switch checked={true} disabled />
            <Label>Reverse video and audio</Label>
          </div>
        );
      }
      case 'color-grade': {
        const brightness = (effect.params.brightness as number) ?? 0;
        const contrast = (effect.params.contrast as number) ?? 1;
        const saturation = (effect.params.saturation as number) ?? 1;
        const gamma = (effect.params.gamma as number) ?? 1;
        return (
          <div className="space-y-2">
            <div>
              <Label>Brightness: {brightness.toFixed(2)}</Label>
              <Slider value={[brightness]} min={-1} max={1} step={0.01} onValueChange={([v]) => onUpdate({ ...effect.params, brightness: v })} />
            </div>
            <div>
              <Label>Contrast: {contrast.toFixed(2)}</Label>
              <Slider value={[contrast]} min={0} max={2} step={0.01} onValueChange={([v]) => onUpdate({ ...effect.params, contrast: v })} />
            </div>
            <div>
              <Label>Saturation: {saturation.toFixed(2)}</Label>
              <Slider value={[saturation]} min={0} max={3} step={0.01} onValueChange={([v]) => onUpdate({ ...effect.params, saturation: v })} />
            </div>
            <div>
              <Label>Gamma: {gamma.toFixed(2)}</Label>
              <Slider value={[gamma]} min={0.1} max={3} step={0.01} onValueChange={([v]) => onUpdate({ ...effect.params, gamma: v })} />
            </div>
          </div>
        );
      }
      case 'filter': {
        const preset = (effect.params.preset as string) ?? 'none';
        return (
          <div>
            <Label>Preset</Label>
            <Select
              value={preset}
              onValueChange={(v) => onUpdate({ ...effect.params, preset: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="grayscale">Grayscale</SelectItem>
                <SelectItem value="sepia">Sepia</SelectItem>
                <SelectItem value="invert">Invert</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      }
      case 'blur': {
        const radius = (effect.params.radius as number) ?? 5;
        return (
          <div>
            <Label>Blur Radius: {radius}</Label>
            <Slider value={[radius]} min={1} max={50} step={1} onValueChange={([v]) => onUpdate({ ...effect.params, radius: v })} />
          </div>
        );
      }
      case 'pixelate': {
        const blockSize = (effect.params.blockSize as number) ?? 10;
        return (
          <div>
            <Label>Block Size: {blockSize}px</Label>
            <Slider value={[blockSize]} min={2} max={50} step={1} onValueChange={([v]) => onUpdate({ ...effect.params, blockSize: v })} />
          </div>
        );
      }
      case 'text-overlay': {
        const text = (effect.params.text as string) ?? '';
        const x = (effect.params.x as number) ?? 10;
        const y = (effect.params.y as number) ?? 10;
        const fontSize = (effect.params.fontSize as number) ?? 24;
        const color = (effect.params.color as string) ?? '#ffffff';
        return (
          <div className="space-y-2">
            <div>
              <Label>Text</Label>
              <Input value={text} onChange={(e) => onUpdate({ ...effect.params, text: e.target.value })} placeholder="Enter text..." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>X: {x}</Label>
                <Slider value={[x]} min={0} max={1920} step={1} onValueChange={([v]) => onUpdate({ ...effect.params, x: v })} />
              </div>
              <div>
                <Label>Y: {y}</Label>
                <Slider value={[y]} min={0} max={1080} step={1} onValueChange={([v]) => onUpdate({ ...effect.params, y: v })} />
              </div>
            </div>
            <div>
              <Label>Font Size: {fontSize}</Label>
              <Slider value={[fontSize]} min={8} max={200} step={1} onValueChange={([v]) => onUpdate({ ...effect.params, fontSize: v })} />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={color}
                  className="h-9 w-12 p-1"
                  onChange={(e) => onUpdate({ ...effect.params, color: e.target.value })}
                />
                <Input
                  value={color}
                  className="flex-1"
                  onChange={(e) => onUpdate({ ...effect.params, color: e.target.value })}
                />
              </div>
            </div>
          </div>
        );
      }
      case 'chroma-key': {
        const color = (effect.params.color as string) ?? '#00ff00';
        const similarity = (effect.params.similarity as number) ?? 0.1;
        const blend = (effect.params.blend as number) ?? 0;
        return (
          <div className="space-y-2">
            <div>
              <Label>Key Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={color}
                  className="h-9 w-12 p-1"
                  onChange={(e) => onUpdate({ ...effect.params, color: e.target.value })}
                />
                <Input
                  value={color}
                  className="flex-1"
                  onChange={(e) => onUpdate({ ...effect.params, color: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Similarity: {similarity.toFixed(3)}</Label>
              <Slider value={[similarity]} min={0.01} max={1} step={0.01} onValueChange={([v]) => onUpdate({ ...effect.params, similarity: v })} />
            </div>
            <div>
              <Label>Blend: {blend.toFixed(2)}</Label>
              <Slider value={[blend]} min={0} max={1} step={0.01} onValueChange={([v]) => onUpdate({ ...effect.params, blend: v })} />
            </div>
          </div>
        );
      }
      case 'gif-export': {
        const fps = (effect.params.fps as number) ?? 10;
        const width = (effect.params.width as number) ?? 480;
        const dither = (effect.params.dither as boolean) ?? true;
        return (
          <div className="space-y-2">
            <div>
              <Label>FPS: {fps}</Label>
              <Slider value={[fps]} min={1} max={30} step={1} onValueChange={([v]) => onUpdate({ ...effect.params, fps: v })} />
            </div>
            <div>
              <Label>Max Width: {width}</Label>
              <Input
                type="number"
                value={width}
                onChange={(e) => onUpdate({ ...effect.params, width: parseInt(e.target.value) || 480 })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={dither} onCheckedChange={(v) => onUpdate({ ...effect.params, dither: v })} />
              <Label>Dithering</Label>
            </div>
          </div>
        );
      }
      case 'audio-extract': {
        const format = (effect.params.format as string) ?? 'mp3';
        const bitrate = (effect.params.bitrate as number) ?? 192;
        return (
          <div className="space-y-2">
            <div>
              <Label>Format</Label>
              <Select value={format} onValueChange={(v) => onUpdate({ ...effect.params, format: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp3">MP3</SelectItem>
                  <SelectItem value="wav">WAV</SelectItem>
                  <SelectItem value="aac">AAC</SelectItem>
                  <SelectItem value="ogg">OGG</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bitrate: {bitrate}kbps</Label>
              <Slider value={[bitrate]} min={64} max={320} step={32} onValueChange={([v]) => onUpdate({ ...effect.params, bitrate: v })} />
            </div>
          </div>
        );
      }
      case 'audio-replace': {
        const matchVideo = (effect.params.matchVideo as boolean) ?? true;
        return (
          <div className="flex items-center gap-2">
            <Switch checked={matchVideo} onCheckedChange={(v) => onUpdate({ ...effect.params, matchVideo: v })} />
            <Label>Match video length</Label>
          </div>
        );
      }
      case 'stabilize': {
        const smoothness = (effect.params.smoothness as number) ?? 5;
        return (
          <div>
            <Label>Smoothness: {smoothness}</Label>
            <Slider value={[smoothness]} min={1} max={15} step={1} onValueChange={([v]) => onUpdate({ ...effect.params, smoothness: v })} />
          </div>
        );
      }
      default:
        return <p className="text-xs text-muted-foreground">No controls available</p>;
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={effect.enabled} onCheckedChange={onToggle} />
          <span className="text-sm font-medium capitalize">
            {effect.type.replace(/-/g, ' ')}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {effect.enabled && renderControls()}
    </div>
  );
}

export function EffectsPanel({
  effects,
  onAddEffect,
  onRemoveEffect,
  onUpdateEffect,
  onToggleEffect,
  className,
}: EffectsPanelProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Add effect accordion */}
      <Accordion type="single" collapsible>
        {Object.entries(EFFECT_CATEGORIES).map(([key, category]) => (
          <AccordionItem key={key} value={key}>
            <AccordionTrigger className="text-sm font-medium">
              {category.label}
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap gap-2">
                {category.types.map((t) => (
                  <Button
                    key={t.value}
                    variant="outline"
                    size="sm"
                    onClick={() => onAddEffect(t.value)}
                    className="gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    {t.label}
                  </Button>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {/* Active effects */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          Active Effects ({effects.length})
        </h3>
        {effects.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No effects added yet. Select a category above to add effects.
          </p>
        )}
        {effects.map((effect) => (
          <EffectControl
            key={effect.id}
            effect={effect}
            onUpdate={(params) => onUpdateEffect(effect.id, params)}
            onRemove={() => onRemoveEffect(effect.id)}
            onToggle={() => onToggleEffect(effect.id)}
          />
        ))}
      </div>
    </div>
  );
}
