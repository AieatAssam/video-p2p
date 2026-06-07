import React, { useCallback, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Play, Pause, AlertTriangle } from 'lucide-react';
import { applyEffectsToFrame } from '@/lib/effect-renderer';
import type { EffectInput } from '@/lib/effects';
import type { LogEntry } from '@/types';

interface PreviewProps {
  src?: string;
  currentTime?: number;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  className?: string;
  onLog?: (level: LogEntry['level'], message: string) => void;
  /** Live effects to render on the canvas overlay */
  liveEffects?: EffectInput[];
}

export function Preview({
  src,
  currentTime,
  onTimeUpdate,
  onDurationChange,
  className,
  onLog,
  liveEffects,
}: PreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localCurrentTime, setLocalCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const hasLiveEffects = liveEffects && liveEffects.length > 0;

  // ── Canvas render loop (when effects are active) ──
  useEffect(() => {
    if (!hasLiveEffects) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      rafRef.current = requestAnimationFrame(render);

      if (video.readyState < 2) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      applyEffectsToFrame({
        source: video,
        srcWidth: video.videoWidth,
        srcHeight: video.videoHeight,
        ctx,
        outW: canvas.width,
        outH: canvas.height,
        effects: liveEffects!,
        live: true,
      });
    };

    rafRef.current = requestAnimationFrame(render);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [hasLiveEffects, liveEffects]);

  // Sync external currentTime to video element when scrubbing the timeline.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || currentTime === undefined) return;
    const diff = Math.abs(video.currentTime - currentTime);
    if (diff > 0.1) {
      onLog?.('debug', `🎯 Syncing video.currentTime: ${video.currentTime.toFixed(2)} → ${currentTime.toFixed(2)} (diff=${diff.toFixed(2)})`);
      video.currentTime = currentTime;
    }
  }, [currentTime, onLog]);

  const doPlay = useCallback(async (video: HTMLVideoElement) => {
    const tryPlay = async (attempt: number): Promise<void> => {
      onLog?.('info', `▶️ Play requested (attempt ${attempt + 1})`);
      try {
        if (onLog) {
          onLog('debug', `🎬 readyState=${video.readyState} before play()`);
        }
        await video.play();
        setIsPlaying(true);
        setPlaybackError(null);
        onLog?.('info', '▶️ Playback started successfully');
      } catch (err) {
        const errorObj = err as { name?: string; message?: string; code?: number };
        const msg = errorObj?.message ?? String(err);
        const name = errorObj?.name ?? '';
        onLog?.('error', `▶️ Playback failed: ${name ? `[${name}] ` : ''}${msg}`);

        if ((name === 'AbortError' || msg.includes('AbortError')) && attempt < 2) {
          onLog?.('info', '⏳ Play was interrupted — retrying in 500ms...');
          await new Promise((r) => setTimeout(r, 500));
          return tryPlay(attempt + 1);
        }

        if (msg.includes('NotAllowedError') || name === 'NotAllowedError' || msg.includes('user gesture')) {
          setPlaybackError('Click play to start (browser requires interaction)');
          onLog?.('warn', 'Playback blocked by autoplay policy — user gesture required');
        } else if (msg.includes('NotSupportedError') || name === 'NotSupportedError') {
          setPlaybackError('Playback failed — this video codec may not be supported by your browser.');
          onLog?.('error', 'Codec not supported by browser for real-time playback');
        } else {
          setIsPlaying(false);
          setPlaybackError('Playback failed — this video codec may not be supported by your browser.');
        }
      }
    };

    await tryPlay(0);
  }, [onLog]);

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      doPlay(video);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [doPlay]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || isSeeking) return;
    const time = videoRef.current.currentTime;
    setLocalCurrentTime(time);
    onTimeUpdate?.(time);
  }, [onTimeUpdate, isSeeking]);

  const handleLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    if (isFinite(dur) && dur > 0) {
      setDuration(dur);
      onDurationChange?.(dur);
    }
    setPlaybackError(null);
  }, [onDurationChange]);

  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const mediaError = video.error;
    if (mediaError) {
      const codeNames: Record<number, string> = {
        1: 'MEDIA_ERR_ABORTED',
        2: 'MEDIA_ERR_NETWORK',
        3: 'MEDIA_ERR_DECODE',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
      };
      const codeName = codeNames[mediaError.code] ?? `Unknown(${mediaError.code})`;
      const detail = mediaError.message ? ` — ${mediaError.message}` : '';
      onLog?.('error', `🎬 Video element error [${codeName}]${detail}`);
      onLog?.('debug', `🎬 networkState=${video.networkState} readyState=${video.readyState} src="${video.currentSrc || '(none)'}"`);

      setPlaybackError(
        mediaError.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? 'Video codec not supported — this browser can\'t play this format.'
          : `Video error (${codeName}): ${mediaError.message || 'Unknown error'}`
      );
    } else {
      onLog?.('error', '🎬 Video playback error (no mediaError object)');
      setPlaybackError('Video playback error');
    }
  }, [onLog]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    setIsPlaying(false);
    setLocalCurrentTime(0);
    setPlaybackError(null);
  }, [src]);

  return (
    <div className={cn('relative flex flex-col overflow-hidden rounded-lg bg-black', className)}>
      {/* Video element — hidden when canvas overlay is active */}
      <video
        ref={videoRef}
        src={src || undefined}
        className={cn('h-full w-full object-contain', hasLiveEffects && 'hidden')}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleVideoError}
        onSeeking={() => setIsSeeking(true)}
        onSeeked={() => setIsSeeking(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        controls={false}
        playsInline
        muted
      />

      {/* Canvas overlay for live effects */}
      {hasLiveEffects && (
        <canvas
          ref={canvasRef}
          className="h-full w-full object-contain"
        />
      )}

      {/* Overlay controls */}
      {src && (
        <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePlayPause}
            className="text-white hover:bg-white/20"
            aria-label={isPlaying ? 'Pause video' : 'Play video'}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>
          <span className="text-xs text-white/80">
            {formatTime(localCurrentTime)} / {formatTime(duration)}
          </span>
          {hasLiveEffects && (
            <span className="text-[10px] text-yellow-400/80 ml-1">⚡ effects live</span>
          )}
        </div>
      )}

      {/* Playback error banner */}
      {playbackError && (
        <div className="absolute left-0 right-0 top-0 flex items-center gap-2 bg-destructive/90 p-2 text-xs text-destructive-foreground">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{playbackError}</span>
        </div>
      )}

      {/* Empty state */}
      {!src && (
        <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-muted-foreground">
          No video loaded
        </div>
      )}
    </div>
  );
}
