#!/usr/bin/env node
// Post-build script: removes `crossorigin` from <link> tags to 
// prevent CORS issues on GitHub Pages with stylesheets
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distAssets = join(__dirname, '..', 'dist', 'assets');

// Step 1: Remove crossorigin from <link> tags
const htmlPath = join(__dirname, '..', 'dist', 'index.html');
try {
  let html = readFileSync(htmlPath, 'utf-8');
  html = html.replace(/<link([^>]*) crossorigin([^>]*)>/g, '<link$1$2>');
  writeFileSync(htmlPath, html, 'utf-8');
  console.log('✅ Stripped crossorigin from <link> tags in index.html');
} catch (e) {
  console.error('❌ Failed to process index.html:', e.message);
}

// Step 2: Patch new Worker(..., {type:"module"}) to new Worker(...) in JS bundles
// Module Workers ({type:"module"}) fail on browsers served via GitHub Pages due
// to content-type including charset (application/javascript; charset=utf-8)
// which WebKit rejects for module Workers. Classic Workers work fine since the
// Vite-bundled worker has all imports inlined as an IIFE.
try {
  const files = readdirSync(distAssets).filter(f => f.endsWith('.js'));
  let patchedCount = 0;
  for (const file of files) {
    const filePath = join(distAssets, file);
    let content = readFileSync(filePath, 'utf-8');
    // Match: ,{type:"module"}  appearing right before ) in Worker constructors
    // This targets the minified pattern from @ffmpeg/ffmpeg's classes.js
    const original = content;
    content = content.replace(/,{type:"module"}\)/g, ')');
    if (content !== original) {
      writeFileSync(filePath, content, 'utf-8');
      patchedCount++;
      const changes = (original.match(/,{type:"module"}\)/g) || []).length;
      console.log(`✅ Patched ${file}: removed {type:"module"} from ${changes} Worker constructor(s)`);
    }
  }
  if (patchedCount === 0) {
    console.log('ℹ️  No files needed patching (type:"module" not found)');
  }
} catch (e) {
  console.error('❌ Failed to patch JS bundles:', e.message);
}

// ── Step 3: Patch ffmpeg worker to support pre-loaded wasmBinary ──
// Emscripten checks Module.wasmBinary — if set, it skips WASM fetch().
// We inject code after importScripts to set Module.wasmBinary from the
// LOAD config data, bypassing Worker-side WASM compilation issues.
// This fixes WebKit+COEP where WebAssembly.instantiate(fetch(cdnURL))
// hangs inside the Worker.
try {
  const workerFiles = readdirSync(distAssets).filter(f =>
    f.startsWith('worker-') && f.endsWith('.js')
  );

  for (const file of workerFiles) {
    const filePath = join(distAssets, file);
    let content = readFileSync(filePath, 'utf-8');
    const original = content;

    // 1) Add wasmBinary param to the O function signature.
    //    Pattern: {coreURL:t,wasmURL:n,workerURL:e}
    //    Replace: {coreURL:t,wasmURL:n,workerURL:e,wasmBinary:w}
    content = content.replace(
      /\{coreURL:t,wasmURL:n,workerURL:e\}/g,
      '{coreURL:t,wasmURL:n,workerURL:e,wasmBinary:w}'
    );

    // 2) Set Module.wasmBinary BEFORE importScripts so Emscripten picks it up.
    //    Emscripten preamble: var Module = typeof Module != "undefined" ? Module : {};
    //    If self.Module exists before importScripts, Emscripten reuses it.
    //    Inject "if(w)self.Module={wasmBinary:w};" right after "const o=!r;"
    //    (before the try block that calls importScripts).
    content = content.replace(
      /const o=!r;try\{/g,
      'const o=!r;if(w)self.Module={wasmBinary:w};try{'
    );

    if (content !== original) {
      writeFileSync(filePath, content, 'utf-8');
      console.log(`✅ Patched ${file}: added wasmBinary support to ffmpeg worker`);
    } else {
      console.log(`ℹ️  Worker ${file} pattern not found (may be already patched)`);
    }
  }

  if (workerFiles.length === 0) {
    console.log('ℹ️  No worker files found to patch');
  }
} catch (e) {
  console.error('❌ Failed to patch worker files:', e.message);
}
