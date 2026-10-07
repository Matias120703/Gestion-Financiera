'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Rico } from '@/components/Rico';
import { Tilde } from '@/components/portada/pantallas/Celular';
import {
  Anuncio, Avatar, Billete, Contador, ControlEscena, FiguraCelular, Globo, IconoWhatsApp, Pestanias,
  SeccionEscena, Toque, useAlVerse, useSecuencia,
} from '@/components/portada/escenas/base';
import { useLocale, useTextos } from '@/i18n/cliente';
import { recomendarEs, recomendarPt, type TextosRecomendar } from '@/i18n/textos/escenas/recomendar';
import { vitrinaEs, vitrinaPt } from '@/i18n/textos/vitrina';
import { precio } from '@/lib/formato';

/**
 * LA ESCENA «RECOMENDAR» (02/10/2026): «Traé a alguien y llevate la mitad».
 *
 * Una tira con tres viñetas y dos carriles entre ellas:
 *   1 · Vos: la tarjeta real «Tu enlace» de Invitaciones y el mensaje de
 *       WhatsApp ya escrito, que sale como un globo.
 *   2 · El que entra (la barbería de la vitrina, o «Caro» si el plan es el
 *       de la cuenta personal): primero «Probando gratis», más adelante
 *       «Pagó su primer mes» con su plan y un billete con el precio de lista.
 *   3 · Vos, otra vez: el aviso real del panel («… pagó su primer mes. Te
 *       tocan …») y el cuadro «Tu saldo» con la mitad.
 * Por el carril 1 viaja el globo; por el 2, la mitad del billete. Debajo de
 * cada viñeta va su paso, en texto real.
 *
 * Lo que llega es un SALDO, nunca una transferencia recibida: así funciona
 * la app (saldo y después «Cobrar»). Sin bancos, sin pasarelas, sin cantidad
 * de socios. Ningún precio escrito: los planes con su precio de lista y su
 * mitad llegan por props desde page.tsx, que es el único lugar que calcula
 * «/ 2». Los chips «¿Con qué plan entra?» cambian el plan de la viñeta 2 y
 * los importes de la 3, que ruedan del valor anterior al nuevo.
 *
 * Cómo se mueve: el HTML del servidor es el cuadro final, completo y quieto
 * (también con «reducir movimiento»). Al verse por primera vez corre UNA
 * entrada de 4,9 s —cuatro cuadros, ver DURACIONES— y queda terminada.
 * Lo que todavía no llegó no se desmonta: queda en su lugar con opacidad 0,
 * así cada viñeta mide siempre lo mismo y la página no salta. Las viñetas
 * son decorativas para el lector de pantalla (el resumen va en un `sr-only`
 * antes de la tira); los pasos, los chips, el botón y el <details> son
 * texto y controles reales.
 */

/**
 * Los cuatro cuadros de la entrada, en ms (el último es el final):
 *   0 · 0,0 s  se enciende la viñeta 1; a 0,5 el dedo toca «Mandar por
 *              WhatsApp»; a 0,8 sale el globo con el mensaje
 *   1 · 1,3 s  el globo, chico, cruza el carril 1; a 0,6 se enciende la
 *              viñeta 2 con «Probando gratis»; a 0,9 «Más adelante · Pagó su
 *              primer mes» con el plan; a 1,0 cae el billete
 *   2 · 3,0 s  el billete se parte; a 0,4 una mitad cruza el carril 2 y la
 *              otra queda apagada; a 1,0 se enciende la viñeta 3: entran el
 *              aviso y «Tu saldo», que sube de cero a la mitad (700 ms)
 *   3 · 4,9 s  las tres encendidas, terminada
 */
const DURACIONES: (number | null)[] = [1300, 1700, 1900, 0];
const CUADRO = { manda: 0, entra: 1, paga: 2, final: 3 } as const;

/** Un plan de ejemplo, como lo arma page.tsx: precio de lista mensual en PYG y su mitad (o null si no hay precio). */
export type PlanDeEjemplo = {
  clave: 'basico' | 'pro' | 'negocio' | 'personal';
  nombre: string;
  lista: number | null;
  mitad: number | null;
};

type PlanConPrecio = PlanDeEjemplo & { lista: number; mitad: number };

