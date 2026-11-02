#!/usr/bin/env python3
"""Render measured floor-grid accumulation; receives TypeScript projection output."""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

data = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2])
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size, index=1)

W, H = 1800, 1010
paper, ink, muted = '#f7f7ef', '#25352d', '#748171'
image = Image.new('RGB', (W, H), paper)
draw = ImageDraw.Draw(image)
draw.text((68, 40), 'ACTUAL OBSERVATIONS / TIME ACCUMULATION', font=font(19, True), fill='#de8253')
draw.text((65, 86), '관찰이 쌓이면, 공간의 패턴이 보입니다.', font=font(42, True), fill=ink)
draw.text((68, 154), '동일한 실제 영상의 누적 구간 · 발 위치 추정과 수동 원근 보정 · 전체 52초와 같은 색상 범위', font=font(21), fill=muted)
palette = [(0, (49,82,211)), (.24,(23,163,224)), (.46,(69,209,171)), (.66,(247,226,66)), (.83,(252,143,39)), (1,(225,57,43))]

def colorize(grid):
    grid = np.asarray(grid, dtype=float)
    relative = np.clip(grid / max(data['fullMax'], 1e-10), 0, 1)
    levels = np.power(relative, .52)
    rgba = np.zeros((*grid.shape, 4), dtype=np.uint8)
    for channel in range(3):
        rgba[..., channel] = np.interp(levels, [x[0] for x in palette], [x[1][channel] for x in palette]).astype(np.uint8)
    rgba[..., 3] = np.where(relative >= .007, np.minimum(1, relative * 22) * 225, 0).astype(np.uint8)
    return Image.fromarray(rgba)

for i, stage in enumerate(data['stages']):
    left, top, width, height = 66 + i*568, 225, 536, 622
    draw.rounded_rectangle((left,top,left+width,top+height), radius=20, fill='#ffffff', outline='#dfe4d9', width=2)
    draw.text((left+28, top+22), f"0–{stage['end']:02d}s", font=font(28, True), fill=ink)
    draw.text((left+width-115, top+31), f"STAGE 0{i+1}", font=font(13, True), fill='#9aa38f')
    # Unitless manually rectified floor. These are structural display rows, not a surveyed plan.
    fx, fy, fw, fh = left+60, top+92, 416, 414
    floor = Image.new('RGBA', (fw, fh), '#edf0e7')
    fd = ImageDraw.Draw(floor)
    for x in range(0,fw,26): fd.line((x,0,x,fh), fill='#e0e5d9')
    for y in range(0,fh,26): fd.line((0,y,fw,y), fill='#e0e5d9')
    heat = colorize(np.asarray(stage['grid']).reshape(stage['height'],stage['width'])).resize((fw,fh),Image.Resampling.BICUBIC)
    floor.alpha_composite(heat)
    fd = ImageDraw.Draw(floor)
    # Shade shelf footprints lightly so underlying measured heat remains visible.
    shelf = Image.new('RGBA',(fw,fh)); sd=ImageDraw.Draw(shelf)
    for box in [(8,24,41,fh-38),(fw-41,24,fw-8,fh-38),(fw//2-34,100,fw//2+34,fh-80),(49,10,fw-49,28)]:
        sd.rounded_rectangle(box, radius=3, fill=(219,224,212,185), outline=(160,172,151,255), width=2)
    floor.alpha_composite(shelf)
    image.paste(floor.convert('RGB'),(fx,fy))
    draw.rectangle((fx,fy,fx+fw,fy+fh),outline='#c5cfbb',width=2)
    draw.text((fx+154,fy-24),'FAR / REAR',font=font(11,True),fill='#7c8970')
    draw.text((fx+144,fy+fh+7),'NEAR / CAMERA',font=font(11,True),fill='#7c8970')
    draw.text((left+28,top+548),f"{stage['detections']}건 관찰 → {stage['mappedObservations']}건 투영",font=font(23,True),fill=ink)
    draw.text((left+28,top+590),f"누적 {stage['mappedPersonSeconds']:.1f}인·초  /  {stage['sampledFrames']}개 표본 프레임",font=font(17),fill=muted)

gx, gy, gw = 70, 892, 470
gradient = Image.new('RGB',(gw,18))
pixels=gradient.load()
for x in range(gw):
    level=x/(gw-1)
    rgb=tuple(int(np.interp(level,[a[0] for a in palette],[a[1][c] for a in palette])) for c in range(3))
    for y in range(18):pixels[x,y]=rgb
image.paste(gradient,(gx,gy))
draw.text((gx,gy+28),'낮은 상대 체류',font=font(16),fill=muted)
draw.text((gx+344,gy+28),'높은 상대 체류',font=font(16),fill=muted)
draw.text((610,887),'실제 관찰값만 누적 · 잘린 발과 보정 영역 밖 관찰은 제외',font=font(19,True),fill='#65765d')
draw.text((610,921),'배치와 원근은 수동 재구성입니다. 실측 밀도·구매 의도·방문자 수를 의미하지 않습니다.',font=font(16),fill=muted)
draw.text((68,976),'Source: Intel IoT DevKit / sample-videos · CC BY 4.0 · modified analysis illustration · source.json / license.txt',font=font(12),fill='#8c9783')
image.save(out,optimize=True)
