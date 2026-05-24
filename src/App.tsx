import { useState } from 'react';
import { Video, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Editor from '@/components/Editor';
import DropZone from '@/components/DropZone';
import type { MediaFile } from '@/types';

function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [editorReady, setEditorReady] = useState(false);

  const handleFileSelect = (file: File) => {
    setVideoFile(file);
    setEditorReady(true);
  };

  const handleBack = () => {
    setEditorReady(false);
    setVideoFile(null);
  };

  if (!editorReady) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            <h1 className="font-semibold text-lg">VideoP2P</h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="hidden sm:inline">Edit & share videos — 100% in your browser</span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Share2 className="w-10 h-10 text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                Video Editor with P2P Sharing
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                No uploads. No servers. Everything runs locally in your browser.
                Trim, filter, chroma key, GIF export, speed, reverse, stabilize, split-screen,
                and share videos peer-to-peer with zero backend.
              </p>
            </div>
            <DropZone onFileSelected={handleFileSelect} />
            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div className="rounded-lg border border-border p-3 text-left space-y-1">
                <span className="text-foreground font-medium block">🎬 20+ Effects</span>
                <span>Trim, crop, blur, chroma key, text overlay, GIF, stabilize & more</span>
              </div>
              <div className="rounded-lg border border-border p-3 text-left space-y-1">
                <span className="text-foreground font-medium block">🔗 P2P Share</span>
                <span>Send edited videos directly browser-to-browser via WebRTC</span>
              </div>
            </div>
          </div>
        </main>

        <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground text-center">
          Powered by ffmpeg.wasm + WebRTC — 100% client-side on GitHub Pages
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-primary" />
          <h1 className="font-semibold text-sm">VideoP2P</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={handleBack} className="text-xs" aria-label="Back to file selection">
          New Video
        </Button>
      </header>
      <main className="flex-1 flex overflow-hidden">
        <Editor initialFile={videoFile} />
      </main>
    </div>
  );
}

export default App;
