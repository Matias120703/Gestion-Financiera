'use client';

import { useState } from 'react';
import { dinero, fechaLegible, simboloDe } from '@/lib/formato';
import { cotizacionEscrita, cotizacionVieja, diaDeLaCotizacion, parDe, textoDelCambio } from '@/lib/monedas';
import { monedasACotizar, tengoEnTotal } from '@/lib/patrimonio';
import { useLocale, useTextos } from '@/i18n/cliente';
import { useZona } from '@/lib/zona';
import type { Billetera, ParteDeMoneda, Patrimonio } from '@/lib/tipos';
import { HojaCotizacion } from '@/components/billetera/HojaCotizacion';

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.9,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/**
 * «TENGO EN TOTAL» (132): plata + lo que te deben + mercadería + lo que
 * tenés − lo que debés.
 *
 * Matías quiere anotar lo que tiene y no es plata «y ver cuánto tiene en
 * total». Aparece recién cuando hay al menos un bien anotado.
 *
 * CADA RENGLÓN VA EN SU MONEDA, EXACTO. Lo de dólares se lee en dólares y lo
 * de guaraníes en guaraníes: arriba de la raya no hay nada convertido.
 *
 * EL NÚMERO DE ABAJO ES EL ÚNICO CONVERTIDO, y por eso lleva siempre «≈» y,
 * al lado, el cambio que se usó con su fecha: es la cotización que escribió
 * la persona (la misma de la Billetera), no una de internet. Lleva «≈»
 * también cuando todo está en una sola moneda, porque el valor de un auto es
 * una estimación. Si falta la cotización de una moneda que tiene algo
 * adentro, NO HAY NÚMERO: hay un enlace para ponerla.
 *
 * NO SALE DE ACÁ. La cuenta la hace `tengoEnTotal` (lib/patrimonio.ts) en el
 * navegador, para mostrarla: no se guarda, no entra en «Disponible», ni en la
 * ganancia, ni en un reporte, un Excel, un aviso o el resumen semanal.
 */
