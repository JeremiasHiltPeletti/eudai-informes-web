"""Traza sólo la línea naranja de la onda superior, sin el logo.
Uso: linea.py origen.jpg alto_mm svg_completo.svg salida_grupo.txt"""
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
LINEA, LOGO = 3, 4
logo = ndimage.binary_dilation(idx == LOGO, iterations=6)
mask = np.isin(idx, (LINEA, LOGO)) & ~logo
lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
# la línea: las manchas grandes (puede quedar partida donde roza el logo)
keep = [i + 1 for i, s in enumerate(sizes) if s > sizes.max() * 0.02]
mask = np.isin(lab, keep)
# Si la línea quedó partida donde rozaba el logo, se unen los tramos con un
# segmento del mismo grosor (en esa distancia corta la curva es casi recta).
if len(keep) == 2:
    from PIL import ImageDraw
    pa = np.argwhere(lab == keep[0]); pb = np.argwhere(lab == keep[1])
    sa = pa[::max(1, len(pa) // 4000)]; sb = pb[::max(1, len(pb) // 4000)]
    dd = ((sa[:, None, :] - sb[None]) ** 2).sum(-1)
    i, j = np.unravel_index(dd.argmin(), dd.shape)
    # grosor típico de la línea: alto de la mancha por columna
    cols = [np.count_nonzero(mask[:, x]) for x in range(0, w, 7) if mask[:, x].any()]
    thick = float(np.median(cols))
    img = Image.fromarray((mask * 255).astype('uint8')); dr = ImageDraw.Draw(img)
    # se extiende el puente unos píxeles hacia adentro de cada tramo
    (y0, x0), (y1, x1) = sa[i], sb[j]
    dr.line([(x0, y0), (x1, y1)], fill=255, width=max(2, round(thick * 0.8)))
    mask = np.asarray(img) > 0
print('manchas', n, 'conservadas', len(keep), [int(sizes[i - 1]) for i in keep])
with tempfile.TemporaryDirectory() as d:
    m = Image.fromarray((mask * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.2))
    bmp = os.path.join(d, 'm.pbm'); svg = os.path.join(d, 'm.svg')
    Image.fromarray(((np.asarray(m) < 128) * 255).astype('uint8')).convert('1').save(bmp)
    subprocess.run(['potrace', bmp, '-s', '-o', svg, '-t', '40', '-a', '1.0', '-O', '1.5', '-u', '10'], check=True)
    s = open(svg).read()
tr = re.search(r'<g transform="([^"]+)"', s).group(1)
color = '#' + fills[2]
open(out, 'w').write(f'<g transform="{tr}" fill="{color}">' + ''.join(f'<path d="{q}"/>' for q in re.findall(r' d="([^"]+)"', s)) + '</g>')
