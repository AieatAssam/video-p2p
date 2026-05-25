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
import { chainEffects, buildGIFCommand, type EffectInput } from '@/lib/effects';
import { Loader2, AlertCircle } from 'lucide-react';
import { LogViewer } from '@/components/LogViewer';
import type { VideoInfo, Effect, EffectType, MediaFile, LogEntry } from '@/types';

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
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    setLogs((prev) => [...prev, { timestamp: Date.now(), level, message }]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const ffmpegRef = useRef<FFmpegEngine | null>(null);
  const fileDataRef = useRef<File | null>(null);
  const ffmpegLoadedRef = useRef(false);

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
    // Route ffmpeg's internal logs (stderr, debug info) to the debug panel
    engine.setLogCallback((message) => {
      addLog('ffmpeg', message);
    });

    // Detect first-load SW setup: if the coi-serviceworker just registered
    // and the page is about to reload (coi-done flag set but isolation not
    // yet active), show a clean message instead of a cryptic error.
    if (sessionStorage.getItem('coi-done') === '1' && !crossOriginIsolated) {
      addLog('info', 'Cross-origin isolation not yet active — waiting for service worker setup reload.');
      setLoadError(
        'Setting up browser features for video processing… ' +
        'The page will reload automatically. This only happens on the first visit.'
      );
      // If the SW reload doesn't happen within 3s, clear the flag and let
      // the normal error flow take over (SW registration probably failed).
      setTimeout(() => {
        sessionStorage.removeItem('coi-done');
        if (!crossOriginIsolated) {
          setLoadError(
            'This browser does not support the video processing features required. ' +
            'Please use Chrome, Firefox, or Edge.'
          );
        }
      }, 3000);
      return;
    }

    try {
      addLog('info', 'Loading ffmpeg.wasm (core-mt)...');
      await engine.load();
      setFfmpegLoaded(true);
      ffmpegLoadedRef.current = true;
      setLoadError(null);
      addLog('info', 'ffmpeg.wasm loaded successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addLog('error', `ffmpeg.wasm failed to load: ${message}`);
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
  }, [addLog]);

  // Initialize FFmpeg
  useEffect(() => {
    const engine = new FFmpegEngine();
    ffmpegRef.current = engine;
    initFfmpeg(engine);

    return () => {
      engine.terminate();
    };
  }, [initFfmpeg]);

  // Process file from the landing page automatically on mount
  useEffect(() => {
    if (initialFile && !file) {
      handleFileSelected(initialFile);
    }
    // Only run on mount when initialFile is provided
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

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
    addLog('info', `📁 File picked: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(1)} MB)`);

    setFile(selectedFile);
    setLoadError(null);

    const engine = ffmpegRef.current;
    if (!engine) {
      addLog('warn', 'FFmpeg engine not initialized');
      setLoadError('FFmpeg engine not initialized');
      return;
    }

    if (!ffmpegLoadedRef.current) {
      addLog('info', 'Waiting for FFmpeg to initialize before loading video...');
      setProcessingStatus('Loading FFmpeg...');
      // Wait for ffmpeg to finish loading — the useEffect that starts initFfmpeg
      // runs asynchronously, so the first file selection may arrive before it's ready.
      await new Promise<void>((resolve) => {
        const check = () => {
          if (ffmpegLoadedRef.current) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
      addLog('info', 'FFmpeg ready, loading video...');
    }

    try {
      setIsProcessing(true);
      setProcessingStatus('Analyzing video...');

      // Store the File reference for later use (thumbnails, export).
      // We DON'T pre-load it into memory — that's done on-demand to avoid
      // keeping the entire file in JS heap + WASM memory simultaneously.
      fileDataRef.current = selectedFile;

      // Create object URL for preview
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);

      // Determine video info from a native <video> element (no ffmpeg needed)
      // Add a timeout to prevent hanging on unsupported codecs
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = url;

      const videoDuration = await new Promise<number>((resolve) => {
        const timeout = setTimeout(() => {
          tempVideo.remove();
          addLog('warn', 'Video metadata timed out (8s) — using fallback info');
          const fallbackDuration = 10;
          setVideoInfo({
            width: 640,
            height: 480,
            duration: fallbackDuration,
            fps: 30,
            fileSize: selectedFile.size,
            hasAudio: true,
            codec: 'h264',
            name: selectedFile.name,
          });
          setDuration(fallbackDuration);
          setTrimEnd(fallbackDuration);
          resolve(fallbackDuration);
        }, 8000);

        tempVideo.onloadedmetadata = () => {
          clearTimeout(timeout);
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
          clearTimeout(timeout);
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
      });

      // Extract thumbnails using browser-native <video> (GPU-accelerated,
      // handles HEVC/AV1/VP9 — much faster than ffmpeg.wasm decode)
      setProcessingStatus('Extracting thumbnails...');
      try {
        await extractThumbnails(selectedFile, videoDuration, url);
      } catch {
        // Thumbnails are optional
      }

      // Ensure virtual filesystem is clean
      try { await engine.deleteFile('input'); } catch { /* ignore */ }

      addLog('info', `Video loaded: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(1)} MB, ${videoDuration.toFixed(1)}s)`);
      setProcessingStatus('');
      setIsProcessing(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message :
        typeof err === 'string' ? err :
        err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) :
        'Failed to load file';
      addLog('error', `File selection failed: ${message}`);
      setLoadError(message);
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [ffmpegLoaded, videoInfo, addLog]);

  const extractThumbnails = async (
    file: File,
    videoDuration: number,
    videoUrl: string
  ) => {
    const thumbs: string[] = [];
    const numThumbs = 10;

    // Use the browser's native <video> element for thumbnail extraction.
    // This is hardware-accelerated and works with ANY codec the browser
    // supports (HEVC/H.265, AV1, VP9, etc.) — no ffmpeg decode overhead.
    // ffmpeg.wasm's software HEVC decoder is far too slow for 4K content.
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.src = videoUrl;

    // Wait for the video to be seekable
    await new Promise<void>((resolve, reject) => {
      const onCanPlay = () => {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
        reject(new Error('Video failed to load'));
      };
      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('error', onError);
      // Fallback — if video metadata is already available
      if (video.readyState >= 2) {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
        resolve();
      }
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) return;

    for (let i = 0; i < numThumbs; i++) {
      const time = (videoDuration / numThumbs) * i;
      try {
        // Seek to the desired timestamp
        video.currentTime = time;

        // Wait for the seeked event
        await new Promise<void>((resolve, reject) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          const onError = () => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            reject(new Error('Seek failed'));
          };
          video.addEventListener('seeked', onSeeked);
          video.addEventListener('error', onError);
          // If already at the right time
          if (Math.abs(video.currentTime - time) < 0.01) {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            resolve();
          }
        });

        // Wait for the next animation frame so the browser actually
        // composites the decoded frame before we drawImage it.
        // Without this, drawImage captures a black/empty frame because
        // seeked fires before the decoder delivers the pixel data.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            // requestAnimationFrame alone isn't always enough — a second
            // microtask yields the render pipeline time to finish decoding
            requestAnimationFrame(() => resolve());
          });
        });

        // Guard against dimensions not being available yet
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) {
          addLog('warn', `Thumbnail ${i}: video dimensions not ready (${vw}x${vh}), using 16:9 fallback`);
        }
        const thumbWidth = 160;
        const thumbHeight = vw && vh
          ? Math.round((thumbWidth / vw) * vh)
          : Math.round(thumbWidth * (9 / 16));
        canvas.width = thumbWidth;
        canvas.height = thumbHeight;
        ctx.drawImage(video, 0, 0, thumbWidth, thumbHeight);

        // Convert to blob
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8);
        });
        if (blob) {
          thumbs.push(URL.createObjectURL(blob));
        }
        setProcessingProgress(Math.round(((i + 1) / numThumbs) * 100));
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        addLog('warn', `Thumbnail ${i} failed: ${errMsg}`);
      }
    }

    // Cleanup
    video.removeAttribute('src');
    video.load();

    addLog('info', `Extracted ${thumbs.length}/${numThumbs} thumbnails via <video>`);
    setThumbnails(thumbs);
    setProcessingProgress(0);
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

        // Write input file to ffmpeg's virtual filesystem on-demand.
        // We don't pre-load the entire file into memory — instead we read
        // from the File object right when ffmpeg needs it.
        if (fileDataRef.current) {
          const data = await engine.loadFile(fileDataRef.current);
          await engine.writeFile('input', data);
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
        const onExportProgress = (event: { percent: number }) => {
          setProcessingProgress(event.percent);
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
            await engine.execCommand(args, onExportProgress);
            outputFile = 'output.mp4';
            outputMime = 'video/mp4';
            successMessage = 'MP4 exported successfully!';
            break;
          }
          case 'gif': {
            // GIF two-pass palette workflow: palettegen writes palette.png to VFS,
            // then paletteuse reads it. Must be TWO execCommand calls because ffmpeg
            // opens ALL inputs before writing any output.
            const gifEffect = effectInputs.find((e) => e.type === 'gif');
            const { fps = 10, width = 480, dither = true } = (gifEffect?.params ?? {}) as { fps?: number; width?: number; dither?: boolean };
            const otherEffects = effectInputs.filter((e) => e.type !== 'gif');
            const gifCmd = buildGIFCommand({ fps, width, dither });

            // Extract filter/complex filter from chainEffects for non-GIF effects
            // chainEffects returns: ['-i', 'input', ...filters, ...extraArgs, outputFilename]
            // We need to merge the GIF palette filter into whatever chainEffects produces,
            // while keeping the extra args (trim, etc.).
            const baseArgs = chainEffects('input', otherEffects, '');
            const fcIdx = baseArgs.indexOf('-filter_complex');
            const vfIdx = baseArgs.indexOf('-vf');

            // Collect non-filter extra args (trim -ss/-to, etc.) from the raw chainEffects output.
            // These are everything that isn't '-i input', a filter flag+value, or the trailing ''.
            const extraArgs: string[] = [];
            let i = 2; // skip ['-i', 'input']
            while (i < baseArgs.length - 1) {
              if (baseArgs[i] === '-filter_complex' || baseArgs[i] === '-vf' || baseArgs[i] === '-af') {
                i += 2; // skip flag + value
              } else {
                extraArgs.push(baseArgs[i]);
                i++;
              }
            }

            // Helper: build the final args for each pass
            const buildPass1Args = (): string[] => {
              const args: string[] = ['-i', 'input'];
              args.push(...extraArgs);

              if (fcIdx >= 0) {
                // There's an existing filter_complex — append palettegen to it
                const existingFilter = baseArgs[fcIdx + 1];
                args.push('-filter_complex', `${existingFilter},${gifCmd.pass1Filter}`);
              } else if (vfIdx >= 0) {
                // There's an existing -vf — must use -filter_complex to combine with palettegen
                const existingFilter = baseArgs[vfIdx + 1];
                args.push('-filter_complex', `${existingFilter},${gifCmd.pass1Filter}`);
              } else {
                // No video filters at all — just palettegen
                args.push('-vf', gifCmd.pass1Filter);
              }

              args.push('palette.png');
              return args;
            };

            const buildPass2Args = (): string[] => {
              const args: string[] = ['-i', 'input'];
              args.push(...extraArgs);

              if (fcIdx >= 0) {
                const existingFilter = baseArgs[fcIdx + 1];
                args.push('-filter_complex', `${existingFilter}[v];${gifCmd.pass2Filter}`);
              } else if (vfIdx >= 0) {
                const existingFilter = baseArgs[vfIdx + 1];
                args.push('-filter_complex', `${existingFilter}[v];${gifCmd.pass2Filter}`);
              } else {
                args.push('-filter_complex', gifCmd.pass2Filter);
              }

              args.push('-i', 'palette.png');
              args.push('output.gif');
              return args;
            };

            // Pass 1: generate palette.png in VFS
            const pass1Args = buildPass1Args();
            addLog('info', `GIF pass 1: palettegen`);
            await engine.execCommand(pass1Args, onExportProgress);

            // Pass 2: use palette.png to encode output.gif
            const pass2Args = buildPass2Args();
            addLog('info', `GIF pass 2: paletteuse`);
            await engine.execCommand(pass2Args, onExportProgress);

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
            await engine.execCommand(args, onExportProgress);
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
        // Also free the input file from the virtual filesystem
        try { await engine.deleteFile('input'); } catch { /* ignore */ }
        // Clean up palette.png if this was a GIF export
        if (format === 'gif') {
          try { await engine.deleteFile('palette.png'); } catch { /* ignore */ }
        }

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
        addLog('error', `Export failed: ${message}`);
        setLoadError(message);
        setIsProcessing(false);
        setProcessingStatus('');
      }
    },
    [file, videoInfo, effects, trimStart, trimEnd, duration, addLog]
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

        {/* Right panel: Drop zone or Effects — full width on mobile, 320px on desktop */}
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

      {/* Processing status bar — non-blocking, doesn't cover the UI or debug log */}
      {isProcessing && processingStatus && (
        <div className="flex-shrink-0 border-t border-border bg-card/80 px-4 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            <span className="text-xs font-medium text-foreground/80">{processingStatus}</span>
            {processingProgress > 0 && (
              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                {processingProgress}%
              </span>
            )}
            {processingProgress > 0 && (
              <div className="h-1.5 flex-1 min-w-[60px] max-w-[200px] rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.min(processingProgress, 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Share dialog */}
      <ShareDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        file={mediaFile}
      />

      {/* Debug log panel at the bottom */}
      <LogViewer logs={logs} onClear={clearLogs} />
    </div>
  );
}

export default Editor;
