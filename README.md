# [wabi] frontend v14 · GitHub

Paquete compacto para GitHub Pages y para la futura separación frontend/backend.

Estructura:
- `index.html`
- `assets/css/styles.css`
- `assets/js/` — 16 scripts separados, en el mismo orden funcional del HTML
- `assets/images/` — 10 imágenes reales del onboarding/institucionales
- `assets/licenses/`

Los 55 iconos SVG locales están embebidos como data URI dentro de `styles.css`. Así siguen siendo SVG propios y no dependen de Font Awesome CDN, pero evitamos más de 55 archivos individuales y el límite de 100 archivos del uploader web de GitHub.

Inter y Open Sans se cargan desde Google Fonts; no se incluyen archivos binarios de fuentes.

Para GitHub Pages, descomprime este ZIP y sube el contenido de la carpeta conservando la estructura. `index.html` debe quedar en la raíz.
