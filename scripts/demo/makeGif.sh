#!/bin/sh
# Turns the frames recorded by recordDemo.spec.ts into out/demo/demo.gif: raw footage for the
# edited README demo (docs/media/demo.gif), which this does not overwrite.
# Needs ffmpeg and gifski (brew install ffmpeg gifski).
# Shrinking the edited README GIF (2.8 MB at 1120x700, 5 fps): `npx gifsicle -U` it, keep the odd
# frames ('#1' '#3' … so the end card stays), then `npx gifsicle -O3 --lossy=80 --colors 128
# --delay 20`. Lossy above ~100 streaks the fades.
set -eu

FRAMES_DIR="out/demo/frames"
VIDEO_FRAMES_DIR="out/demo/video-frames"
OUTPUT="out/demo/demo.gif"
FPS=12
# The capture's full Retina width (a 1440-point window at 2x), so text stays sharp. This raw
# footage is larger than the README GIF, which is edited down and re-encoded as above.
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
