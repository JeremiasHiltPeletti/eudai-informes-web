/* Arranque, antes del primer pintado.
   Es un script clásico y bloqueante a propósito: `app.js` es un módulo y corre
   cuando el HTML ya se dibujó, así que al recargar en `#/nuevo` se veía un
   instante el inicio y recién después el formulario. Acá sólo se anota en
   <html> qué vista toca, y el CSS la reserva desde el primer cuadro (invisible
   hasta que `app.js` le carga el borrador). */
// La posición al recargar la repone `app.js` en el mismo momento en que
// muestra la vista; si la repusiera el navegador, lo haría por su cuenta
// después del primer pintado y en el celular se vería todo saltar.
if ('scrollRestoration' in globalThis.history) globalThis.history.scrollRestoration = 'manual';

if (globalThis.location.hash === '#/nuevo') {
  document.documentElement.dataset.boot = 'form';
}
