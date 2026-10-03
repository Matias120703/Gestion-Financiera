'use client';

import { Fragment } from 'react';
import { Entra, Tilde } from '@/components/portada/pantallas/Celular';
import {
  Avatar, Billete, Boleta, Contador, Globo, LogoEscucha, Teclado, Toque,
} from '@/components/portada/escenas/base';
import { precio } from '@/lib/formato';
import type { TextosCargar } from '@/i18n/textos/escenas/cargar';
import type { TextosVitrina } from '@/i18n/textos/vitrina';
import type { useTextos } from '@/i18n/cliente';

/**
 * LOS CUADROS DE LA ESCENA «CARGAR» (02/10/2026): lo que se dibuja ADENTRO
 * del celular en cada cuadro y lo que flota AFUERA (quién carga y con qué).
 * La sección, el reloj y los controles viven en EscenaCargar.tsx; acá no hay
 * estado: cada función recibe el modo y el cuadro y pinta.
 *
 * Todo lo de adentro del celular es decorado para el lector de pantalla (el
 * marco es `role="img"` con el `resumen`), así que los botones dibujados son
 * `<span>`, no `<button>`. Lo que dicen las pantallas sale de `t.captura.*`
 * y `t.comun.*`, letra por letra como en la app; lo propio de la escena (lo
 * dicho, los montos de ejemplo) del módulo `cargar.ts`.
 *
 * Las pantallas copian la captura real (components/CapturaInteligente.tsx y
 * RevisionFiado.tsx): el velo oscuro, el menú «Registrar rápido» con sus tres
 * opciones, el logo que escucha con el cronómetro, el área de texto, el
 * «Entendiendo…», y la revisión con la pastilla del tipo, lo dicho entre «»,
 * los campos, el total y el pie «Atrás / Guardar». Nada que la app no tenga.
 */

export type ModoCarga = 'voz' | 'foto' | 'texto';
export const MODOS: ModoCarga[] = ['voz', 'foto', 'texto'];

/** Los cinco cuadros de la secuencia; el de la revisión espera al dedo. */
export const CUADRO = { menu: 0, captura: 1, entendiendo: 2, revision: 3, cargado: 4 } as const;
export const DURACIONES: (number | null)[] = [900, 2200, 800, null, 0];

type Diccionario = ReturnType<typeof useTextos>;

const TRAZO = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/** Los tres íconos del menú real de la captura (micrófono, cámara, lápiz). */
const DIBUJO_MODO: Record<ModoCarga, JSX.Element> = {
  voz: (
    <>
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
      <path d="M18.5 11.5A6.5 6.5 0 0 1 5.5 11.5M12 18v3" />
    </>
  ),
  foto: (
    <>
      <path d="M3.5 8.5h3l1.5-2.5h8L17.5 8.5h3v10h-17z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  texto: <path d="M4 20h16M6 16.5 16.5 6a2.1 2.1 0 0 1 3 3L9 19.5l-4 1z" />,
};

export function IconoModo({ modo, className = 'h-5 w-5' }: { modo: ModoCarga; className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...TRAZO}>
      {DIBUJO_MODO[modo]}
    </svg>
  );
}

/**
 * Una frase que aparece palabra por palabra (110 ms entre una y otra). Sin
 * `animado` —reducir movimiento, o el cuadro inicial— está entera y quieta.
 */