export function TarjetaTengoEnTotal({
  empresaId, moneda, billetera, patrimonio, conMercaderia, oculto,
}: {
  empresaId: string;
  /** La moneda del negocio. */
  moneda: string;
  billetera: Billetera;
  patrimonio: Patrimonio;
  /** Esta cuenta tiene la pantalla de Productos: su mercadería, a precio de costo, cuenta. */
  conMercaderia: boolean;
  /** El ojo: tapa también estos números. */
  oculto: boolean;
}) {
  const t = useTextos();
  const p = t.monedas.patrimonio;
  const m = t.monedas.billetera;
  const locale = useLocale();
  const zona = useZona();
  const [cotizando, setCotizando] = useState(false);
  /** En qué moneda se mira el total. Null: en la del negocio. */
  const [verEn, setVerEn] = useState<string | null>(null);

  const cuenta = tengoEnTotal(patrimonio, conMercaderia);

  const plata = (n: number, enMoneda: string) => {
    if (oculto) return '••••••';
    const escrito = dinero(Math.abs(n), enMoneda, true, locale);
    return n < 0 ? `− ${escrito}` : escrito;
  };
  const nombreUno = (codigo: string) => t.gastosCampana.moneda.uno[codigo] ?? codigo;

  // El total, en la moneda del negocio o en la que se pidió ver.
  const enPropia: ParteDeMoneda | null = cuenta.total === null ? null : { moneda, total: cuenta.total };
  const visto = cuenta.enOtras.find((x) => x.moneda === verEn) ?? enPropia;
  const otrasVistas = visto && enPropia
    ? [enPropia, ...cuenta.enOtras].filter((x) => x.moneda !== visto.moneda)
    : [];

  // El cambio que se usó, con su fecha, igual que en «Tu plata».
  const cambios = cuenta.conCambio.flatMap((otra) => {
    const guardada = patrimonio.cotizaciones.find((k) => k.moneda === otra);
    if (!guardada || !(guardada.valor > 0)) return [];
    const partes = textoDelCambio(cotizacionEscrita(guardada.valor, moneda, otra), moneda, otra, locale);
    return [{
      moneda: otra,
      texto: m.cambio(partes.uno, partes.vale),
      fecha: fechaLegible(diaDeLaCotizacion(guardada.desde, zona), false, locale),
      vieja: cotizacionVieja(guardada.desde),
    }];
  });
  // De qué depende el número: de un cambio (se nombra como en la hoja, por la
  // moneda grande de la pareja: «del dólar»), de varios, o solo de lo estimado.
  const grandes = [...new Set(cuenta.conCambio.map((otra) => parDe(moneda, otra).grande))];
  const dependeDe = grandes.length === 0
    ? p.esAproximadoSinCambio
    : grandes.length === 1 ? p.esAproximado(nombreUno(grandes[0])) : p.esAproximadoVarios;

  const renglon = (titulo: string, montos: React.ReactNode, detalle?: string) => (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="min-w-0 text-[14px] leading-snug text-tinta/70">
        {titulo}
        {detalle && <span className="mt-0.5 block text-[12px] text-tinta/45">{detalle}</span>}
      </dt>
      <dd className="shrink-0 text-right text-[14.5px] font-semibold leading-snug tabular-nums">{montos}</dd>
    </div>
  );
  const porMoneda = (partes: ParteDeMoneda[]) => partes.map((x) => (
    <span key={x.moneda} className={`block ${x.total < 0 ? 'text-rojo' : ''}`}>{plata(x.total, x.moneda)}</span>
  ));

  return (
    <section className="tarjeta px-5 pb-4 pt-5">
      <h2 className="text-[13px] font-semibold text-tinta/55">{p.tengoEnTotal}</h2>

      <dl className="mt-2">
        {renglon(
          p.plata, porMoneda(cuenta.plata),
          cuenta.guardado > 0 ? p.deEsoGuardado(plata(cuenta.guardado, moneda)) : undefined,
        )}
        {cuenta.teDeben > 0 && renglon(p.teDeben, plata(cuenta.teDeben, moneda))}
        {cuenta.mercaderia > 0 && renglon(p.mercaderia, plata(cuenta.mercaderia, moneda))}
        {cuenta.bienes.length > 0 && renglon(p.loQueTenes, porMoneda(cuenta.bienes))}
        {cuenta.debes > 0 && renglon(p.debes, <span className="text-rojo">{plata(-cuenta.debes, moneda)}</span>)}
      </dl>

      <div className="mt-2 border-t border-borde/70 pt-3">
        {visto ? (
          <>
            {/* El único número convertido: siempre con «≈» adelante. */}
            <p className={`font-titulo font-extrabold leading-tight tabular-nums tracking-tight ${
              plata(visto.total, visto.moneda).length > 15 ? 'text-[25px] min-[400px]:text-[30px]' : 'text-[30px]'
            } ${visto.total < 0 ? 'text-rojo' : ''}`}>
              ≈ {plata(visto.total, visto.moneda)}
            </p>
            {(cambios.length > 0 || otrasVistas.length > 0) && (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4">
                <div className="flex flex-wrap gap-x-4">
                  {cambios.map((c) => (
                    <button
                      key={c.moneda} type="button" onClick={() => setCotizando(true)}
                      aria-label={`${m.cambiarCotizacion}: ${c.texto}`}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg text-[12.5px] text-tinta/55 transition hover:text-tinta active:scale-[.98]"
                    >
                      <span className="tabular-nums">{c.texto}</span>
                      {c.fecha && (
                        <>
                          <span aria-hidden>·</span>
                          <span className={c.vieja ? 'font-semibold text-ambar' : ''}>{c.fecha}</span>
                        </>
                      )}
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-tinta/40" aria-hidden {...trazo}>
                        <path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" />
                      </svg>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4">
                  {otrasVistas.map((x) => (
                    <button
                      key={x.moneda} type="button"
                      onClick={() => setVerEn(x.moneda === moneda ? null : x.moneda)}
                      className="boton-texto min-h-[36px] text-[12.5px]"
                    >
                      {p.verEn(simboloDe(x.moneda))}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-1 text-[12px] leading-snug text-tinta/45">{dependeDe}</p>
          </>
        ) : cuenta.imposibles.length > 0 ? (
          // Una moneda que Orden no sabe cotizar: ni «≈» ni un enlace que no serviría.
          <p className="text-[13px] leading-snug text-tinta/60">{p.sinTotal(cuenta.imposibles.join(', '))}</p>
        ) : (
          // Falta una cotización: no hay número, hay dónde ponerla. Se nombra
          // la moneda grande de la pareja («el dólar»), como la hoja que abre.
          <button type="button" onClick={() => setCotizando(true)} className="boton-texto min-h-[40px] text-left text-[13.5px] leading-snug">
            {m.ponerCotizacion(nombreUno(parDe(moneda, cuenta.faltan[0] ?? moneda).grande))}
          </button>
        )}
      </div>

      {cotizando && (
        <HojaCotizacion
          empresaId={empresaId} moneda={moneda} oculto={oculto}
          // La hoja de siempre, preguntando por las monedas de TODO lo que se
          // junta acá: también la de un terreno en dólares sin cuenta en dólares.
          billetera={{
            ...billetera,
            totalesOtras: monedasACotizar(patrimonio).map((x) => ({ ...x, cuentas: 0 })),
            cotizaciones: patrimonio.cotizaciones,
          }}
          onCerrar={() => setCotizando(false)}
        />
      )}
    </section>
  );
}
