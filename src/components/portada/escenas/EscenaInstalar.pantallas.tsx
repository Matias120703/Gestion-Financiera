'use client';

import { Marca } from '@/components/Marca';
import { Tilde } from '@/components/portada/pantallas/Celular';
import { Toque } from '@/components/portada/escenas/base';
import type { TextosInstalar } from '@/i18n/textos/escenas/instalar';
import type { TextosVitrina } from '@/i18n/textos/vitrina';
import { IconoAgregar, IconoCompartir, IconoMenu } from './EscenaInstalar.iconos';

/**
 * LAS PANTALLAS DE LA ESCENA «INSTALAR» (02/10/2026): lo que se dibuja
 * ADENTRO del teléfono en cada paso, para iPhone (Safari) y para Android
 * (Chrome). La guía, el estado y los botones viven en EscenaInstalar.guia.tsx;
 * acá no hay estado: cada función recibe el cuadro y pinta.
 *
 * Cada paso es una pila de capas: la página de Orden (la miniatura de la
 * primera pantalla), la barra del navegador, y encima la hoja, el menú o el
 * diálogo de ese paso. En cada paso hay UN solo control resaltado —anillo
 * verde, fondo verde claro, y con movimiento un halo que late tres veces y
 * el dedo encima—: el botón verdadero que hay que tocar en ese teléfono.
 * Cuando se llega con «Siguiente», el dedo toca primero el control del paso
 * anterior (que sigue dibujado debajo, y se va), y recién después entra la
 * capa nueva: así se ve la causa antes del efecto.
 *
 * Todo lo de adentro es decorado para el lector de pantalla (el marco es un
 * `role="img"` con el `resumen` del paso), así que los botones dibujados son
 * `<span>`, no `<button>`. Los nombres de los menús salen de `menus` del
 * módulo instalar.ts, letra por letra como los muestra cada sistema; nada de
 * logos de Apple, Safari, Chrome ni Google: barras, píldoras y círculos.
 *
 * Con «reducir movimiento» (o antes de verse) no se agrega ninguna clase de
 * animación: cada paso aparece armado, con su anillo fijo, sin latido ni
 * dedo. Solo se animan `transform` y `opacity`.
 */

export type Sistema = 'iphone' | 'android';
export const TOTAL_PASOS = 4;

/** Lo que el dibujo necesita saber del cuadro. */
export interface Cuadro {
  sistema: Sistema;
  /** 1 a 4. */
  paso: number;
  /** Hay movimiento: la capa nueva entra, el control resaltado late y el dedo lo toca. */
  anima: boolean;
  /** Se llegó con «Siguiente» desde el paso anterior: el dedo toca primero el control de ese paso. */
  desdeAnterior: boolean;
}

/** Los textos que el dibujo usa: los de la escena, los de la vitrina (el panel) y el titular real de la portada. */
export interface TextosDibujo {
  x: TextosInstalar;
  v: TextosVitrina;
  titular: string;
  titularResaltado: string;
  titularCierre: string;
}

/**
 * El reloj de un paso, en ms desde que se muestra: el dedo toca el control
 * anterior en 0, la capa nueva entra en ENTRA, el control resaltado empieza
 * a latir en LATE y el dedo lo toca en TOCA. Los pasos que primero deslizan
 * o dejan caer algo pasan sus propios `late` y `toca`.
 */
const ENTRA = 250;
const LATE = 450;
const TOCA = 700;

/** El resplandor verde de la marca (los valores de la primera pantalla). */
const RESPLANDOR = 'radial-gradient(closest-side, rgba(40,180,100,.55), rgba(40,180,100,0))';

const TRAZO = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/**
 * El CSS propio de la escena, con nombres `escena-instalar-*`: la capa del
 * paso anterior que se va cuando entra la nueva. Natural (sin movimiento):
 * invisible. Con `both`, durante el retraso está a la vista (el dedo la
 * toca) y después se desvanece.
 */
export const CSS_ESCENA_INSTALAR = `
.escena-instalar-se-va { opacity: 0; }
@keyframes escena-instalar-se-va { from { opacity: 1; } to { opacity: 0; } }
@media (prefers-reduced-motion: no-preference) {
  .escena-instalar-se-va { animation: escena-instalar-se-va .2s ease-out both; }
}
`;

