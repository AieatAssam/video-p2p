import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropZone } from '@/components/DropZone';
import { Toolbar } from '@/components/Toolbar';
import { Timeline } from '@/components/Timeline';
import { Preview } from '@/components/Preview';
import { EffectsPanel } from '@/components/EffectsPanel';
import { ShareDialog } from '@/components/ShareDialog';
import type { EffectInput } from '@/lib/effects';
import { Loader2, AlertCircle } from 'lucide-react';
import { LogViewer } from '@/components/LogViewer';
import type { VideoInfo, Effect, EffectType, MediaFile, LogEntry } from '@/types';
import {
  runAccelerationProbe,
  probeFileAcceleration,
  selectPipeline,
  type AccelerationProbe,
  type PipelineDecision,
} from '@/lib/pipeline';
import { exportWithMediaRecorder } from '@/lib/webcodecs-pipeline';

let effectIdCounter = 0;
function genEffectId(): string {
  return `effect-${Date.now()}-${++effectIdCounter}`;
}

/**
 * Maps UI-facing EffectType (kebab-case, from types/index.ts) to the
 * effects pipeline EffectType (camelCase, from effects.ts).
 */
const EFFECT_TYPE_MAP: Record<string, string> = {
  'color-grade': 'colorGrade',
  'text-overlay': 'textOverlay',
  'chroma-key': 'chromaKey',
};

function toPipelineType(uiType: EffectType): string {
  return EFFECT_TYPE_MAP[uiType] ?? uiType;
}

type FileCodecProbe = { codec: string; hw: boolean }[];