export function Palabras({ texto, animado, desde = 0 }: {
  texto: string;
  animado: boolean;
  desde?: number;
}): JSX.Element {
  const palabras = texto.split(' ');
  return (
    <>
      {palabras.map((palabra, i) => (
        <Fragment key={i}>
          <span
            className={`inline-block ${animado ? 'portada-palabra' : ''}`}
            style={animado ? { animationDelay: `${desde + i * 110}ms` } : undefined}
          >
            {palabra}
          </span>
          {i < palabras.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </>
  );
}

/**
 * El CSS propio de la escena, con nombres `escena-cargar-*`: la boleta que
 * sube y se endereza en el visor de la cámara y el cursor del área de texto.
 * Solo `transform` y `opacity`, y solo con «reducir movimiento» apagado: sin
 * animación la boleta está en su lugar (apenas inclinada) y el cursor quieto.
 * El cursor late cuatro veces y se queda: nada gira sin fin.
 */
export const CSS_ESCENA_CARGAR = `
@keyframes escena-cargar-boleta {
  from { opacity: 0; transform: translateY(24px) rotate(-5deg); }
  to   { opacity: 1; transform: translateY(0) rotate(-2deg); }
}
@keyframes escena-cargar-cursor { 50% { opacity: 0; } }
.escena-cargar-boleta { transform: rotate(-2deg); }
@media (prefers-reduced-motion: no-preference) {
  .escena-cargar-boleta { animation: escena-cargar-boleta .8s cubic-bezier(.2, .7, .2, 1) both; }
  .escena-cargar-cursor { animation: escena-cargar-cursor 1s steps(2, start) 4; }
}
`;

// ---------------------------------------------------------------------------
// PIEZAS CHICAS
// ---------------------------------------------------------------------------

/**
 * Un botón dibujado, de la forma de los de la app (píldora verde o verde
 * clara). `toque` pone el dedo encima a los ms que diga; `halo` el latido de
 * «tocá acá» (tres veces); `anillo` el anillo fijo de reducir movimiento y
 * del cuadro inicial, que no late.
 */
function BotonDibujado({ tono, children, toque, halo = false, anillo = false }: {
  tono: 'principal' | 'suave';
  children: React.ReactNode;
  toque?: number;
  halo?: boolean;
  anillo?: boolean;
}): JSX.Element {
  return (
    <span className="relative block">
      {halo && <span className="portada-pulso absolute -inset-1.5 rounded-full bg-verde/25" />}
      <span
        className={`relative flex min-h-[34px] items-center justify-center rounded-full px-3 text-[11.5px] font-semibold ${
          tono === 'principal' ? 'bg-verde text-sobre-verde' : 'bg-verde-claro text-verde-fuerte'} ${
          anillo ? 'ring-2 ring-verde/60 ring-offset-2 ring-offset-superficie' : ''}`}
      >
        {children}
      </span>
      {toque !== undefined && <Toque x="50%" y="50%" retraso={toque} />}
    </span>
  );
}

/** Un campo de la revisión, como se ve en la app: la etiqueta y el valor en su caja. */
function Campo({ etiqueta, valor, paso }: { etiqueta: string; valor: string; paso: number }): JSX.Element {
  return (
    <Entra paso={paso}>
      <span className="block text-[10px] font-semibold text-tinta/70">{etiqueta}</span>
      <span className="mt-1 block rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-[11.5px] text-tinta">{valor}</span>
    </Entra>
  );
}

/** La pastilla del tipo, con los colores de la revisión real: venta verde, gasto rojo, fiado ámbar. */
function PastillaTipo({ modo, t }: { modo: ModoCarga; t: Diccionario }): JSX.Element {
  const [texto, color] = modo === 'voz'
    ? [t.captura.tipoVenta, 'bg-verde-claro text-verde-fuerte']
    : modo === 'foto'
      ? [t.captura.tipoGasto, 'bg-rojo-claro text-rojo']
      : [t.captura.tipoTeDeben, 'bg-ambar-claro text-ambar'];
  return <span className={`pastilla shrink-0 px-2 py-0.5 text-[10px] ${color}`}>{texto}</span>;
}

/** El borde de abajo del papelito, en zigzag (ocho dientes de 5 px). */
const ZIGZAG_PAPELITO = (() => {
  const dientes = 8;
  const puntos = ['0 0', '100% 0'];
  for (let i = dientes; i >= 0; i--) {
    puntos.push(`${(i / dientes) * 100}% ${i % 2 === 0 ? '100%' : 'calc(100% - 5px)'}`);
  }
  return `polygon(${puntos.join(', ')})`;
})();

/**
 * Una boleta chica con los colores del tema, para flotar al lado del
 * celular sobre el fondo claro (la `Boleta` de la base es blanca translúcida
 * y solo sirve sobre el visor oscuro). Sin nombre de comercio: tres renglones
 * grises y el total.
 */
function Papelito({ total, rotulo, className = '' }: { total: string; rotulo: string; className?: string }): JSX.Element {
  return (
    <span
      className={`block h-[96px] w-[84px] border border-borde bg-arena px-2 pt-2.5 text-tinta shadow-[0_10px_24px_-14px_rgba(10,23,18,.5)] ${className}`}
      style={{ clipPath: ZIGZAG_PAPELITO }}
    >
      <span className="block space-y-2">
        <span className="block h-1 w-3/4 rounded-full bg-tinta/15" />
        <span className="block h-1 w-1/2 rounded-full bg-tinta/15" />
        <span className="block h-1 w-2/3 rounded-full bg-tinta/15" />
      </span>
      <span className="mt-3 flex items-baseline justify-between gap-1 border-t border-dashed border-tinta/25 pt-1.5 text-[8px] font-bold tabular-nums">
        <span>{rotulo}</span>
        <span>{total}</span>
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// EL PANEL DE ATRÁS (y el de después de guardar)
// ---------------------------------------------------------------------------

/** La tarjeta «Te quedó hoy» del panel de Aurora, la misma de la vitrina (pantallas/Comercio.tsx). */
function TarjetaPanel({ p }: { p: TextosVitrina['pantallas']['comercio'] }): JSX.Element {
  return (
    <div className="tarjeta p-4">
      <p className="text-[10.5px] font-bold uppercase tracking-[.14em] text-tinta/60">{p.teQuedoHoy}</p>
      <p className="mt-1 font-titulo text-[28px] font-extrabold leading-none tracking-tight tabular-nums text-verde-fuerte">
        {p.monto}
      </p>
      <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-verde-claro px-2 py-0.5 text-[11px] font-bold text-verde-fuerte">
        {p.variacion} <span className="font-medium text-tinta/60">{p.comparado}</span>
      </p>
      <dl className="mt-3 space-y-1.5 border-t border-borde pt-2.5">
        {p.filas.map((f) => (
          <div key={f.etiqueta} className="flex items-baseline justify-between gap-3 text-[12px]">
            <dt className="font-semibold text-tinta/60">{f.etiqueta}</dt>
            <dd className={`font-bold tabular-nums ${f.tono === 'malo' ? 'text-rojo' : 'text-tinta'}`}>{f.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** «Lo cargaste así»: el ícono del modo, lo dicho y el tilde de lo que quedó. */
function TarjetaLoCargaste({ x, v, modo }: { x: TextosCargar; v: TextosVitrina; modo: ModoCarga }): JSX.Element {
  const e = x.escenas;
  const dicho = modo === 'voz' ? `«${e.voz.dicho}»` : modo === 'texto' ? `«${e.texto.dicho}»` : e.foto.descripcion;
  return (
    <div className="tarjeta p-3.5">
      <p className="text-[10.5px] font-bold uppercase tracking-[.14em] text-tinta/60">{v.pantallas.comercio.loCargasteAsi}</p>
      <div className="mt-2 flex items-start gap-2">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-verde-claro text-verde-fuerte">
          <IconoModo modo={modo} className="h-3.5 w-3.5" />
        </span>
        <p className="text-[12.5px] font-medium leading-snug text-tinta/75">{dicho}</p>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 border-t border-borde pt-2 text-[11.5px] font-semibold text-verde-fuerte">
        <Tilde />
        {e[modo].queda}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LO QUE PASA ENCIMA DEL PANEL, CUADRO POR CUADRO
// ---------------------------------------------------------------------------

/** El menú «Registrar rápido», como en la app: sobre el velo, sin tarjeta. */
function Menu({ t, modo, animado }: { t: Diccionario; modo: ModoCarga; animado: boolean }): JSX.Element {
  const filas: { clave: ModoCarga; titulo: string; detalle: string }[] = [
    { clave: 'voz', titulo: t.captura.porVoz, detalle: t.captura.ejemploVozNegocio },
    { clave: 'foto', titulo: t.captura.porFoto, detalle: t.captura.porFotoDetalle },
    { clave: 'texto', titulo: t.captura.porTexto, detalle: t.captura.porTextoDetalle },
  ];
  return (
    <div className={`w-full ${animado ? 'portada-sube' : ''}`}>
      <p className="px-1 text-[14px] font-bold tracking-tight text-white">{t.captura.registrarRapido}</p>
      <p className="mt-1 px-1 text-[10.5px] leading-snug text-white/60">{t.captura.contaleLoQuePasoNegocio}</p>
      <div className="mt-3 space-y-2">
        {filas.map((f) => {
          const activa = f.clave === modo;
          return (
            <div key={f.clave} className="relative flex items-center gap-2.5 rounded-2xl border border-borde bg-superficie px-3 py-2.5 text-left">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-verde-claro text-verde-fuerte">
                <IconoModo modo={f.clave} className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-bold text-tinta">{f.titulo}</span>
                <span className="block truncate text-[10.5px] text-tinta/55">{f.detalle}</span>
              </span>
              {/* A los 0,4 s el dedo cae sobre la fila del modo elegido y la fila queda marcada. */}
              {activa && (
                <span className="portada-enciende absolute -inset-px rounded-2xl ring-2 ring-verde" style={{ animationDelay: '450ms' }} />
              )}
              {activa && animado && <Toque x="50%" y="50%" retraso={400} />}
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 text-center text-[10.5px] font-semibold text-white/50">{t.comun.cancelar}</p>
    </div>
  );
}

/** Grabando: el logo que escucha, el cronómetro que sube y «Cancelar / Listo». */
function Grabando({ x, t, animado }: { x: TextosCargar; t: Diccionario; animado: boolean }): JSX.Element {
  return (
    <div className="py-1 text-center">
      <LogoEscucha />
      <p className="mt-3">
        <Contador
          hasta={3} ms={2000} activo={animado} formato={x.cronometro}
          className="font-titulo text-[22px] font-extrabold tracking-tight"
        />
      </p>
      <p className="mt-1 text-[11px] leading-snug text-tinta/60">{t.captura.hablaNormal}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <BotonDibujado tono="suave">{t.comun.cancelar}</BotonDibujado>
        <BotonDibujado tono="principal" toque={animado ? 1900 : undefined}>{t.comun.listo}</BotonDibujado>
      </div>
    </div>
  );
}

/** Escribiendo: «Contame qué pasó», el área de texto que se llena palabra por palabra y el teclado. */
function Escribiendo({ x, t, animado }: { x: TextosCargar; t: Diccionario; animado: boolean }): JSX.Element {
  const dicho = x.escenas.texto.dicho;
  const palabras = dicho.split(' ').length;
  return (
    <div>
      <p className="text-[13px] font-bold tracking-tight">{t.captura.contameQuePaso}</p>
      <p className="mt-2.5 min-h-[72px] rounded-xl border border-verde bg-superficie px-3 py-2 text-left text-[12px] leading-relaxed text-tinta ring-2 ring-verde/15">
        <Palabras texto={dicho} animado={animado} desde={150} />
        <span
          className="escena-cargar-cursor ml-px inline-block h-[1em] w-px bg-tinta align-[-2px]"
          style={animado ? { animationDelay: `${150 + palabras * 110}ms` } : undefined}
        />
      </p>
      <div className="mt-2.5"><Teclado /></div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <BotonDibujado tono="suave">{t.captura.atras}</BotonDibujado>
        <BotonDibujado tono="principal" toque={animado ? 1900 : undefined}>{t.captura.interpretar}</BotonDibujado>
      </div>
    </div>
  );
}

/** La IA pensando: el logo con el arco, «Entendiendo lo que dijiste…» (o «Leyendo el comprobante…»). */
function Entendiendo({ t, modo }: { t: Diccionario; modo: ModoCarga }): JSX.Element {
  return (
    <div className="py-6 text-center">
      <LogoEscucha pensando />
      <p className="mt-3 text-[12.5px] font-semibold">{modo === 'foto' ? t.captura.subiendoFoto : t.captura.interpretando}</p>
      <p className="mt-0.5 text-[11px] text-tinta/50">{t.captura.tardaSegundos}</p>
    </div>
  );
}

/**
 * La revisión, SIEMPRE antes de guardar: la pastilla del tipo, lo dicho entre
 * «» (o la miniatura de la foto con la casilla del comprobante), los campos
 * que entran uno detrás de otro, el total que sube y el pie «Atrás / Guardar»
 * con el latido en Guardar. Es el cuadro inicial, el que pinta el servidor.
 */
function Revision({ x, t, modo, locale, animado, reducido }: {
  x: TextosCargar;
  t: Diccionario;
  modo: ModoCarga;
  locale: string;
  animado: boolean;
  reducido: boolean;
}): JSX.Element {
  const e = x.escenas;
  const total = e[modo].total;
  const plata = (n: number) => precio(n, 'PYG', locale);
  return (
    <div className="text-left">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold tracking-tight">{t.captura.revisar}</p>
          <p className="mt-0.5 text-[10.5px] text-tinta/55">{t.captura.podesCorregir}</p>
        </div>
        <PastillaTipo modo={modo} t={t} />
      </div>

      {modo === 'foto' ? (
        <div className="mt-2.5 flex items-center gap-2.5 rounded-lg bg-arena p-2">
          {/* La miniatura de la foto: el papel sobre fondo oscuro. */}
          <span className="grid h-12 w-10 shrink-0 place-items-center rounded-md bg-noche-hondo">
            <span className="block h-8 w-6 bg-white/85 px-1 pt-1.5">
              <span className="block h-0.5 w-full rounded-full bg-noche/20" />
              <span className="mt-1 block h-0.5 w-2/3 rounded-full bg-noche/20" />
              <span className="mt-1 block h-0.5 w-full rounded-full bg-noche/20" />
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded bg-verde text-sobre-verde">
              <Tilde className="h-3 w-3" />
            </span>
            <span className="text-[10.5px] font-medium leading-snug text-tinta/75">{t.captura.guardarComprobante}</span>
          </span>
        </div>
      ) : (
        <p className="mt-2.5 rounded-lg bg-arena px-2.5 py-1.5 text-[11px] italic leading-snug text-tinta/60">
          «{modo === 'voz' ? e.voz.dicho : e.texto.dicho}»
        </p>
      )}

      <div className="mt-2.5 space-y-2">
        {modo === 'voz' && (
          <>
            <Campo etiqueta={t.captura.campoCobroPago} valor={t.captura.metodoEfectivo} paso={0} />
            <Entra paso={1}>
              <span className="block text-[10px] font-semibold text-tinta/55">{t.captura.productos}</span>
              <span className="mt-1 block rounded-lg border border-borde p-2">
                <span className="block text-[11.5px] font-bold text-tinta">{e.voz.descripcion}</span>
                <span className="mt-1.5 grid grid-cols-2 gap-2">
                  <span className="block">
                    <span className="block text-[9.5px] font-semibold text-tinta/50">{t.captura.cantidad}</span>
                    <span className="block text-[11.5px] tabular-nums text-tinta">{e.voz.cantidad}</span>
                  </span>
                  <span className="block">
                    <span className="block text-[9.5px] font-semibold text-tinta/50">{t.captura.precioCadaUno}</span>
                    <span className="block text-[11.5px] tabular-nums text-tinta">{plata(e.voz.precioUnitario)}</span>
                  </span>
                </span>
                <span className="mt-1.5 block text-[9.5px] font-semibold text-verde-fuerte">{t.captura.vinculadoAlCatalogo}</span>
              </span>
            </Entra>
          </>
        )}
        {modo === 'foto' && (
          <>
            <Campo etiqueta={t.captura.campoDescripcion} valor={e.foto.descripcion} paso={0} />
            <Campo etiqueta={t.captura.campoCobroPago} valor={t.captura.metodoEfectivo} paso={1} />
          </>
        )}
        {modo === 'texto' && (
          <Campo etiqueta={t.captura.quienTeDebe} valor={e.texto.quien} paso={0} />
        )}
      </div>

      <Entra paso={2}>
        <div className="mt-2.5 rounded-xl bg-arena p-2.5">
          <p className="text-[10px] font-semibold text-tinta/70">{modo === 'texto' ? t.captura.cuantoTeDebe : t.captura.total}</p>
          <p className="mt-0.5">
            <Contador
              hasta={total} ms={600} retraso={200} activo={animado} formato={plata}
              className="font-titulo text-[17px] font-extrabold text-verde-fuerte"
            />
          </p>
        </div>
      </Entra>

      {/* El pie de la revisión real (`pie-captura`): Atrás y Guardar. Nada se guarda hasta tocar Guardar. */}
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-borde/70 pt-3">
        <BotonDibujado tono="suave">{t.captura.atras}</BotonDibujado>
        <BotonDibujado tono="principal" halo={animado} anillo={!animado || reducido}>{t.comun.guardar}</BotonDibujado>
      </div>
    </div>
  );
}

/** El visor de la cámara del teléfono: las esquinas del encuadre, la boleta que sube, el destello y el disparador. */
function Visor({ x, locale, animado }: { x: TextosCargar; locale: string; animado: boolean }): JSX.Element {
  const esquina = 'absolute h-6 w-6 border-white/70';
  return (
    <div className="absolute inset-0 z-[5] bg-noche-hondo">
      <span className={`${esquina} left-7 top-24 border-l-2 border-t-2 rounded-tl-md`} />
      <span className={`${esquina} right-7 top-24 border-r-2 border-t-2 rounded-tr-md`} />
      <span className={`${esquina} bottom-36 left-7 border-b-2 border-l-2 rounded-bl-md`} />
      <span className={`${esquina} bottom-36 right-7 border-b-2 border-r-2 rounded-br-md`} />
      <div className="absolute inset-x-0 top-[150px] flex justify-center">
        <Boleta total={precio(x.escenas.foto.total, 'PYG', locale)} rotulo={x.boletaTotal} className="escena-cargar-boleta" />
      </div>
      {/* El flash a los 1,55 s y el disparador que se aprieta a los 1,6 s. */}
      {animado && <span className="portada-destello absolute inset-0 bg-white/60" style={{ animationDelay: '1550ms' }} />}
      <span
        className={`absolute bottom-16 left-1/2 -ml-7 grid h-14 w-14 place-items-center rounded-full border-[3px] border-white/80 ${animado ? 'portada-pop' : ''}`}
        style={animado ? { animationDelay: '1600ms' } : undefined}
      >
        <span className="block h-10 w-10 rounded-full bg-white/90" />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LA PANTALLA ENTERA, SEGÚN EL CUADRO
// ---------------------------------------------------------------------------

/**
 * Lo que va adentro del `Celular` en un cuadro dado. Detrás siempre está el
 * panel de Aurora; encima, el velo con el menú, la captura, el «entendiendo»
 * o la revisión; en el último cuadro la hoja se cierra, como en la app, y
 * vuelve el panel con la tarjeta «Lo cargaste así». El velo es `absolute
 * inset-0` sobre la pantalla del celular (que es `relative` y de alto fijo),
 * con `z-[5]`: tapa la barra y el micrófono, pero no la isla (`z-10`).
 *
 * `animado` es «esta pasada corre con reloj» (ni reducir movimiento ni el
 * cuadro inicial del servidor): manda sobre el dedo, el latido y los números
 * que suben.
 */
export function PantallaCargar({ x, v, t, modo, cuadro, locale, animado, reducido }: {
  x: TextosCargar;
  v: TextosVitrina;
  t: Diccionario;
  modo: ModoCarga;
  cuadro: number;
  locale: string;
  animado: boolean;
  reducido: boolean;
}): JSX.Element {
  const cargado = cuadro === CUADRO.cargado;
  const enVisor = modo === 'foto' && cuadro === CUADRO.captura;

  let hoja: React.ReactNode = null;
  if (cuadro === CUADRO.menu) hoja = <Menu t={t} modo={modo} animado={animado} />;
  else if (cuadro === CUADRO.captura) hoja = modo === 'voz' ? <Grabando x={x} t={t} animado={animado} /> : <Escribiendo x={x} t={t} animado={animado} />;
  else if (cuadro === CUADRO.entendiendo) hoja = <Entendiendo t={t} modo={modo} />;
  else if (cuadro === CUADRO.revision) hoja = <Revision x={x} t={t} modo={modo} locale={locale} animado={animado} reducido={reducido} />;

  return (
    <>
      <div className="space-y-2.5">
        {cargado ? (
          <>
            <Entra paso={0}><TarjetaPanel p={v.pantallas.comercio} /></Entra>
            <Entra paso={1}><TarjetaLoCargaste x={x} v={v} modo={modo} /></Entra>
          </>
        ) : (
          <TarjetaPanel p={v.pantallas.comercio} />
        )}
      </div>

      {enVisor && <Visor x={x} locale={locale} animado={animado} />}

      {!cargado && !enVisor && (
        <div
          className={`absolute inset-0 z-[5] flex justify-center bg-noche/70 px-3 backdrop-blur-sm ${
            // Al escribir, arriba (en la app el teclado tapa el centro); lo demás, centrado.
            modo === 'texto' && cuadro === CUADRO.captura ? 'items-start pt-14' : 'items-center'}`}
        >
          {cuadro === CUADRO.menu ? hoja : (
            <div className="aparecer w-full rounded-2xl border border-borde bg-superficie p-3.5 shadow-[0_18px_40px_-18px_rgba(10,23,18,.5)]">
              {hoja}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// LO QUE FLOTA AFUERA DEL CELULAR
// ---------------------------------------------------------------------------

/** Las tres fases de lo que flota: antes de abrir (quién y con qué), mientras carga (lo que dice), y después (nada). */
export type FaseFlotante = 'antes' | 'cargando' | 'despues';

export function faseDe(cuadro: number): FaseFlotante {
  return cuadro === CUADRO.menu ? 'antes' : cuadro === CUADRO.cargado ? 'despues' : 'cargando';
}

/**
 * Quién carga y con qué, al lado del celular (fuera del `role="img"`, todo
 * `aria-hidden`): antes de abrir la captura, la persona con el billete que
 * acaba de cobrar, la boleta del gasto o el lápiz; mientras habla, su globo
 * con la frase palabra por palabra. Con la foto y el texto, mientras carga,
 * no flota nada: lo que importa está adentro del celular.
 *
 * Centrado con `inset-x-0 mx-auto` y no con `-translate-x-1/2`: las
 * animaciones terminan en `transform: none` y borrarían el corrimiento (la
 * vitrina ya se chocó con eso). Desde `lg` cuelga a la izquierda del marco.
 */
export function Flotante({ x, modo, fase, locale, animado }: {
  x: TextosCargar;
  modo: ModoCarga;
  fase: FaseFlotante;
  locale: string;
  animado: boolean;
}): JSX.Element | null {
  if (fase === 'despues') return null;
  if (fase === 'cargando' && modo !== 'voz') return null;
  const entra = animado ? 'portada-sube' : '';
  const inicial = x.vos.charAt(0).toUpperCase();

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -top-9 mx-auto flex w-[250px] items-start gap-2.5 lg:inset-x-auto lg:-left-16 lg:top-12 lg:w-[236px]"
    >
      <span className="shrink-0 pt-1"><Avatar inicial={inicial} nombre={x.vos} /></span>
      {fase === 'antes' && modo === 'voz' && (
        <span className={`block pt-0.5 ${entra}`}><Billete importe={precio(x.escenas.voz.total, 'PYG', locale)} /></span>
      )}
      {fase === 'antes' && modo === 'foto' && (
        <span className={`block -rotate-3 ${entra}`}><Papelito total={precio(x.escenas.foto.total, 'PYG', locale)} rotulo={x.boletaTotal} /></span>
      )}
      {fase === 'antes' && modo === 'texto' && (
        <span className={`grid h-11 w-11 place-items-center rounded-xl border border-borde bg-superficie text-verde-fuerte shadow-[0_10px_24px_-14px_rgba(10,23,18,.5)] ${entra}`}>
          <IconoModo modo="texto" className="h-5 w-5" />
        </span>
      )}
      {fase === 'cargando' && (
        <Globo cola="izquierda" tono="noche" className={`min-w-0 ${entra}`}>
          <Palabras texto={x.escenas.voz.dicho} animado={animado} desde={200} />
        </Globo>
      )}
    </div>
  );
}