// ---------------------------------------------------------------------------
// PIEZAS CHICAS
// ---------------------------------------------------------------------------

/**
 * Un control dibujado del teléfono. `resaltado` es el verdadero de este
 * paso: anillo verde adentro del borde (así nunca lo recorta una lista),
 * fondo verde claro, y con movimiento un halo que late tres veces desde
 * `late` y el dedo encima en `toca`. `toque` (ms) pone solo el dedo: es el
 * control del paso anterior, el que «alguien acaba de tocar».
 */
function Control({
  resaltado = false, toque, anima, late = LATE, toca = TOCA, forma = 'rounded-full', ancho = false, anilloAfuera = false, children,
}: {
  resaltado?: boolean;
  toque?: number;
  anima: boolean;
  late?: number;
  toca?: number;
  /** La clase del radio: `rounded-full` para botones redondos, `rounded-lg` para renglones, etc. */
  forma?: string;
  /** Un renglón a todo el ancho (en vez de un botón que mide lo que su contenido). */
  ancho?: boolean;
  /**
   * El anillo por fuera, con un hueco oscuro (para el ícono de Orden en la
   * pantalla de inicio: el logo tapa todo el cuadro y un anillo adentro no
   * se vería).
   */
  anilloAfuera?: boolean;
  children: React.ReactNode;
}) {
  const redondo = forma === 'rounded-full';
  const anillo = anilloAfuera
    ? 'ring-2 ring-verde ring-offset-2 ring-offset-noche'
    : 'bg-verde-claro text-verde-fuerte ring-2 ring-inset ring-verde';
  return (
    <span className={`relative ${ancho ? 'flex w-full' : 'inline-flex'}`}>
      {resaltado && anima && (
        <span
          aria-hidden
          className={`portada-pulso absolute ${redondo ? '-inset-1.5' : anilloAfuera ? '-inset-2.5' : '-inset-1'} ${forma} bg-verde/25`}
          style={{ animationDelay: `${late}ms` }}
        />
      )}
      <span
        className={`relative inline-flex items-center ${ancho ? 'w-full' : ''} ${forma} ${resaltado ? anillo : ''}`}
      >
        {children}
      </span>
      {anima && resaltado && <Toque x="50%" y="50%" retraso={toca} />}
      {anima && toque !== undefined && <Toque x="50%" y="50%" retraso={toque} />}
    </span>
  );
}

/** La barra de estado: la hora y los dibujos de señal y batería, como el Celular de la vitrina. */
function BarraEstado({ sobreOscuro }: { sobreOscuro: boolean }) {
  return (
    <div
      className={`relative z-[1] flex h-9 items-center justify-between px-5 pt-1 text-[10.5px] font-semibold ${
        sobreOscuro ? 'text-white' : 'text-tinta'}`}
    >
      <span className="tabular-nums">9:41</span>
      <span className="flex items-center gap-1 opacity-85">
        <svg viewBox="0 0 18 12" className="h-[8px] w-[12px]" fill="currentColor" aria-hidden>
          <rect x="0" y="8" width="3" height="4" rx=".8" /><rect x="5" y="5.5" width="3" height="6.5" rx=".8" />
          <rect x="10" y="3" width="3" height="9" rx=".8" /><rect x="15" y="0" width="3" height="12" rx=".8" />
        </svg>
        <svg viewBox="0 0 26 12" className="h-[9px] w-[19px]" aria-hidden>
          <rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" strokeOpacity=".45" />
          <rect x="2.5" y="2.5" width="15" height="7" rx="1.6" fill="currentColor" />
          <rect x="23.5" y="4" width="1.6" height="4" rx=".8" fill="currentColor" fillOpacity=".45" />
        </svg>
      </span>
    </div>
  );
}

