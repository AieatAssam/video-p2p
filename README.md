# VideoP2P

> Edit & share videos entirely in your browser. No uploads. No servers.

An in-browser video editor with **14 effects** (trim, crop, resize, speed, reverse, color grade, filter presets, blur, pixelate, text overlay, chroma key, vignette, glitch/VHS) plus **P2P sharing via WebRTC** — all running 100% client-side on GPU-accelerated WebCodecs, deployed as static files on GitHub Pages.

**[Live Demo →](https://aieatassam.github.io/video-p2p/)**

## Features

### 🎬 Video Editor
Effects are organized into three categories in the sidebar:

| Category | Effects |
|----------|---------|
| **Filter** | Filter Preset (grayscale, sepia, invert, vintage, night-vision), Color Grade, Blur, Pixelate, Vignette, Glitch / VHS |
| **Transform** | Crop, Resize, Speed (0.25x–4x), Reverse |
| **Overlay** | Text Overlay (positioned text with font/color/size controls), Chroma Key (green/blue screen removal) |

- **Trim** — cut start/end points with visual timeline
- **Color Grading** — brightness, contrast, saturation sliders
- **Preview** — real-time video playback with seekable timeline and thumbnail strip

### 🔗 P2P Sharing
- Share edited videos directly browser-to-browser
- No server, no upload — WebRTC with manual SDP signaling
- Works across networks via Google STUN
- Real-time transfer progress with speed/ETA calculation

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS + shadcn/ui |
| Video Engine | WebCodecs + Canvas2D + MediaRecorder (GPU decode/encode) |
| P2P | Raw WebRTC (RTCPeerConnection + RTCDataChannel) |
| Testing | Vitest + React Testing Library |
| Deployment | GitHub Actions → GitHub Pages |
| Signaling | Manual SDP copy-paste (zero infrastructure) |

## Getting Started

```bash
# Clone
git clone https://github.com/AieatAssam/video-p2p.git
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
3. Apply effects from the sidebar panel (expand Filter, Transform, or Overlay)
4. Use the timeline to trim and preview
5. **Export** — download as MP4
6. **Share** — create a P2P share link and send it to anyone

## Pipeline

All exports use the **WebCodecs pipeline** — GPU-accelerated video decode via `<video>` element, Canvas2D compositing for effects, and MediaRecorder for H.264 encoding. No software decode fallback. See [TECHNICAL.md](./TECHNICAL.md) for the full migration rationale (ffmpeg.wasm did not work on WebKit/Safari).

## How P2P Sharing Works

1. **Sender** clicks "Share" → generates a WebRTC offer (SDP string)
2. Sender copies the offer and sends it to the receiver (via chat, email, etc.)
3. **Receiver** pastes the offer → generates an answer (SDP string)
4. Receiver copies the answer back to the sender
5. **Sender** pastes the answer → P2P connection established
6. File transfers directly browser-to-browser via encrypted WebRTC data channel

No servers involved. The STUN server is only used for NAT traversal.

## Technical Details

### 🧠 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Single-Page App — React 19)                       │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ DropZone /   │  │ Editor       │  │ EffectsPanel     │   │
│  │ File Loader  │  │ (orchestrator)│  │ (effect config)  │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                 │                     │            │
│         ▼                 ▼                     ▼            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Core Libraries                                      │    │
│  │  ┌──────────────┐  ┌───────────────────┐           │    │
│  │  │ effects.ts   │  │ webcodecs-        │           │    │
│  │  │ (effect      │  │ pipeline.ts       │           │    │
│  │  │  type defs)  │  │ (Canvas2D +       │           │    │
│  │  │              │  │  MediaRecorder)    │           │    │
│  │  └──────────────┘  └───────────────────┘           │    │
│  │  ┌────────────────────────────────────┐            │    │
│  │  │ pipeline.ts (selector + GPU probe) │            │    │
│  │  └────────────────────────────────────┘            │    │
│  │                                                      │    │
│  │  ┌────────────────────────────────────────────┐    │    │
│  │  │  WebRTC (Browser-Native)                   │    │    │
│  │  │  - RTCPeerConnection + RTCDataChannel       │    │    │
│  │  │  - STUN: stun.l.google.com:19302           │    │    │
│  │  │  - SDP exchange via copy-paste UI          │    │    │
│  │  └────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 🎬 Effects Pipeline

Effects are applied frame-by-frame in Canvas2D during export. Each effect reads the current canvas state, transforms it, and draws back. The order is deterministic: crop/resize → color grade → blur → vignette → glitch → filter preset → pixelate → chroma key → text overlay.

### 🔗 WebRTC Peer-to-Peer Transfer

The P2P sharing system uses raw browser WebRTC APIs. Details in [TECHNICAL.md](./TECHNICAL.md).

### 🏗️ Build & Deployment Pipeline

Vite produces a fully static `dist/` directory. A post-build script strips `crossorigin` from `<link>` tags for GitHub Pages compatibility. CI/CD via GitHub Actions deploys on every push to `main`.

### 🧪 Test Strategy

32 tests across 3 test files:

| File | Tests | What it covers |
|------|-------|---------------|
| `tests/lib/effects.test.ts` | 14 | Effect type definitions and parameters |
| `tests/lib/webrtc.test.ts` | 14 | Connection lifecycle, SDP flow, chunked transfer, progress |
| `tests/App.test.tsx` | 4 | React component rendering, drop zone interactions |

### 🐛 Debug Log Panel

A resizable debug log panel at the bottom displays all internal operations:
- **INFO (blue)** — system info, codec probes, pipeline decisions, export progress
- **WARN (yellow)** — audio drops, fallback codecs, recoverable errors
- **ERROR (red)** — export failures, unsupported codecs
- **DEBUG (muted)** — detailed per-effect rendering, seek sync

### Project Structure

```
src/
├── components/
│   ├── ui/              # shadcn primitives (button, slider, select, switch, etc.)
│   ├── Editor.tsx       # Main editor — orchestrates file loading, effects, export
│   ├── DropZone.tsx     # File upload landing page
│   ├── Toolbar.tsx      # Action toolbar (export format, share button)
│   ├── Timeline.tsx     # Trim timeline with thumbnail strip
│   ├── Preview.tsx      # Video preview with play/pause overlay
│   ├── EffectsPanel.tsx # Effects UI — accordion categories, per-effect controls
│   ├── ShareDialog.tsx  # P2P sharing UI (SDP offer/answer exchange)
│   └── LogViewer.tsx    # Debug log panel (collapse, copy, clear)
├── lib/
│   ├── effects.ts       # Effect type definitions
│   ├── pipeline.ts      # Pipeline selector + GPU acceleration probe
│   ├── webcodecs-pipeline.ts  # Canvas2D + MediaRecorder export pipeline
│   ├── webrtc.ts        # WebRTC connection, chunked transfer, progress
│   └── utils.ts         # cn() helper
└── types/
    └── index.ts         # TypeScript types (VideoInfo, Effect, LogEntry, etc.)

tests/
├── fixtures/            # Test video files
├── lib/                 # Module tests (effects, webrtc)
├── components/          # Component tests
└── App.test.tsx
```

## License & Attributions

MIT License — see [LICENSE](./LICENSE).

- **Lucide Icons** are CC BY 4.0
- All other dependencies are MIT, Apache-2.0, or ISC licensed
