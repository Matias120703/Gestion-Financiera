import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tinta:  { DEFAULT: '#0d1b16', suave: '#1b2f26' },
        verde:  { DEFAULT: '#17795a', claro: '#e6f4ee', fuerte: '#0f5c44' },
        arena:  '#f6f7f5',
        borde:  '#e3e7e4',
        rojo:   { DEFAULT: '#c0392b', claro: '#fdeceb' },
        ambar:  { DEFAULT: '#b7791f', claro: '#fdf5e3' },
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
