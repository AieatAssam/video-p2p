# VideoP2P

> Edit & share videos entirely in your browser. No uploads. No servers.

An in-browser video editor with 20+ effects (trim, crop, chroma key, GIF export, speed, reverse, stabilize, text overlay, split-screen, and more) plus **P2P sharing via WebRTC** — all running 100% client-side, deployed as static files on GitHub Pages.

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
- Real-time transfer progress with speed/ETA calculation

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS + shadcn/ui |
| Video Engine | ffmpeg.wasm 0.12 (WebAssembly via SharedArrayBuffer) |
| P2P | Raw WebRTC (RTCPeerConnection + RTCDataChannel) |
| Testing | Vitest + React Testing Library |
| Deployment | GitHub Actions → GitHub Pages |
| Signaling | Manual SDP copy-paste (zero infrastructure)

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

> ⚠️ **GitHub Pages limitation**: GitHub Pages' CDN strips `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers, which ffmpeg.wasm requires for SharedArrayBuffer. The app works fully on the dev server and on platforms that support custom headers.

**Recommended: Netlify** (free, one-click)
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
npx netlify deploy --prod --dir=dist
```
The `netlify.toml` in the repo configures the required headers automatically.

**Alternative: Vercel** (free, one-click)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
npx vercel --prod
```
The `vercel.json` in the repo configures the required headers automatically.

**Local dev server** (for testing without deployment):
```bash
npm run dev
```
Opens at `http://localhost:5173/video-p2p/` with full ffmpeg.wasm support.

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
│  │  ┌──────────────────┐  ┌─────────────────────────┐  │    │
│  │  │  ffmpeg.ts        │  │  effects.ts              │  │    │
│  │  │  (ffmpeg.wasm     │  │  (20 effect builders +   │  │    │
│  │  │   lifecycle +     │  │   filter chain composer) │  │    │
│  │  │   virtual FS)     │  │                          │  │    │
│  │  └────────┬─────────┘  └───────────┬─────────────┘  │    │
│  │           │                         │                │    │
│  │           ▼                         ▼                │    │
│  │  ┌────────────────────────────────────────────┐      │    │
│  │  │  ffmpeg.wasm (WebAssembly)                 │      │    │
│  │  │  - ffmpeg-core.wasm  (~31 MB)              │      │    │
│  │  │  - SharedArrayBuffer-backed virtual FS     │      │    │
│  │  │  - Runs in a Web Worker (separate thread)  │      │    │
│  │  └────────────────────────────────────────────┘      │    │
│  │                                                        │    │
│  │  ┌────────────────────────────────────────────┐      │    │
│  │  │  WebRTC (Browser-Native)                   │      │    │
│  │  │  - RTCPeerConnection + RTCDataChannel       │      │    │
│  │  │  - STUN: stun.l.google.com:19302           │      │    │
│  │  │  - SDP exchange via copy-paste UI          │      │    │
│  │  └────────────────────────────────────────────┘      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Page Context & Security (Cross-Origin Isolation)     │   │
│  │  COOP: same-origin  +  COEP: require-corp            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

### 🎞️ How ffmpeg Runs in the Browser

This is the most technically challenging piece. FFmpeg is a ~31 MB C/C++ codebase compiled to WebAssembly. Running it in a browser tab requires overcoming several hard constraints.

#### WebAssembly Port (ffmpeg.wasm)

