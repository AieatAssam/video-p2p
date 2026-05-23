#!/usr/bin/env bash
# Generate small test video fixtures for automated testing
# All generated files are synthetic test patterns

set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR"

echo "==> Generating test video fixtures..."
echo "Output dir: $OUT"

# 1. Solid blue + sine tone (1s, 320x240, mp4)
ffmpeg -y -f lavfi -i "color=c=blue:s=320x240:d=1:r=15" \
  -f lavfi -i "sine=f=440:d=1" \
  -c:v libx264 -preset ultrafast -crf 28 \
  -c:a aac -ar 22050 -ac 1 -b:a 32k -shortest \
  "$OUT/small-blue.mp4" 2>&1 | tail -1

# 2. Red (1s)
ffmpeg -y -f lavfi -i "color=c=red:s=320x240:d=1:r=15" \
  -c:v libx264 -preset ultrafast -crf 28 \
  "$OUT/small-red.mp4" 2>&1 | tail -1

# 3. Green (1s)
ffmpeg -y -f lavfi -i "color=c=green:s=320x240:d=1:r=15" \
  -c:v libx264 -preset ultrafast -crf 28 \
  "$OUT/small-green.mp4" 2>&1 | tail -1

# 4. Testsync pattern for chroma key (2s, moving elements)
ffmpeg -y -f lavfi -i "color=c=0x00FF00:s=320x240:d=2:r=15" \
  -f lavfi -i "testsrc=s=80x80:d=2:r=15" \
  -filter_complex "overlay=x=100:y=70" \
  -c:v libx264 -preset ultrafast -crf 28 \
  "$OUT/small-greenscreen.mp4" 2>&1 | tail -1

# 5. Short clip (0.5s) for speed/reverse tests
ffmpeg -y -f lavfi -i "color=c=purple:s=320x240:d=0.5:r=15" \
  -c:v libx264 -preset ultrafast -crf 28 \
  "$OUT/small-purple.mp4" 2>&1 | tail -1

# 6. Test pattern (2s, 15fps)
ffmpeg -y -f lavfi -i "testsrc=s=320x240:d=2:r=15" \
  -c:v libx264 -preset ultrafast -crf 30 \
  "$OUT/small-testsrc.mp4" 2>&1 | tail -1

# 7. Audio-only (for audio extract/replace tests)
ffmpeg -y -f lavfi -i "sine=f=660:d=1" \
  -c:a aac -ar 22050 -ac 1 -b:a 32k \
  "$OUT/small-beep.m4a" 2>&1 | tail -1

echo ""
echo "==> Done! Files:"
ls -lh "$OUT"/small-*.mp4 "$OUT"/small-*.m4a 2>/dev/null | awk '{print $5, $9}'
