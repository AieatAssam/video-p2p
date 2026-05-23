import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WebRTCShare } from '@/lib/webrtc';
import {
  Link2,
  Download,
  Check,
  Copy,
  Loader2,
  Wifi,
  WifiOff,
  FileVideo,
} from 'lucide-react';
import type { ConnectionState, TransferProgress, MediaFile } from '@/types';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: MediaFile | null;
}

function useWebRTCShare() {
  const shareRef = useRef<WebRTCShare>(new WebRTCShare());
  const [state, setState] = useState<ConnectionState>('idle');
  const [progress, setProgress] = useState<TransferProgress>({
    bytes: 0,
    total: 0,
    speed: 0,
    eta: 0,
    state: 'idle',
  });
  const [receivedFile, setReceivedFile] = useState<{ name: string; data: ArrayBuffer; type: string } | null>(null);

  const pollProgress = useCallback(() => {
    const s = shareRef.current;
    setState(s.getState());
    setProgress(s.getTransferProgress());
  }, []);

  // Poll every 500ms during transfer
  useEffect(() => {
    if (state === 'receiving' || state === 'connecting' || state === 'connected') {
      const interval = setInterval(pollProgress, 500);
      return () => clearInterval(interval);
    }
  }, [state, pollProgress]);

  const createOffer = useCallback(async () => {
    const sdp = await shareRef.current.createOffer();
    setState('waiting-answer');
    return sdp;
  }, []);

  const receiveOffer = useCallback(async (sdp: string) => {
    const answer = await shareRef.current.receiveOffer(sdp);
    setState('connecting');
    return answer;
  }, []);

  const acceptAnswer = useCallback(async (sdp: string) => {
    await shareRef.current.acceptAnswer(sdp);
    setState('connecting');
  }, []);

  const sendFile = useCallback(async (file: MediaFile) => {
    await shareRef.current.sendFile(file);
    setState('complete');
    setProgress({
      bytes: file.size,
      total: file.size,
      speed: 0,
      eta: 0,
      state: 'complete',
    });
  }, []);

  const cleanup = useCallback(() => {
    shareRef.current.cleanup();
    setState('idle');
    setProgress({
      bytes: 0,
      total: 0,
      speed: 0,
      eta: 0,
      state: 'idle',
    });
    setReceivedFile(null);
  }, []);

  // Check for completed file
  useEffect(() => {
    if (state === 'complete') {
      // Try to read from progress 
      // Note: in a real app we'd need to store the received chunks
      // For now, the WebRTC class stores them internally
    }
  }, [state]);

  return {
    state,
    progress,
    receivedFile,
    createOffer,
    receiveOffer,
    acceptAnswer,
    sendFile,
    cleanup,
    shareRef,
  };
}