const TRAZO = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/** El signo de plata del aviso real (components/AvisoComision.tsx, que no lo exporta). */
const SIGNO_PLATA = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden {...TRAZO}>
    <path d="M12 7.5v9M14.8 9.6c-.5-.8-1.5-1.3-2.8-1.3-1.6 0-2.7.8-2.7 2 0 2.8 5.6 1.4 5.6 4.2 0 1.2-1.2 2-2.9 2-1.4 0-2.4-.5-2.9-1.4" />
  </svg>
);

/**
 * Lo que esta escena mueve y la base no tiene: dónde arranca y hasta dónde
 * va el viajero del carril (vertical a 375 px, horizontal desde `lg`), y el
 * billete que se parte en dos. Mismas reglas que las clases `portada-*`:
 * solo `transform` y `opacity`, animan solo sin «reducir movimiento», y el
 * estado natural es el final.
 *
 * El final de la mitad que se fue es un HUECO: el contorno punteado de la
 * mitad, vacío, del color de la tarjeta. Con la mitad apagada al 40 % (como
 * estaba) el importe quedaba cortado por la mitad y a medio ver, y parecía
 * un error de dibujo. El hueco es una capa `::after` encima de la mitad que
 * la tapa; lo que se anima es su opacidad (aparece cuando la media plata ya
 * salió), nunca el fondo.
 */
const CSS = `
.escena-recomendar-viajero { position: absolute; left: 50%; top: -16px; margin-left: -24px; --dx: 0px; --dy: 40px; }
@media (min-width: 1024px) {
  .escena-recomendar-viajero { left: -24px; top: 50%; margin-left: 0; margin-top: -24px; --dx: 56px; --dy: 0px; }
}
.escena-recomendar-mitad-izq { transform: translateX(-2px); }
.billete-derecha.escena-recomendar-mitad-der { transform: translateX(8px); border-style: dashed; border-left-width: 1px; }
.escena-recomendar-mitad-der::after { content: ''; position: absolute; inset: 0; background: rgb(var(--superficie)); }
@keyframes escena-recomendar-parte-izq {
  0% { transform: none; } 60% { transform: translateX(-5px) scale(1.06); } 100% { transform: translateX(-2px); }
}
@keyframes escena-recomendar-parte-der {
  0% { transform: none; } 30% { transform: translateX(10px) scale(1.06); } 100% { transform: translateX(8px); }
}
@keyframes escena-recomendar-hueco { 0%, 45% { opacity: 0; } 100% { opacity: 1; } }
@media (prefers-reduced-motion: no-preference) {
  .escena-recomendar-parte .escena-recomendar-mitad-izq { animation: escena-recomendar-parte-izq .5s ease-out both; }
  .escena-recomendar-parte .escena-recomendar-mitad-der { animation: escena-recomendar-parte-der 1.1s ease-out both; }
  .escena-recomendar-parte .escena-recomendar-mitad-der::after { animation: escena-recomendar-hueco 1.1s ease-out both; }
}
`;

