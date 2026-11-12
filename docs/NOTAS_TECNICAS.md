# Eudai · Sistema de Informes

Generador de informes profesionales del consultorio Eudai. Se cargan los datos
del paciente, se redacta el informe y se descarga en PDF con el diseño de la
marca (portada, ficha de datos y conclusiones en A4).

Es un sitio **estático, sin build y sin dependencias en runtime**: HTML, CSS y
JavaScript nativo con módulos ES. No hay backend, no hay claves de API y no
sale ni un byte del navegador.

```
index.html             Cáscara de la app: las cuatro vistas y las plantillas
report-template.html   El documento A4 (portada · datos · conclusiones)
css/app.css            Sistema de diseño + interfaz
css/report.css         Estilos del documento impreso
js/schema.js           Definición de los campos: única fuente de verdad
js/sanitize.js         Normalización de texto y fechas
js/validate.js         Reglas de validación (puras, reutilizables en backend)
js/format.js           Fechas, nombres, DNI, teléfono, matrícula, edad
js/store.js            Borrador del informe en curso
js/report.js           Armado, paginación e impresión del documento
js/ui.js               Avisos, diálogos, descargas y utilidades
js/app.js              Enrutado y orquestación
_headers               CSP y cabeceras de seguridad (Netlify)
assets/favicon.svg     El arbolito de la marca, vectorizado (3 KB)
```

## Cómo correrlo

No hace falta instalar nada:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Tiene que servirse por HTTP, no abriendo `index.html` con doble clic: los
módulos ES y el `fetch` de la plantilla no funcionan bajo `file://`.

## Despliegue

Netlify, sin build. Sirve tanto conectando este repositorio (el `netlify.toml`
publica la raíz) como arrastrando la carpeta al panel: las
cabeceras viven en `_headers`, dentro del directorio publicado, así que valen en
los dos casos.

---

## Qué cambió respecto de la versión anterior

### Correcciones de fondo

| | Antes | Ahora |
| --- | --- | --- |
| **Texto perdido** | El contenido se recortaba al llegar al borde de la tarjeta, sin aviso. Un informe largo salía cortado. | El texto se reparte en tantas hojas A4 como haga falta, cortando por palabra y numerando las páginas. |
| **Inyección de HTML** | La plantilla se rellenaba reemplazando `<%= %>` con expresiones regulares y el resultado iba a `innerHTML`. Un `<` en un apellido rompía el documento; el historial insertaba el nombre del paciente sin escapar. | Los datos entran **siempre** por `textContent` sobre una plantilla estática. No hay una sola concatenación de HTML con datos del usuario. |
| **Corrupción silenciosa** | `String.replace` interpreta `$&`, `$1`… en el reemplazo: un dato con `$&` se duplicaba solo. | No hay sustitución de cadenas. |
| **Fechas corridas un día** | `new Date('2024-01-15')` se interpreta como medianoche UTC; al oeste de Greenwich imprimía 14/01. | Las fechas se formatean partiendo la cadena ISO, sin construir un `Date`. |
| **Campos que se pedían y no se imprimían** | «Tipo de informe» y «Diagnóstico médico» se cargaban pero nunca aparecían en el PDF. | El tipo va como subtítulo de la portada y el diagnóstico es un campo más de la ficha del paciente. |
| **Ventana emergente para imprimir** | `window.open` + `document.write` + un `<script>` inyectado: lo bloquea cualquier bloqueador de pop-ups e incumple la CSP. | El informe ya paginado se copia al documento principal y se imprime con `window.print()`. Sin ventanas nuevas ni scripts inyectados. |
| **Alto fijo cableado** | La vista previa asumía `3449px` de alto, siempre. | El alto y el número de páginas se miden sobre el documento real. |
| **IDs que podían chocar** | `Date.now()` como identificador: dos informes en el mismo milisegundo compartían id. | Prefijo temporal ordenable + sufijo aleatorio. |
| **Decoración sobre el texto** | La hoja decorativa se dibujaba encima de las conclusiones. | Pasó a ser marca de agua detrás del cuerpo. |

### Seguridad

- **CSP estricta** (`_headers`): `default-src 'none'`, sin `unsafe-inline` ni
  `unsafe-eval`. Para que se cumpla no quedó **ningún** atributo `style` ni
  ningún `onclick` en el HTML; todo el estilo está en hojas externas y todos los
  eventos se enlazan desde los módulos. El documento del informe va en un iframe
  `srcdoc`, que hereda esta misma política.