export function ShareDialog({ open, onOpenChange, file }: ShareDialogProps) {
  const {
    state,
    progress,
    receivedFile,
    createOffer,
    receiveOffer,
    acceptAnswer,
    sendFile,
    cleanup,
  } = useWebRTCShare();

  const [activeTab, setActiveTab] = useState<'share' | 'receive'>('share');
  const [offerText, setOfferText] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [pasteOffer, setPasteOffer] = useState('');
  const [pasteAnswer, setPasteAnswer] = useState('');
  const [copied, setCopied] = useState(false);
  const [localReceivedFile, setLocalReceivedFile] = useState<{ name: string; data: ArrayBuffer; type: string } | null>(null);
  const receivedChunksRef = useRef<ArrayBuffer[]>([]);
  const receivedFileInfoRef = useRef<{ name: string; size: number; type: string } | null>(null);

  // Reset on dialog open/close
  useEffect(() => {
    if (!open) {
      cleanup();
      setOfferText('');
      setAnswerText('');
      setPasteOffer('');
      setPasteAnswer('');
      setCopied(false);
      setLocalReceivedFile(null);
      receivedChunksRef.current = [];
      receivedFileInfoRef.current = null;
    }
  }, [open, cleanup]);

  // Monitor shared ref for received data
  // In a real app we'd have callback-based approach - here we simulate via polling
  useEffect(() => {
    if (open && activeTab === 'receive' && state === 'complete') {
      // We'd normally get the file from the WebRTC class
      // For now this is a placeholder for the received file flow
    }
  }, [open, activeTab, state]);

  const handleCreateShareLink = useCallback(async () => {
    try {
      const sdp = await createOffer();
      setOfferText(sdp);
    } catch (err) {
      console.error('Failed to create offer:', err);
    }
  }, [createOffer]);

  const handleCopyOffer = useCallback(() => {
    navigator.clipboard.writeText(offerText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [offerText]);

  const handleStartReceiving = useCallback(async () => {
    if (!pasteOffer) return;
    try {
      const answer = await receiveOffer(pasteOffer);
      setAnswerText(answer);
    } catch (err) {
      console.error('Failed to receive offer:', err);
    }
  }, [pasteOffer, receiveOffer]);

  const handleCopyAnswer = useCallback(() => {
    navigator.clipboard.writeText(answerText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [answerText]);

  const handlePasteAnswer = useCallback(async () => {
    if (!pasteAnswer) return;
    try {
      await acceptAnswer(pasteAnswer);
    } catch (err) {
      console.error('Failed to accept answer:', err);
    }
  }, [pasteAnswer, acceptAnswer]);

  const handleSendFile = useCallback(async () => {
    if (!file) return;
    try {
      await sendFile(file);
    } catch (err) {
      console.error('Failed to send file:', err);
    }
  }, [file, sendFile]);

  const handleDownloadReceived = useCallback(() => {
    if (!localReceivedFile) return;
    const blob = new Blob([localReceivedFile.data], { type: localReceivedFile.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = localReceivedFile.name;
    a.click();
    URL.revokeObjectURL(url);
  }, [localReceivedFile]);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatSpeed = (bytesPerSec: number): string => {
    if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  const progressPercent =
    progress.total > 0 ? Math.round((progress.bytes / progress.total) * 100) : 0;

  const renderConnectionStatus = () => {
    const statusMap: Record<ConnectionState, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
      idle: { label: 'Idle', variant: 'secondary' },
      'creating-offer': { label: 'Creating Offer...', variant: 'secondary' },
      'waiting-answer': { label: 'Waiting for Answer', variant: 'secondary' },
      connecting: { label: 'Connecting...', variant: 'default' },
      connected: { label: 'Connected', variant: 'default' },
      receiving: { label: 'Transferring...', variant: 'default' },
      complete: { label: 'Complete!', variant: 'default' },
      error: { label: 'Error', variant: 'destructive' },
    };
    const s = statusMap[state] ?? { label: state, variant: 'secondary' as const };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>P2P Share</DialogTitle>
          <DialogDescription>
            Share your video directly with another peer via WebRTC (no server).
            Copy and paste the offer/answer strings to establish a connection.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'share' | 'receive')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="share">Share</TabsTrigger>
            <TabsTrigger value="receive">Receive</TabsTrigger>
          </TabsList>

          <TabsContent value="share" className="space-y-4">
            {renderConnectionStatus()}

            {state === 'idle' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  {file
                    ? `Ready to share: ${file.name} (${formatBytes(file.size)})`
                    : 'No file loaded. Please load a video first.'}
                </p>
                <Button onClick={handleCreateShareLink} disabled={!file}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Create Share Link
                </Button>
              </div>
            )}

            {(state === 'waiting-answer' || state === 'creating-offer') && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Share this offer string with the receiver:
                </p>
                <div className="relative">
                  <textarea
                    className="h-32 w-full rounded-md border bg-muted p-2 text-xs font-mono"
                    value={offerText}
                    readOnly
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute right-2 top-2"
                    onClick={handleCopyOffer}
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div>
                  <Label>Paste the receiver's answer:</Label>
                  <textarea
                    className="mt-1 h-16 w-full rounded-md border bg-background p-2 text-xs font-mono"
                    value={pasteAnswer}
                    onChange={(e) => setPasteAnswer(e.target.value)}
                    placeholder="Paste answer SDP here..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handlePasteAnswer} disabled={!pasteAnswer}>
                    Connect
                  </Button>
                  <Button variant="outline" onClick={cleanup}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {state === 'connecting' && (
              <div className="flex items-center justify-center gap-2 py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Establishing connection...</span>
              </div>
            )}

            {state === 'connected' && file && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span>Connected! Ready to send.</span>
                </div>
                <Button onClick={handleSendFile}>
                  <FileVideo className="mr-2 h-4 w-4" />
                  Send {file.name}
                </Button>
              </div>
            )}

            {(state === 'receiving' || state === 'complete') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Transfer progress</span>
                  <span>{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatBytes(progress.bytes)} / {formatBytes(progress.total)}</span>
                  <span>{formatSpeed(progress.speed)}</span>
                </div>
                {state === 'complete' && (
                  <div className="flex items-center gap-2 text-sm text-green-500">
                    <Check className="h-4 w-4" />
                    <span>File sent successfully!</span>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="receive" className="space-y-4">
            {renderConnectionStatus()}

            {state === 'idle' && (
              <div className="space-y-3">
                <div>
                  <Label>Paste the sender's offer:</Label>
                  <textarea
                    className="mt-1 h-24 w-full rounded-md border bg-background p-2 text-xs font-mono"
                    value={pasteOffer}
                    onChange={(e) => setPasteOffer(e.target.value)}
                    placeholder="Paste offer SDP here..."
                  />
                </div>
                <Button onClick={handleStartReceiving} disabled={!pasteOffer}>
                  Receive File
                </Button>
              </div>
            )}

            {state === 'connecting' && answerText && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Send this answer string to the sender:
                </p>
                <div className="relative">
                  <textarea
                    className="h-24 w-full rounded-md border bg-muted p-2 text-xs font-mono"
                    value={answerText}
                    readOnly
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute right-2 top-2"
                    onClick={handleCopyAnswer}
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Waiting for sender to start transfer...</span>
                </div>
              </div>
            )}

            {state === 'receiving' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Receiving file...</span>
                  <span>{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatBytes(progress.bytes)} / {formatBytes(progress.total)}</span>
                  <span>{formatSpeed(progress.speed)}</span>
                </div>
              </div>
            )}

            {state === 'complete' && localReceivedFile && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-500">
                  <Check className="h-4 w-4" />
                  <span>File received!</span>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium">{localReceivedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(localReceivedFile.data.byteLength)}
                  </p>
                </div>
                <Button onClick={handleDownloadReceived}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Received File
                </Button>
              </div>
            )}

            {state === 'complete' && !localReceivedFile && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-500">
                  <Check className="h-4 w-4" />
                  <span>Transfer completed!</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  File data received. Save it to process.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
