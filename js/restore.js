/* Recarga en el formulario: lo cargado vuelve antes del primer pintado.
   Es un script clásico al final de <body>: corre apenas el formulario existe,
   sin esperar a `app.js`, que es un módulo y llega (con sus dependencias) un
   rato después. En el celular esa espera se veía como la página en blanco y
   los campos llenándose después.
   Acá sólo se copian los valores guardados y se vuelve a la altura en la que
   estaba la página; `app.js` después los sanea y valida como siempre.
   Asignar `.value` no interpreta HTML: un valor guardado no puede inyectar
   nada. */
(() => {
  const root = document.documentElement;
  if (root.dataset.boot !== 'form') return;

  try {
    const form = document.getElementById('report-form');
    const saved = JSON.parse(globalThis.localStorage.getItem('eudai.borrador.v1') ?? 'null');
    const data = saved && typeof saved === 'object' ? saved.data : null;
    if (form && data && typeof data === 'object') {
      for (const control of form.elements) {
        const value = data[control.name];
        if (!control.name || typeof value !== 'string' || !value) continue;
        if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName)) continue;
        control.value = value.slice(0, 10000);
      }
    }
  } catch {
    // Sin almacenamiento o con un borrador ilegible: `app.js` decide.
  }

  try {
    const scroll = JSON.parse(globalThis.sessionStorage.getItem('eudai.scroll') ?? 'null');
    if (scroll && scroll.hash === '#/nuevo' && Number.isFinite(scroll.y)) {
      // `instant`: el CSS pide desplazamiento suave, y acá se vería la página
      // deslizarse desde arriba.
      globalThis.scrollTo({ top: Math.max(0, scroll.y), behavior: 'instant' });
    }
  } catch {
    // La recarga empieza arriba.
  }

  root.dataset.boot = 'form-ready';
})();