- **Sin terceros.** Se eliminaron el CDN de Tailwind y Google Fonts. Las
  tipografías (Inter y Montserrat variables, licencia OFL) están
  auto-hospedadas. La app no hace una sola petición externa: nada que auditar,
  nada que se caiga, ningún dato de salud filtrado por `Referer`.
- **Validación y saneamiento en una capa aparte.** `schema.js` + `validate.js` +
  `sanitize.js` no tocan el DOM: son funciones puras. Hoy corren en el
  navegador; el día que haya backend, el mismo módulo se ejecuta en el servidor
  sin tocar una línea. Se sanea la entrada del formulario, lo que viene de
  `localStorage` y lo que trae un archivo importado — nada de eso se considera
  confiable.
- **Longitudes, patrones y listas cerradas** por campo, con reglas cruzadas
  (la fecha no puede ser futura, el nacimiento no puede ser posterior al
  informe, la edad tiene que coincidir con la fecha de nacimiento).
- **Caracteres invisibles.** Se quitan zero-width, marcas y anulaciones de
  dirección bidi: un nombre con un override bidi puede leerse al revés en el
  PDF impreso.
- Cabeceras: `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`,
  `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin`,
  `Permissions-Policy` restrictiva, HSTS. `robots.txt` bloquea la indexación.

### Rendimiento

| | Antes | Ahora |
| --- | --- | --- |
| Imágenes | 4,5 MB | **145 KB** (−97 %) |
| Tailwind por CDN | ~400 KB + compilación en el navegador | 0 — CSS propio |
| Peticiones externas | Tailwind + Google Fonts | ninguna |

Los PNG pesaban 2 MB cada uno por **ruido de compresión**, no por detalle: son
degradados suaves. Un suavizado leve más paleta indexada los deja en ~20 KB sin
diferencia visible.

### Interfaz y accesibilidad

- **Contraste WCAG AA verificado.** La paleta original no llegaba: el naranja de
  marca da 3,1:1 sobre blanco y las etiquetas 3,9:1. Ahora la marca tiene tonos
  separados por función — `--brand-500` pinta, `--brand-ink` y `--brand-600`
  llevan texto — y todos los pares de texto pasan 4,5:1.
- **Navegación real con el historial del navegador** (rutas por hash): el botón
  Atrás funciona y cada vista se puede enlazar.
- `<dialog>` nativo en lugar de `confirm()`, y avisos con `role="status"` en
  lugar de `alert()`.
- Etiquetas asociadas a cada control, errores enlazados por `aria-describedby`,
  foco al título al cambiar de vista, salto al contenido, objetivos táctiles de
  44 px y respeto por `prefers-reduced-motion`.
- Tipografía y espaciados fluidos con `clamp()`; sin desborde horizontal ni a
  390 px ni al 200 % de zoom.

### Funcionalidad nueva

- **Borrador automático**: lo que se está escribiendo se guarda solo y se
  recupera si se cierra la pestaña.
- **Edad calculada** a partir de la fecha de nacimiento, editable a mano.
- **Migración transparente** de los informes guardados por la versión anterior
  (la clave `reports` del `localStorage`).
- Aviso claro de que los datos viven sólo en ese navegador, y aviso distinto si
  el navegador tiene el almacenamiento bloqueado.

---

## Sobre las medidas de seguridad que no aplican

Del pedido original, tres no tienen dónde aplicarse en esta app y conviene
dejarlo dicho en vez de simularlo:

- **Claves en variables de entorno.** No hay ninguna clave: la app no llama a
  ninguna API. Si en algún momento se suma (por ejemplo, para redactar el
  informe con IA), la clave va en una variable de entorno de Netlify y la
  llamada pasa por una Netlify Function — nunca en el código del navegador,
  donde cualquiera la lee con «ver código fuente».
- **CORS y rate limiting.** No hay endpoints propios que proteger. Lo más
  parecido que sí se configuró es `Cross-Origin-Resource-Policy: same-origin`
  y `frame-ancestors 'none'`, que impiden que otro sitio incruste la app o
  enlace sus recursos.
