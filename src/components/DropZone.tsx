import React, { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Upload, Film, AlertCircle } from 'lucide-react';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  accept?: string;
  className?: string;
}

/** Video extensions we support for validation. */
const VIDEO_EXTS = ['mp4', 'webm', 'ogg', 'avi', 'mov', 'mkv', 'm4v', '3gp', 'flv'];

export function DropZone({ onFileSelected, accept = 'video/*', className }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    // Check MIME type — if the browser provides one, validate against our list
    if (file.type && file.type.startsWith('video/')) return true;
    // Check extension fallback for files where type is empty
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext && VIDEO_EXTS.includes(ext)) return true;
    // If we can't determine the type, let it through
    return !file.type;
  };

  const handleFile = (file: File) => {
    if (!validateFile(file)) {
      setError(`Unsupported file type: ${file.type || 'unknown'}. Please use a video file (MP4, WebM, MOV, etc.).`);
      return;
    }
    setError(null);
    setSelectedFile(file);
    onFileSelected(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [onFileSelected]
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [onFileSelected]
  );

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      aria-label="Drop video file here or click to browse"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors',
        isDragOver
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-muted-foreground/50',
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />
      {error && (
        <div className="mb-2 flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {selectedFile ? (
        <div className="flex flex-col items-center gap-2">
          <Film className="h-10 w-10 text-primary" />
          <p className="text-sm font-medium">{selectedFile.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatSize(selectedFile.size)}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">
            Drop your video here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            Supports MP4, WebM, AVI, MOV and more
          </p>
        </div>
      )}
    </div>
  );
}

export default DropZone;
