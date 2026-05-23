# VideoP2P

> Edit & share videos entirely in your browser. No uploads. No servers.

An in-browser video editor with 20+ effects (trim, crop, chroma key, GIF export, speed, reverse, stabilize, text overlay, split-screen, and more) plus **P2P sharing via WebRTC** — all running 100% client-side.

**[Live Demo →](https://aieatassam.github.io/video-p2p/)**

## Features

### 🎬 Video Editor
- **Trim** — cut start/end points with visual timeline
- **Crop** — region crop with live preview
- **Resize** — scale to target dimensions
- **Speed** — 0.25x to 4x with audio pitch correction
- **Reverse** — play video backwards
- **Color Grading** — brightness, contrast, saturation, gamma
- **Filter Presets** — grayscale, sepia, invert
- **Blur** — gaussian blur with adjustable radius
- **Pixelate** — mosaic/censor effect
- **Text Overlay** — positioned text with font/color/size
- **Chroma Key** — green/blue screen removal
- **Audio Extract** — extract audio to MP3/WAV/AAC/OGG
- **Audio Replace** — swap audio track
- **GIF Export** — video to animated GIF with FPS control
- **Concat** — join multiple clips
- **Frame Extract** — extract still frames as PNG/JPG
- **Split Screen** — side-by-side or picture-in-picture
- **Glitch/VHS** — retro distortion effects
- **Stabilize** — video deshake / stabilization

### 🔗 P2P Sharing
- Share edited videos directly browser-to-browser
- No server, no upload — WebRTC with manual SDP signaling
- Works across networks via Google STUN
- Real-time transfer progress

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS + shadcn/ui |
| Video Engine | ffmpeg.wasm (WebAssembly) |
| P2P | WebRTC (native browser API) |
| Testing | Vitest + React Testing Library |
| Deployment | GitHub Actions → GitHub Pages |

## Getting Started

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/video-p2p.git
cd video-p2p

# Install
npm install

# Dev server
npm run dev

# Tests
npm test

# Build
npm run build
```

### Usage

1. Open the app (or `npm run dev`)
2. Drop a video file onto the landing page
3. Wait for ffmpeg.wasm to load (~3-5MB first time)
4. Apply effects from the sidebar panel
5. Use the timeline to trim
6. Preview in real-time
7. **Export** — download as MP4, GIF, or audio
8. **Share** — create a P2P share link and send it to anyone

## How P2P Sharing Works

1. **Sender** clicks "Share" → generates a WebRTC offer (SDP string)
2. Sender copies the offer and sends it to the receiver (via chat, email, etc.)
3. **Receiver** pastes the offer → generates an answer (SDP string)
4. Receiver copies the answer back to the sender
5. **Sender** pastes the answer → P2P connection established
6. File transfers directly browser-to-browser via encrypted WebRTC data channel

No servers involved. The STUN server is only used for NAT traversal.

## Development

### TDD

All features are developed test-first:

```bash
# Watch mode
npm run test:watch

# Single run
npm test
```

### Project Structure

```
src/
├── components/
│   ├── ui/           # shadcn primitives
│   ├── Editor.tsx     # Main editor
│   ├── DropZone.tsx   # File upload
│   ├── Toolbar.tsx    # Action toolbar
│   ├── Timeline.tsx   # Trim timeline
│   ├── Preview.tsx    # Video preview
│   ├── EffectsPanel.tsx # Effects controls
│   └── ShareDialog.tsx  # P2P sharing
├── lib/
│   ├── ffmpeg.ts     # ffmpeg.wasm engine
│   ├── effects.ts    # Effect builders
│   ├── webrtc.ts     # WebRTC sharing
│   └── utils.ts      # cn() helper
└── types/
    └── index.ts      # TypeScript types

tests/
├── fixtures/         # Test video files
├── lib/              # Module tests
├── components/       # Component tests
└── App.test.tsx
```

## License

MIT
