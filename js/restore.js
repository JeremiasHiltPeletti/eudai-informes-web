/* Recarga en el formulario: lo cargado vuelve antes del primer pintado.
   Es un script clásico al final de <body>: corre apenas el formulario existe,
   sin esperar a `app.js`, que es un módulo y llega (con sus dependencias) un
   rato después. En el celular esa espera se veía como la página en blanco y
   los campos llenándose después.
   Acá sólo se copian los valores guardados; `app.js` después los sanea y
   valida como siempre. Como el formulario ya tiene su alto definitivo antes
   del primer pintado, el navegador repone por su cuenta la altura en la que
   estaba la página al recargar, sin ningún salto. (Moverla por código acá
   dejaba, en Chrome para iOS, la cabecera tapada por la barra del navegador.)
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

  root.dataset.boot = 'form-ready';
})();
