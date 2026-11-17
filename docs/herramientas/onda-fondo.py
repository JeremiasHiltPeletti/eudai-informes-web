"""Traza la banda clara y la onda de la franja superior sin logo ni línea.
Uso: fondo-onda.py origen.jpg alto_mm svg_completo.svg salida_grupos.txt"""
import sys, re, os, subprocess, tempfile
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
src, hmm, full_svg, out = sys.argv[1], float(sys.argv[2]), sys.argv[3], sys.argv[4]
im = Image.open(src).convert('RGB'); W, H = im.size
crop = im.crop((0, 0, W, round(hmm / 297 * H)))
big = crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS)
a = np.asarray(big).astype(float); h, w = a.shape[:2]
full = open(full_svg).read()
fills = re.findall(r'<g transform="[^"]+" fill="#([0-9a-f]{6})">', full)
pal = np.array([[252, 252, 252]] + [[int(f[i:i + 2], 16) for i in (0, 2, 4)] for f in fills], float)
idx = np.empty((h, w), int); fl = a.reshape(-1, 3)
for s0 in range(0, len(fl), 300000):
    idx.reshape(-1)[s0:s0 + 300000] = np.argmin(((fl[s0:s0 + 300000, None] - pal[None]) ** 2).sum(-1), 1)
BANDA, ONDA, LINEA, LOGO = 1, 2, 3, 4
# todo lo que sea naranja (logo, línea y sus bordes) se borra con margen
remove = ndimage.binary_dilation(np.isin(idx, (LINEA, LOGO)), iterations=6)
_, (iy, ix) = ndimage.distance_transform_edt(remove, return_indices=True)
idx = idx[iy, ix]
# limpieza: se quitan islitas sueltas de cada color
for c in (BANDA, ONDA):
    m = idx == c
    lab, n = ndimage.label(m)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        for i, s in enumerate(sizes):
            if s < sizes.max() * 0.01:
                region = lab == i + 1
                ring = ndimage.binary_dilation(region, iterations=2) & ~region
                idx[region] = np.bincount(idx[ring]).argmax()
groups = []
with tempfile.TemporaryDirectory() as d:
    for li, layer in enumerate((BANDA, ONDA)):
        mask = np.isin(idx, (BANDA, ONDA)[li:])
        m = Image.fromarray((mask * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(7))
        bmp = os.path.join(d, 'm.pbm'); svg = os.path.join(d, 'm.svg')
        Image.fromarray(((np.asarray(m) < 128) * 255).astype('uint8')).convert('1').save(bmp)
        subprocess.run(['potrace', bmp, '-s', '-o', svg, '-t', '40', '-a', '1.0', '-O', '1.5', '-u', '10'], check=True)
        s = open(svg).read()
        tr = re.search(r'<g transform="([^"]+)"', s).group(1)
        groups.append(f'<g transform="{tr}" fill="#{fills[layer - 1]}">' + ''.join(f'<path d="{q}"/>' for q in re.findall(r' d="([^"]+)"', s)) + '</g>')
open(out, 'w').write(''.join(groups))
print(out, 'listo')
