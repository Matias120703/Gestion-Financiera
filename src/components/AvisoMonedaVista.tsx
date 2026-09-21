import Link from 'next/link';
import { estaConvertida, simboloDe, fechaLegible, type Vista } from '@/lib/formato';
import { textos, idiomaActual, FICHA } from '@/i18n';
import { Rico } from '@/components/Rico';

/**
 * «Estás mirando en otra moneda.»
 *
 * Sin esto, la conversión sería una trampa: los números cambian de tamaño y
 * el símbolo es chico. Alguien entra un lunes, ve «US$ 685» donde siempre
 * hubo millones y no tiene forma de saber si le fue mal o si está mirando
 * otra cosa.
 *
 * Muestra las tres cosas que hacen falta para confiar en el número: en qué
 * moneda está, a qué cambio, y de cuándo es ese cambio. La fecha no es un
 * adorno — una cotización de hace tres meses presentada como número de hoy
 * es otra forma de mentir, y el único que puede decidir si todavía sirve es
 * el que la puso.
 *
 * No se muestra nada cuando no hay conversión: un cartel permanente que casi
 * siempre dice «todo normal» deja de leerse, y el día que importe tampoco se
 * va a leer.
 */
export async function AvisoMonedaVista({ vista }: { vista: Vista }) {
  if (!estaConvertida(vista)) return null;
  const a = (await textos()).ajustes;
  const locale = FICHA[(await idiomaActual())].locale;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5
                    rounded-xl border border-borde bg-arena px-4 py-2.5">
      <p className="text-[13px] leading-snug text-tinta/70">
        <Rico texto={a.estasViendoEnCorto(simboloDe(vista.moneda))} negrita="text-tinta" />
        {vista.cotizacion != null && (
          <> · 1 {simboloDe(vista.moneda)} = {vista.cotizacion.toLocaleString(locale)} {simboloDe(vista.propia)}</>
        )}
        {vista.desde && (
          <span className="text-tinta/45"> · {a.cargadoEl(fechaLegible(vista.desde.slice(0, 10), true, locale))}</span>
        )}
      </p>
      <Link href="/ajustes?ver=moneda" className="text-[12.5px] font-semibold text-verde-fuerte hover:underline">
        {a.cambiar}
      </Link>
    </div>
  );
}
