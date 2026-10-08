'use client';

import Link from 'next/link';
import { dinero, fechaLegible } from '@/lib/formato';
import {
  cotizacionEscrita, cotizacionVieja, diaDeLaCotizacion, parDe, textoDelCambio, totalAprox,
} from '@/lib/monedas';
import { useLocale, useTextos } from '@/i18n/cliente';
import { useZona } from '@/lib/zona';
import type { Billetera } from '@/lib/tipos';

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.9,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/**
 * LO QUE HAY EN OTRAS MONEDAS, DEBAJO DE «TU PLATA» (131).
 *
 * El número grande de siempre (lo que hay en la moneda del negocio) lo sigue
 * dibujando cada pantalla, igual que antes. Esta pieza agrega lo que viene
 * después, y SOLO si hay alguna cuenta en otra moneda: sin ninguna no dibuja
 * nada, y la billetera de quien no usa esto queda idéntica.
 *
 * NUNCA SE SUMAN MONEDAS COMO SI FUERAN UNA. Lo exacto va primero y más
 * grande: un renglón por moneda («US$ 10.350,00»). Lo de todo junto es UN
 * solo renglón, chico y gris, con «≈» adelante y con el cambio que se usó y
 * su fecha al lado, porque diez mil dólares valen distinto cada día. Si
 * falta la cotización de alguna moneda no hay número: hay una invitación a
 * escribirla. Una cotización de más de un mes lleva la fecha en ámbar.
 *
 * La cotización la escribe la persona (`alCotizar` abre la hoja). En el
 * panel no se edita: tocarla lleva a la billetera.
 */
export function TotalesDePlata({
  billetera, moneda, oculto, tamano = 'grande', alCotizar,
}: {
  billetera: Billetera;
  /** La moneda del negocio. */
  moneda: string;
  /** El ojo: tapa también estos números. */
  oculto: boolean;
  tamano?: 'grande' | 'chico';
  /** Abre la hoja de la cotización. Sin esto (el panel), se va a la billetera. */
  alCotizar?: () => void;
}) {
  const t = useTextos();
  const m = t.monedas.billetera;
  const locale = useLocale();
  const zona = useZona();

  const totales = billetera.totalesOtras;
  if (totales.length === 0) return null;

  const plata = (n: number, enMoneda: string) => (oculto ? '••••••' : dinero(n, enMoneda, true, locale));
  const nombreUno = (codigo: string) => t.gastosCampana.moneda.uno[codigo] ?? codigo;

  // Aproximado: se muestra con «≈» y con el cambio al lado, nunca solo.
  const junto = totalAprox(
    [{ moneda, total: billetera.total }, ...totales], moneda, billetera.cotizaciones,
  );
  // La invitación nombra la misma moneda que la hoja que abre: la GRANDE de
  // la pareja («el dólar»), no la que falta. Un negocio en dólares con una
  // caja en guaraníes leía «poné a cuánto está el guaraní» y al tocarlo la
  // hoja preguntaba «¿A cuánto está el dólar?».
  const monedaQueSePregunta = junto.faltan.length > 0 ? nombreUno(parDe(moneda, junto.faltan[0]).grande) : '';
  const cambios = totales.flatMap((tot) => {
    const guardada = billetera.cotizaciones.find((k) => k.moneda === tot.moneda);
    if (!guardada || !(guardada.valor > 0)) return [];
    const partes = textoDelCambio(cotizacionEscrita(guardada.valor, moneda, tot.moneda), moneda, tot.moneda, locale);
    return [{
      moneda: tot.moneda,
      texto: m.cambio(partes.uno, partes.vale),
      fecha: fechaLegible(diaDeLaCotizacion(guardada.desde, zona), false, locale),
      vieja: cotizacionVieja(guardada.desde),
    }];
  });

  const grande = tamano === 'grande';
  const claseLinea = grande
    ? 'text-[24px] min-[400px]:text-[26px]'
    : 'text-[19px]';

  return (
    <div className={grande ? 'mt-2' : 'mt-1.5'}>
      {totales.map((tot) => (
        <p
          key={tot.moneda}
          className={`truncate font-titulo font-extrabold leading-tight tabular-nums tracking-tight ${claseLinea}`}
        >
          {plata(tot.total, tot.moneda)}
        </p>
      ))}

      {junto.total !== null ? (
        <p className="mt-1.5 text-[13px] font-medium tabular-nums text-tinta/60">
          {m.aproxTotal(plata(junto.total, moneda))}
        </p>
      ) : alCotizar ? (
        <button type="button" onClick={alCotizar} className="boton-texto mt-1.5 min-h-[36px] text-left text-[13px] leading-snug">
          {m.ponerCotizacion(monedaQueSePregunta)}
        </button>
      ) : (
        <Link href="/billetera" className="boton-texto mt-1.5 inline-flex min-h-[36px] items-center text-[13px] leading-snug">
          {m.ponerCotizacion(monedaQueSePregunta)}
        </Link>
      )}

      {cambios.length > 0 && (
        <div className="flex flex-wrap gap-x-4">
          {cambios.map((c) => {
            const contenido = (
              <>
                <span className="tabular-nums">{c.texto}</span>
                {c.fecha && (
                  <>
                    <span aria-hidden>·</span>
                    <span className={c.vieja ? 'font-semibold text-ambar' : ''}>{c.fecha}</span>
                  </>
                )}
              </>
            );
            return alCotizar ? (
              <button
                key={c.moneda} type="button" onClick={alCotizar} aria-label={`${m.cambiarCotizacion}: ${c.texto}`}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg text-[12.5px] text-tinta/55 transition hover:text-tinta active:scale-[.98]"
              >
                {contenido}
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-tinta/40" aria-hidden {...trazo}>
                  <path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" />
                </svg>
              </button>
            ) : (
              <p key={c.moneda} className="inline-flex min-h-[24px] items-center gap-1.5 text-[12.5px] text-tinta/55">
                {contenido}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
