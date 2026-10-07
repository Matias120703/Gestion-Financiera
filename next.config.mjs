/**
 * CABECERAS DE LA PANTALLA DE PAGO (Bancard, 02/10/2026).
 *
 * Solo para /plan y lo que cuelga de ahí (la ventana de pago, la pantalla de
 * vuelta, el comprobante): nadie puede meter esas pantallas en un iframe
 * ajeno. Pagar es un toque, y una página de otro que la tapara con algo
 * encima (clickjacking) haría pagar sin querer.
 *
 * A PROPÓSITO NO HAY UNA CSP GLOBAL ni `frame-src`/`script-src`: sin poder
 * probarla en producción, una CSP puede romper la aplicación entera, y el
 * formulario de Bancard navega adentro de su iframe (3D Secure del banco,
 * QR) por direcciones que no se conocen de antemano. Si algún día se agrega
 * una, `script-src` y `frame-src` tienen que incluir
 * https://vpos.infonet.com.py y https://vpos.infonet.com.py:8888 (staging),
 * y las navegaciones del 3D Secure.
 */
const SIN_MARCO_AJENO = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      { source: '/plan', headers: SIN_MARCO_AJENO },
      { source: '/plan/:path*', headers: SIN_MARCO_AJENO },
    ];
  },
};
export default nextConfig;
