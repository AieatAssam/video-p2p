import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropZone } from '@/components/DropZone';
import { Toolbar } from '@/components/Toolbar';
import { Timeline } from '@/components/Timeline';
import { Preview } from '@/components/Preview';
import { EffectsPanel } from '@/components/EffectsPanel';
import { ShareDialog } from '@/components/ShareDialog';
import { FFmpegEngine } from '@/lib/ffmpeg';
import { chainEffects, type EffectInput } from '@/lib/effects';
import { Loader2, AlertCircle } from 'lucide-react';
import type { VideoInfo, Effect, EffectType, MediaFile } from '@/types';

let effectIdCounter = 0;
function genEffectId(): string {
  return `effect-${Date.now()}-${++effectIdCounter}`;
}

/**
 * Maps UI-facing EffectType (kebab-case, from types/index.ts) to the 
 * effects pipeline EffectType (camelCase, from effects.ts).
 * The two modules define different union types with the same name,
 * so this adapter bridges them without `as any` casts.
 */
const EFFECT_TYPE_MAP: Record<string, string> = {
  'color-grade': 'colorGrade',
  'text-overlay': 'textOverlay',
  'chroma-key': 'chromaKey',
  'audio-extract': 'audioExtract',
  'audio-replace': 'audioReplace',
  'gif-export': 'gif',
  'frame-extract': 'frameExtract',
  'split-screen': 'splitScreen',
};

function toPipelineType(uiType: EffectType): string {
  return EFFECT_TYPE_MAP[uiType] ?? uiType;
}

