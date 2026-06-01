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
