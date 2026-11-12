/* Arranque, antes del primer pintado.
   Es un script clásico y bloqueante a propósito: `app.js` es un módulo y corre
   cuando el HTML ya se dibujó, así que al recargar en `#/nuevo` se veía un
   instante el inicio y recién después el formulario. Acá sólo se anota en
   <html> qué vista toca, y el CSS la reserva desde el primer cuadro (invisible
   hasta que `app.js` le carga el borrador). */
if (globalThis.location.hash === '#/nuevo') {
  document.documentElement.dataset.boot = 'form';
}
