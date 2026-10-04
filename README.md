# Eudai Informes

Aplicación web para redactar informes profesionales, previsualizarlos en formato A4 y descargarlos mediante la impresión del navegador como PDF.

**[Abrir la aplicación](https://eudai-informes.netlify.app/#/)**

## El problema

Preparar informes repetitivos exige capturar datos del paciente y del profesional, mantener un formato claro y recuperar trabajos anteriores. En una herramienta que trata información de salud también importa saber dónde quedan esos datos y qué ocurre si se pierde el almacenamiento del navegador.

## La solución

- Formulario con validación de datos, tipo de informe, especialidad y conclusiones.
- Vista previa paginada para impresión en A4 y guardado como PDF.
- Historial con búsqueda y borrador automático.
- Exportación e importación de respaldos JSON.
- Datos guardados localmente en el navegador. La aplicación no tiene backend ni envía informes a un servidor.

**Atención:** los informes y borradores se guardan en `localStorage` del navegador. Si se borran los datos del sitio o se cambia de dispositivo, se pierden salvo que se haya exportado un respaldo. Conviene usar esta herramienta sólo en dispositivos y perfiles de navegador adecuados para manejar información sensible. Este repositorio no contiene informes ni datos reales de pacientes.

## Tecnologías y estructura

HTML, CSS y JavaScript nativo con módulos ES. No requiere instalación de dependencias ni proceso de compilación.

| Ruta | Responsabilidad |
| --- | --- |
| `index.html` | Vistas, formulario y plantillas de interfaz |
| `report-template.html`, `css/report.css` | Documento A4 y estilos de impresión |
| `css/app.css` | Interfaz adaptable |
| `js/schema.js`, `js/sanitize.js`, `js/validate.js` | Campos, normalización y validación |
| `js/store.js` | Historial, borrador y respaldos locales |
| `js/report.js` | Composición y paginación del informe |
| `js/app.js`, `js/ui.js`, `js/format.js` | Flujo, interfaz y presentación de datos |
| `_headers`, `netlify.toml` | Cabeceras y despliegue estático en Netlify |

## Ejecutar en local

Desde la raíz del repositorio:

```bash
python3 -m http.server 8000
```

Abrir `http://localhost:8000/`. Los módulos y la plantilla necesitan servirse por HTTP; abrir `index.html` directamente desde el disco no funciona.

Para publicar en Netlify, conectar este repositorio y usar la configuración incluida en `netlify.toml` (`publish = "."`).

## Decisiones técnicas

La validación y el saneamiento están separados de la interfaz. Los valores de los informes se insertan en la plantilla como texto, y la paginación contempla contenido largo para evitar cortes en el PDF. Las cabeceras de Netlify incluyen una política de seguridad de contenido; las tipografías y recursos se sirven desde el propio sitio.

El historial de correcciones, las decisiones de implementación y las limitaciones están en las [notas técnicas](docs/NOTAS_TECNICAS.md).
