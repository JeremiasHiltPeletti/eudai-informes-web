/* Arranque, antes del primer pintado.
   Es un script clásico y bloqueante a propósito: `app.js` es un módulo y corre
   cuando el HTML ya se dibujó, así que al recargar en `#/nuevo` se veía un
   instante el inicio y recién después el formulario. Acá sólo se anota en
   <html> qué vista toca, y el CSS la reserva desde el primer cuadro (invisible
   hasta que `restore.js` le carga el borrador). */
// La posición al recargar la repone la app (`restore.js`), no el navegador:
// Chrome para iOS, con la página en el tope, la «reponía» corrida el alto de
// su barra (la cabecera quedaba escondida) y la corregía al terminar de cargar.
if ('scrollRestoration' in globalThis.history) globalThis.history.scrollRestoration = 'manual';

// La vista va en el estado del historial (ver «Enrutado» en `app.js`): sólo
// una recarga en el formulario lo trae; una pestaña nueva abre el inicio.
// Recargar en la vista previa también vuelve al formulario (el informe no se
// guarda, el borrador sí).
const bootView = globalThis.history.state?.view;
if (bootView === 'form' || bootView === 'preview') {
  document.documentElement.dataset.boot = 'form';
}