- **Row Level Security.** No hay base de datos ni usuarios: cada navegador ve
  su propio `localStorage` y nada más. El aislamiento por usuario ya es total,
  aunque por el motivo opuesto al de una base con RLS.

## Ajustes posteriores al primer despliegue

- **Safari en iOS hacía zoom al tocar un campo.** Pasa cuando el cuerpo del
  campo mide menos de 16 px; los de la app medían 14. Ahora usan
  `max(16px, var(--step--1))`. El píxel va literal a propósito: el umbral de
  iOS es en píxeles CSS, no en rem. La solución que suele verse por ahí
  —`maximum-scale=1` en el viewport— desactiva el pellizco para ampliar y es un
  incumplimiento de accesibilidad (WCAG 1.4.4), así que no se usó.
- **Logotipo más grande**, de 40 px a 56 px de alto en el celular y de 56 px a
  72 px en escritorio, con `clamp()` para que crezca de forma continua.
- **Favicon nuevo: sólo el arbolito**, sin las letras (a 16 px el logotipo
  completo es una mancha). El arbolito se aisló del logotipo por componentes
  conexas y se vectorizó: son 3 KB de SVG nítidos a cualquier tamaño. El
  `apple-touch-icon.png` va aparte porque iOS rellena de negro cualquier
  transparencia.
- **El formulario se vacía al guardar**, no al volver desde la vista previa.
  Antes, salir por el logo dejaba cargados los datos del paciente anterior, y
  el informe siguiente podía enviarse con el nombre equivocado.
- **Si falla la vista previa, se vuelve al formulario** con los datos intactos,
  en lugar de dejar a la vista un marco vacío.
- **Los topes de fecha se refrescan al entrar al formulario.** Una pestaña
  abierta desde ayer seguía ofreciendo el día de ayer como máximo.
- **Comentarios de `_headers` fuera de los bloques.** Netlify interpreta toda
  línea indentada como `Cabecera: valor`; un comentario ahí adentro puede
  tumbar el archivo entero y dejar el sitio sin ninguna cabecera de seguridad,
  sin avisar.

## Auditoría final

Una última pasada buscando errores, atacando la app con casos límite en el
navegador en vez de sólo leer el código. Apareció esto:

| | Síntoma | Causa |
| --- | --- | --- |
| **Datos derramados fuera de la hoja** | Un nombre, un domicilio o un diagnóstico largos se salían de la tarjeta y del borde del papel, pisando la ficha del profesional. | Los ítems de una rejilla CSS traen `min-width: auto`, así que se dimensionan por su contenido en vez de encogerse. Faltaba `minmax(0, 1fr)` en las dos rejillas del documento. |
| **Nombre recortado en la portada** | Desde 56 caracteres, el nombre del paciente se cortaba al medio en el PDF. | El subrayado tenía un ancho fijo y el encogido llegaba a su tope sin alcanzar. |
| **Texto perdido al paginar** | Una palabra sin espacios más larga que una hoja (un enlace, un código pegado) se quedaba sola en la página y todo lo que seguía desaparecía. | El paginador cortaba por palabra: si la primera no entraba, no tenía por dónde partir. |
| **Generación de informes rota tras un corte de red** | Si la plantilla fallaba al cargar una vez, no volvía a funcionar hasta recargar la página. | La promesa rechazada quedaba cacheada y se devolvía a todas las llamadas siguientes. |

Cómo quedó resuelto:

- **Nada se recorta nunca.** El orden va del ajuste que menos se nota al que
  más: primero el subrayado se estira hasta el margen, después la letra se
  achica un poco, y como último recurso el dato se reparte en dos líneas. Los
  topes de longitud del esquema están calculados para que ese último caso
  alcance siempre.
- **La paginación corta por carácter** cuando ni la primera palabra entra, y
  parte por punto de código Unicode para no romper un emoji al medio. Si aun
  así no pudiera paginar, falla a la vista en vez de entregar un informe
  incompleto sin que nadie lo note.
- Verificado con valores absurdos a propósito: 6.000 caracteres sin un solo
  espacio, nombres de 70 caracteres, todos los campos en su longitud máxima.
  Nada se sale de la hoja y nada se corta.

Otros arreglos de la misma pasada:

- **No se puede imprimir mientras se arma el documento.** El botón queda
  deshabilitado hasta que la vista previa está paginada; antes, apurarse podía
  mandar a la impresora el informe anterior.
