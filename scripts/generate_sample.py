#!/usr/bin/env python3
"""Render original, anonymous mart footage used by the demo.

The picture is an illustration, not a recording of a real business. Solid shirt
colors deliberately make this a deterministic computer-vision test fixture.
No precomputed counts or timestamps are supplied to the analyzer.

Requirements: Pillow, numpy, ffmpeg (libx264). Run from any working directory.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import random
import subprocess

from PIL import Image, ImageDraw, ImageFont
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT, FPS, DURATION = 1280, 720, 15, 36
ZONES = [
    {"id": "produce", "label": "신선식품", "x": .05, "y": .08, "w": .40, "h": .40, "color": "#e87932"},
    {"id": "aisle", "label": "중앙매대", "x": .48, "y": .10, "w": .15, "h": .40, "color": "#699fe8"},
    {"id": "checkout", "label": "계산대", "x": .48, "y": .52, "w": .15, "h": .16, "color": "#c18be0"},
    {"id": "household", "label": "생활용품", "x": .66, "y": .12, "w": .30, "h": .80, "color": "#59b6a1"},
]


def rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))


ACTORS = [
    {"id": "P01", "role": "person", "color": rgb("#e87932"), "path": [
        (0, 175, 180), (4, 350, 180), (8, 350, 180), (11, 475, 190),
        (15, 475, 190), (19, 380, 285), (22, 380, 285), (27, 180, 265),
        (30, 180, 265), (34, 175, 180), (36, 175, 180)]},
    {"id": "P02", "role": "person", "color": rgb("#f4bd50"), "path": [
        (0, 315, 285), (6, 315, 285), (10, 180, 285), (13, 180, 285),
        (17, 180, 185), (20, 180, 185), (25, 330, 185), (29, 330, 185),
        (33, 475, 285), (36, 475, 285)]},
    {"id": "P03", "role": "person", "color": rgb("#59b6a1"), "path": [
        (0, 695, 135), (6, 695, 135), (10, 695, 425), (12, 695, 425),
        (14, 840, 425), (17, 840, 214), (19, 935, 214), (36, 935, 214)]},
    {"id": "P04", "role": "person", "color": rgb("#699fe8"), "path": [
        (0, 745, 230), (9, 745, 230), (13, 745, 435), (16, 745, 435),
        (22, 745, 760), (36, 745, 760)]},
    {"id": "P05", "role": "person", "color": rgb("#c18be0"), "path": [
        (0, 650, -60), (6, 650, -60), (9, 650, 280), (15, 650, 280),
        (19, 650, 420), (21, 650, 420), (27, 1100, 420), (36, 1100, 420)]},
    {"id": "P06", "role": "person", "color": rgb("#e77797"), "path": [
        (0, 790, -60), (15, 790, -60), (18, 790, 250), (23, 790, 250),
        (27, 790, 420), (29, 790, 420), (36, 790, 760)]},
    {"id": "P07", "role": "person", "color": rgb("#7ac7dc"), "path": [
        (0, 950, 570), (10, 950, 570), (12, 957, 574), (18, 957, 574),
        (20, 950, 570), (36, 950, 570)]},
    {"id": "P08", "role": "person", "color": rgb("#a8bc66"), "path": [
        (0, 1120, 200), (22, 1120, 200), (24, 1215, 200), (32, 1215, 760),
        (36, 1215, 760)]},
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "NotoSans-Bold.ttf" if bold else "NotoSans-Regular.ttf"
    return ImageFont.truetype(f"/usr/share/fonts/truetype/noto/{name}", size)


FONT10, FONT12, FONT14, FONT18 = font(10), font(12), font(14), font(18, True)


def pill(draw: ImageDraw.ImageDraw, box, color, radius=8, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=color, outline=outline, width=width)


def plant(draw: ImageDraw.ImageDraw, x: int, y: int, scale: float = 1):
    r = int(22 * scale)
    draw.ellipse((x-r+4, y-r+7, x+r+4, y+r+7), fill="#625344")
    draw.ellipse((x-r, y-r, x+r, y+r), fill="#a29a83", outline="#bcb099", width=3)
    draw.ellipse((x-r+4, y-r+4, x+r-4, y+r-4), fill="#514d3b")
    for angle in range(0, 360, 45):
        theta = math.radians(angle)
        dx, dy = math.cos(theta) * r * .6, math.sin(theta) * r * .6
        draw.ellipse((x+dx-r*.35, y+dy-r*.55, x+dx+r*.35, y+dy+r*.55), fill="#40583e", outline="#526546")
    draw.ellipse((x-5, y-5, x+5, y+5), fill="#667052")


def shelf(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, rng, produce=False):
    """Original grocery fixtures, not an external retail photograph."""
    pill(draw, (x+5,y+8,x+w+5,y+h+8), "#9b9a8d", 5)
    pill(draw, (x,y,x+w,y+h), "#c5c6bc", 4, "#81897f", 2)
    colors = ["#a66c48", "#d4c59f", "#7b9165", "#b78267", "#a5b7b1", "#bca67e", "#66817b", "#bc9a97"]
    if produce:
        bins=6
        for i in range(bins):
            bx=x+6+i*(w-10)//bins
            bw=(w-10)//bins-5
            pill(draw,(bx,y+5,bx+bw,y+h-5),"#716d50",2)
            for px in range(bx+9,bx+bw-5,13):
                for py in range(y+12,y+h-7,13):
                    color=["#7b8b42","#b4673c","#bca64e","#697e4a","#a67a3c","#81905f"][i]
                    draw.ellipse((px-5,py-5,px+5,py+5),fill=color,outline="#5e6441")
    else:
        for px in range(x+7,x+w-13,18):
            for py in range(y+5,y+h-12,22):
                color=rng.choice(colors)
                pill(draw,(px,py,px+13,py+17),color,2)
                draw.rectangle((px+2,py+6,px+11,py+10),fill="#e7e3d6")
    draw.line((x+2,y+h-2,x+w-2,y+h-2),fill="#e6e4d8",width=3)
    for px in range(x+14,x+w-10,40):
        draw.rectangle((px,y+h-2,px+14,y+h+3),fill="#eeead9")


def background() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), "#d3d0c2")
    d = ImageDraw.Draw(image)
    rng = random.Random(31)
    # Supermarket tiles and soft overhead floor texture.
    for x in range(0,WIDTH,64):
        for y in range(48,HEIGHT,64):
            shade=rng.randrange(-4,5)
            d.rectangle((x+1,y+1,x+62,y+62),fill=(210+shade,207+shade,193+shade))
    d.rectangle((0,0,WIDTH,44),fill="#e8e7dc")
    d.rectangle((0,42,WIDTH,50),fill="#787c6e")
    d.rectangle((1237,0,1280,HEIGHT),fill="#e2e1d4")
    for y in (82,275,468):
        pill(d,(1248,y,1278,y+150),"#a6b2aa",1,"#737e73",2)
        d.line((1263,y+3,1263,y+147),fill="#d1d8ce",width=2)
    # Four real spatial zones: produce, promotional aisle, checkout, household.
    pill(d,(42,56,587,362),"#b6bca5",10)
    shelf(d,65,75,498,60,rng,produce=True)
    shelf(d,65,328,498,46,rng,produce=True)
    d.text((79,145),"FRESH PRODUCE",font=FONT12,fill="#68705c")
    d.text((386,305),"FRUIT / VEGETABLES",font=FONT10,fill="#69715f")
    # Grocery gondolas in the lower left, separate from the produce observation zone.
    shelf(d,65,480,498,59,rng)
    shelf(d,65,602,498,52,rng)
    d.text((79,549),"GROCERY & PANTRY",font=FONT12,fill="#7e8170")
    # Promotional endcaps bordering a clear central walking aisle.
    shelf(d,591,129,40,179,rng)
    shelf(d,804,129,40,179,rng)
    pill(d,(669,62,773,87),"#777f62",4)
    d.text((683,67),"DAILY DEALS",font=FONT12,fill="#e9ecdf")
    d.text((674,334),"MAIN AISLE",font=FONT12,fill="#858775")
    # Checkout lane, conveyor, payment terminal and bagging surface.
    pill(d,(600,496,821,585),"#7b8375",7)
    pill(d,(604,496,741,555),"#5f695d",5,"#aab29f",2)
    for y in range(503,554,7):d.line((610,y,735,y),fill="#707c6b")
    pill(d,(747,496,821,555),"#c2c7b7",5)
    pill(d,(759,502,805,531),"#444f43",3)
    pill(d,(764,506,800,524),"#a5b5a4",2)
    d.rectangle((768,535,797,546),fill="#e6e5d7")
    d.text((674,565),"CHECKOUT",font=FONT12,fill="#e5e9dc")
    # Household merchandise, four gondolas with two clear browsing aisles.
    pill(d,(854,94,1226,640),"#c5cbbb",12)
    for sy,sh in ((115,48),(280,43),(350,40),(485,46)):
        shelf(d,876,sy,316,sh,rng)
    d.text((880,177),"HOME & DAILY ESSENTIALS",font=FONT12,fill="#6e7866")
    d.text((880,545),"HOUSEHOLD GOODS",font=FONT12,fill="#6e7866")
    # Wall signage and small fixture details.
    plant(d,38,430,.7)
    plant(d,1208,665,.8)
    pill(d,(631,651,814,711),"#939887",5)
    for y in range(658,708,5):d.line((638,y,808,y),fill="#a6ab99")
    d.text((689,673),"ENTRY",font=FONT12,fill="#e0e4d7")
    pill(d,(15,13,342,39),"#2f392e",5)
    d.ellipse((27,22,35,30),fill="#d8e4bd")
    d.text((45,16),"SYNTHETIC MART  /  DEMO CAMERA 01",font=FONT12,fill="#e8eddf")
    d.text((1040,16),"store.ai  /  SIMULATION",font=FONT12,fill="#737f69")
    # Reserve all marker colors exclusively for anonymous shoppers.
    pixels=np.asarray(image).copy()
    for actor in ACTORS:
        color=np.asarray(actor["color"],dtype=np.int16)
        matches=np.all(np.abs(pixels.astype(np.int16)-color)<=36,axis=2)
        pixels[matches]=(141,136,124)
    return Image.fromarray(pixels)


def position(path, time: float):
    for left, right in zip(path, path[1:]):
        t0, x0, y0 = left
        t1, x1, y1 = right
        if t0 <= time <= t1:
            f = (time-t0)/(t1-t0)
            # Linear motion is deliberate: testing movement metrics is repeatable.
            return x0+(x1-x0)*f, y0+(y1-y0)*f, math.atan2(y1-y0, x1-x0) if (x1,y1)!=(x0,y0) else -.5
    return path[-1][1], path[-1][2], -.5


def person(draw: ImageDraw.ImageDraw, x: float, y: float, color, angle: float):
    # Draw feet and shadows first; only the shirt has its distinctive marker hue.
    draw.ellipse((x-21+5, y-22+8, x+21+5, y+24+8), fill="#7c7362")
    draw.ellipse((x-12, y+14, x-2, y+29), fill="#45453d")
    draw.ellipse((x+3, y+14, x+13, y+29), fill="#45453d")
    draw.ellipse((x-20, y-8, x+20, y+22), fill=color)
    # Sleeve patches connect with the body, creating a robust component.
    draw.ellipse((x-23, y-2, x-11, y+16), fill=color)
    draw.ellipse((x+11, y-2, x+23, y+16), fill=color)
    draw.ellipse((x-11, y-17, x+11, y+6), fill="#cfae8e")
    draw.ellipse((x-11, y-21, x+11, y-3), fill="#4d4338")
    # A small highlight suggests overhead light while keeping the marker intact.
    draw.arc((x-17, y-4, x+17, y+18), 45, 145, fill=color, width=2)


def render(base: Image.Image, time: float) -> Image.Image:
    frame = base.copy()
    d = ImageDraw.Draw(frame)
    for actor in sorted(ACTORS, key=lambda a: position(a["path"], time)[1]):
        x, y, angle = position(actor["path"], time)
        if -35 < x < WIDTH+35 and -35 < y < HEIGHT+35:
            person(d, x, y, actor["color"], angle)
    pill(d, (1016, 680, 1263, 708), "#32372f", 5)
    d.text((1029, 685), f"SIMULATED TIME  10:00:{int(time):02d}", font=FONT12, fill="#efe8d8")
    return frame


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "server/data/demo-mart.mp4")
    parser.add_argument("--preview", type=Path, default=Path("/tmp/mart-scene.png"))
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    base = background()
    render(base, 11).save(args.preview)
    config = {
        "description": "Original synthetic overhead mart illustration; actors and timings are simulated. Person counts are computed from video pixels.",
        "license": "Original project artwork; no third-party footage or real personal data.",
        "width": WIDTH, "height": HEIGHT, "fps": FPS, "duration": DURATION,
        "markers": [{"id": a["id"], "color": a["color"], "role": a["role"]} for a in ACTORS],
        "zones": ZONES,
    }
    args.output.with_name("demo-mart-config.json").write_text(json.dumps(config, ensure_ascii=False, indent=2)+"\n")
    command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning", "-f", "rawvideo", "-vcodec", "rawvideo", "-s", f"{WIDTH}x{HEIGHT}", "-pix_fmt", "rgb24", "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(args.output)]
    proc = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        for i in range(DURATION * FPS):
            proc.stdin.write(render(base, i / FPS).tobytes())
    finally:
        proc.stdin.close()
    if proc.wait():
        raise RuntimeError("ffmpeg failed")
    print(f"Rendered {args.output}: {DURATION}s, {FPS}fps, {args.output.stat().st_size:,} bytes")
    print(f"Preview: {args.preview}")


if __name__ == "__main__":
    main()
