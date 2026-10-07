/**
 * EL LOGO PARA EL PERFIL DE APLICACIÓN DE BANCARD (02/10/2026).
 *
 * El manual («Restricciones del comercio»): «El logo para utilizar por el
 * comercio debe idealmente tener un ancho de 173 píxeles y un alto 55
 * píxeles. El ancho mínimo es de 85 píxeles». Se sube a mano en el portal
 * (Perfil de aplicación, una vez por ambiente); no lo sirve la aplicación.
 *
 * Se arma con el anillo de public/iconos/icono.svg (los mismos trazos y el
 * mismo verde) y la palabra «Orden», sobre el fondo oscuro del ícono. Es un
 * script de una vez: `node recursos/bancard/generar-logo.js` deja
 * `recursos/bancard/logo-orden-173x55.png` al lado. Usa `sharp`, que ya está
 * en node_modules (lo trae Next).
 *
 * La carpeta `recursos/` está en la raíz del proyecto, no en `public/`: no se
 * publica como página ni como archivo estático.
 */
const path = require('path');
const sharp = require('sharp');

const ANCHO = 173;
const ALTO = 55;
const SALIDA = path.join(__dirname, 'logo-orden-173x55.png');

// El anillo del ícono (viewBox 512) achicado a 44 px y centrado a la izquierda.
const ESCALA = 44 / 512;
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
  <defs>
    <linearGradient id="anillo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7cf0a8"/>
      <stop offset="55%" stop-color="#48dc82"/>
      <stop offset="100%" stop-color="#1f9d57"/>
    </linearGradient>
  </defs>
  <rect width="${ANCHO}" height="${ALTO}" rx="12" fill="#121212"/>
  <g transform="translate(7 ${(ALTO - 44) / 2}) scale(${ESCALA})">
    <circle cx="256" cy="256" r="132" fill="none" stroke="url(#anillo)" stroke-width="46"/>
    <path d="M132 211A132 132 0 0 1 301 132" fill="none" stroke="#eafff1" stroke-width="15" stroke-linecap="round" opacity=".92"/>
    <path d="M256 190v132" stroke="#f3f5f2" stroke-width="26" stroke-linecap="round"/>
  </g>
  <text x="60" y="38" font-family="Archivo, Inter, Arial, Helvetica, sans-serif" font-size="29" font-weight="800"
        letter-spacing="-0.6" fill="#f3f5f2">Orden</text>
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toFile(SALIDA)
  .then((info) => {
    console.log(`Listo: ${SALIDA} (${info.width} × ${info.height})`);
  })
  .catch((e) => {
    console.error('No se pudo generar el logo:', e.message);
    process.exit(1);
  });