- **El formulario se vacía apenas se guarda**, antes de armar la vista previa:
  si el renderizado fallaba, los datos del paciente anterior quedaban cargados.
- **El cursor ya no salta al final** al corregir un dígito en medio del DNI.
- **Dos pestañas abiertas se mantienen sincronizadas** (evento `storage`).
- Comprobado el modo de fallo por almacenamiento lleno: avisa con un mensaje
  claro, se queda en el formulario y no pierde lo escrito.

## Detalles de interfaz corregidos después

Reportados desde un iPhone, todos con causa concreta en el código:

- **El cartel de confirmación aparecía arriba a la izquierda** en vez de
  centrado. Lo que centra un `<dialog>` modal es el `margin: auto` que le pone
  la hoja de estilos del navegador, y el reset `* { margin: 0 }` lo estaba
  anulando.
- **Después de «Limpiar» quedaba un borde naranja alrededor de media
  pantalla.** Era el anillo de foco: un `:focus-visible` universal se lo
  dibujaba a cualquier contenedor que recibiera el foco por programa (el
  `<main>`, el título de la vista). Ahora el anillo se limita a los elementos
  realmente enfocables, y los que sólo se enfocan por programa —que no son
  alcanzables con Tab— no lo muestran nunca.
- **Franja negra al final del scroll en Chrome móvil.** El color de fondo
  estaba sólo en `<body>`: el área que asoma al sobre-scrollear, o cuando el
  navegador esconde su barra, la pinta el lienzo. Ahora el color está también
  en `<html>` y el rebote elástico está desactivado.
- **En Safari de iOS la cabecera se perdía al scrollear y el contenido se veía
  pasar por detrás.** Eran dos fallas del mismo `backdrop-filter`: en WebKit
  necesita el prefijo `-webkit-` (sin él no desenfocaba nada y el contenido se
  veía a través del 82 % de blanco), y aplicado sobre un elemento `sticky` hace
  que Safari lo pierda durante el scroll con inercia. La cabecera pasó a ser
  opaca: no cuesta nada de composición y sobre una barra con el logo el efecto
  no aportaba nada.

## Ideas para más adelante

Ninguna hace falta hoy; quedan anotadas por si el uso las pide:

- **Editar un informe ya guardado** (hoy sólo se puede crear y borrar).
- **Recordar el profesional y la especialidad** entre informes, que en un
  consultorio de un solo profesional se repiten siempre.
- **Funcionamiento sin conexión** con un service worker, si el wifi del
  consultorio es inestable.

## Impresión en Safari de iOS

La primera versión imprimía el iframe de la vista previa con
`frame.contentWindow.print()`. Funciona en Chrome, Edge y Firefox, pero Safari
en iOS ignora el marco e imprime la página contenedora: en el iPhone salía una
hoja con el aviso de respaldo en lugar del informe.

Ahora las hojas ya paginadas se copian a `.print-root`, en el documento
principal, y se llama a `window.print()`. `report.css` se carga ahí con
`media="print"`, de modo que sus reglas sólo rigen al imprimir y no tocan la
interfaz. La copia se prepara al terminar la vista previa y no al apretar el
botón, para que `print()` ocurra dentro del gesto del usuario. Como se copia lo
ya paginado, lo impreso es exactamente lo que muestra la vista previa.

La clase `.card` del documento pasó a `.rcard`: era el único nombre que
coincidía con uno de la interfaz, y al convivir las dos hojas la tarjeta del
informe heredaba la sombra de la tarjeta del formulario.

### Hojas de más en iOS

Con el informe ya visible apareció un segundo problema: salía con el doble de
páginas, una casi vacía después de cada hoja. WebKit en iOS ignora
`@page { margin: 0 }`, imprime con sus propios márgenes (unos 6 mm a los lados y
14 mm arriba y abajo) y achica el contenido sólo hasta que entre a lo ancho. La
hoja de 210 × 297 mm quedaba al 94 %, con 279 mm de alto contra 269 disponibles,
y los 10 mm sobrantes caían en una página nueva.

