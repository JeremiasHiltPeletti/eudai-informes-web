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
js/store.js            Persistencia, migración, borrador y copias de respaldo
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
| **Ventana emergente para imprimir** | `window.open` + `document.write` + un `<script>` inyectado: lo bloquea cualquier bloqueador de pop-ups e incumple la CSP. | Se imprime el iframe directamente (`frame.contentWindow.print()`). Sin ventanas nuevas ni scripts inyectados. |
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
- **Búsqueda en el historial**, insensible a acentos y mayúsculas.
- **Exportar e importar copia de respaldo** en JSON. Reimportar el mismo archivo
  no duplica nada.
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
- **Si falla la vista previa, se va al historial** en lugar de dejar un marco
  vacío: el informe ya está guardado y desde ahí se descarga igual.
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
- **Guardas al importar**: se rechaza un archivo de más de 8 MB o con más de
  5.000 informes antes de intentar parsearlo y congelar la pestaña.
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

- **Duplicar un informe** del historial como base de uno nuevo. Para los
  informes de evolución del mismo paciente ahorraría recargar todos los datos.
- **Editar un informe ya guardado** (hoy sólo se puede crear y borrar).
- **Recordar el profesional y la especialidad** entre informes, que en un
  consultorio de un solo profesional se repiten siempre.
- **Funcionamiento sin conexión** con un service worker, si el wifi del
  consultorio es inestable.

## Limitación conocida

Los informes viven en el `localStorage` del navegador. Eso es bueno para la
confidencialidad (los datos de salud no salen del equipo) y malo para la
continuidad: si se borran los datos del sitio, se cambia de navegador o se
usa otra computadora, no están. Por eso existe la copia de respaldo, y la app
lo dice en la pantalla de inicio.

Si en algún momento hacen falta varios dispositivos, historial compartido entre
profesionales o respaldo automático, el paso siguiente es un backend con
usuarios. Ahí sí entran en juego el login, **Row Level Security** (cada
profesional ve sólo sus informes), **CORS** acotado al dominio de la app y
**rate limiting** por endpoint. La validación ya está lista para ese día:
`schema.js`, `validate.js` y `sanitize.js` no dependen del navegador y se
ejecutan igual en el servidor.

## Compatibilidad

Chrome, Edge, Firefox y Safari actuales (móvil y escritorio). Usa módulos ES,
`<dialog>`, `:focus-visible` y propiedades lógicas de CSS. `field-sizing:
content` en el área de texto es una mejora progresiva: donde no está, el campo
sigue siendo redimensionable a mano.
