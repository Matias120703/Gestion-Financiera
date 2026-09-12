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
 *     botones verdes y sobre fondos oscuros, donde blanco es blanco en los
 *     dos temas. Para las tarjetas está `superficie`.
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

        /*
         * Solo para la portada y las superficies que son oscuras siempre.
         *
         * `verde` (#17795a) está elegido para leerse sobre blanco, y sobre un
         * fondo casi negro queda apagado y sin contraste. `menta` es el mismo
         * verde llevado a donde se lee en oscuro; `noche` no es negro puro
         * sino el mismo verde de la marca bajado hasta el fondo, para que la
         * portada y la aplicación se sientan del mismo producto.
         */
        noche:  { DEFAULT: '#0a1712', hondo: '#050d0a' },
        menta:  { DEFAULT: '#3ddc9a', suave: '#8ef0c6' },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        tarjeta: '0 1px 2px rgba(13,27,22,.04), 0 8px 24px -12px rgba(13,27,22,.18)',
      },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
};
export default config;
