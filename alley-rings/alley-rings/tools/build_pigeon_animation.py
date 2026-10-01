"""Assemble the generated 3x2 contact sheet into local GIF / MP4 assets.

Usage: python tools/build_pigeon_animation.py
Dependencies: Pillow, imageio-ffmpeg (see requirements-animation.txt).
The reference images were used by ImageGen to generate the source sheet;
this script only extracts / registers those generated animation frames.
"""
from pathlib import Path
import json
from PIL import Image, ImageChops
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "source" / "elly-pigeon-spritesheet.png"
ASSETS = ROOT / "assets"
EXPORT = ROOT / "exports"
EXPORT.mkdir(exist_ok=True)
sheet = Image.open(SOURCE).convert("RGB")
cell_w, cell_h = sheet.width // 3, sheet.height // 2
cells = [sheet.crop((col * cell_w, row * cell_h, (col+1) * cell_w, (row+1) * cell_h)) for row in range(2) for col in range(3)]
# Use one shared crop / transform across every pose, preserving head motion.
boxes = []
for cell in cells:
    mask = cell.convert("L").point(lambda p: 255 if p < 205 else 0)
    boxes.append(mask.getbbox())
box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
scale = min(630 / (box[2]-box[0]), 630 / (box[3]-box[1]))
size = (round((box[2]-box[0])*scale), round((box[3]-box[1])*scale))
poses = []
for cell in cells:
    frame = Image.new("RGB", (720,720), "white")
    content = cell.crop(box).resize(size, Image.Resampling.NEAREST)
    frame.paste(content, ((720-size[0])//2, (720-size[1])//2))
    poses.append(frame)
sequence = [0,1,2,3,4,5,4,3,2,1,0,0]
durations = [340,330,330] * 4  # Exactly 4 seconds, repeated indefinitely.
frames = [poses[i] for i in sequence]
# Shared palette prevents black / green glyph colors flickering between poses.
palette_canvas = Image.new("RGB",(720*3,720*2),"white")
for i,pose in enumerate(poses):
    palette_canvas.paste(pose,((i%3)*720,(i//3)*720))
palette = palette_canvas.quantize(colors=128,method=Image.Quantize.MEDIANCUT)
gif_frames = [frame.quantize(palette=palette,dither=Image.Dither.NONE) for frame in frames]
gif_path = ASSETS / "elly-pigeon.gif"
gif_frames[0].save(gif_path,save_all=True,append_images=gif_frames[1:],duration=durations,loop=0,optimize=False,disposal=2)
poses[0].save(ASSETS / "elly-pigeon-poster.png")
video_path = EXPORT / "elly-ring-pigeon.mp4"
writer = imageio_ffmpeg.write_frames(str(video_path),(720,720),fps=24,codec="libx264",pix_fmt_in="rgb24",pix_fmt_out="yuv420p",quality=9,output_params=["-movflags","+faststart","-metadata","title=Elly's Ring — typographic pigeon"])
writer.send(None)
try:
    for _ in range(3):
        for frame in frames:
            raw=frame.tobytes()
            for _ in range(8):
                writer.send(raw)
finally:
    writer.close()
# Separate user-facing GIF export as well as the in-app asset.
(EXPORT / "elly-ring-pigeon.gif").write_bytes(gif_path.read_bytes())
metadata={"name":"Elly's Ring","style":"Black monospaced M / N / O / 0 pigeon with green accents on white","source":"assets/source/elly-pigeon-spritesheet.png","generation":"Built-in ImageGen; two user-supplied visual references","size":[720,720],"gif_loop_seconds":4,"video_seconds":12,"fps":24,"video_codec":"H.264","gif":str(gif_path.relative_to(ROOT)),"mp4":str(video_path.relative_to(ROOT))}
(EXPORT / "animation.json").write_text(json.dumps(metadata,indent=2,ensure_ascii=False),encoding="utf-8")
print(json.dumps(metadata,ensure_ascii=False))
print("GIF bytes:",gif_path.stat().st_size,"MP4 bytes:",video_path.stat().st_size)
