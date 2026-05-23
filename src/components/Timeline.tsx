import React, { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';

interface TimelineProps {
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  onTrimChange?: (start: number, end: number) => void;
  trimStart?: number;
  trimEnd?: number;
  thumbnails?: string[];
  className?: string;
}

export function Timeline({
  duration,
  currentTime,
  onSeek,
  onTrimChange,
  trimStart = 0,
  trimEnd,
  thumbnails,
  className,
}: TimelineProps) {
  const effectiveTrimEnd = trimEnd ?? duration;
  const [isDraggingTrimStart, setIsDraggingTrimStart] = useState(false);
  const [isDraggingTrimEnd, setIsDraggingTrimEnd] = useState(false);
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getPositionFromEvent = useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      return Math.max(0, Math.min(1, x)) * duration;
    },
    [duration]
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDraggingTrimStart || isDraggingTrimEnd) return;
      const time = getPositionFromEvent(e.clientX);
      onSeek(time);
    },
    [getPositionFromEvent, isDraggingTrimStart, isDraggingTrimEnd, onSeek]
  );

  const handleTrimStartMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsDraggingTrimStart(true);
    },
    []
  );

  const handleTrimEndMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsDraggingTrimEnd(true);
    },
    []
  );

  const handlePlayheadMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setDraggingPlayhead(true);
    },
    []
  );

  // Global mouse handlers for drag operations
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingTrimStart && onTrimChange) {
        const time = getPositionFromEvent(e.clientX);
        const clampedStart = Math.max(0, Math.min(time, effectiveTrimEnd - 0.1));
        onTrimChange(clampedStart, effectiveTrimEnd);
      } else if (isDraggingTrimEnd && onTrimChange) {
        const time = getPositionFromEvent(e.clientX);
        const clampedEnd = Math.min(duration, Math.max(time, trimStart + 0.1));
        onTrimChange(trimStart, clampedEnd);
      } else if (draggingPlayhead) {
        const time = getPositionFromEvent(e.clientX);
        onSeek(Math.max(0, Math.min(time, duration)));
      }
    };

    const handleMouseUp = () => {
      setIsDraggingTrimStart(false);
      setIsDraggingTrimEnd(false);
      setDraggingPlayhead(false);
    };

    if (isDraggingTrimStart || isDraggingTrimEnd || draggingPlayhead) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDraggingTrimStart,
    isDraggingTrimEnd,
    draggingPlayhead,
    getPositionFromEvent,
    onTrimChange,
    onSeek,
    trimStart,
    effectiveTrimEnd,
    duration,
  ]);

  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const trimStartPercent = duration > 0 ? (trimStart / duration) * 100 : 0;
  const trimEndPercent = duration > 0 ? (effectiveTrimEnd / duration) * 100 : 100;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Time display */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative h-16 cursor-pointer rounded-md bg-muted"
        onClick={handleTrackClick}
      >
        {/* Thumbnails strip */}
        {thumbnails && thumbnails.length > 0 && (
          <div className="absolute inset-0 flex overflow-hidden rounded-md">
            {thumbnails.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Frame ${i}`}
                className="h-full flex-1 object-cover"
                style={{ width: `${100 / thumbnails.length}%` }}
              />
            ))}
          </div>
        )}

        {/* Trim region highlight */}
        <div
          className="absolute top-0 h-full bg-primary/20"
          style={{
            left: `${trimStartPercent}%`,
            width: `${trimEndPercent - trimStartPercent}%`,
          }}
        />

        {/* Trim start handle */}
        <div
          className="absolute top-0 z-10 h-full w-1 cursor-ew-resize bg-primary opacity-80 hover:opacity-100"
          style={{ left: `${trimStartPercent}%` }}
          onMouseDown={handleTrimStartMouseDown}
        >
          <div className="absolute left-1/2 top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-primary" />
        </div>

        {/* Trim end handle */}
        <div
          className="absolute top-0 z-10 h-full w-1 cursor-ew-resize bg-primary opacity-80 hover:opacity-100"
          style={{ left: `${trimEndPercent}%` }}
          onMouseDown={handleTrimEndMouseDown}
        >
          <div className="absolute left-1/2 top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-primary" />
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 z-20 h-full w-0.5 cursor-grab bg-foreground"
          style={{ left: `${playheadPercent}%` }}
          onMouseDown={handlePlayheadMouseDown}
        >
          <div className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-foreground" />
        </div>
      </div>

      {/* Fine seek slider */}
      <Slider
        value={[currentTime]}
        min={0}
        max={duration}
        step={0.1}
        onValueChange={([v]) => onSeek(v)}
        className="w-full"
      />
    </div>
  );
}
