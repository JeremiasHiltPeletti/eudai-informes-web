"""Convierte una franja de fondo (colores lisos) en SVG vectorial.

Así se generaron assets/bg-{data,content}-*.svg a partir de los fondos
completos que quedaron en el historial de Git (commit ef37343). Requiere
potrace, Pillow y numpy.

Uso: python3 vectorizar-fondos.py origen.jpg y0_mm alto_mm colores salida.svg
Ej.:  python3 vectorizar-fondos.py bg-data.jpg 0 105.69 8 bg-data-top.svg
"""
import sys, subprocess, tempfile, os, re
from PIL import Image
import numpy as np
src, y0mm, hmm, k, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
im = Image.open(src).convert('RGB'); W, H = im.size
y0 = round(y0mm / 297 * H); y1 = min(H, round((y0mm + hmm) / 297 * H))
crop = im.crop((0, y0, W, y1))
SC = 2  # se traza al doble para curvas más suaves
big = crop.resize((crop.width * SC, crop.height * SC), Image.LANCZOS)
a = np.asarray(big).astype(float)
# Paleta: colores de píxeles "planos" (vecindario 3x3 uniforme, en la franja
# sin agrandar), elegidos de mayor a menor frecuencia y descartando los que
# quedan a menos de MIN_DIST de uno ya elegido. Así los bordes suavizados no se
# llevan un color propio y un trazo fino (la línea naranja) sí cuenta.
from PIL import ImageFilter
MIN_DIST = 12
c3 = crop
var = np.asarray(c3.filter(ImageFilter.MaxFilter(3)).convert('L')).astype(int) - np.asarray(c3.filter(ImageFilter.MinFilter(3)).convert('L')).astype(int)
flat = np.asarray(c3).reshape(-1, 3)[(var <= 8).ravel()].astype(int)
vals, cnt = np.unique(flat // 3 * 3 + 1, axis=0, return_counts=True)
ordr = np.argsort(-cnt); chosen = []
for i in ordr:
    v = vals[i]
    if cnt[i] < 15: break
    if all(np.abs(v - c).max() >= MIN_DIST for c in chosen):
        # el color representativo: promedio de los píxeles planos cercanos
        near = flat[np.abs(flat - v).max(axis=1) < MIN_DIST / 2]
        chosen.append(near.mean(0) if len(near) else v)
    if len(chosen) >= k: break
pal = np.array(chosen, dtype=float)
flatall = a.reshape(-1, 3)
idx = np.empty(len(flatall), dtype=int)
for s0 in range(0, len(flatall), 400000):
    ch = flatall[s0:s0 + 400000]
    idx[s0:s0 + 400000] = np.argmin(((ch[:, None, :] - pal[None]) ** 2).sum(-1), axis=1)
idx = idx.reshape(a.shape[:2])
counts = np.bincount(idx.ravel(), minlength=k)
order = [0] + [i for i in np.argsort(-counts) if i != 0 and counts[i] > 0]
bg = 0; layers = order[1:]
w, h = big.size
paths = []
with tempfile.TemporaryDirectory() as d:
    for n, li in enumerate(layers):
        mask = np.isin(idx, layers[n:])  # apilado: cada capa cubre por debajo a las siguientes
        if mask.mean() < 0.0002: continue
        bmp = os.path.join(d, 'm.pbm'); svg = os.path.join(d, 'm.svg')
        Image.fromarray(((~mask) * 255).astype('uint8')).convert('1').save(bmp)
        subprocess.run(['potrace', bmp, '-s', '-o', svg, '--flat', '-t', '30', '-a', '1.0', '-O', '0.4', '-u', '10'], check=True)
        s = open(svg).read()
        tr = re.search(r'<g transform="([^"]+)"', s).group(1)
        ds = ' '.join(re.findall(r' d="([^"]+)"', s))
        color = '#%02x%02x%02x' % tuple(int(c) for c in pal[li])
        paths.append(f'<path transform="{tr}" fill="{color}" d="{ds}"/>')
svgtxt = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="none">'
          + ''.join(paths) + '</svg>\n')
open(out, 'w').write(svgtxt)
print(out, f'{len(svgtxt)//1024} KB', 'capas', len(paths), 'fondo', tuple(pal[bg]), 'colores', [tuple(pal[i]) for i in layers])