export function EscenaRecomendar({ idioma, diasNegocio, diasPersonal, planes }: {
  idioma: 'es' | 'pt';
  /** DIAS_DE_PRUEBA.emprendedor: los días de prueba del negocio que entra. */
  diasNegocio: number;
  /** DIAS_DE_PRUEBA.personal. Si no llega, con el plan personal la pastilla dice «Probando gratis» sin días (no se inventa). */
  diasPersonal?: number;
  /** Los planes con su precio de lista mensual y su mitad, armados en page.tsx. Sin precio, el plan no tiene chip. */
  planes: PlanDeEjemplo[];
}): JSX.Element {
  const x: TextosRecomendar = idioma === 'pt' ? recomendarPt : recomendarEs;
  const v = idioma === 'pt' ? vitrinaPt : vitrinaEs;
  const t = useTextos();
  const r = t.recomendar;
  const locale = useLocale();

  const { ref, visto, reducido } = useAlVerse<HTMLElement>();
  const s = useSecuencia(DURACIONES, { arranca: visto && !reducido, inicial: CUADRO.final, reducido });

  const conPrecio = planes.filter((p): p is PlanConPrecio => p.lista !== null && p.mitad !== null);
  // Arranca en Pro (el plan del medio, el de la barbería de la vitrina).
  const [clave, setClave] = useState<PlanDeEjemplo['clave']>(
    () => (conPrecio.some((p) => p.clave === 'pro') ? 'pro' : conPrecio[0]?.clave ?? 'pro'),
  );
  const planActual = conPrecio.find((p) => p.clave === clave) ?? conPrecio[0] ?? null;
  // Al cambiar de chip, el saldo rueda del importe anterior al nuevo (y el billete y el aviso «se aprietan»).
  const [rodar, setRodar] = useState<{ desde: number } | null>(null);
  const [anuncio, setAnuncio] = useState('');

  // En el cuadro final (servidor, sin JavaScript, reducir movimiento) no hay
  // ninguna clase de animación: la tira está completa y quieta.
  const anima = s.estado !== 'final';
  const plata = (n: number) => precio(n, 'PYG', locale);

  const personal = planActual?.clave === 'personal';
  const amigo = personal ? x.amigo.personal : x.amigo.negocio;
  const inicialAmigo = personal ? x.amigo.inicialPersonal : x.amigo.inicial;
  const dias = personal ? diasPersonal : diasNegocio;
  const enlace = x.enlace(x.codigo);
  const importeLista = planActual ? plata(planActual.lista) : '';
  const importeMitad = planActual ? plata(planActual.mitad) : x.sinImporte;

  const cambiarPlan = (nueva: PlanDeEjemplo['clave']) => {
    const nuevo = conPrecio.find((p) => p.clave === nueva);
    if (!nuevo) return;
    setRodar({ desde: planActual?.mitad ?? 0 });
    setClave(nueva);
    setAnuncio(x.cambiado(nuevo.nombre, plata(nuevo.mitad)));
  };
  const repetir = () => {
    setRodar(null);
    setAnuncio('');
    s.repetir();
  };

  /** Las piezas que llegan cuadro por cuadro, con el cuadro actual y si la escena corre. */
  const llega = { cuadro: s.cuadro, anima };
  const saldoEntra = anima && s.cuadro === CUADRO.paga;
  /** Al cambiar de chip, lo que cambia de importe se remonta y «se aprieta». */
  const pop = rodar ? 'portada-pop' : '';

  const titulo = resaltar(x.titulo, x.tituloResaltado);

  const cabecera = (
    <div className="mx-auto max-w-3xl">
      {conPrecio.length >= 2 && (
        <>
          <p className="mb-2.5 text-center text-[13px] font-semibold text-tinta/55">{x.conQuePlan}</p>
          <Pestanias
            etiqueta={x.conQuePlan}
            opciones={conPrecio.map((p) => ({ clave: p.clave, texto: p.nombre }))}
            valor={clave}
            onCambio={cambiarPlan}
            className="justify-center"
          />
        </>
      )}
      <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link href="/crear" className="boton-principal min-h-[48px] px-6 text-[15px]">
          {x.empezarPrueba}
        </Link>
        <span className="text-center text-[13px] font-medium text-tinta/45">{x.tuEnlaceAdentro}</span>
      </div>
    </div>
  );

  // ---- Viñeta 1: vos, con la tarjeta real «Tu enlace» y el mensaje que sale ----
  const vineta1 = (
    <Vineta encendida className="lg:col-start-1 lg:row-start-1">
      <Avatar inicial={x.inicialVos} nombre={x.vos} tono="menta" />
      {/* La tarjeta «Compartir» de PantallaRecomendar.tsx, con sus clases y sus textos. */}
      <div className="mt-3 rounded-2xl border border-borde bg-superficie p-3">
        <p className="text-[12.5px] font-semibold text-tinta/70">{r.tuEnlace}</p>
        <p className="mt-1 truncate rounded-xl bg-arena px-2.5 py-2 text-[12px] font-semibold">{enlace}</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <span className="boton-suave min-h-[36px] px-2 py-1.5 text-[12px]">{r.copiarEnlace}</span>
          <span className="boton-principal relative min-h-[36px] gap-1.5 px-2 py-1.5 text-[12px]">
            <IconoWhatsApp className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{r.mandarPorWhatsApp}</span>
            {anima && s.cuadro === CUADRO.manda && <Toque key={`toque-${s.pasada}`} x="50%" y="50%" retraso={500} />}
          </span>
        </div>
      </div>
      {/* El mensaje ya escrito, tal cual lo manda la app, como un globo de WhatsApp. */}
      <Llega {...llega} cuando={CUADRO.manda} clase="portada-sube" retraso={800} className="mt-3">
        <Globo tono="whatsapp" cola="izquierda" className="ml-1.5">{r.mensajeWhatsApp(enlace)}</Globo>
      </Llega>
    </Vineta>
  );

  // ---- Viñeta 2: el que entra, primero probando y más adelante pagando ----
  // Entero lleva el precio de lista; partido va sin número: cortado por la
  // mitad, «Gs. 19|0.000» se leía como un error de dibujo. El importe ya
  // está al lado, en el renglón del plan, y la mitad en «Tu saldo».
  const billete = s.cuadro >= CUADRO.paga ? (
    <span className={anima && s.cuadro === CUADRO.paga ? 'escena-recomendar-parte inline-block' : 'inline-block'}>
      <Billete
        importe=""
        partido
        mitades={{
          izquierda: { className: 'escena-recomendar-mitad-izq' },
          derecha: { className: 'escena-recomendar-mitad-der' },
        }}
      />
    </span>
  ) : (
    <Billete importe={importeLista} />
  );

  const vineta2 = (
    <Vineta encendida={s.cuadro >= CUADRO.entra} retraso={600} className="lg:col-start-3 lg:row-start-1">
      <Avatar inicial={inicialAmigo} nombre={amigo} />
      <Llega {...llega} cuando={CUADRO.entra} clase="portada-enciende" retraso={600} className="mt-3">
        <span className="pastilla bg-arena text-tinta/60">{dias ? x.probando(dias) : x.probandoSinDias}</span>
      </Llega>
      <Llega {...llega} cuando={CUADRO.entra} clase="portada-sube" retraso={900} className="mt-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-tinta/45">{x.masAdelante}</p>
        <div className="mt-1.5 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="pastilla bg-verde-claro text-verde-fuerte">
              <Tilde className="h-3.5 w-3.5" />
              {x.pagoPrimerMes}
            </span>
            <p key={clave} className={`mt-1.5 text-[12.5px] font-semibold leading-snug text-tinta/70 ${pop}`}>
              {planActual ? x.plan(planActual.nombre, importeLista) : x.sinImporte}
            </p>
          </div>
          <Llega {...llega} cuando={CUADRO.entra} clase="portada-cae" retraso={1000} className="shrink-0">
            <span key={clave} className={`inline-block ${pop}`}>{billete}</span>
          </Llega>
        </div>
      </Llega>
    </Vineta>
  );

  // ---- Viñeta 3: vos otra vez, con el aviso real del panel y «Tu saldo» ----
  const vineta3 = (
    <Vineta encendida={s.cuadro >= CUADRO.paga} retraso={1000} className="lg:col-start-5 lg:row-start-1">
      <Avatar inicial={x.inicialVos} nombre={x.vosOtraVez} tono="menta" />
      {/* El aviso de components/AvisoComision.tsx, con sus clases y sus textos. */}
      <Llega {...llega} cuando={CUADRO.paga} clase="portada-enciende" retraso={1000} className="mt-3">
        <div className="flex items-start gap-2.5 rounded-2xl border border-verde/30 bg-verde-claro/40 p-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-verde text-sobre-verde">{SIGNO_PLATA}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-bold leading-snug">{r.pagoSuPrimerMes(amigo)}</p>
            <p key={clave} className={`mt-0.5 text-[12.5px] leading-snug text-tinta/65 ${pop}`}>
              <Rico texto={r.teTocan(importeMitad)} negrita="text-tinta" />
            </p>
            <p className="mt-2 text-[12px] font-semibold text-verde-fuerte">{r.verMisReferidos}</p>
          </div>
        </div>
      </Llega>
      {/* El cuadro «Tu saldo» de PantallaRecomendar.tsx; el importe sube de cero al verse y rueda al cambiar de chip. */}
      <Llega {...llega} cuando={CUADRO.paga} clase="portada-enciende" retraso={1000} className="mt-3">
        <div className="rounded-2xl border border-borde bg-superficie p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta/45">{r.tuSaldo}</p>
          <p className="mt-1.5 text-[20px] font-bold leading-none">
            {planActual ? (
              <Contador
                hasta={planActual.mitad}
                desde={saldoEntra ? 0 : rodar?.desde ?? 0}
                ms={saldoEntra ? 700 : 350}
                retraso={saldoEntra ? 1000 : 0}
                activo={saldoEntra || rodar !== null}
                formato={plata}
                className="text-verde-fuerte"
              />
            ) : (
              <span className="text-verde-fuerte">—</span>
            )}
          </p>
          <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">{r.paraRetirar}</p>
        </div>
      </Llega>
    </Vineta>
  );

  // ---- Los dos carriles con sus viajeros: el globo chico y la media plata ----
  const viajero1 = anima && s.cuadro === CUADRO.entra && (
    <span key={`globo-${s.pasada}`} className="escena-recomendar-viajero h-12 w-12">
      <span className="portada-viaja grid h-12 w-12 place-items-center">
        <span className="relative grid h-10 w-10 place-items-center rounded-2xl bg-verde-claro text-verde-fuerte shadow-md ring-1 ring-verde/30">
          <IconoWhatsApp className="h-5 w-5" />
          <span className="absolute -bottom-1 left-2.5 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-verde-claro" />
        </span>
      </span>
    </span>
  );
  const viajero2 = anima && s.cuadro === CUADRO.paga && (
    <span key={`mitad-${s.pasada}`} className="escena-recomendar-viajero h-12 w-12">
      <span className="portada-viaja block h-12 w-12 overflow-hidden drop-shadow-md" style={{ animationDelay: '400ms' }}>
        {/* Solo la mitad derecha del billete (sin número, como la que queda): la izquierda no se dibuja y la caja de 48 px recorta el resto. */}
        <Billete importe="" partido mitades={{ izquierda: { className: 'hidden' } }} />
      </span>
    </span>
  );

  const figura = (
    <FiguraCelular leyenda={v.datosDeEjemplo}>
      <style>{CSS}</style>
      {/* Para el que escucha de corrido: la tira en una frase; las viñetas son decorado y los pasos, texto real. */}
      <p className="sr-only">{x.resumen}</p>
      <div className="rounded-3xl bg-arena p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-y-3 lg:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)_56px_minmax(0,1fr)] lg:gap-y-5">
          {vineta1}
          <Paso numero="1" titulo={x.pasos[0].titulo} texto={x.pasos[0].texto} className="lg:col-start-1 lg:row-start-2" />
          <Carril className="lg:col-start-2 lg:row-start-1">{viajero1}</Carril>
          {vineta2}
          <Paso numero="2" titulo={x.pasos[1].titulo} texto={x.pasos[1].texto} className="lg:col-start-3 lg:row-start-2" />
          <Carril className="lg:col-start-4 lg:row-start-1">{viajero2}</Carril>
          {vineta3}
          <Paso numero="3" titulo={x.pasos[2].titulo} texto={x.pasos[2].texto} className="lg:col-start-5 lg:row-start-2" />
        </div>
      </div>
    </FiguraCelular>
  );

  const aparte = (
    <>
      <details className="tarjeta mx-auto max-w-3xl px-4 py-1">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-[14.5px] font-semibold [&::-webkit-details-marker]:hidden">
          {x.condiciones}
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-tinta/45" aria-hidden {...TRAZO}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <p className="pb-3 pt-1 text-[14px] leading-relaxed text-tinta/65">
          <Rico texto={t.portada.recomendarBajada} negrita="text-tinta" />
        </p>
        <p className="pb-4 text-[13.5px] leading-relaxed text-tinta/50">{t.portada.recomendarLetraChica}</p>
      </details>
      <Anuncio texto={anuncio} />
    </>
  );

  return (
    <SeccionEscena
      id="recomendar"
      refSeccion={ref}
      fondo="clara"
      hoja
      lado="centrado"
      etiqueta={x.etiqueta}
      titulo={titulo}
      tituloId="titulo-recomendar"
      apoyo={x.apoyo}
      cabecera={cabecera}
      figura={figura}
      controles={(
        <ControlEscena
          estado={s.estado}
          onPausar={s.pausar}
          onSeguir={s.seguir}
          onRepetir={repetir}
          textos={{ pausar: x.pausar, seguir: x.seguir, verDeNuevo: x.verDeNuevo }}
          oculto={reducido}
        />
      )}
      aparte={aparte}
    />
  );
}