/** El candado de la dirección segura. */
function Candado() {
  return (
    <svg viewBox="0 0 24 24" className="h-[10px] w-[10px] shrink-0" aria-hidden {...TRAZO}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** Un glifo chico de trazo (flechas, libro, pestañas, estrella…). */
function Glifo({ d, className = 'h-[18px] w-[18px]' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...TRAZO}>
      <path d={d} />
    </svg>
  );
}

/** El velo oscuro detrás de una hoja o un diálogo. */
function Velo({ anima }: { anima: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-0 z-[2] bg-noche/40 ${anima ? 'portada-enciende' : ''}`}
      style={{ animationDelay: `${ENTRA}ms` }}
    />
  );
}

// ---------------------------------------------------------------------------
// LA PÁGINA DE ORDEN (la miniatura de la primera pantalla)
// ---------------------------------------------------------------------------

/**
 * La primera pantalla de la portada, en chico: fondo noche con su resplandor,
 * el logo con el nombre, el titular real («¿Realmente sabés cuánto ganás?»),
 * dos barras por la bajada y el botón menta. `margenArriba` deja lugar a la
 * barra de Chrome, que en Android va arriba.
 */
function PaginaOrden({ d, margenArriba }: { d: TextosDibujo; margenArriba: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-noche text-white">
      <span
        aria-hidden
        className="absolute -right-12 -top-8 h-44 w-44 rounded-full opacity-70 blur-2xl"
        style={{ background: RESPLANDOR }}
      />
      <BarraEstado sobreOscuro />
      <div className="relative px-4" style={{ paddingTop: margenArriba }}>
        <div className="flex items-center gap-1.5">
          <Marca clase="h-[18px] w-[18px]" sobreOscuro />
          <span className="text-[10px] font-bold tracking-tight">{d.x.menus.nombreApp}</span>
        </div>
        <p className="mt-7 font-titulo text-[21px] font-extrabold leading-[1.1] tracking-tight">
          {d.titular}{' '}
          <span className="bg-gradient-to-r from-menta to-menta-suave bg-clip-text text-transparent">{d.titularResaltado}</span>
          {d.titularCierre}
        </p>
        <span className="mt-4 block h-2 w-[86%] rounded-full bg-white/15" />
        <span className="mt-1.5 block h-2 w-[64%] rounded-full bg-white/15" />
        <span className="mt-5 block h-8 w-28 rounded-full bg-menta" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// iPHONE · SAFARI
// ---------------------------------------------------------------------------

/**
 * La barra de Safari, ABAJO: la píldora con la dirección y, al final, «···»
 * con un anillo punteado (los iOS nuevos esconden ahí el botón de
 * compartir); debajo, la fila de cinco botones con Compartir al medio.
 */
function BarraSafari({ d, anima, resaltado, toque }: {
  d: TextosDibujo;
  anima: boolean;
  resaltado: boolean;
  toque?: number;
}) {
  const m = d.x.menus;
  return (
    <div className="absolute inset-x-0 bottom-0 z-[2] border-t border-borde bg-superficie pb-[14px] pt-2 text-tinta">
      <div className="mx-3 flex h-8 items-center gap-1.5 rounded-xl bg-arena px-2.5">
        <span className="flex flex-1 items-center justify-center gap-1 text-[10.5px] font-semibold">
          <Candado />
          {m.direccion}
        </span>
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-dashed border-verde/60 text-[11px] font-bold leading-none text-tinta/70">
          ···
        </span>
      </div>
      <div className="mt-2 flex items-center justify-around px-3 text-tinta/70">
        <Glifo d="m14 6-6 6 6 6" />
        <Glifo d="m10 6 6 6-6 6" />
        <Control resaltado={resaltado} toque={toque} anima={anima} late={resaltado ? 0 : LATE} toca={500}>
          <span className="grid h-8 w-8 place-items-center"><IconoCompartir className="h-[18px] w-[18px]" /></span>
        </Control>
        <Glifo d="M4 5h5a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4zM20 5h-5a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h6z" />
        <Glifo d="M4 9h11v11H4zM9 9V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
      </div>
    </div>
  );
}

/** Un renglón de la hoja de compartir: ícono y texto. */
function Opcion({ icono, texto }: { icono: React.ReactNode; texto: string }) {
  return (
    <span className="flex h-9 w-full items-center gap-2.5 px-3 text-[10.5px] font-medium">
      <span className="shrink-0 opacity-80">{icono}</span>
      <span className="truncate">{texto}</span>
    </span>
  );
}

/** Cuánto baja la lista de compartir cuando «alguien desliza»: un renglón. */
const RENGLON = 36;

/**
 * La hoja de compartir de iOS: el encabezado con el ícono y la dirección, la
 * fila de cuatro círculos y la lista de opciones. Con `entra`, la hoja sube,
 * a los 0,4 s la lista baja un renglón (como quien desliza) y «Agregar a
 * inicio» queda resaltado. Sin `entra` es el fondo del paso siguiente: ya
 * deslizada, con el dedo en «Agregar a inicio» si se viene de ahí, y se va.
 */
function HojaCompartir({ d, anima, entra, toqueAnterior }: {
  d: TextosDibujo;
  anima: boolean;
  entra: boolean;
  toqueAnterior?: number;
}) {
  const m = d.x.menus;
  const seVa = !entra && anima ? 'escena-instalar-se-va' : '';
  const listaEstilo = entra
    ? ({ '--dy': `-${RENGLON}px`, animationDelay: `${ENTRA + 400}ms` } as React.CSSProperties)
    : { transform: `translateY(-${RENGLON}px)` };
  return (
    <>
      {entra && <Velo anima={anima} />}
      <div
        className={`absolute inset-x-0 bottom-0 z-[3] h-[300px] rounded-t-2xl bg-superficie text-tinta shadow-[0_-12px_30px_-12px_rgba(10,23,18,.4)] ${
          entra && anima ? 'portada-sube' : ''} ${seVa}`}
        style={{ animationDelay: `${ENTRA}ms` }}
      >
        <span className="mx-auto mt-2 block h-1 w-9 rounded-full bg-borde" />
        <div className="flex items-center gap-2 px-3.5 pt-2.5">
          <Marca clase="h-8 w-8 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-bold">{m.nombreApp}</span>
            <span className="block truncate text-[9.5px] text-tinta/50">{m.direccion}</span>
          </span>
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-arena text-[12px] leading-none text-tinta/60">×</span>
        </div>
        <div className="mt-3 flex justify-around border-y border-borde px-3 py-3">
          {[0, 1, 2, 3].map((i) => <span key={i} className="h-10 w-10 rounded-full bg-borde" />)}
        </div>
        {/* La lista: tres renglones a la vista; deslizada, «Agregar a inicio» queda al medio. */}
        <div className="mx-3 mt-3 overflow-hidden rounded-xl bg-arena" style={{ height: RENGLON * 3 }}>
          <div className={entra && anima ? 'portada-desliza' : ''} style={listaEstilo}>
            <Opcion icono={<Glifo className="h-4 w-4" d="M8 8h12v12H8zM16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />} texto={m.copiar} />
            <Opcion icono={<Glifo className="h-4 w-4" d="M4 5h5a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4zM20 5h-5a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h6z" />} texto={m.favoritos} />
            <Control resaltado={entra} toque={toqueAnterior} anima={anima} forma="rounded-lg" ancho late={ENTRA + 450} toca={ENTRA + 1100}>
              <Opcion icono={<IconoAgregar className="h-4 w-4" />} texto={m.agregarAInicio} />
            </Control>
            <Opcion icono={<Glifo className="h-4 w-4" d="M17.5 11a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0zM20 20l-4.5-4.5" />} texto={m.buscar} />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * La pantalla «Agregar a inicio» de iOS: Cancelar a la izquierda, el título
 * al medio y «Agregar» arriba a la derecha, resaltado; debajo, el ícono de
 * Orden con el nombre y la dirección.
 */
function HojaAgregar({ d, anima, entra, toqueAnterior }: {
  d: TextosDibujo;
  anima: boolean;
  entra: boolean;
  toqueAnterior?: number;
}) {
  const m = d.x.menus;
  return (
    <div
      className={`absolute inset-x-0 bottom-0 top-9 z-[4] rounded-t-2xl bg-superficie text-tinta ${
        entra && anima ? 'portada-sube' : ''} ${!entra && anima ? 'escena-instalar-se-va' : ''}`}
      style={{ animationDelay: `${ENTRA}ms` }}
    >
      <div className="flex items-center justify-between px-3.5 py-3 text-[11px]">
        <span className="text-tinta/60">{m.cancelar}</span>
        <span className="font-bold">{m.agregarAInicio}</span>
        <Control resaltado={entra} toque={toqueAnterior} anima={anima} late={ENTRA + 450} toca={ENTRA + 700}>
          <span className="px-2 py-1 text-[11px] font-bold">{m.agregar}</span>
        </Control>
      </div>
      <div className="mx-3.5 mt-2 flex items-center gap-3 rounded-xl bg-arena p-3">
        <Marca clase="h-12 w-12 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block border-b border-borde pb-1 text-[12px] font-semibold">{m.nombreApp}</span>
          <span className="mt-1 block truncate text-[9.5px] text-tinta/50">{m.direccion}</span>
        </span>
      </div>
      <span className="mx-3.5 mt-4 block h-2 w-[80%] rounded-full bg-borde" />
      <span className="mx-3.5 mt-1.5 block h-2 w-[55%] rounded-full bg-borde" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ANDROID · CHROME
// ---------------------------------------------------------------------------

/** La barra de Chrome, ARRIBA: la píldora con la dirección y los tres puntos a la derecha. */
function BarraChrome({ d, anima, resaltado, toque }: {
  d: TextosDibujo;
  anima: boolean;
  resaltado: boolean;
  toque?: number;
}) {
  const m = d.x.menus;
  return (
    <div className="absolute inset-x-0 top-9 z-[2] flex h-11 items-center gap-2 bg-superficie px-2.5 text-tinta">
      <span className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-arena px-3 text-[10.5px] font-semibold">
        <Candado />
        <span className="truncate">{m.direccion}</span>
      </span>
      <Control resaltado={resaltado} toque={toque} anima={anima} late={resaltado ? 0 : LATE} toca={500}>
        <span className="grid h-8 w-8 place-items-center text-tinta/80"><IconoMenu className="h-[18px] w-[18px]" /></span>
      </Control>
    </div>
  );
}

/** Un renglón del menú de Chrome. */
function Renglon({ icono, texto }: { icono?: React.ReactNode; texto: string }) {
  return (
    <span className="flex h-7 w-full items-center gap-2 px-2.5 text-[10px] font-medium">
      {icono && <span className="shrink-0 opacity-80">{icono}</span>}
      <span className="truncate">{texto}</span>
    </span>
  );
}

/**
 * El menú de los tres puntos, desplegado desde la esquina: la fila de
 * glifos y los renglones, con «Instalar aplicación» resaltado y, con anillo
 * punteado, «Agregar a pantalla de inicio»: así se llama en algunas
 * versiones (lo dice `android2`).
 */
function MenuChrome({ d, anima, entra, toqueAnterior }: {
  d: TextosDibujo;
  anima: boolean;
  entra: boolean;
  toqueAnterior?: number;
}) {
  const m = d.x.menus;
  return (
    <div
      className={`absolute right-2 top-10 z-[3] w-[168px] rounded-xl border border-borde bg-superficie p-1 text-tinta shadow-[0_18px_40px_-16px_rgba(10,23,18,.5)] ${
        entra && anima ? 'portada-despliega' : ''} ${!entra && anima ? 'escena-instalar-se-va' : ''}`}
      style={{ animationDelay: `${ENTRA}ms` }}
    >
      <div className="flex justify-around border-b border-borde px-1 pb-1.5 pt-1 text-tinta/60">
        <Glifo className="h-3.5 w-3.5" d="M5 12h14M13 6l6 6-6 6" />
        <Glifo className="h-3.5 w-3.5" d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />
        <Glifo className="h-3.5 w-3.5" d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        <Glifo className="h-3.5 w-3.5" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01" />
        <Glifo className="h-3.5 w-3.5" d="M19.5 12a7.5 7.5 0 1 1-2.3-5.4M19.5 4.5v4.5h-4.5" />
      </div>
      <div className="pt-1">
        <Renglon texto={m.nuevaPestania} />
        <Renglon texto={m.historial} />
        <Renglon texto={m.descargas} />
        <Control resaltado={entra} toque={toqueAnterior} anima={anima} forma="rounded-lg" ancho late={ENTRA + 350} toca={ENTRA + 600}>
          <Renglon icono={<IconoAgregar className="h-3.5 w-3.5" />} texto={m.instalarApp} />
        </Control>
        <span className="block rounded-lg border border-dashed border-verde/60">
          <Renglon texto={m.agregarPantalla} />
        </span>
        <Renglon texto={m.configuracion} />
      </div>
    </div>
  );
}

/** El cuadro de confirmación de Chrome: el ícono de Orden con el nombre y la dirección, Cancelar e Instalar. */
function DialogoInstalar({ d, anima, entra, toqueAnterior }: {
  d: TextosDibujo;
  anima: boolean;
  entra: boolean;
  toqueAnterior?: number;
}) {
  const m = d.x.menus;
  const seVa = !entra && anima ? 'escena-instalar-se-va' : '';
  return (
    <>
      {entra && <Velo anima={anima} />}
      <div
        className={`absolute inset-x-0 bottom-0 z-[4] rounded-t-2xl bg-superficie p-4 pb-6 text-tinta ${
          entra && anima ? 'portada-sube' : ''} ${seVa}`}
        style={{ animationDelay: `${ENTRA}ms` }}
      >
        <div className="flex items-center gap-3">
          <Marca clase="h-11 w-11 shrink-0" />
          <span className="min-w-0">
            <span className="block text-[12px] font-bold">{m.nombreApp}</span>
            <span className="block truncate text-[9.5px] text-tinta/50">{m.direccion}</span>
          </span>
        </div>
        <span className="mt-3 block h-2 w-[85%] rounded-full bg-borde" />
        <span className="mt-1.5 block h-2 w-[60%] rounded-full bg-borde" />
        <div className="mt-4 flex items-center justify-end gap-3 text-[11px] font-bold">
          <span className="px-2 text-tinta/60">{m.cancelar}</span>
          <Control resaltado={entra} toque={toqueAnterior} anima={anima} late={ENTRA + 450} toca={ENTRA + 700}>
            <span className="px-3.5 py-1.5">{m.instalar}</span>
          </Control>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// EL PASO 4: LA PANTALLA DE INICIO Y ORDEN ABIERTA
// ---------------------------------------------------------------------------

/** Un ícono cualquiera de la pantalla de inicio: un cuadrado y su nombre, sin marcas. */
function AppVacia({ conNombre = true }: { conNombre?: boolean }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="h-10 w-10 rounded-[11px] bg-white/10" />
      {conNombre && <span className="h-1.5 w-6 rounded-full bg-white/10" />}
    </span>
  );
}

/** Los mismos dibujos de la barra de abajo de la app (pantallas/Celular.tsx, que no los exporta), más chicos. */
const ICONO_BARRA: Record<'panel' | 'vender' | 'gastos' | 'cierre' | 'mas', JSX.Element> = {
  panel: <><path d="M3 12l9-8 9 8" /><path d="M5 10.5V20h14v-9.5" /><path d="M9.5 20v-5h5v5" /></>,
  vender: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v9M14.8 9.6c-.5-.8-1.5-1.3-2.8-1.3-1.6 0-2.7.8-2.7 2 0 2.8 5.6 1.4 5.6 4.2 0 1.2-1.2 2-2.9 2-1.4 0-2.4-.5-2.9-1.4" /></>,
  gastos: <><path d="M3.5 7.5h17v11a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" /><path d="M3.5 7.5 6 4h12l2.5 3.5M9 12h6" /></>,
  cierre: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></>,
  mas: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
};

/** Cuándo se abre Orden desde el ícono, en ms desde que se muestra el paso 4. */
const ABRE = 1300;

/**
 * Orden abierta a pantalla completa, SIN la barra del navegador: la pantalla
 * real del panel de la vitrina (Perfumería Aurora: «Te quedó hoy» con sus
 * tres filas, «Lo cargaste así», lo que está por acabarse) con el botón del
 * micrófono y la barra de vidrio. Con movimiento, crece desde el lugar del
 * ícono; sin movimiento, ya está abierta.
 */
function AppAbierta({ d, anima }: { d: TextosDibujo; anima: boolean }) {
  const p = d.v.pantallas.comercio;
  const b = d.v.barra;
  const items: { icono: keyof typeof ICONO_BARRA; texto: string }[] = [
    { icono: 'panel', texto: b.panel }, { icono: 'vender', texto: b.vender }, { icono: 'gastos', texto: b.gastos },
    { icono: 'cierre', texto: b.cierre }, { icono: 'mas', texto: b.mas },
  ];
  return (
    <div
      className={`absolute inset-0 z-[5] overflow-hidden bg-arena text-tinta ${anima ? 'portada-cae' : ''}`}
      // El origen es el lugar del ícono de Orden en la grilla: de ahí se abre.
      style={{ animationDelay: `${ABRE}ms`, transformOrigin: '17% 64%' }}
    >
      <BarraEstado sobreOscuro={false} />
      <div className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <Marca clase="h-5 w-5 shrink-0" />
          <span className="truncate text-[11px] font-bold tracking-tight">{p.negocio}</span>
        </span>
        <span className="shrink-0 text-[9.5px] font-semibold text-tinta/60">{d.v.hoy}</span>
      </div>
      <div className="space-y-2 px-2.5 pb-24">
        <div className="tarjeta p-3">
          <p className="text-[8.5px] font-bold uppercase tracking-[.14em] text-tinta/60">{p.teQuedoHoy}</p>
          <p className="mt-1 font-titulo text-[22px] font-extrabold leading-none tracking-tight tabular-nums text-verde-fuerte">{p.monto}</p>
          <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-verde-claro px-1.5 py-0.5 text-[9px] font-bold text-verde-fuerte">
            {p.variacion} <span className="font-medium text-tinta/60">{p.comparado}</span>
          </p>
          <dl className="mt-2.5 space-y-1 border-t border-borde pt-2">
            {p.filas.map((f) => (
              <div key={f.etiqueta} className="flex items-baseline justify-between gap-2 text-[10px]">
                <dt className="font-semibold text-tinta/60">{f.etiqueta}</dt>
                <dd className={`font-bold tabular-nums ${f.tono === 'malo' ? 'text-rojo' : 'text-tinta'}`}>{f.valor}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="tarjeta p-3">
          <p className="text-[8.5px] font-bold uppercase tracking-[.14em] text-tinta/60">{p.loCargasteAsi}</p>
          <p className="mt-1.5 text-[10px] font-medium leading-snug text-tinta/75">{p.dictado}</p>
          <p className="mt-2 flex items-center gap-1 border-t border-borde pt-1.5 text-[9.5px] font-semibold text-verde-fuerte">
            <Tilde className="h-3 w-3" />
            {p.cargado}
          </p>
        </div>
        <div className="tarjeta p-3">
          <p className="text-[10px] font-bold tracking-tight">{p.porAcabarse}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {p.stock.map((s) => (
              <span key={s} className="pastilla bg-ambar-claro px-1.5 py-0.5 text-[8.5px] text-ambar">{s}</span>
            ))}
          </div>
        </div>
      </div>
      {/* Lo que sigue pasa por detrás de la barra, desvanecido; el botón verde de la captura; la barra de vidrio. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-arena via-arena/70 to-arena/0" />
      <span className="absolute bottom-[60px] right-3 grid h-9 w-9 place-items-center rounded-full bg-verde text-sobre-verde shadow-[0_10px_24px_-6px_rgba(40,180,100,.7)]">
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden {...TRAZO} strokeWidth={2}>
          <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
          <path d="M18.5 11.5A6.5 6.5 0 0 1 5.5 11.5M12 18v3" />
        </svg>
      </span>
      <div className="barra-vidrio absolute inset-x-2 bottom-3 grid grid-cols-5 rounded-full px-1 py-1">
        {items.map((it, i) => (
          <span
            key={it.icono}
            className={`flex min-w-0 flex-col items-center gap-0.5 rounded-full px-0.5 py-1 text-[7.5px] font-semibold leading-none ${
              i === 0 ? 'bg-verde/15 text-verde-fuerte' : 'text-tinta/60'}`}
          >
            <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" aria-hidden {...TRAZO} strokeWidth={1.7}>{ICONO_BARRA[it.icono]}</svg>
            <span className="max-w-full truncate">{it.texto}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * La pantalla de inicio del teléfono: fondo noche con el resplandor, una
 * grilla de íconos sin marcas y el ícono real de Orden (la `Marca`, la misma
 * del manifest) que cae en el primer lugar libre con su nombre debajo,
 * resaltado. Con movimiento, a los 1,3 s el dedo lo toca y Orden se abre
 * desde ahí a pantalla completa. Con `entra` (se viene del paso anterior)
 * la pantalla se enciende después del dedo sobre «Agregar» / «Instalar».
 */
function PantallaInicio({ d, anima, entra }: { d: TextosDibujo; anima: boolean; entra: boolean }) {
  const m = d.x.menus;
  return (
    <div
      // Con su propio z-index: cuando se viene del paso 3, la página y la barra del navegador quedan debajo.
      className={`absolute inset-0 z-[5] overflow-hidden bg-noche text-white ${entra && anima ? 'portada-enciende' : ''}`}
      style={{ animationDelay: `${ENTRA}ms` }}
    >
      <span
        aria-hidden
        className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: RESPLANDOR }}
      />
      <BarraEstado sobreOscuro />
      <div className="relative grid grid-cols-4 gap-x-2 gap-y-3 px-5 pt-3">
        {Array.from({ length: 12 }, (_, i) => <AppVacia key={i} />)}
        <span className="flex flex-col items-center gap-1">
          {/* El ícono cae con su anillo y su halo; después late, y el dedo lo toca antes de que Orden se abra. */}
          <span className={`inline-flex ${anima ? 'portada-cae' : ''}`} style={{ animationDelay: `${ENTRA + 250}ms` }}>
            <Control resaltado anima={anima} anilloAfuera forma="rounded-[11px]" late={ENTRA + 700} toca={ABRE - 250}>
              <Marca clase="h-10 w-10" />
            </Control>
          </span>
          <span className="text-[8.5px] font-medium leading-none">{m.nombreApp}</span>
        </span>
        {Array.from({ length: 3 }, (_, i) => <AppVacia key={`b-${i}`} />)}
      </div>
      <div className="absolute inset-x-3 bottom-4 flex justify-around rounded-2xl bg-white/10 px-2 py-2.5">
        {Array.from({ length: 4 }, (_, i) => <AppVacia key={i} conNombre={false} />)}
      </div>
      <AppAbierta d={d} anima={anima} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// EL CUADRO ENTERO
// ---------------------------------------------------------------------------

/**
 * La pila de capas de un paso. El paso anterior solo se dibuja debajo
 * cuando se llega con «Siguiente» y hay movimiento: ahí el dedo lo toca y
 * la capa se va; en los demás casos (ir atrás, saltar a un punto, reducir
 * movimiento, el cuadro inicial) el paso aparece armado.
 */
export function PantallaPaso({ c, d }: { c: Cuadro; d: TextosDibujo }): JSX.Element {
  const { sistema, paso, anima, desdeAnterior } = c;
  const conAnterior = anima && desdeAnterior;
  const toqueAnterior = conAnterior ? 0 : undefined;
  const iphone = sistema === 'iphone';

  // La página y la barra del navegador están en todos los pasos menos en el
  // último, donde se ve la pantalla de inicio (y, si se viene del paso 3,
  // la hoja o el diálogo que el dedo acaba de tocar).
  const fondo = iphone ? (
    <>
      <PaginaOrden d={d} margenArriba={10} />
      <BarraSafari d={d} anima={anima} resaltado={paso === 1} toque={paso === 2 ? toqueAnterior : undefined} />
    </>
  ) : (
    <>
      <PaginaOrden d={d} margenArriba={52} />
      <BarraChrome d={d} anima={anima} resaltado={paso === 1} toque={paso === 2 ? toqueAnterior : undefined} />
    </>
  );

  if (paso === 4) {
    return (
      <>
        {conAnterior && fondo}
        {conAnterior && (iphone
          ? <HojaAgregar d={d} anima={anima} entra={false} toqueAnterior={0} />
          : <DialogoInstalar d={d} anima={anima} entra={false} toqueAnterior={0} />)}
        <PantallaInicio d={d} anima={anima} entra={conAnterior} />
      </>
    );
  }

  return (
    <>
      {fondo}
      {paso === 2 && (iphone
        ? <HojaCompartir d={d} anima={anima} entra />
        : <MenuChrome d={d} anima={anima} entra />)}
      {paso === 3 && iphone && (
        <>
          {conAnterior && <HojaCompartir d={d} anima={anima} entra={false} toqueAnterior={0} />}
          <HojaAgregar d={d} anima={anima} entra />
        </>
      )}
      {paso === 3 && !iphone && (
        <>
          {conAnterior && <MenuChrome d={d} anima={anima} entra={false} toqueAnterior={0} />}
          <DialogoInstalar d={d} anima={anima} entra />
        </>
      )}
    </>
  );
}