El arreglo vive en el bloque de impresión de `css/app.css`, dentro de
`@supports (-webkit-touch-callout: none)` —una propiedad que sólo existe en
iOS—: el contenedor pasa a medir 222 mm de ancho con la hoja centrada, de modo
que iOS la achica un poco más y entra también a lo alto. En iPhone y iPad el
informe sale entonces con un margen blanco alrededor (iOS no permite imprimir a
sangre desde la web); en el resto de los navegadores sigue a página completa.

## Carga sin saltos y cabecera fija en el celular

Al entrar o recargar en el celular, los textos y botones se movían un instante.
Eran tres cosas sumadas, y ninguna un desplazamiento de layout medible (el CLS
ya daba 0):

- la transición de entrada de cada vista incluía un desplazamiento de 8 px y
  corría también en la carga inicial. Ahora es sólo de opacidad y sólo al
  navegar: el router marca con `is-entering` la vista que entra, salvo la
  primera;
- Inter se cargaba con `font-display: swap`, que dibuja con la tipografía del
  sistema y redibuja al llegar la fuente. Pasó a `optional` (está precargada);
- al recargar en `#/nuevo` se veía el inicio hasta que corría `app.js`, que es
  un módulo y se ejecuta después del primer pintado. `js/boot.js`, un script
  clásico de pocas líneas, anota la ruta en `<html>` antes de pintar y el CSS
  muestra la vista correcta desde el primer cuadro.

La cabecera pasó un tiempo de `sticky` a `fixed` con un relleno de
`env(safe-area-inset-top)`, para pegarla al notch. Fue un error: ver «Cabecera,
barra del navegador y notch», más abajo.

## Recargar sin perder lo cargado

Al recargar en el formulario se veían un instante los campos vacíos —las fechas
con «dd/mm/aaaa»— y después se llenaban, y a veces lo último no volvía:

- el borrador se completa cuando corre `app.js`, después del primer pintado.
  Ahora el formulario espera invisible ese instante (ocupa su lugar, así que
  nada se corre); si el script fallara, una animación lo muestra al segundo;
- el autoguardado espera 600 ms y una recarga dentro de ese margen perdía lo
  último. Ahora los selectores de fecha y los desplegables se guardan al
  elegirlos, y lo pendiente se guarda al salir de la página (`pagehide`) o al
  pasar a segundo plano;
- un borrador se restauraba sólo con varios campos cargados, así que una fecha
  sola se perdía. Ahora basta con cualquier campo distinto de un formulario
  recién abierto (la fecha de hoy y la primera opción de cada desplegable).

## Recargar sin que la página salte

Al recargar más abajo en el formulario, el navegador reponía la altura después
del primer pintado y la app la volvía a mandar arriba: en el celular se veía
todo moverse. Ahora `boot.js` desactiva la reposición del navegador
(`history.scrollRestoration = 'manual'`), la altura se guarda en
`sessionStorage` al salir, y `app.js` la repone en el mismo momento en que
muestra la vista, con el formulario todavía invisible. Al navegar entre vistas
se sigue empezando arriba.

Otros dos detalles del arranque: sin hash en la dirección, se corrige con
`history.replaceState` (con `location.replace` la vista inicial se dibujaba dos
veces), y en la carga inicial ya no se mueve el foco al título.

También se quitó `overscroll-behavior-y: none` de `<html>`: bloquear el rebote
interfiere con cómo Chrome y Safari en el celular esconden y muestran sus
barras al hacer scroll. La franja negra que motivó esa regla ya la evita el
color de fondo de `<html>`.

## Recarga en Chrome para iPhone

Un video de la recarga en Chrome para iPhone mostró que el formulario quedaba en
blanco casi un segundo y que el aviso «Recuperamos el borrador» volvía a subir
en cada recarga. Tres causas y sus arreglos:

- `app.js` importa módulos que a su vez importan otros, y el navegador los
  descubría en cascada, revalidando cada uno. Ahora `index.html` los precarga
  todos juntos con `<link rel="modulepreload">`;
- el borrador ya no espera a `app.js`: `js/restore.js`, un script clásico al
  final de `<body>`, copia los valores guardados y repone la altura en cuanto
  el formulario existe, antes del primer pintado. `app.js` después los sanea
  como siempre;
- `<html>` tiene `scroll-behavior: smooth`, así que reponer la altura con un
  `scrollTo` común deslizaba la página desde arriba: se usa `behavior: 'instant'`.