[ffmpeg.wasm](https://github.com/nicedoc/ffmpeg.wasm) is a WebAssembly port of FFmpeg compiled with Emscripten. It ships three files fetched on-demand from unpkg CDN:

| File | Purpose | Size |
|------|---------|------|
| `ffmpeg-core.js` | JavaScript glue code (Emscripten runtime) | ~1 MB |
| `ffmpeg-core.wasm` | The actual FFmpeg binary compiled to WASM | ~31 MB |
| `ffmpeg-core.worker.js` | Web Worker wrapper for multi-threading | ~50 KB |

These are loaded via `toBlobURL()` — each file is fetched as a blob and re-served from a local object URL. This avoids CORS issues with `importScripts()` inside the worker and lets the page control the loading lifecycle.

```typescript
const coreURL = await toBlobURL(`${BASE}/ffmpeg-core.js`, 'text/javascript');
const wasmURL = await toBlobURL(`${BASE}/ffmpeg-core.wasm', 'application/wasm');
await this.ffmpeg.load({ coreURL, wasmURL, workerURL });
```

The `.wasm` file is large (~31 MB) — the app shows a loading bar during first fetch. It's cached by the browser's HTTP cache on subsequent visits.

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

---

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
| **Blur** | `gblur=sigma=N` | Video |
| **Pixelate** | `pixelize=N` | Video |
| **Text Overlay** | `drawtext=text='...':x=N:y=N` | Video |
| **Chroma Key** | `colorkey=color:similarity:blend` | Video |
| **Split Screen** | `hstack` (side-by-side) or `overlay` (PIP) | Complex |
| **Glitch** | `freezeframes` + frame manipulation | Video |

#### Filter Chaining Algorithm

When multiple video effects are applied, `chainEffects()` extracts the `-vf` or `-af` filter strings from each effect builder and concatenates them with commas into a single `-filter_complex` argument:

```text
filter = "crop=640:480:0:0,scale=1280:720,eq=brightness=0.1:contrast=1.2"
```

This is valid because comma-separated filters in ffmpeg form a linear chain where each filter's output feeds the next filter's input. This prevents the need for multiple ffmpeg passes — all effects are applied in a single decode-process-encode cycle.

Effects that can't be expressed as simple filters (trim, GIF export, concat, stabilize, audio operations) use `-ss`/`-to` (input seeking), multi-step commands, or special encoder flags instead.

#### Audio Pitch Correction

Speed changes require separate handling for video and audio. The video `setpts` filter adjusts frame presentation timestamps. For audio, ffmpeg's `atempo` filter preserves pitch while changing speed — but it's capped at a 2x range per filter instance. For speeds >2x or <0.5x, the algorithm chains multiple `atempo` instances:

```typescript
// 4x speed → chain two atempo=2.0 filters
chain = "atempo=2.0,atempo=2.0"
```

#### GIF Export (Palette-Based)

GIF export uses ffmpeg's two-pass palette generation for color quality:

1. **First pass** — generate an optimized 256-color palette from the video: `fps=N,scale=W:-1:flags=lanczos,palettegen`
2. **Second pass** — encode using the palette: `paletteuse=dither=bayer:bayer_scale=5`

This produces dramatically better quality than simple per-frame quantization.

---

### 🔗 WebRTC Peer-to-Peer Transfer

The P2P sharing system uses raw browser WebRTC APIs with zero external dependencies.

#### Connection Lifecycle

```
Sender                          Receiver
  │                                │
  ├─ createOffer() ────────────────┤
  │  (generates SDP offer)         │
  │                                │
  │  ═══ copy/paste offer ════>   │
  │                                │
  │                                ├─ receiveOffer(sdp)
  │                                │  (generates SDP answer)
  │  <═══ copy/paste answer ══════ │
  │                                │
  ├─ acceptAnswer(sdp) ────────────┤
  │                                │
  │  ◄── ICE + STUN ──────────────►│
  │  (NAT traversal via Google)    │
  │                                │
  │  ═══ RTCDataChannel open ═══>  │
  │                                │
  ├─ sendFile(file) ───────────────┤
  │  (16KB chunks over DC)         │
```

#### SDP (Session Description Protocol)

SDP is the text-based protocol that describes the media session: codecs, network addresses, encryption keys. When the sender calls `createOffer()`, the browser generates an opaque SDP string containing:

- ICE candidates (potential network paths to reach the peer)
- DTLS fingerprint (encryption key for the data channel)
- RTCDataChannel parameters (ordered, reliable delivery)

This SDP string is copied and pasted between peers — the app never sends it over the network. The signaling channel is whatever the users already have (chat, email, carrier pigeon).

#### ICE & STUN (NAT Traversal)

Most devices are behind NAT routers. ICE (Interactive Connectivity Establishment) discovers reachable network paths:

1. **Host candidates** — the device's own LAN IP
2. **STUN candidates** — the device's public IP as seen by Google's STUN server at `stun.l.google.com:19302`
3. **Relay candidates** (TURN) — not used here; would require a paid TURN server

For NAT-to-NAT connections, STUN alone works when both peers have full-cone NAT. For symmetric NAT scenarios (rare on consumer networks), a TURN relay would be needed — this is left as future work.

#### RTCDataChannel — Chunked File Transfer

WebRTC data channels send messages, not streams — attempting to send a large file as a single message fails with `MessageTooBig` (SCTP limit is typically 64KB-256KB). The solution is chunked transfer:

```typescript
const CHUNK_SIZE = 16 * 1024;  // 16 KB
const data = new Uint8Array(file.data);
let offset = 0;

while (offset < data.length) {
  const end = Math.min(offset + CHUNK_SIZE, data.length);
  const chunk = data.slice(offset, end);
  dataChannel.send(chunk.buffer);  // ArrayBuffer transfer
  offset = end;
}
```

**Protocol:**

1. **Header** (JSON string) — `{ type: 'file-header', name, size, mimeType }`
2. **Payload** (binary ArrayBuffer) — 16KB chunks
3. **Completion** — receiver detects `receivedBytes >= fileInfo.size`

The receiver's `onmessage` handler branches on type: strings are parsed as JSON headers, `ArrayBuffer` instances are accumulated as binary chunks.

#### Transfer Progress Calculation

Speed and ETA are computed from real wall-clock timing:

```typescript
speed = bytesTransferred / elapsed_seconds
eta   = (totalBytes - bytesTransferred) / speed
```

The React UI polls `getTransferProgress()` every 500ms during active transfers and renders a shadcn `Progress` bar with byte counts, speed (B/s/KB/s/MB/s), and ETA.

---

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

---

### 🧪 Test Strategy

65 tests across 4 test files, following TDD methodology:

| File | Tests | What it covers |
|------|-------|---------------|
| `tests/ffmpeg.test.ts` | 14 | Engine lifecycle, file ops, error handling, progress callbacks |
| `tests/effects.test.ts` | 33 | Every effect builder + `chainEffects()` composition logic |
| `tests/webrtc.test.ts` | 14 | Connection lifecycle, SDP flow, chunked send/receive, progress tracking |
| `tests/App.test.tsx` | 4 | React component rendering, drop zone interactions |

Key testing patterns:
- WebRTC tests use a **mock RTCPeerConnection** and **mock RTCDataChannel** (not available in jsdom)
- ffmpeg tests mock the `@ffmpeg/ffmpeg` module and verify command construction without actually running WASM
- Effect tests are pure function tests — no mocking needed, they assert exact ffmpeg argument arrays

---

### ⚡ Limitations & Future Work

- **Large files** (>2 GB) may exhaust browser memory for the virtual filesystem
- **TURN server** is needed for symmetric NAT traversal — currently falls back to browser-to-same-network only
- **Audio codecs** for speed effects require compatible encoder support in ffmpeg.wasm (libmp3lame is included; AAC uses the built-in aac encoder)
- **Mobile browsers** may unload the ffmpeg Web Worker during backgrounding — processing should persist state via IndexedDB in a future version
- **Multi-track editing** (layered video/audio tracks) is feasible via ffmpeg's `overlay` and `amix` filters but isn't exposed in the UI yet

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

## License & Attributions

This project is licensed under the **MIT License** — see [LICENSE](./LICENSE) for details.

### Third-Party Notices

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for license information on included open-source components.

- **Lucide Icons** (used in the UI) are CC BY 4.0
- All other dependencies are MIT, Apache-2.0, or ISC licensed
