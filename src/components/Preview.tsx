import React, { useCallback, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Play, Pause } from 'lucide-react';

interface PreviewProps {
  src?: string;
  currentTime?: number;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  className?: string;
}

export function Preview({
  src,
  currentTime,
  onTimeUpdate,
  onDurationChange,
  className,
}: PreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localCurrentTime, setLocalCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  // Sync external currentTime to video element
  useEffect(() => {
    if (videoRef.current && currentTime !== undefined && !isSeeking) {
      const diff = Math.abs(videoRef.current.currentTime - currentTime);
      if (diff > 0.5) {
        videoRef.current.currentTime = currentTime;
      }
    }
  }, [currentTime, isSeeking]);

  const handlePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || isSeeking) return;
    const time = videoRef.current.currentTime;
    setLocalCurrentTime(time);
    onTimeUpdate?.(time);
  }, [onTimeUpdate, isSeeking]);

  const handleLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    setDuration(dur);
    onDurationChange?.(dur);
  }, [onDurationChange]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // When src changes, reset state
  useEffect(() => {
    setIsPlaying(false);
    setLocalCurrentTime(0);
  }, [src]);

  return (
    <div className={cn('relative flex flex-col overflow-hidden rounded-lg bg-black', className)}>
      {/* Video element */}
      <video
        ref={videoRef}
        src={src}
        className="h-full w-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onSeeking={() => setIsSeeking(true)}
        onSeeked={() => setIsSeeking(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        controls={false}
        playsInline
      />

      {/* Overlay controls */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={handlePlayPause}
          className="text-white hover:bg-white/20"
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>
        <span className="text-xs text-white/80">
          {formatTime(localCurrentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Empty state */}
      {!src && (
        <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-muted-foreground">
          No video loaded
        </div>
      )}
    </div>
  );
}