// ---------------------------------------------------------------------------
// AYUDANTES PRIVADOS DE LA ESCENA
// ---------------------------------------------------------------------------

/** El título con una parte en verde (la parte tiene que estar adentro del título, letra por letra). */
function resaltar(titulo: string, parte: string): React.ReactNode {
  const i = titulo.indexOf(parte);
  if (i < 0) return titulo;
  return (
    <>
      {titulo.slice(0, i)}
      <span className="text-verde-fuerte">{parte}</span>
      {titulo.slice(i + parte.length)}
    </>
  );
}

/**
 * Una viñeta de la tira: una tarjeta que está encendida o apagada (al 45 %).
 * Encenderse es un fundido de opacidad, con el retraso del guion; apagarse
 * (al ver de nuevo) es inmediato. Decorativa para el lector de pantalla.
 */
function Vineta({ encendida, retraso = 0, className = '', children }: {
  encendida: boolean;
  retraso?: number;
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div
      aria-hidden
      className={`tarjeta relative p-3.5 transition-opacity duration-500 motion-reduce:transition-none ${
        encendida ? 'opacity-100' : 'opacity-[.45]'} ${className}`}
      style={{ transitionDelay: encendida ? `${retraso}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}

/**
 * Una pieza que llega en el cuadro `cuando`. Antes queda en su lugar con
 * opacidad 0 (la viñeta mide siempre lo mismo); en su cuadro, con la escena
 * corriendo, entra con la clase `portada-*` que se le pide y su retraso;
 * después (o en el cuadro final) está quieta y completa.
 */
function Llega({ cuando, cuadro, anima, clase, retraso = 0, className = '', children }: {
  cuando: number;
  cuadro: number;
  anima: boolean;
  clase: string;
  retraso?: number;
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  if (cuadro < cuando) return <div className={`opacity-0 ${className}`}>{children}</div>;
  if (anima && cuadro === cuando) {
    return <div className={`${clase} ${className}`} style={{ animationDelay: `${retraso}ms` }}>{children}</div>;
  }
  return <div className={className}>{children}</div>;
}

/**
 * El carril entre dos viñetas: una línea punteada con una punta de flecha,
 * vertical a 375 px (56 px de alto) y horizontal desde `lg` (56 px de ancho,
 * del alto de la fila). Por encima de las viñetas (`z-10`) para que el
 * viajero asome sobre sus bordes.
 */
function Carril({ className = '', children }: { className?: string; children?: React.ReactNode }): JSX.Element {
  return (
    <div aria-hidden className={`relative z-10 h-14 lg:h-auto lg:w-14 lg:self-stretch ${className}`}>
      <span className="absolute inset-y-0 left-1/2 border-l border-dashed border-borde lg:inset-x-0 lg:inset-y-auto lg:left-0 lg:top-1/2 lg:border-l-0 lg:border-t" />
      <span className="absolute bottom-0.5 left-1/2 -ml-1 h-2 w-2 rotate-45 border-b border-r border-borde lg:bottom-auto lg:left-auto lg:right-0.5 lg:top-1/2 lg:-mt-1 lg:ml-0 lg:-rotate-45" />
      {children}
    </div>
  );
}

/** Un paso debajo de su viñeta: número en círculo verde, título y texto. Texto real, fuera del decorado. */
function Paso({ numero, titulo, texto, className = '' }: {
  numero: string;
  titulo: string;
  texto: string;
  className?: string;
}): JSX.Element {
  return (
    <div className={`flex gap-3 px-1 ${className}`}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-verde text-[13px] font-black text-sobre-verde">
        {numero}
      </span>
      <div className="min-w-0">
        <p className="text-[14.5px] font-bold leading-snug tracking-tight">{titulo}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-tinta/55">{texto}</p>
      </div>
    </div>
  );
}