export function Editor() {
  const [file, setFile] = useState<File | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  const ffmpegRef = useRef<FFmpegEngine | null>(null);
  const originalDataRef = useRef<Uint8Array | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Revoke any object URLs to prevent memory leaks
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      thumbnails.forEach((t) => URL.revokeObjectURL(t));
    };
  }, [previewUrl, thumbnails]);

  /**
   * Attempt to load ffmpeg.wasm. Shows a descriptive error message
   * if cross-origin isolation (COOP/COEP) is missing — the most common
   * cause of SharedArrayBuffer failure.
   */
  const initFfmpeg = useCallback(async (engine: FFmpegEngine) => {
    try {
      await engine.load();
      setFfmpegLoaded(true);
      setLoadError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      // Detect missing SharedArrayBuffer / cross-origin isolation
      if (message.includes('SharedArrayBuffer') || !crossOriginIsolated) {
        setLoadError(
          'FFmpeg requires cross-origin isolation (SharedArrayBuffer). ' +
          'A service worker was registered to provide this. ' +
          'If this persists, try reloading the page.'
        );
      } else {
        setLoadError(`Failed to load FFmpeg: ${message}`);
      }
    }
  }, []);

  // Initialize FFmpeg
  useEffect(() => {
    const engine = new FFmpegEngine();
    ffmpegRef.current = engine;
    initFfmpeg(engine);

    return () => {
      engine.terminate();
    };
  }, [initFfmpeg]);

  /** Retry ffmpeg.wasm loading after a failure. */
  const handleRetryFfmpeg = useCallback(async () => {
    setIsRetrying(true);
    setLoadError(null);
    const engine = new FFmpegEngine();
    ffmpegRef.current = engine;
    await initFfmpeg(engine);
    setIsRetrying(false);
  }, [initFfmpeg]);

  // Handle file selection
  const handleFileSelected = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setLoadError(null);

    const engine = ffmpegRef.current;
    if (!engine || !ffmpegLoaded) {
      setLoadError('FFmpeg is not loaded yet. Please wait.');
      return;
    }

    try {
      setIsProcessing(true);
      setProcessingStatus('Loading file...');

      // Load file into ffmpeg virtual filesystem
      const data = await engine.loadFile(selectedFile);
      originalDataRef.current = data;
      await engine.writeFile('input', data);

      // Extract video info using ffprobe via ffmpeg
      setProcessingStatus('Analyzing video...');

      // Create object URL for preview
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);

      // Determine video info from the file
      // We use a temporary video element to get metadata (same URL as preview)
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = url;

      const videoDuration = await new Promise<number>((resolve) => {
        tempVideo.onloadedmetadata = () => {
          const info: VideoInfo = {
            width: tempVideo.videoWidth,
            height: tempVideo.videoHeight,
            duration: tempVideo.duration,
            fps: 30,
            fileSize: selectedFile.size,
            hasAudio: true,
            codec: 'h264',
            name: selectedFile.name,
          };
          setVideoInfo(info);
          setDuration(tempVideo.duration);
          setTrimEnd(tempVideo.duration);
          setCurrentTime(0);
          setEffects([]);
          resolve(tempVideo.duration);
        };
        tempVideo.onerror = () => {
          // Fallback info when video metadata can't be read
          const fallbackDuration = 10;
          const info: VideoInfo = {
            width: 640,
            height: 480,
            duration: fallbackDuration,
            fps: 30,
            fileSize: selectedFile.size,
            hasAudio: true,
            codec: 'h264',
            name: selectedFile.name,
          };
          setVideoInfo(info);
          setDuration(fallbackDuration);
          setTrimEnd(fallbackDuration);
          resolve(fallbackDuration);
        };
        tempVideo.src = url;
      });

      // Extract thumbnails — pass duration directly instead of relying on React state
      setProcessingStatus('Extracting thumbnails...');
      try {
        await extractThumbnails(engine, data, videoDuration);
      } catch {
        // Thumbnails are optional
      }

      setProcessingStatus('');
      setIsProcessing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load file';
      setLoadError(message);
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [ffmpegLoaded]);

  const extractThumbnails = async (
    engine: FFmpegEngine,
    data: Uint8Array,
    videoDuration: number
  ) => {
    const thumbs: string[] = [];
    const numThumbs = 10;

    // Write original data if not already written
    try {
      await engine.writeFile('input', data);
    } catch {
      // File may already exist
    }

    for (let i = 0; i < numThumbs; i++) {
      const time = (videoDuration / numThumbs) * i;
      const thumbFile = `thumb_${i}.png`;
      try {
        await engine.execCommand([
          '-i', 'input',
          '-ss', String(time),
          '-vframes', '1',
          '-vf', 'scale=160:-1',
          thumbFile,
        ]);
        const thumbData = await engine.readFile(thumbFile);
        const blob = new Blob([thumbData], { type: 'image/png' });
        thumbs.push(URL.createObjectURL(blob));
        await engine.deleteFile(thumbFile);
      } catch {
        // Skip failed thumbnails
      }
    }

    setThumbnails(thumbs);
  };

  // Effect handlers
  const handleAddEffect = useCallback((type: EffectType) => {
    const defaultParams: Record<string, unknown> = {};
    switch (type) {
      case 'trim':
        defaultParams.start = trimStart;
        defaultParams.end = trimEnd;
        break;
      case 'crop':
        defaultParams.x = 0;
        defaultParams.y = 0;
        defaultParams.width = videoInfo?.width ?? 640;
        defaultParams.height = videoInfo?.height ?? 480;
        break;
      case 'resize':
        defaultParams.width = videoInfo?.width ?? 640;
        defaultParams.height = videoInfo?.height ?? 480;
        defaultParams.keepAspect = true;
        break;
      case 'speed':
        defaultParams.factor = 1;
        break;
      case 'reverse':
        break;
      case 'filter':
        defaultParams.preset = 'none';
        break;
      case 'color-grade':
        defaultParams.brightness = 0;
        defaultParams.contrast = 1;
        defaultParams.saturation = 1;
        defaultParams.gamma = 1;
        break;
      case 'blur':
        defaultParams.radius = 5;
        break;
      case 'pixelate':
        defaultParams.blockSize = 10;
        break;
      case 'text-overlay':
        defaultParams.text = 'Your Text';
        defaultParams.x = 10;
        defaultParams.y = 10;
        defaultParams.fontSize = 24;
        defaultParams.color = '#ffffff';
        break;
      case 'chroma-key':
        defaultParams.color = '#00ff00';
        defaultParams.similarity = 0.1;
        defaultParams.blend = 0;
        break;
      case 'gif-export':
        defaultParams.fps = 10;
        defaultParams.width = 480;
        defaultParams.dither = true;
        break;
      case 'audio-extract':
        defaultParams.format = 'mp3';
        defaultParams.bitrate = 192;
        break;
      case 'audio-replace':
        defaultParams.matchVideo = true;
        break;
      case 'stabilize':
        defaultParams.smoothness = 5;
        break;
      default:
        break;
    }

    const newEffect: Effect = {
      id: genEffectId(),
      type,
      params: defaultParams,
      enabled: true,
    };
    setEffects((prev) => [...prev, newEffect]);
  }, [trimStart, trimEnd, videoInfo]);

  const handleRemoveEffect = useCallback((id: string) => {
    setEffects((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleUpdateEffect = useCallback((id: string, params: Record<string, unknown>) => {
    setEffects((prev) =>
      prev.map((e) => (e.id === id ? { ...e, params } : e))
    );
  }, []);

  const handleToggleEffect = useCallback((id: string) => {
    setEffects((prev) =>
      prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e))
    );
  }, []);

  // Export handler
  const handleExport = useCallback(
    async (format: 'mp4' | 'gif' | 'audio') => {
      const engine = ffmpegRef.current;
      if (!engine || !file || !videoInfo) return;

      try {
        setIsProcessing(true);
        const statusMsg = `Exporting as ${format.toUpperCase()}...`;
        setProcessingStatus(statusMsg);

        // Write input file to ffmpeg's virtual filesystem
        if (originalDataRef.current) {
          await engine.writeFile('input', originalDataRef.current);
        }

        // Build effect chain from enabled effects, mapping UI types to pipeline types
        const activeEffects = effects.filter((e) => e.enabled);
        const effectInputs: EffectInput[] = activeEffects.map((e) => ({
          type: toPipelineType(e.type) as EffectInput['type'],
          params: e.params,
        }));

        // Prepend trim if needed (trim is handled via timeline, not effect list)
        if (trimStart > 0 || trimEnd < duration) {
          effectInputs.unshift({
            type: 'trim',
            params: { start: trimStart, end: trimEnd },
          });
        }

        // Shared progress callback for ffmpeg operations
        const onProgress = (event: { percent: number }) => {
          setProcessingStatus(`${statusMsg} (${event.percent}%)`);
        };

        let outputFile: string;
        let outputMime: string;
        let successMessage: string;

        switch (format) {
          case 'mp4': {
            const args = chainEffects('input', effectInputs, 'output.mp4');
            args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '23');
            if (videoInfo.hasAudio) {
              args.push('-c:a', 'aac', '-b:a', '128k');
            }
            await engine.execCommand(args, onProgress);
            outputFile = 'output.mp4';
            outputMime = 'video/mp4';
            successMessage = 'MP4 exported successfully!';
            break;
          }
          case 'gif': {
            // Find user-configured GIF effect, or use defaults
            const gifEffect = effectInputs.find((e) => e.type === 'gif');
            const params = gifEffect?.params ?? { fps: 10, width: 480, dither: true };
            const otherEffects = effectInputs.filter((e) => e.type !== 'gif');
            const gifInput: EffectInput = { type: 'gif', params };
            const args = chainEffects('input', [...otherEffects, gifInput], 'output.gif');
            await engine.execCommand(args, onProgress);
            outputFile = 'output.gif';
            outputMime = 'image/gif';
            successMessage = 'GIF exported successfully!';
            break;
          }
          case 'audio': {
            // Find user-configured audio extract effect, or use defaults
            const audioEffect = effectInputs.find((e) => e.type === 'audioExtract');
            const audioFormat = (audioEffect?.params?.format as string) ?? 'mp3';
            const bitrate = (audioEffect?.params?.bitrate as number) ?? 192;
            outputFile = `output.${audioFormat}`;
            outputMime = `audio/${audioFormat === 'mp3' ? 'mpeg' : audioFormat}`;
            successMessage = 'Audio exported successfully!';

            // Build audio-extraction command: strip video, keep audio with chosen codec
            const formatCodecMap: Record<string, string> = {
              mp3: 'libmp3lame',
              wav: 'pcm_s16le',
              aac: 'aac',
              ogg: 'libvorbis',
            };
            const codec = formatCodecMap[audioFormat] ?? 'libmp3lame';
            const args = chainEffects('input', effectInputs, outputFile);
            // Override output codec for audio extraction
            args.push('-vn', '-acodec', codec, '-b:a', `${bitrate}k`);
            await engine.execCommand(args, onProgress);
            break;
          }
        }

        // Read back the output file and trigger browser download
        const outputData = await engine.readFile(outputFile);
        const blob = new Blob([outputData], { type: outputMime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = outputFile;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Cleanup output file from virtual filesystem
        await engine.deleteFile(outputFile);

        setProcessingStatus(successMessage);
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
        setLoadError(message);
        setIsProcessing(false);
        setProcessingStatus('');
      }
    },
    [file, videoInfo, effects, trimStart, trimEnd, duration]
  );

  // Share handler
  const handleShareClick = useCallback(() => {
    setShareDialogOpen(true);
  }, []);

  const mediaFile: MediaFile | null = file
    ? {
        name: file.name,
        type: file.type,
        size: file.size,
        data: new ArrayBuffer(0), // Will be populated when sending
      }
    : null;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h1 className="text-lg font-bold">Video P2P Editor</h1>
        {!ffmpegLoaded && !loadError && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading FFmpeg...
          </div>
        )}
        {loadError && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="max-w-[300px] truncate">{loadError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryFfmpeg}
              disabled={isRetrying}
              className="ml-2 h-7 text-xs"
            >
              {isRetrying ? (
                <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Retrying...</>
              ) : (
                'Retry'
              )}
            </Button>
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

      {/* Main content — responsive: stack on mobile, side-by-side on desktop */}
      <div className="flex flex-1 flex-col md:flex-row gap-4 overflow-hidden p-4">
        {/* Left panel: Preview + Timeline */}
        <div className="flex flex-1 flex-col gap-4 overflow-hidden min-h-0">
          <Preview
            src={previewUrl}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
            onDurationChange={setDuration}
            className="flex-1 min-h-[200px]"
          />

          {file && (
            <Timeline
              duration={duration}
              currentTime={currentTime}
              onSeek={setCurrentTime}
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

        {/* Right panel: Drop zone or Effects — full width on mobile, 320px on desktop */}
        <div className="w-full md:w-80 shrink-0 overflow-y-auto">
          {!file ? (
            <DropZone onFileSelected={handleFileSelected} className="h-full" />
          ) : (
            <EffectsPanel
              effects={effects}
              onAddEffect={handleAddEffect}
              onRemoveEffect={handleRemoveEffect}
              onUpdateEffect={handleUpdateEffect}
              onToggleEffect={handleToggleEffect}
            />
          )}
        </div>
      </div>

      {/* Processing overlay */}
      {isProcessing && processingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex items-center gap-3 rounded-lg bg-card p-6 shadow-lg">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm font-medium">{processingStatus}</span>
          </div>
        </div>
      )}

      {/* Share dialog */}
      <ShareDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        file={mediaFile}
      />
    </div>
  );
}

export default Editor;
