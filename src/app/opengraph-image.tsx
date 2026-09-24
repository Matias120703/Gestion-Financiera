import { ImageResponse } from 'next/og';

/**
 * LA FOTO DEL ENLACE
 *
 * Es lo que aparece cuando alguien pega el link de Orden en WhatsApp,
 * Facebook o un correo. Antes no había ninguna: el enlace salía como un
 * renglón gris sin imagen, justo en el lugar donde un comerciante decide si
 * lo abre o no. Next la sirve sola en `/opengraph-image` y agrega las
 * etiquetas `og:image` a la portada y a todas las páginas que no tengan la
 * suya.
 *
 * QUÉ CUENTA
 *
 * Lo mismo que la portada: que Orden se adapta a lo que hacés y que te dice
 * cuánto te quedó de verdad. A la izquierda, la marca, el titular y los
 * rubros; a la derecha, un celular con tres tarjetas de rubros distintos
 * (un comercio, un campo, un profe), con los mismos datos de ejemplo que la
 * vitrina de la portada. Nada de capturas: todo es dibujo, así no queda
 * viejo cuando cambia una pantalla.
 *
 * POR QUÉ ES FIJA Y EN ESPAÑOL
 *
 * Se arma una sola vez, al compilar, y se sirve como archivo: rápida y sin
 * tocar la base. Leer el idioma de quien mira la volvería dinámica, y no
 * serviría de mucho: quien la pide es el robot de WhatsApp, que no manda
 * idioma. Por eso dice «Em português também» abajo: el brasileño que la ve
 * sabe que adentro lo atienden en su idioma.
 *
 * POR QUÉ SIN FUENTES DE AFUERA
 *
 * `next/og` trae su letra (Noto Sans) adentro. Bajar Inter o Archivo de
 * Google al compilar puede fallar sin red y romper el build entero por una
 * foto. La letra por defecto no tiene negrita: el peso de los títulos sale
 * del tamaño y de un trazo fino del mismo color.
 *
 * No dice cuántos días dura la prueba a propósito: son 8 para un negocio y 5
 * para una cuenta personal, y la foto habla de los dos. «Probalo gratis» es
 * verdad para todos; el número exacto lo dice la portada, que lo lee de la
 * constante.
 *
 * Ojo: el middleware tiene que dejar pasar `/opengraph-image` sin sesión.
 * El robot de WhatsApp no tiene cuenta: si lo mandan al login, se queda con
 * el HTML del login y el enlace sale sin foto, sin ningún error que avise.
 */

export const alt = 'Orden: sabé cuánto te quedó de verdad, en tu comercio, tus clases, tu campo o tu casa.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Los colores de globals.css (modo oscuro), en hexadecimal porque la foto no
// lee variables de CSS.
const C = {
  noche: '#121212',
  superficie: '#222321',
  borde: '#343532',
  tinta: '#f0f1ee',
  tintaSuave: '#c8cac5',
  verde: '#48dc82',
  verdeClaro: '#1f3627',
  verdeFuerte: '#78eaa4',
  sobreVerde: '#062a14',
  ambar: '#e8b052',
} as const;

const TEXTO = {
  titular1: 'Sabé cuánto',
  titular2: 'te quedó',
  titular3: 'de verdad.',
  bajada: 'Orden se adapta a lo que hacés. Contale lo que pasó hablando, con una foto o escribiendo.',
  rubros: ['Comercio', 'Servicios', 'Clases', 'Personal trainer', 'Campo', 'Ganadería', 'Para vos'],
  prueba: 'Probalo gratis · sin tarjeta',
  portugues: 'Em português também',
} as const;

/** El anillo de Orden, el mismo de public/iconos/icono.svg. */
function Logo({ lado }: { lado: number }) {
  return (
    <svg width={lado} height={lado} viewBox="0 0 512 512">
      <defs>
        <linearGradient id="anillo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7cf0a8" />
          <stop offset="55%" stopColor="#48dc82" />
          <stop offset="100%" stopColor="#1f9d57" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="#121212" />
      <circle cx="256" cy="256" r="132" fill="none" stroke="url(#anillo)" strokeWidth="46" />
      <path d="M132 211A132 132 0 0 1 301 132" fill="none" stroke="#eafff1" strokeWidth="15" strokeLinecap="round" opacity="0.92" />
      <path d="M256 190v132" stroke="#f3f5f2" strokeWidth="26" strokeLinecap="round" />
    </svg>
  );
}

