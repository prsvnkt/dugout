#!/bin/sh
# Turns the frames recorded by recordDemo.spec.ts into docs/media/demo.gif.
# Needs ffmpeg and gifski (brew install ffmpeg gifski).
set -eu

FRAMES_DIR="out/demo/frames"
VIDEO_FRAMES_DIR="out/demo/video-frames"
OUTPUT="docs/media/demo.gif"
FPS=12
WIDTH=1280
QUALITY=85

for tool in ffmpeg gifski; do
  command -v "$tool" >/dev/null || { echo "$tool not found: brew install ffmpeg gifski" >&2; exit 1; }
done

# Resample the irregular screenshots to a steady frame rate, keeping each one's real duration.
rm -rf "$VIDEO_FRAMES_DIR"
mkdir -p "$VIDEO_FRAMES_DIR" "$(dirname "$OUTPUT")"
ffmpeg -loglevel error -f concat -safe 0 -i "$FRAMES_DIR/frames.txt" \
  -vf "fps=$FPS,scale=$WIDTH:-2:flags=lanczos" "$VIDEO_FRAMES_DIR/%05d.png"

gifski --quiet --fps "$FPS" --quality "$QUALITY" --output "$OUTPUT" "$VIDEO_FRAMES_DIR"/*.png
echo "Wrote $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
