import React, { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Share2, Loader2, Video, Music } from 'lucide-react';
import type { VideoInfo } from '@/types';

interface ToolbarProps {
  videoInfo: VideoInfo | null;
  onExport: (format: 'mp4') => void;
  onShareClick: () => void;
  isProcessing: boolean;
  className?: string;
}

export function Toolbar({
  videoInfo,
  onExport,
  onShareClick,
  isProcessing,
  className,
}: ToolbarProps) {

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-lg border bg-card p-2 shadow-sm',
        className
      )}
    >
      {/* File info */}
      <div className="flex items-center flex-wrap gap-1.5">
        {videoInfo ? (
          <>
            <Badge variant="outline" className="gap-1 text-xs">
              <Video className="h-3 w-3" />
              {videoInfo.width}x{videoInfo.height}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {formatDuration(videoInfo.duration)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {formatFileSize(videoInfo.fileSize)}
            </Badge>
            {videoInfo.hasAudio && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Music className="h-3 w-3" />
                Audio
              </Badge>
            )}
          </>
        ) : (
          <span className="px-2 text-xs sm:text-sm text-muted-foreground">
            No video loaded
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center flex-wrap gap-1.5 w-full sm:w-auto">
        {isProcessing && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing...
          </div>
        )}

        {/* Export — MP4 only (WebCodecs pipeline outputs H.264 MP4) */}
        <div className="flex items-center gap-1">
          <Button
            variant="default"
            size="sm"
            onClick={() => onExport('mp4')}
            disabled={!videoInfo || isProcessing}
            className="gap-1"
            aria-label="Export as MP4"
          >
            <Video className="h-4 w-4" />
            Export
          </Button>
        </div>

        {/* Share */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onShareClick}
          disabled={!videoInfo}
          className="gap-1"
          aria-label="Share video via peer-to-peer"
        >
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </div>
    </div>
  );
}
