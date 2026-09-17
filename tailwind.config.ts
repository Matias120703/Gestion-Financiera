import type { Config } from 'tailwindcss';

/**
 * LOS COLORES SON VARIABLES, NO NÚMEROS FIJOS.
 *
 * Antes acá había hexadecimales y la app era clara y punto. Para el modo
 * oscuro había dos caminos: escribir `dark:` en cada clase de cada pantalla
 * —cientos de lugares, y el que se olvide queda blanco brillante en la cara
 * de alguien a las once de la noche— o dar vuelta la paleta en un solo lugar.
 *
 * Esto es lo segundo. Cada color apunta a una variable CSS que se define dos
 * veces en globals.css: una para el tema claro y otra para el oscuro. Las
 * pantallas no saben en qué tema están, y no tienen por qué saberlo.
 *
 * `<alpha-value>` es lo que mantiene vivas las opacidades (`text-tinta/45`,
 * `bg-verde/10`): sin eso, Tailwind no puede componer el alfa sobre una
 * variable y esas clases dejan de existir.
 *
 * LOS QUE NO CAMBIAN, Y POR QUÉ:
 *
 *   · `white` sigue siendo blanco de verdad. Se usa para el texto sobre
 *     fondos oscuros, donde blanco es blanco en los dos temas. Para las
 *     tarjetas está `superficie`. Sobre el verde va `sobre-verde`: el verde
 *     vivo es claro, y el blanco encima no se lee.
 *   · `noche` y `menta` son superficies oscuras a propósito —la portada, la
 *     pantalla de ingreso, el velo de los diálogos—. Si siguieran a `tinta`,
 *     que ahora es el color del texto, en oscuro quedarían claras con letras
 *     blancas encima.
 */
const v = (nombre: string) => `rgb(var(--${nombre}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tinta:  { DEFAULT: v('tinta'), suave: v('tinta-suave') },
        verde:  { DEFAULT: v('verde'), claro: v('verde-claro'), fuerte: v('verde-fuerte') },
        arena:  v('arena'),
        borde:  v('borde'),
        rojo:   { DEFAULT: v('rojo'), claro: v('rojo-claro') },
        ambar:  { DEFAULT: v('ambar'), claro: v('ambar-claro') },

        /** La tarjeta. Blanca en claro, gris oscuro en oscuro. */
        superficie: v('superficie'),

        /** El texto sobre un botón o una pastilla verde llena. */
        'sobre-verde': v('sobre-verde'),

        /*
         * Solo para la portada y las superficies que son oscuras siempre.
         *
         * `noche` es casi negro neutro, el mismo fondo del modo oscuro, y no
         * negro puro: sobre negro absoluto el texto blanco vibra. `menta` es
         * el verde vivo de la marca, que es el que se lee sobre ese fondo.
         */
        noche:  { DEFAULT: '#121212', hondo: '#0a0a0a' },
        menta:  { DEFAULT: '#48dc82', suave: '#a6f0c2' },
      },
      /*
       * Dos letras, como Wise: una prolija para leer (Inter) y otra pesada y
       * angosta para los números grandes y los títulos (Archivo). Se cargan
       * con next/font en app/layout.tsx; si no llegan, queda la del sistema.
       */
      fontFamily: {
        sans: ['var(--fuente-texto)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        titulo: ['var(--fuente-titulo)', 'var(--fuente-texto)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        tarjeta: '0 1px 2px rgba(0,0,0,.03)',
      },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
};
export default config;
