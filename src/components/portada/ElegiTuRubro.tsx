'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { precio } from '@/lib/formato';
import { FICHA } from '@/i18n/idiomas';
import { PERSONAL, RUBROS, rubroVisible } from '@/lib/rubros';
import type { Rubro } from '@/lib/tipos';
import { vitrinaEs, vitrinaPt, type TextosVitrina } from '@/i18n/textos/vitrina';
import {
  CLAVES_VITRINA, claveConTecla, diasDePrueba, enlaceDePrueba, esClaveVitrina, planesDeLaVitrina,
  rachaDelDescuento, rubroDeClave, type ClaveVitrina, type PlanVitrina, type PrecioVitrina, type TarjetaPlan,
} from './vitrina-datos';
import { PantallaComercio } from './pantallas/Comercio';
import { PantallaServicios } from './pantallas/Servicios';
import { PantallaClases } from './pantallas/Clases';
import { PantallaEntrenamiento } from './pantallas/Entrenamiento';
import { PantallaCampo } from './pantallas/Campo';
import { PantallaGanaderia } from './pantallas/Ganaderia';
import { PantallaPersonal } from './pantallas/Personal';
import { Tilde } from './pantallas/Celular';

export type { ClaveVitrina, PrecioVitrina } from './vitrina-datos';

/**
 * «ORDEN SE TRANSFORMA SEGÚN LO QUE HACÉS» (portada, 24/09).
 *
 * Una fila de chips —Comercio, Servicios, Clases, Personal trainer, Campo,
 * Ganadería, Para vos— y al tocar uno cambia todo lo de abajo con un
 * fundido: el celular muestra la pantalla que ese rubro ve de verdad en
 * Orden, los tres beneficios son los suyos, y los planes y precios son SOLO
 * los que ese rubro puede comprar (ficha del rubro, 102). El botón de la
 * prueba lleva al alta con el rubro ya elegido.
 *
 * Es el único pedazo de cliente de la portada: lo demás es del servidor. Sin
 * JavaScript, o antes de hidratar, se ve entero el rubro inicial (comercio
 * en español, el campo en portugués), con sus precios y su botón.
 *
 * UNA SOLA FUENTE DE VERDAD DEL RUBRO ELEGIDO: el estado `clave`. El
 * celular, los beneficios, los planes y el enlace salen de ahí.
 *
 * Los precios, los días de prueba, la promo y el precio del vendedor llegan
 * por las props, leídos de la base por la página; acá no hay un solo importe
 * escrito a mano. Lo que se decide con ellos vive en `vitrina-datos.ts`,
 * que tiene su prueba.
 *
 * ACCESIBLE: los chips son un grupo de radio (flechas, Inicio y Fin; uno solo
 * entra en el orden del tabulador), el cambio se anuncia por `aria-live`, y
 * con «reducir movimiento» no hay ninguna animación.
 */
