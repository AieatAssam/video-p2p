import React, { useCallback, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Play, Pause, AlertTriangle } from 'lucide-react';
import type { LogEntry } from '@/types';

interface PreviewProps {
  src?: string;
  currentTime?: number;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  className?: string;
  onLog?: (level: LogEntry['level'], message: string) => void;
}

export function Preview({
  src,
  currentTime,
  onTimeUpdate,
  onDurationChange,
  className,
  onLog,
}: PreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localCurrentTime, setLocalCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Sync external currentTime to video element when scrubbing the timeline.
  // External seeks always override regardless of isSeeking — otherwise fast drags
  // during an in-progress seek are swallowed, making the playhead seem unresponsive.
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
    // Autoplay policies and unsupported codecs can cause play() to reject.
    // We catch the rejection to surface it rather than swallowing it silently.
    onLog?.('info', '▶️ Play requested');
    try {
      // Check readyState before attempting play
      if (video.readyState < 2) {
        onLog?.('warn', `play() called but readyState=${video.readyState} (HAVE_CURRENT_DATA=2 needed), waiting for canplay...`);
        await new Promise<void>((resolve) => {
          const onCanPlay = () => {
            video.removeEventListener('canplay', onCanPlay);
            resolve();
          };
          video.addEventListener('canplay', onCanPlay);
          // If already ready by the time we check
          if (video.readyState >= 2) {
            video.removeEventListener('canplay', onCanPlay);
            resolve();
          }
        });
        onLog?.('info', '⏳ Waited for canplay, now attempting play()');
      }
      await video.play();
      setIsPlaying(true);
      setPlaybackError(null);
      onLog?.('info', '▶️ Playback started successfully');
    } catch (err) {
      setIsPlaying(false);
      const errorObj = err as { name?: string; message?: string; code?: number };
      const msg = errorObj?.message ?? String(err);
      const name = errorObj?.name ?? '';
      // Log the full error details to the debug panel
      onLog?.('error', `▶️ Playback failed: ${name ? `[${name}] ` : ''}${msg}`);
      // NotAllowedError = autoplay policy (user gesture needed) — recoverable
      // NotSupportedError = codec not supported by browser — permanent
      if (msg.includes('NotAllowedError') || name === 'NotAllowedError' || msg.includes('user gesture')) {
        setPlaybackError('Click play to start (browser requires interaction)');
        onLog?.('warn', 'Playback blocked by autoplay policy — user gesture required');
      } else if (msg.includes('NotSupportedError') || name === 'NotSupportedError') {
        setPlaybackError(
          `Playback failed — this video codec may not be supported by your browser. ` +
          `Try MP4 export or a different browser.`
        );
        onLog?.('error', 'Codec not supported by browser for real-time playback');
      } else {
        setPlaybackError(
          `Playback failed — this video codec may not be supported by your browser. ` +
          `Try MP4 export or a different browser.`
        );
      }
    }
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
          ? `Video codec not supported — this browser can't play this format. Try a different browser or export to MP4.`
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

  // When src changes, reset state
  useEffect(() => {
    setIsPlaying(false);
    setLocalCurrentTime(0);
    setPlaybackError(null);
  }, [src]);

  return (
    <div className={cn('relative flex flex-col overflow-hidden rounded-lg bg-black', className)}>
      {/* Video element — muted helps autoplay policies */}
      <video
        ref={videoRef}
        src={src}
        className="h-full w-full object-contain"
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

      {/* Overlay controls — only show when a video is loaded */}
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