export function Editor({ initialFile }: { initialFile?: File | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [fileCodecProbe, setFileCodecProbe] = useState<FileCodecProbe>([]);
  const [editorReady, setEditorReady] = useState(false);

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    setLogs((prev) => [...prev, { timestamp: Date.now(), level, message }]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const fileDataRef = useRef<File | null>(null);
  const probeStartedRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      thumbnails.forEach((t) => URL.revokeObjectURL(t));
    };
  }, [previewUrl, thumbnails]);

  /** Initialize the editor (probe GPU, mark ready). */
  useEffect(() => {
    if (!probeStartedRef.current) {
      probeStartedRef.current = true;

      // System info
      const cores = navigator.hardwareConcurrency ?? 'unknown';
      const isolated = typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false;
      addLog('debug', `🔧 System: ${cores} logical cores, crossOriginIsolated=${isolated}`);

      // GPU probe
      runAccelerationProbe(addLog)
        .then((probe) => {
          // Cache for later use
          (window as unknown as Record<string, unknown>).__accelProbe = probe;
        })
        .catch(() => {});

      setEditorReady(true);
    }
  }, [addLog]);

  // Process file from the landing page automatically on mount
  useEffect(() => {
    if (initialFile && !file) {
      handleFileSelected(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  // Handle file selection
  const handleFileSelected = useCallback(async (selectedFile: File) => {
    addLog('info', `📁 File picked: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(1)} MB)`);

    setFile(selectedFile);
    setLoadError(null);

    try {
      setIsProcessing(true);
      setProcessingStatus('Analyzing video...');

      fileDataRef.current = selectedFile;

      // Create object URL for preview
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);

      // Determine video info from a native <video> element
      const tempVideo = document.createElement('video');
      tempVideo.muted = true;
      tempVideo.playsInline = true;
      tempVideo.preload = 'auto';

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video metadata load timed out')), 30000);
        tempVideo.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve();
        };
        tempVideo.onerror = () => {
          clearTimeout(timeout);
          const err = tempVideo.error;
          reject(new Error(`Video decode error: ${err?.message ?? 'unsupported format'}`));
        };
        tempVideo.src = url;
      });

      const info: VideoInfo = {
        width: tempVideo.videoWidth,
        height: tempVideo.videoHeight,
        duration: tempVideo.duration,
        fps: 30,
        fileSize: selectedFile.size,
        hasAudio: tempVideo.mozHasAudio ?? true,
        codec: 'unknown',
        name: selectedFile.name,
      };

      setVideoInfo(info);
      setDuration(info.duration);
      setTrimEnd(info.duration);

      // Probe codec for hardware acceleration
      const probe = (window as unknown as Record<string, unknown>).__accelProbe as AccelerationProbe | undefined;
      if (probe) {
        const codecs = probeFileAcceleration(tempVideo, probe);
        setFileCodecProbe(codecs);
      }

      addLog('info', `  Resolution: ${info.width}x${info.height}, ${info.duration.toFixed(1)}s`);

      // Generate thumbnails using a dedicated video element with its own
      // blob URL — sharing tempVideo's blob URL with the Preview disrupts
      // Chrome's media pipeline (FFmpegDemuxer: data source error).
      if (fileDataRef.current) {
        generateThumbnails(fileDataRef.current, info.duration)
          .then((urls) => {
            setThumbnails(urls);
            addLog('debug', `  Generated ${urls.length} thumbnails`);
          })
          .catch((err) => {
            addLog('warn', `  Thumbnail generation failed: ${err instanceof Error ? err.message : err}`);
          });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addLog('error', `Failed to load video: ${message}`);
      setLoadError(message);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [addLog]);

  const handleAddEffect = useCallback((type: EffectType) => {
    const id = genEffectId();
    setEffects((prev) => [...prev, { id, type, params: {}, enabled: true }]);
    addLog('info', `✨ Added effect: ${type}`);
  }, [addLog]);

  const handleRemoveEffect = useCallback((id: string) => {
    setEffects((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleUpdateEffect = useCallback(
    (id: string, params: Record<string, unknown>) => {
      setEffects((prev) =>
        prev.map((e) => (e.id === id ? { ...e, params: { ...e.params, ...params } } : e))
      );
    },
    []
  );

  const handleToggleEffect = useCallback((id: string) => {
    setEffects((prev) =>
      prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e))
    );
  }, []);

  // Export handler — uses browser-native WebCodecs pipeline (MP4 only)
  const handleExport = useCallback(
    async (format: 'mp4') => {
      if (!file || !videoInfo) return;

      let savedPreviewUrl: string | undefined;

      try {
        setIsProcessing(true);
        setProcessingProgress(0);
        const statusMsg = `Exporting as ${format.toUpperCase()}...`;
        setProcessingStatus(statusMsg);
        savedPreviewUrl = previewUrl;

        // Build effect chain from enabled effects, mapping UI types to pipeline types
        const activeEffects = effects.filter((e) => e.enabled);
        const effectInputs: EffectInput[] = activeEffects.map((e) => ({
          type: toPipelineType(e.type) as EffectInput['type'],
          params: e.params,
        }));

        // Prepend trim if needed
        if (trimStart > 0 || trimEnd < duration) {
          effectInputs.unshift({
            type: 'trim',
            params: { start: trimStart, end: trimEnd },
          });
        }

        // Pipeline selection — always webcodecs now
        const decision = selectPipeline(
          effectInputs,
          format,
          videoInfo?.hasAudio ?? false,
          null,
          fileCodecProbe
        );
        addLog('info', `🚀 Pipeline: ${decision.pipeline} — ${decision.reason}`);
        if (decision.audioHandling === 'dropped' && videoInfo?.hasAudio) {
          addLog('warn', '🔇 Audio will be dropped — WebCodecs pipeline captures canvas only');
        }

        if (!previewUrl) {
          addLog('error', 'No preview URL — cannot export');
          return;
        }

        addLog('info', 'Starting WebCodecs export (Canvas2D + MediaRecorder)...');

        // Create a dedicated blob URL for the export pipeline
        let exportVideoUrl = previewUrl;
        if (fileDataRef.current) {
          try {
            const fileData = await fileDataRef.current.arrayBuffer();
            const exportBlob = new Blob([fileData], { type: fileDataRef.current.type });
            exportVideoUrl = URL.createObjectURL(exportBlob);
          } catch {
            addLog('warn', 'Could not create dedicated export URL — using preview URL');
          }
        }

        const blob = await exportWithMediaRecorder({
          videoUrl: exportVideoUrl,
          effects: effectInputs,
          trimStart,
          trimEnd,
          addLog,
          onProgress: (e) => {
            setProcessingProgress(e.percent);
            setProcessingStatus(`${statusMsg} (${e.percent.toFixed(0)}%)`);
          },
        });

        if (exportVideoUrl !== previewUrl) {
          URL.revokeObjectURL(exportVideoUrl);
        }

        // Trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = format === 'mp4' ? 'mp4' : 'webm';
        a.download = `export.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setProcessingStatus('Export complete!');
        setTimeout(() => {
          setProcessingStatus('');
          setIsProcessing(false);
        }, 2000);
      } catch (err) {
        const message =
          err instanceof Error ? err.message :
          typeof err === 'string' ? err :
          err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) :
          'Export failed';
        addLog('error', `Export failed: ${message}`);
        setLoadError(message);
        setIsProcessing(false);
        setProcessingStatus('');
      } finally {
        if (savedPreviewUrl && !previewUrl) {
          setPreviewUrl(savedPreviewUrl);
          addLog('info', 'Restored preview after export');
        }
      }
    },
    [file, videoInfo, effects, trimStart, trimEnd, duration, addLog, previewUrl]
  );

  const handleShareClick = useCallback(() => {
    setShareDialogOpen(true);
  }, []);

  const mediaFile: MediaFile | null = file
    ? {
        name: file.name,
        type: file.type,
        size: file.size,
        data: new ArrayBuffer(0),
      }
    : null;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h1 className="text-lg font-bold">Video P2P Editor</h1>
        {!editorReady && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Starting editor...
          </div>
        )}
        {loadError && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="max-w-[300px] truncate">{loadError}</span>
          </div>
        )}
      </header>

      {/* Toolbar */}
      <Toolbar
        videoInfo={videoInfo}
        onExport={handleExport}
        onShareClick={handleShareClick}
        isProcessing={isProcessing}
        className="mx-4 mt-2"
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col md:flex-row gap-4 overflow-hidden p-4">
        {/* Left panel: Preview + Timeline */}
        <div className="flex flex-1 flex-col gap-4 overflow-hidden min-h-0">
          <Preview
            src={previewUrl}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
            onDurationChange={setDuration}
            onLog={addLog}
            className="flex-1 min-h-[200px]"
          />

          {file && (
            <Timeline
              duration={duration}
              currentTime={currentTime}
              onSeek={setCurrentTime}
              onLog={addLog}
              trimStart={trimStart}
              trimEnd={trimEnd}
              onTrimChange={(start, end) => {
                setTrimStart(start);
                setTrimEnd(end);
              }}
              thumbnails={thumbnails}
            />
          )}
        </div>

        {/* Right panel */}
        <div className="w-full md:w-80 shrink-0 overflow-y-auto max-h-[50vh] md:max-h-none">
          {file ? (
            <EffectsPanel
              effects={effects}
              onAddEffect={handleAddEffect}
              onRemoveEffect={handleRemoveEffect}
              onUpdateEffect={handleUpdateEffect}
              onToggleEffect={handleToggleEffect}
            />
          ) : initialFile ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span>Preparing editor...</span>
              </div>
            </div>
          ) : (
            <DropZone onFileSelected={handleFileSelected} className="h-full" />
          )}
        </div>
      </div>

      {/* Processing status bar */}
      {isProcessing && processingStatus && (
        <div className="flex-shrink-0 border-t border-border bg-card/80 px-4 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            <span className="text-xs font-medium text-foreground/80">{processingStatus}</span>
            <span className="text-[10px] text-muted-foreground/60 shrink-0">
              {processingProgress > 0 ? `${processingProgress}%` : 'starting...'}
            </span>
            <div className="h-1.5 flex-1 min-w-[60px] max-w-[200px] rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{
                  width: `${processingProgress > 0 ? Math.min(processingProgress, 100) : 3}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Share dialog */}
      <ShareDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        file={mediaFile}
      />

      {/* Debug log panel */}
      <LogViewer logs={logs} onClear={clearLogs} />
    </div>
  );
}

export default Editor;

/**
 * Generate thumbnail strip using a dedicated video element with its own
 * blob URL — avoids sharing the data source with the Preview's <video>,
 * which causes Chrome's "FFmpegDemuxer: data source error" when seeking.
 * No DOM attachment needed; double rAF handles frame readiness.
 */
async function generateThumbnails(
  file: File,
  duration: number
): Promise<string[]> {
  const THUMB_COUNT = 10;
  const urls: string[] = [];

  if (duration <= 0) return urls;

  // Create independent blob URL from the File — separate data pipe
  // from the Preview's blob URL, so seeking here doesn't disrupt playback.
  const thumbUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = thumbUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('metadata timeout')), 10000);
      video.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
      video.onerror = () => { clearTimeout(timeout); reject(new Error('load error')); };
      if (video.readyState >= 2) { clearTimeout(timeout); resolve(); }
    });
  } catch (err) {
    URL.revokeObjectURL(thumbUrl);
    throw err; // surface to caller for logging
  }

  if (video.videoWidth === 0) {
    URL.revokeObjectURL(thumbUrl);
    return urls;
  }

  const canvas = document.createElement('canvas');
  const thumbWidth = 160;
  const thumbHeight = Math.round((thumbWidth / video.videoWidth) * video.videoHeight);
  canvas.width = thumbWidth;
  canvas.height = thumbHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(thumbUrl);
    return urls;
  }

  for (let i = 0; i < THUMB_COUNT; i++) {
    const seekTime = (i / (THUMB_COUNT - 1)) * (duration - 0.1);

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('seek timeout')), 3000);
        const onSeeked = () => {
          clearTimeout(timeout);
          video.removeEventListener('seeked', onSeeked);
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        };
        video.addEventListener('seeked', onSeeked, { once: true });
        video.currentTime = seekTime;
        if (Math.abs(video.currentTime - seekTime) < 0.05) {
          clearTimeout(timeout);
          video.removeEventListener('seeked', onSeeked);
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }
      });
    } catch {
      continue;
    }

    if (video.readyState < 2) continue;

    ctx.drawImage(video, 0, 0, thumbWidth, thumbHeight);
    const jpegBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.7)
    );
    if (jpegBlob) {
      urls.push(URL.createObjectURL(jpegBlob));
    }
  }

  URL.revokeObjectURL(thumbUrl);
  return urls;
}