export function ElegiTuRubro(props: {
  idioma: 'es' | 'pt';
  inicial: ClaveVitrina;
  preciosPYG: PrecioVitrina[];
  referenciaUSD: PrecioVitrina[];
  diasPrueba: { negocio: number; personal: number };
  promo: { porcentaje: number; negocio: number; personal: number; constanciaPorcentaje: number; constanciaDias: number };
  precioPorVendedor: number | null;
  planesPorRubro: Record<ClaveVitrina, ('basico' | 'pro' | 'negocio')[]>;
}): JSX.Element {
  const { idioma, preciosPYG, referenciaUSD, diasPrueba, promo, precioPorVendedor, planesPorRubro } = props;
  const v: TextosVitrina = idioma === 'pt' ? vitrinaPt : vitrinaEs;
  const locale = FICHA[idioma === 'pt' ? 'pt' : 'es'].locale;

  const [clave, setClave] = useState<ClaveVitrina>(esClaveVitrina(props.inicial) ? props.inicial : 'comercio');
  const [anuncio, setAnuncio] = useState('');

  const idPregunta = useId();
  const chips = useRef<Partial<Record<ClaveVitrina, HTMLButtonElement | null>>>({});

  const rubro = v.rubros[clave];
  const dias = diasDePrueba(clave, diasPrueba);
  const enlace = enlaceDePrueba(clave);
  const tarjetas = planesDeLaVitrina(clave, { planesPorRubro, preciosPYG, referenciaUSD, precioPorVendedor });
  const ficha = clave === 'personal' ? PERSONAL : RUBROS[rubroDeClave(clave) as Rubro];
  const ejemplo = rubroVisible(ficha, idioma).ejemplo;

  function elegir(nueva: ClaveVitrina) {
    if (nueva === clave) return;
    setClave(nueva);
    setAnuncio(v.mostrando(v.rubros[nueva].chip));
  }

  function conTeclado(e: React.KeyboardEvent<HTMLButtonElement>) {
    const siguiente = claveConTecla(clave, e.key);
    if (!siguiente) return;
    e.preventDefault();
    elegir(siguiente);
    chips.current[siguiente]?.focus();
  }

  const importe = (n: number | null) => (n === null ? '—' : precio(n, 'PYG', locale));
  const hayEquipo = tarjetas.some((x) => x.plan !== 'basico') && clave !== 'personal';

  // Las condiciones ocupan las columnas que dejan libres los planes: con un
  // solo plan (profe, trainer, personal) van al lado, con tres van abajo.
  const anchoCondiciones = tarjetas.length === 1 ? 'md:col-span-2' : tarjetas.length === 2 ? 'md:col-span-1' : 'md:col-span-3';

  return (
    <div className="text-tinta">
      {/* ---------------- los chips ---------------- */}
      <p id={idPregunta} className="titulo-seccion">{v.pregunta}</p>
      {/* Los siete a la vista, en dos o tres renglones en el celular. Una fila
          que se desliza escondía la mitad: en portugués el chip inicial (el
          campo) quedaba afuera hasta que cargara el JavaScript. */}
      <div role="radiogroup" aria-labelledby={idPregunta} className="mt-2.5 flex flex-wrap gap-2">
        {CLAVES_VITRINA.map((c) => {
          const encendido = c === clave;
          return (
            <button
              key={c}
              ref={(el) => { chips.current[c] = el; }}
              type="button"
              role="radio"
              aria-checked={encendido}
              tabIndex={encendido ? 0 : -1}
              onClick={() => elegir(c)}
              onKeyDown={conTeclado}
              className={`${encendido ? 'chip-encendido shadow-[0_8px_20px_-10px_rgba(40,180,100,.8)]' : 'chip-apagado hover:border-verde/50 hover:text-tinta'}
                          whitespace-nowrap px-3.5 text-[13.5px] sm:px-4 sm:text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                          focus-visible:outline-verde-fuerte`}
            >
              {v.rubros[c].chip}
            </button>
          );
        })}
      </div>
      <p key={`para-${clave}`} className="mt-2 text-[13.5px] leading-snug text-tinta/60 motion-safe:animate-[aparecer_.35s_ease-out_both]">
        {ejemplo}
      </p>
      {/* Lo que oye un lector de pantalla al cambiar de chip. Vacío al cargar: no se anuncia lo que ya se ve. */}
      <p aria-live="polite" className="sr-only">{anuncio}</p>

      {/* ---------------- el celular y lo que gana ese rubro ---------------- */}
      <div className="mt-8 grid items-center gap-10 lg:mt-10 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-16">
        <figure className="overflow-x-clip px-1 pb-2 pt-4">
          <div key={`cel-${clave}`}>
            <Pantalla clave={clave} v={v} />
          </div>
          <figcaption className="mt-10 text-center text-[12px] font-medium text-tinta/60">{v.datosDeEjemplo}</figcaption>
        </figure>

        <div key={`rubro-${clave}`} className="motion-safe:animate-[aparecer_.4s_ease-out_both]">
          <h3 className="font-titulo text-[28px] font-extrabold leading-[1.08] tracking-tight sm:text-[34px] lg:text-[40px]">
            {rubro.titulo}
          </h3>
          <ul className="mt-6 space-y-3.5">
            {rubro.beneficios.map((b, i) => (
              <li
                key={b}
                className="flex items-start gap-3 text-[15.5px] leading-snug text-tinta/75 motion-safe:animate-[aparecer_.4s_ease-out_both]"
                style={{ animationDelay: `${120 + i * 80}ms` }}
              >
                <span className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full bg-verde-claro text-verde-fuerte">
                  <Tilde className="h-3.5 w-3.5" />
                </span>
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link href={enlace} className="boton-principal min-h-[48px] px-6 text-[15px]">
              {v.probar(dias)}
            </Link>
            <span className="text-center text-[13px] font-medium text-tinta/60 sm:text-left">{v.garantias}</span>
          </div>
        </div>
      </div>

      {/* ---------------- los planes de ESE rubro ---------------- */}
      <div id="precios" className="mt-14 scroll-mt-4">
        <h3 key={`titulo-${clave}`} className="text-[20px] font-bold tracking-tight">{v.cuantoCuesta(rubro.chip)}</h3>
        <div key={`planes-${clave}`} className="mt-4 grid gap-4 md:grid-cols-3">
          {tarjetas.map((t, i) => (
            <TarjetaDePlan
              key={t.plan}
              t={t}
              v={v}
              paso={i}
              nombre={clave === 'personal' ? v.nombrePersonal : v.nombresPlan[t.plan]}
              textos={v.planes[clave][t.plan] ?? v.planGenerico[t.plan]}
              resaltar={tarjetas.length > 1 && t.conEsteProbas}
              importe={importe}
              usd={(n) => precio(n, 'USD', locale)}
              enlace={enlace}
              llamado={v.probar(dias)}
            />
          ))}

          {/* Lo que hay que saber antes de elegir, sin letra chica. */}
          <div
            className={`rounded-3xl border border-dashed border-borde p-5 motion-safe:animate-[aparecer_.4s_ease-out_both] ${anchoCondiciones}`}
            style={{ animationDelay: `${tarjetas.length * 70}ms` }}
          >
            <h4 className="text-[15px] font-bold tracking-tight">{v.loQueTenesQueSaber}</h4>
            <ul className={`mt-3 grid gap-3 ${tarjetas.length >= 3 ? 'md:grid-cols-2' : ''}`}>
              <Condicion icono="guaranies">{v.cobroEnGuaranies}</Condicion>
              <Condicion icono="descuento">
                {v.descuento(Math.round(promo.porcentaje), rachaDelDescuento(clave, promo))}{' '}
                {v.constancia(Math.round(promo.constanciaPorcentaje), promo.constanciaDias)}
              </Condicion>
              <Condicion icono="pago">{v.comoSePaga}</Condicion>
              <Condicion icono="candado">{v.finDePrueba}</Condicion>
              {hayEquipo && <Condicion icono="equipo">{v.equipoNoPaga}</Condicion>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/** La mini pantalla de cada rubro (src/components/portada/pantallas). */
function Pantalla({ clave, v }: { clave: ClaveVitrina; v: TextosVitrina }) {
  switch (clave) {
    case 'servicios': return <PantallaServicios v={v} />;
    case 'clases': return <PantallaClases v={v} />;
    case 'entrenamiento': return <PantallaEntrenamiento v={v} />;
    case 'agricultura': return <PantallaCampo v={v} />;
    case 'ganaderia': return <PantallaGanaderia v={v} />;
    case 'personal': return <PantallaPersonal v={v} />;
    default: return <PantallaComercio v={v} />;
  }
}

function TarjetaDePlan({
  t, v, paso, nombre, textos, resaltar, importe, usd, enlace, llamado,
}: {
  t: TarjetaPlan;
  v: TextosVitrina;
  paso: number;
  nombre: string;
  textos: { para: string; puntos: string[] };
  /** El plan con el que arranca la prueba, cuando hay más de uno para elegir. */
  resaltar: boolean;
  importe: (n: number | null) => string;
  usd: (n: number) => string;
  enlace: string;
  llamado: string;
}) {
  return (
    <div
      className={`tarjeta flex flex-col p-5 motion-safe:animate-[aparecer_.4s_ease-out_both] ${
        resaltar ? 'border-verde/50 ring-1 ring-verde/20' : ''}`}
      style={{ animationDelay: `${paso * 70}ms` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[16px] font-bold tracking-tight">{nombre}</h4>
        {resaltar && <span className="pastilla bg-verde-claro text-verde-fuerte">{v.conEsteProbas}</span>}
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        {t.desde && <span className="text-[13px] font-semibold text-tinta/60">{v.desde}</span>}
        <span className="font-titulo text-[27px] font-extrabold tracking-tight tabular-nums">{importe(t.mensual)}</span>
        {t.mensual !== null && <span className="text-[13px] font-semibold text-tinta/60">{v.porMes}</span>}
        {t.referenciaUSD !== null && (
          <span className="text-[12.5px] font-semibold tabular-nums text-tinta/60" title={v.referenciaAyuda}>
            {v.referencia(usd(t.referenciaUSD))}
          </span>
        )}
      </p>
      <p className="mt-1.5 text-[13px] font-semibold text-tinta/60">{textos.para}</p>

      <ul className="mt-4 flex-1 space-y-2">
        {textos.puntos.map((punto) => (
          <li key={punto} className="flex items-start gap-2 text-[13.5px] leading-snug text-tinta/70">
            <Tilde className="mt-[3px] h-3.5 w-3.5 shrink-0 text-verde-fuerte" />
            {punto}
          </li>
        ))}
      </ul>

      {t.mesesDeRegalo > 0 && t.anual !== null && (
        <p className="mt-4 border-t border-borde pt-3 text-[13px] leading-relaxed text-tinta/60">
          {v.alAnio(importe(t.anual), t.mesesDeRegalo)}
        </p>
      )}
      {t.porVendedor !== null && (
        <p className="mt-4 border-t border-borde pt-3 text-[13px] leading-relaxed text-tinta/60">
          {v.vendedorExtra(importe(t.porVendedor))}
        </p>
      )}

      <Link
        href={enlace}
        className={`mt-4 flex min-h-[44px] items-center justify-center rounded-xl px-4 text-center text-[14px] font-bold transition ${
          resaltar
            ? 'bg-verde text-sobre-verde hover:brightness-95'
            : 'border border-verde/40 text-verde-fuerte hover:bg-verde-claro'}`}
      >
        {llamado}
      </Link>
    </div>
  );
}

type IconoCondicion = 'guaranies' | 'descuento' | 'pago' | 'candado' | 'equipo';

function Condicion({ icono, children }: { icono: IconoCondicion; children: React.ReactNode }) {
  const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const dibujo: Record<IconoCondicion, JSX.Element> = {
    guaranies: <><circle cx="12" cy="12" r="8.5" /><path d="M12 6.5v11M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-2.8.9-2.8 2.2 0 3 5.8 1.5 5.8 4.4 0 1.3-1.2 2.2-3 2.2-1.4 0-2.5-.6-3-1.6" /></>,
    descuento: <><path d="M4 12.5V5a1 1 0 0 1 1-1h7.5L20 11.5 12.5 19z" /><circle cx="8.5" cy="8.5" r="1.3" /></>,
    pago: <><path d="M4 7h13l-3-3M20 17H7l3 3" /></>,
    candado: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
    equipo: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" /><circle cx="16.8" cy="9.5" r="2.4" /><path d="M16.6 14.4c2 .2 3.4 1.7 3.9 4.1" /></>,
  };
  return (
    <li className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-tinta/65">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-verde-claro text-verde-fuerte">
        <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo} aria-hidden>{dibujo[icono]}</svg>
      </span>
      <span>{children}</span>
    </li>
  );
}

// Para que la página no tenga que repetir el tipo del plan.
export type { PlanVitrina };
