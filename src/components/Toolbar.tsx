import React, { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Download,
  Share2,
  Loader2,
  Video,
  Music,
  Image as ImageIcon,
} from 'lucide-react';
import type { VideoInfo } from '@/types';

interface ToolbarProps {
  videoInfo: VideoInfo | null;
  onExport: (format: 'mp4' | 'gif' | 'audio') => void;
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
  const [exportFormat, setExportFormat] = useState<'mp4' | 'gif' | 'audio'>('mp4');

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getExportIcon = () => {
    switch (exportFormat) {
      case 'mp4':
        return <Video className="h-4 w-4" />;
      case 'gif':
        return <ImageIcon className="h-4 w-4" />;
      case 'audio':
        return <Music className="h-4 w-4" />;
    }
  };

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg border bg-card p-2 shadow-sm',
        className
      )}
    >
      {/* File info */}
      <div className="flex items-center gap-2">
        {videoInfo ? (
          <>
            <Badge variant="outline" className="gap-1">
              <Video className="h-3 w-3" />
              {videoInfo.width}x{videoInfo.height}
            </Badge>
            <Badge variant="outline">
              {formatDuration(videoInfo.duration)}
            </Badge>
            <Badge variant="outline">
              {formatFileSize(videoInfo.fileSize)}
            </Badge>
            {videoInfo.hasAudio && (
              <Badge variant="outline" className="gap-1">
                <Music className="h-3 w-3" />
                Audio
              </Badge>
            )}
          </>
        ) : (
          <span className="px-2 text-sm text-muted-foreground">
            No video loaded
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Processing indicator */}
        {isProcessing && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing...
          </div>
        )}

        {/* Export */}
        <div className="flex items-center gap-1">
          <Select
            value={exportFormat}
            onValueChange={(v) => setExportFormat(v as 'mp4' | 'gif' | 'audio')}
          >
            <SelectTrigger className="h-8 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mp4">MP4</SelectItem>
              <SelectItem value="gif">GIF</SelectItem>
              <SelectItem value="audio">Audio</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="default"
            size="sm"
            onClick={() => onExport(exportFormat)}
            disabled={!videoInfo || isProcessing}
            className="gap-1"
            aria-label={`Export as ${exportFormat.toUpperCase()}`}
          >
            {getExportIcon()}
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
