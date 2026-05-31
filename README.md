# VideoP2P

> Edit & share videos entirely in your browser. No uploads. No servers.

An in-browser video editor with **20+ effects** (trim, crop, chroma key, GIF export, speed, reverse, stabilize, text overlay, split-screen, glitch/VHS, frame extract, and more) plus **P2P sharing via WebRTC** — all running 100% client-side, deployed as static files on GitHub Pages.

**[Live Demo →](https://aieatassam.github.io/video-p2p/)**

## Features

### 🎬 Video Editor
Effects are organized into four categories in the sidebar:

| Category | Effects |
|----------|---------|
| **Filter** | Filter Preset (grayscale, sepia, invert, vintage, vignette, night-vision), Color Grade, Blur, Pixelate, Glitch / VHS |
| **Transform** | Crop, Resize, Speed (0.25x–4x with pitch correction), Reverse, Stabilization, Split Screen (side-by-side, picture-in-picture) |
| **Overlay** | Text Overlay (positioned text with font/color/size controls), Chroma Key (green/blue screen removal) |
| **Export** | GIF Export (palette-optimized, FPS/dither controls), Audio Extract (MP3/WAV/AAC/OGG), Frame Extract (PNG/JPEG, every Nth frame) |

- **Trim** — cut start/end points with visual timeline
- **Color Grading** — brightness, contrast, saturation sliders
- **Concat** — join multiple clips via ffmpeg concat demuxer
- **Audio Replace** — swap audio track on video
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
| Video Engine (SW) | ffmpeg.wasm 0.12 (WebAssembly via SharedArrayBuffer) |
| Video Engine (HW) | WebCodecs + Canvas2D + MediaRecorder (GPU decode/encode) |
| P2P | Raw WebRTC (RTCPeerConnection + RTCDataChannel) |
| Testing | Vitest + React Testing Library (65 tests) |
| Deployment | GitHub Actions → GitHub Pages |
| Signaling | Manual SDP copy-paste (zero infrastructure) |

## Getting Started

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/video-p2p.git
cd video-p2p

# Install
npm install

# Dev server (COOP/COEP headers auto-configured via Vite)
npm run dev

# Tests
npm test

# Build
npm run build
```

### Deployment

> **GitHub Pages fully supported** — The app includes a service worker (`public/coi-serviceworker.js`) that injects the required COOP/COEP headers at the browser level on every page load. On your first visit, the page registers the service worker and reloads once to activate it. Subsequent visits work immediately.

The app also deploys to **Netlify** or **Vercel** if preferred:

**Netlify** (free)
```bash
npx netlify deploy --prod --dir=dist
```

**Vercel** (free)
```bash
npx vercel --prod
```

**Local dev server** (for testing without deployment):
```bash
npm run dev
```
Opens at `http://localhost:5173/video-p2p/` with full ffmpeg.wasm support.

### Usage

1. Open the app (or `npm run dev`)
2. Drop a video file onto the landing page
3. Wait for ffmpeg.wasm to load (~3-5MB first time)
4. Apply effects from the sidebar panel (expand Filter, Transform, Overlay, or Export)
5. Use the timeline to trim and preview
6. **Export** — download as MP4, GIF, or audio
7. **Share** — create a P2P share link and send it to anyone

## Smart Pipeline Selection

The app selects the fastest export pipeline automatically based on your effects and browser capabilities:

| Pipeline | How it works | Best for |
|----------|-------------|----------|
| **WebCodecs** | GPU decode (`<video>`) → Canvas2D effects → `MediaRecorder` H.264 encode | Simple effects (crop, resize, blur, text, color grade, pixelate, chroma key, filter presets) — GPU all the way |
| **Hybrid** | GPU decode (`<video>`) → ffmpeg.wasm encode | GIF export or effects that need both GPU decode and ffmpeg filter power |
| **ffmpeg** | Full ffmpeg.wasm software pipeline | Speed, reverse, audio ops, concat, or when no HW decode is available |

The acceleration probe runs on startup, checking WebGL, WebGPU, and `MediaCapabilities` for per-codec HW decode support. A debug log panel at the bottom shows the pipeline decision and reasoning.

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
│  │  ┌──────────────┐  ┌───────────────┐               │    │
│  │  │  ffmpeg.ts    │  │  effects.ts  │               │    │
│  │  │  (ffmpeg.wasm │  │  (effect     │               │    │
│  │  │   lifecycle + │  │   builders + │               │    │
│  │  │   virtual FS) │  │   chain)     │               │    │
│  │  └──────┬───────┘  └───────┬───────┘               │    │
│  │  ┌──────┴───────┐  ┌───────┴────────┐              │    │
│  │  │ pipeline.ts  │  │ webcodecs-     │              │    │
│  │  │ (selector +  │  │ pipeline.ts    │              │    │
│  │  │ acceleration │  │ (Canvas2D +    │              │    │
│  │  │  probe)      │  │  MediaRecorder)│              │    │
│  │  └──────────────┘  └────────────────┘              │    │
│  │                                                      │    │
│  │  ┌────────────────────────────────────────────┐    │    │
│  │  │  WebRTC (Browser-Native)                   │    │    │
│  │  │  - RTCPeerConnection + RTCDataChannel       │    │    │
│  │  │  - STUN: stun.l.google.com:19302           │    │    │
│  │  │  - SDP exchange via copy-paste UI          │    │    │
│  │  └────────────────────────────────────────────┘    │    │
│  │                                                      │    │
│  │  ┌────────────────────────────────────────────┐    │    │
│  │  │  ffmpeg.wasm (WebAssembly)                  │    │    │
│  │  │  - ffmpeg-core.wasm  (~31 MB)              │    │    │
│  │  │  - SharedArrayBuffer-backed virtual FS     │    │    │
│  │  │  - Runs in a Web Worker (separate thread)  │    │    │
│  │  └────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Page Context & Security (Cross-Origin Isolation)     │   │
│  │  COOP: same-origin  +  COEP: require-corp            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 🎞️ How ffmpeg Runs in the Browser

This is the most technically challenging piece. FFmpeg is a ~31 MB C/C++ codebase compiled to WebAssembly. Running it in a browser tab requires overcoming several hard constraints.

[ffmpeg.wasm](https://github.com/nicedoc/ffmpeg.wasm) is a WebAssembly port of FFmpeg compiled with Emscripten. It ships three files fetched on-demand from CDN (jsdelivr.net):

| File | Purpose | Size |
|------|---------|------|
| `ffmpeg-core.js` | JavaScript glue code (Emscripten runtime) | ~1 MB |
| `ffmpeg-core.wasm` | The actual FFmpeg binary compiled to WASM | ~31 MB |
| `ffmpeg-core.worker.js` | Web Worker wrapper for multi-threading | ~50 KB |

These are loaded via `toBlobURL()` — each file is fetched as a blob and re-served from a local object URL. This avoids CORS issues with `importScripts()` inside the worker and lets the page control the loading lifecycle.

#### SharedArrayBuffer & Cross-Origin Isolation

ffmpeg.wasm uses SharedArrayBuffer to share memory between the main thread and the ffmpeg Web Worker for efficient file I/O. **Browsers require cross-origin isolation to enable SharedArrayBuffer** (a security measure against Spectre-type attacks).

This means two HTTP headers must be present on every page load:

```
Cross-Origin-Opener-Policy: same-origin       # isolates the browsing context group
Cross-Origin-Embedder-Policy: require-corp    # prevents loading cross-origin resources
```

On the dev server, these are set via Vite's `server.headers` config. On GitHub Pages, they're set via a `_headers` file in the repository root — GitHub Pages reads this file and applies the headers to matching paths during deployment.

If these headers are missing, ffmpeg.wasm fails silently with a SharedArrayBuffer error, and the app shows a clear error message asking the user to enable cross-origin isolation.

#### Virtual File System

ffmpeg.wasm runs in a Web Worker with an in-memory virtual filesystem (Emscripten's MEMFS). The workflow is:

1. **Write input file** — the user's video file (`File` object) is converted to a `Uint8Array` and written to the virtual FS via `ffmpeg.writeFile('input.mp4', data)`
2. **Execute FFmpeg** — `ffmpeg.exec(['-i', 'input.mp4', ...args, 'output.mp4'])` — runs the actual ffmpeg pipeline in the worker thread
3. **Read output** — `ffmpeg.readFile('output.mp4')` returns the result as a `Uint8Array`
4. **Cleanup** — `ffmpeg.deleteFile()` removes intermediate files from the virtual FS

The `FFmpegEngine` class in `src/lib/ffmpeg.ts` wraps this lifecycle into a clean API with error handling and progress reporting via ffmpeg's built-in progress events.

### 🎬 Effects Pipeline

The `chainEffects()` function in `src/lib/effects.ts` is the heart of the video processing system. It takes a list of effect objects and compiles them into a single ffmpeg command.

#### Filter Graph Composition

ffmpeg processes video through a filter graph — a directed graph of filters connected by labelled links. Each effect maps to one or more ffmpeg filters:

| Effect | ffmpeg Filter | Type |
|--------|--------------|------|
| **Crop** | `crop=w:h:x:y` | Video filter |
| **Resize** | `scale=w:h` | Video filter |
| **Speed** | `setpts=N*PTS` (video) + `atempo=N` (audio) | Both |
| **Reverse** | `reverse` + `areverse` | Both |
| **Color Grade** | `eq=brightness:contrast:saturation:gamma` | Video |
| **Grayscale** | `colorchannelmixer` with luminance weights | Video |
| **Sepia** | `colorchannelmixer` with sepia matrix | Video |
| **Invert** | `negate` | Video |
| **Vintage** | `colorchannelmixer` warm matrix + `eq` contrast/saturation | Video |
| **Vignette** | `vignette=PI/4:max_eval=frame` | Video |
| **Night Vision** | `colorchannelmixer` green tint + `eq` brightness/contrast | Video |
| **Blur** | `gblur=sigma=N` | Video |
| **Pixelate** | `pixelize=N` | Video |
| **Text Overlay** | `drawtext=text='...':x=N:y=N` (escaped) | Video |
| **Chroma Key** | `colorkey=color:similarity:blend` | Video |
| **Glitch/VHS** | `noise` static + `eq` saturation + optional `drawbox` scanlines | Video |
| **Stabilize** | `deshake=rx=0:ry=0:edge=blank:blocksize=N` | Video |
| **Split Screen** | `hstack` (side-by-side) or `overlay` (PIP) | Complex |
| **GIF Export** | Two-pass: `palettegen` + `paletteuse` (scale FIRST for performance) | Complex |
| **Frame Extract** | `select=not(mod(n\,N))` + `vsync vfr` + codec selection | Standalone |
| **Audio Extract** | `-vn -acodec codec -b:a bitrate` | Standalone |
| **Audio Replace** | `-map 0:v -map 1:a -c:v copy -shortest` | Standalone |
| **Concat** | `-i concat:files... -c copy` | Standalone |

#### Filter Chaining Algorithm

When multiple video effects are applied, `chainEffects()` extracts the `-vf` or `-af` filter strings from each effect builder and concatenates them with commas into a single `-filter_complex` or `-af` argument:

```text
filter_complex = "crop=640:480:0:0,scale=1280:720,eq=brightness=0.1:contrast=1.2"
```

This is valid because comma-separated filters in ffmpeg form a linear chain where each filter's output feeds the next filter's input. This prevents the need for multiple ffmpeg passes — all effects are applied in a single decode-process-encode cycle.

Effects that can't be expressed as simple filters (trim, GIF export, concat, stabilize, audio operations) use `-ss`/`-to` (input seeking), multi-step commands, or special encoder flags instead.

Complex filters (split-screen, PiP overlay) use separate `-filter_complex` flags with labelled stream connections (`[v];[1:v]`).

#### Audio Pitch Correction

Speed changes require separate handling for video and audio. The video `setpts` filter adjusts frame presentation timestamps. For audio, ffmpeg's `atempo` filter preserves pitch while changing speed — but it's capped at a 2x range per filter instance. For speeds >2x or <0.5x, the algorithm chains multiple `atempo` instances:

```typescript
// 4x speed → chain two atempo=2.0 filters
chain = "atempo=2.0,atempo=2.0"
```

#### GIF Export (Palette-Based)

GIF export uses ffmpeg's two-pass palette generation for color quality:

1. **First pass** — generate an optimized 256-color palette from the scaled video: `fps=N,scale=W:-1:flags=lanczos,effects...,palettegen`
2. **Second pass** — encode using the palette: `paletteuse=dither=bayer:bayer_scale=5`

The scaling filter is prepended BEFORE other effects so pixel-level operations (chroma-key, blur) run on small frames instead of full 4K — exponentially faster in ffmpeg.wasm.

### 🔗 WebRTC Peer-to-Peer Transfer

The P2P sharing system uses raw browser WebRTC APIs with zero external dependencies.

Details on connection lifecycle, SDP, ICE/STUN, RTCDataChannel chunked transfer, and progress calculation are in [TECHNICAL.md](./TECHNICAL.md).

#### Transfer Progress Calculation

Speed and ETA are computed from real wall-clock timing:

```typescript
speed = bytesTransferred / elapsed_seconds
eta   = (totalBytes - bytesTransferred) / speed
```

The React UI polls `getTransferProgress()` every 500ms during active transfers and renders a shadcn `Progress` bar with byte counts, speed (B/s/KB/s/MB/s), and ETA.

### 🏗️ Build & Deployment Pipeline

#### Build Process

The Vite build produces a fully static `dist/` directory. A custom post-build script (`scripts/postbuild.mjs`) runs after `vite build` to strip the `crossorigin` attribute from `<link>` tags in `index.html`:

```javascript
html.replace(/<link([^>]*) crossorigin([^>]*)>/g, '<link$1$2>');
```

This is necessary because GitHub Pages serves static assets from the same origin but Vite adds `crossorigin` to module `<link>` tags, which triggers CORS checks that fail on certain browsers.

#### GitHub Actions CI/CD

The deploy workflow (`deploy.yml`) runs on every push to `main`:

1. **Checkout** the repository
2. **Install** dependencies with `npm ci`
3. **Run** the full test suite (65 tests) — build fails if any test fails
4. **Build** with `npm run build`
5. **Upload** the `dist/` directory as a GitHub Pages artifact
6. **Deploy** via `actions/deploy-pages@v4`

GitHub Pages automatically serves the artifact at `https://aieatassam.github.io/video-p2p/`.

#### Path Resolution

Because the site lives at a subpath (`/video-p2p/`), Vite's `base` config must be set:

```typescript
base: '/video-p2p/'
```

This ensures all asset URLs (JS, CSS, fonts) are prefixed correctly. Without this, assets would be loaded from `/assets/...` (domain root) instead of `/video-p2p/assets/...`, resulting in 404s.

### 🧪 Test Strategy

65 tests across 4 test files, following TDD methodology:

| File | Tests | What it covers |
|------|-------|---------------|
| `tests/lib/ffmpeg.test.ts` | 14 | Engine lifecycle, file ops, error handling, progress callbacks |
| `tests/lib/effects.test.ts` | 33 | Every effect builder + `chainEffects()` composition logic |
| `tests/lib/webrtc.test.ts` | 14 | Connection lifecycle, SDP flow, chunked send/receive, progress tracking |
| `tests/App.test.tsx` | 4 | React component rendering, drop zone interactions |

Key testing patterns:
- WebRTC tests use a **mock RTCPeerConnection** and **mock RTCDataChannel** (not available in jsdom)
- ffmpeg tests mock the `@ffmpeg/ffmpeg` module and verify command construction without actually running WASM
- Effect tests are pure function tests — no mocking needed, they assert exact ffmpeg argument arrays

### 🐛 Debug Log Panel

A resizable debug log panel at the bottom of the editor displays all internal operations:

- **INFO (blue)** — system info, codec probes, pipeline decisions, export progress
- **WARN (yellow)** — audio drops, fallback codecs, recoverable errors
- **ERROR (red)** — ffmpeg failures, unsupported codecs, export errors
- **DEBUG (muted)** — detailed per-effect filter construction, seek sync
- **FFMPEG (green)** — raw ffmpeg.wasm stderr output

The log panel includes Copy and Clear buttons, auto-scrolls to the latest entry, and can be collapsed.

### ⚡ Limitations & Future Work

- **Large files** (>2 GB) may exhaust browser memory for the virtual filesystem
- **TURN server** is needed for symmetric NAT traversal — currently falls back to browser-to-same-network only
- **Audio codecs** for speed effects require compatible encoder support in ffmpeg.wasm (libmp3lame is included; AAC uses the built-in aac encoder)
- **Mobile browsers** may unload the Web Worker during backgrounding — processing should persist state via IndexedDB in a future version
- **Multi-track editing** (layered video/audio tracks) is feasible via ffmpeg's `overlay` and `amix` filters but isn't exposed in the UI yet
- **WebCodecs audio** — MediaRecorder captures canvas only, so audio is dropped in the WebCodecs pipeline. Hybrid pipeline (GPU decode + ffmpeg encode) handles this

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
│   ├── ffmpeg.ts        # ffmpeg.wasm engine (lifecycle, VFS, progress)
│   ├── effects.ts       # Effect builder functions + chainEffects() composer
│   ├── pipeline.ts      # Pipeline selector — acceleration probe + pipeline decision
│   ├── webcodecs-pipeline.ts  # Canvas2D + MediaRecorder export pipeline
│   ├── webrtc.ts        # WebRTC connection, chunked transfer, progress
│   └── utils.ts         # cn() helper
└── types/
    └── index.ts         # TypeScript types (VideoInfo, Effect, LogEntry, etc.)

tests/
├── fixtures/            # Test video files (small-testsrc.mp4, greenscreen, etc.)
├── lib/                 # Module tests (effects, ffmpeg, webrtc)
├── components/          # Component tests
└── App.test.tsx
```

## License & Attributions

This project is licensed under the **MIT License** — see [LICENSE](./LICENSE) for details.

### Third-Party Notices

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for license information on included open-source components.

- **Lucide Icons** (used in the UI) are CC BY 4.0
- All other dependencies are MIT, Apache-2.0, or ISC licensed
