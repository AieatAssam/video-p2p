#!/usr/bin/env node
// Post-build script: removes `crossorigin` from <link> tags to 
// prevent CORS issues on GitHub Pages with stylesheets
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, '..', 'dist', 'index.html');

try {
  let html = readFileSync(htmlPath, 'utf-8');
  
  // Remove crossorigin from <link> tags only (not <script>)
  html = html.replace(/<link([^>]*) crossorigin([^>]*)>/g, '<link$1$2>');
  
  writeFileSync(htmlPath, html, 'utf-8');
  console.log('✅ Stripped crossorigin from <link> tags in index.html');
} catch (e) {
  console.error('❌ Failed to process index.html:', e.message);
  process.exit(1);
}
