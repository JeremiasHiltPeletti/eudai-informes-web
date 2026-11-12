/* Panel de diagnóstico (temporal): muestra en pantalla las medidas que
   explican dónde queda la cabecera. Se borra cuando se resuelva. */
(() => {
  const box = document.createElement('pre');
  const s = box.style;
  s.setProperty('position', 'fixed');
  s.setProperty('inset-block-end', '0');
  s.setProperty('inset-inline', '0');
  s.setProperty('z-index', '1000');
  s.setProperty('margin', '0');
  s.setProperty('padding', '8px');
  s.setProperty('font', '11px/1.35 monospace');
  s.setProperty('color', '#fff');
  s.setProperty('background', 'rgba(0,0,0,.82)');
  s.setProperty('white-space', 'pre-wrap');
  document.body.append(box);

  const t0 = globalThis.performance.now();
  const lines = [];
  const header = document.querySelector('.site-header');
  const vv = globalThis.visualViewport;
  const [nav] = globalThis.performance.getEntriesByType('navigation');
  const snap = (label) => {
    const h = header.getBoundingClientRect();
    lines.push(
      `${label.padEnd(9)} t=${Math.round(globalThis.performance.now() - t0)}ms sY=${Math.round(globalThis.scrollY)} ` +
        `hdr=${Math.round(h.top)}/${Math.round(h.height)} inH=${globalThis.innerHeight} ` +
        `vv=${vv ? Math.round(vv.height) + '@' + Math.round(vv.offsetTop) + '/' + Math.round(vv.pageTop) : '-'} ` +
        `doc=${document.documentElement.scrollHeight} cl=${document.documentElement.clientHeight}`,
    );
    box.textContent =
      `nav=${nav?.type ?? '?'} url=${globalThis.location.pathname}${globalThis.location.hash} ua=${globalThis.navigator.userAgent.replace(/.*(CriOS\/[\d.]+|Version\/[\d.]+ .*Safari).*/, '$1')}\n` +
      lines.slice(-9).join('\n');
  };
  snap('inicio');
  globalThis.addEventListener('load', () => snap('load'));
  globalThis.addEventListener('scroll', () => snap('scroll'), { passive: true });
  vv?.addEventListener('resize', () => snap('vv-resize'));
  vv?.addEventListener('scroll', () => snap('vv-scroll'));
  for (const ms of [100, 300, 600, 1000, 2000, 4000]) globalThis.setTimeout(() => snap(`+${ms}`), ms);
})();