El aviso del borrador ya no aparece en una recarga (`performance` informa el
tipo de navegación): lo cargado vuelve a estar donde estaba y no hace falta
avisarlo.

## Entrada, rebote y teclado en el celular

- **Al entrar se veía la página scrolleada y sin cabecera.** La altura guardada
  se reponía en cualquier carga, también al volver a entrar en la misma
  pestaña. Ahora se repone sólo en una recarga (tipo de navegación `reload`);
  al entrar por un enlace, desde el historial o con la pestaña reabierta se
  empieza arriba.
- **Desplazamiento suave.** Se quitó `scroll-behavior: smooth`, para que
  ningún desplazamiento hecho por código se vea deslizar. (Se probó también
  bloquear el rebote con `overscroll-behavior-y: none`, pero eso desactiva el
  gesto de «tirar para recargar», que sí se usa; quedó fuera.)
- **El teclado tapaba lo que se escribía.** iOS no acompaña al cursor cuando el
  área de texto crece mientras se escribe, y a veces deja el campo justo debajo
  del teclado. `js/keyboard.js` mide el área visible (`visualViewport`) y, si el
  campo —o, en un área de texto más alta que lo visible, la línea del cursor,
  medida con una copia invisible— queda tapado, corre la página lo justo.
  Con el teclado abierto agrega al final de la página un espacio del alto del
  teclado (`--keyboard-inset`), para que hasta el último campo pueda subir.
  Sin teclado en pantalla no hace nada.

## Cabecera, barra del navegador y notch

En Chrome para iPhone, al scrollear la barra del navegador se esconde y, al
volver, la cabecera quedaba separada del notch por un hueco, a veces sí y a
veces no; al recargar, toda la página saltaba. La causa era la cabecera `fixed`
con `padding-block-start: env(safe-area-inset-top)` y `viewport-fit=cover`: con
la barra del navegador a la vista ese valor es 0 y, cuando la barra se esconde,
pasa a unos 50 px. La cabecera y el relleno de `<body>` (que lo sumaba) cambiaban
de alto en ese momento, y el contenido se corría por debajo.

Ahora no hay nada que dependa del área segura: se quitó `viewport-fit=cover`
(el navegador reserva él solo la zona del notch y de su barra) y la cabecera
volvió a `sticky`, dentro del flujo: ocupa su lugar arriba del todo —al entrar
al sitio está siempre a la vista— y se queda pegada al borde al scrollear.
`scroll-padding-block-start` sigue evitando que tape lo que se enfoca.

### La cabecera tapada por la barra de Chrome

Aun así, un segundo video mostró la cabecera oculta detrás de la barra de
Chrome al entrar al sitio y al recargar, con la página ya en el tope (arrastrar
hacia abajo disparaba el «tirar para recargar» en vez de mostrarla). Chrome en
iOS dibuja su barra sobre la página y la compensa con un margen interno; si la
página mueve el scroll por código mientras carga, ese margen queda mal y el
contenido arranca debajo de la barra. La app lo hacía dos veces: en el primer
`renderRoute` (`scrollTo(0)`) y en `restore.js` (reponer la altura guardada).

Ahora, en la carga inicial, `scrollTo(0)` queda sólo para navegar entre vistas
y `scrollRestoration` vuelve a `auto`. (La causa real resultó ser otra, el
cambio de dirección durante la carga —ver más abajo—, así que la reposición
de la altura en una recarga volvió a `restore.js`: el navegador la repone
igual, pero al terminar de cargar, y en el celular se veía la página arriba y
después el salto. `restore.js` la repone antes del primer pintado, sólo si la
página estaba scrolleada; en el tope no toca nada.) El aviso de borrador recuperado se suprime con una
marca en `sessionStorage` (ya se mostró en esta pestaña) y no con el tipo de
navegación: el «Volver a cargar» del menú de Chrome en iOS no siempre se
informa como `reload`.

### Entrar escribiendo la dirección

El patrón de los videos era constante: la cabecera quedaba tapada al entrar
escribiendo `eudai-informes.netlify.app` en la barra, y aparecía tras
recargar. La diferencia entre los dos casos es la dirección: al entrar no tiene
`#/`, y la app se lo agregaba durante la carga con `history.replaceState`; al
recargar, ya lo tiene y no se toca. Ese cambio de dirección en plena carga
alcanza para que Chrome en iOS reacomode su barra a destiempo. Ahora una
dirección sin hash se deja como está (es el inicio); sólo se corrige una ruta
inexistente o la vista previa sin informe.

