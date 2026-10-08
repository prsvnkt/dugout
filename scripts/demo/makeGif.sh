#!/bin/sh
# Turns the frames recorded by recordDemo.spec.ts into out/demo/demo.gif: raw footage for the
# edited README demo (docs/media/demo.gif), which this does not overwrite.
# Needs ffmpeg and gifski (brew install ffmpeg gifski).
set -eu

FRAMES_DIR="out/demo/frames"
VIDEO_FRAMES_DIR="out/demo/video-frames"
OUTPUT="out/demo/demo.gif"
FPS=12
# The capture's full Retina width (a 1440-point window at 2x), so text stays sharp. Flat UI
# compresses well: about 2 MB for 30 seconds.
WIDTH=2880
QUALITY=95

for tool in ffmpeg gifski; do
  command -v "$tool" >/dev/null || { echo "$tool not found: brew install ffmpeg gifski" >&2; exit 1; }
done

# Resample the irregular screenshots to a steady frame rate, keeping each one's real duration.
rm -rf "$VIDEO_FRAMES_DIR"
mkdir -p "$VIDEO_FRAMES_DIR" "$(dirname "$OUTPUT")"
ffmpeg -loglevel error -f concat -safe 0 -i "$FRAMES_DIR/frames.txt" \
  -vf "fps=$FPS,scale=$WIDTH:-2:flags=lanczos" "$VIDEO_FRAMES_DIR/%05d.png"

# gifski shrinks to about 800x600 unless given --width.
gifski --quiet --fps "$FPS" --quality "$QUALITY" --width "$WIDTH" --output "$OUTPUT" "$VIDEO_FRAMES_DIR"/*.png
echo "Wrote $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
