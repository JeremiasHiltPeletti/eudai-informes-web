/* Recarga en el formulario: lo cargado vuelve antes del primer pintado.
   Es un script clásico al final de <body>: corre apenas el formulario existe,
   sin esperar a `app.js`, que es un módulo y llega (con sus dependencias) un
   rato después. En el celular esa espera se veía como la página en blanco y
   los campos llenándose después.
   Acá sólo se copian los valores guardados; `app.js` después los sanea y
   valida como siempre. Asignar `.value` no interpreta HTML: un valor guardado
   no puede inyectar nada.
   Con el formulario ya a su alto definitivo se repone también la altura a la
   que estaba la página (el navegador no la repone: ver `boot.js`). Sólo se
   hace si estaba scrolleada: con la página en el tope no se toca nada. */
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

  // La fecha del informe vale hoy por defecto; `app.js` la pone igual, pero
  // un instante después del primer pintado, y se veía el campo vacío.
  const fecha = document.getElementById('fecha');
  if (fecha && !fecha.value) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    fecha.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  try {
    const y = Number(globalThis.sessionStorage.getItem('eudai.scroll'));
    globalThis.sessionStorage.removeItem('eudai.scroll');
    if (y > 0) globalThis.scrollTo({ top: y, behavior: 'instant' });
  } catch {
    // La repone el navegador al terminar de cargar.
  }

  root.dataset.boot = 'form-ready';
})();