/** Una tarjeta del celular: la etiqueta del rubro, el dato grande y el detalle. */
function Tarjeta({ rubro, titulo, dato, detalle, acento }: {
  rubro: string; titulo: string; dato: string; detalle: string; acento: string;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', padding: '15px 18px', borderRadius: 22, flexShrink: 0,
      background: C.superficie, border: `1px solid ${C.borde}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: 5, background: acento }} />
        <div style={{ fontSize: 16, color: C.tintaSuave, letterSpacing: 0.5 }}>{rubro}</div>
      </div>
      <div style={{ fontSize: 17, color: C.tintaSuave, marginTop: 8 }}>{titulo}</div>
      <div style={{ fontSize: 32, color: C.tinta, marginTop: 0, WebkitTextStroke: `0.8px ${C.tinta}` }}>{dato}</div>
      <div style={{ fontSize: 16, color: acento, marginTop: 4 }}>{detalle}</div>
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'hidden',
        background: C.noche, fontFamily: 'Noto Sans',
      }}>
        {/* El brillo verde de fondo, detrás del celular. */}
        <div style={{
          position: 'absolute', right: -160, top: -120, width: 760, height: 760, borderRadius: 380,
          backgroundImage: 'radial-gradient(circle, rgba(72,220,130,0.30) 0%, rgba(72,220,130,0.08) 45%, rgba(18,18,18,0) 70%)',
        }} />

        {/* Izquierda: marca, titular, rubros. */}
        <div style={{ display: 'flex', flexDirection: 'column', width: 720, padding: '50px 0 44px 72px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Logo lado={52} />
            <div style={{ fontSize: 38, color: C.verde, letterSpacing: -0.5, WebkitTextStroke: `1.2px ${C.verde}` }}>Orden</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26, flexShrink: 0 }}>
            <div style={{ fontSize: 70, lineHeight: 1.04, color: C.tinta, letterSpacing: -2, WebkitTextStroke: `2px ${C.tinta}` }}>{TEXTO.titular1}</div>
            <div style={{ fontSize: 70, lineHeight: 1.04, color: C.tinta, letterSpacing: -2, WebkitTextStroke: `2px ${C.tinta}` }}>{TEXTO.titular2}</div>
            <div style={{ fontSize: 70, lineHeight: 1.04, color: C.verde, letterSpacing: -2, WebkitTextStroke: `2px ${C.verde}` }}>{TEXTO.titular3}</div>
          </div>

          <div style={{ display: 'flex', flexShrink: 0, fontSize: 22, lineHeight: 1.35, color: C.tintaSuave, marginTop: 18, maxWidth: 600 }}>{TEXTO.bajada}</div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 22, maxWidth: 620, flexShrink: 0 }}>
            {TEXTO.rubros.map((r, i) => (
              <div key={r} style={{
                display: 'flex', padding: '6px 14px', borderRadius: 999, fontSize: 18,
                background: i === 0 ? C.verde : 'rgba(255,255,255,0.04)',
                color: i === 0 ? C.sobreVerde : C.tinta,
                border: `1px solid ${i === 0 ? C.verde : C.borde}`,
              }}>{r}</div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 'auto', flexShrink: 0, fontSize: 20, color: C.tintaSuave }}>
            <div style={{ color: C.verdeFuerte }}>{TEXTO.prueba}</div>
            <div style={{ width: 5, height: 5, borderRadius: 3, background: C.borde }} />
            <div>{TEXTO.portugues}</div>
          </div>
        </div>

        {/* Derecha: el celular, cortado por el borde de abajo como si asomara. */}
        <div style={{
          position: 'absolute', left: 792, top: 40, width: 356, height: 640, display: 'flex', flexDirection: 'column',
          borderRadius: 52, padding: 14, background: '#0a0a0a', border: `2px solid ${C.borde}`,
          boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', flexGrow: 1, borderRadius: 40, background: C.noche,
            padding: '26px 16px 0 16px', gap: 12,
          }}>
            {/* La isla de arriba del teléfono. */}
            <div style={{ display: 'flex', alignSelf: 'center', width: 96, height: 24, borderRadius: 12, background: '#000', marginTop: -12, marginBottom: 4 }} />
            <Tarjeta rubro="Perfumería" titulo="Te quedó hoy" dato="Gs. 2.150.000" detalle="+18 % que el martes pasado" acento={C.verde} />
            <Tarjeta rubro="Campo · Soja · 50 ha" titulo="Para cubrir el costo necesitás" dato="742 kg/ha" detalle="a US$ 415/t · 30.000 kg en el silo" acento={C.ambar} />
            <Tarjeta rubro="Clases de hoy" titulo="17:00 Sofía · inglés" dato="Por cobrar: 3" detalle="Gs. 450.000 · a Juan le quedan 2" acento={C.verdeFuerte} />
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