## La vista va en el historial, no en la dirección

Al entrar por primera vez —también en incógnito— se abría el formulario en vez
del inicio: Chrome autocompletaba la dirección con la última visitada,
`…/#/nuevo`, y la app mostraba esa ruta. Ahora la vista actual no va en la
dirección sino en el estado del historial de la pestaña (`history.state.view`):

- entrar al sitio (escribiendo la dirección, desde un enlace, en una pestaña
  nueva o en incógnito) abre siempre el inicio: no hay estado;
- recargar conserva el estado: se vuelve a la misma vista. Recargar en la vista
  previa vuelve al formulario, porque el informe no se guarda y el borrador sí;
- navegar crea entradas con `pushState` sin cambiar la dirección, así que Atrás
  y Adelante pasan de una vista a otra (`popstate`);
- los enlaces internos conservan su `href="#/…"`, pero un manejador de clics
  los resuelve por el historial; un `#/nuevo` viejo en la dirección se ignora
  y desaparece en la primera navegación. No hay manejador de `hashchange`: al
  volver a una entrada vieja con `#/nuevo` ese evento también se dispara, y
  reabría el formulario.

`boot.js` lee el mismo estado para mostrar el formulario desde el primer
pintado en una recarga.

Para aislar la causa se publicaron un rato dos páginas de prueba (una copia de
la app con un panel de medidas en pantalla y una copia sin scripts); con ellas
la cabecera se veía bien, y con la dirección sin tocar también en la página
principal. Ya se borraron.

## Vista previa de impresión lenta en Chrome para Windows

El diálogo de impresión de Chrome se arrastraba en Windows, mientras que en
Safari y en macOS iba fluido. El PDF generado tenía todas sus imágenes con
máscara de transparencia —hasta seis PNG superpuestos por hoja, dos de ellos de
1536×1024— y el visor de Chrome, que en Windows dibuja por CPU, las mezclaba
una por una cada vez que se desplazaba la vista.

Como la decoración de cada hoja es fija, ahora va aplanada en una sola imagen
opaca por tipo de hoja (`assets/bg-cover.jpg`, `bg-data.jpg`,
`bg-content.jpg`), generada a partir del render del diseño original a 2,5×. La
hoja decorativa de la tarjeta de conclusiones también quedó aplanada sobre el
color de la tarjeta, sin `opacity`. El PDF resultante no tiene ninguna máscara
de transparencia ni estado de opacidad.

El costo es peso: los fondos suman unos 470 KB contra los 145 KB de los PNG
sueltos. Se descargan recién al generar el primer informe, no al abrir la app.

Si hubiera que cambiar la decoración, los fondos se regeneran a partir de las
capas originales, que quedaron en el historial de Git.

## Qué se guarda, y qué no

La app **no guarda informes**. El archivo es el PDF que se descarga y se envía.

Hubo un historial local y se quitó: vivía en el `localStorage` de cada equipo,
así que no se compartía entre dispositivos y no podía funcionar como archivo.
Lo que sí hacía era acumular datos de salud en cada navegador donde se abrió la
app, sin vencimiento y en texto plano.

Lo único que persiste es el **borrador en curso**, que se sobrescribe a cada
rato y se borra al descargar el PDF.

Al cargar `store.js` se borran las claves `eudai.informes.v1` y `reports`, que
usaban las versiones anteriores. Quitar la pantalla sin borrar los datos sería
lo peor de los dos mundos: informes de pacientes dormidos en el navegador,
invisibles y fuera del alcance de quien los cargó.

Como el PDF pasó a ser la única copia, salir de la vista previa sin haberlo
descargado pide confirmación, tanto por el botón de volver como por el logo.
Descargar es la señal de trabajo terminado: ahí se vacían el formulario y el
borrador.

## Compatibilidad

Chrome, Edge, Firefox y Safari actuales (móvil y escritorio). Usa módulos ES,
`<dialog>`, `:focus-visible` y propiedades lógicas de CSS. `field-sizing:
content` en el área de texto es una mejora progresiva: donde no está, el campo
sigue siendo redimensionable a mano.
