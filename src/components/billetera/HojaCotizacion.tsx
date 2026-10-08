'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { dinero, fechaLegible, simboloDe } from '@/lib/formato';
import {
  aPropia, cotizacionAGuardar, cotizacionEscrita, cotizacionPorGuardar, decimalesDelCambio, diaDeLaCotizacion,
  esParDolar, parDe,
} from '@/lib/monedas';
import { avisoDolar } from '@/lib/agricultura';
import { useLocale, useTextos } from '@/i18n/cliente';
import { useZona } from '@/lib/zona';
import type { Billetera } from '@/lib/tipos';
import { CampoMonto } from '@/components/CampoMonto';
import { Hoja, MensajeError, PieHoja } from '@/components/Hoja';

/**
 * A CUÁNTO ESTÁ EL CAMBIO (131).
 *
 * La cotización la escribe la persona, con su fecha. Orden no la baja de
 * internet: el dólar del banco, el de la casa de cambios y el de la calle no
 * son el mismo, y el que vale es el que esa persona consigue.
 *
 * SIRVE PARA UNA SOLA COSA: el renglón «≈ … en total». No toca ningún saldo,
 * ningún gasto ni ningún reporte: cambiarla mañana no mueve nada de lo que
 * ya está guardado. Por eso se puede escribir sin miedo, y se dice.
 *
 * Se pregunta como se dice en la calle, en las dos direcciones: «¿A cuánto
 * está el dólar?» lo contesta igual un negocio en guaraníes con una cuenta
 * en dólares que uno en dólares con una caja en guaraníes. La vuelta para
 * guardarla la da `cotizacionAGuardar`.
 *
 * Una sección por cada moneda en la que hay cuentas. Mientras se escribe se
 * ve lo que significa: «US$ 10.350,00 ≈ Gs. 76.590.000».
 */
export function HojaCotizacion({
  empresaId, moneda, billetera, oculto, onCerrar,
}: {
  empresaId: string;
  /** La moneda del negocio. */
  moneda: string;
  billetera: Billetera;
  oculto: boolean;
  onCerrar: () => void;
}) {
  const t = useTextos();
  const m = t.monedas.billetera;
  const locale = useLocale();
  const zona = useZona();
  const router = useRouter();

  const totales = billetera.totalesOtras;
  const guardada = (otra: string) => billetera.cotizaciones.find((k) => k.moneda === otra) ?? null;
  const [escritas, setEscritas] = useState<Record<string, number>>(() => Object.fromEntries(
    totales.map((tot) => [tot.moneda, cotizacionEscrita(guardada(tot.moneda)?.valor ?? 0, moneda, tot.moneda)]),
  ));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const pregunta = (otra: string) => {
    const { grande, chica } = parDe(moneda, otra);
    const uno = t.gastosCampana.moneda.uno[grande] ?? grande;
    return esParDolar(moneda, otra)
      ? m.cuantoEsta(uno)
      : m.cuantosVale(t.gastosCampana.moneda.nombres[chica] ?? chica, uno);
  };

  // Solo lo que cambió y tiene un número: un campo vacío no borra nada. Y la
  // de siempre cuando ya es vieja (fecha en ámbar): guardar el mismo número
  // la confirma con la fecha de hoy (ver `cotizacionPorGuardar`).
  const aGuardar = totales
    .map((tot) => ({ moneda: tot.moneda, valor: cotizacionAGuardar(escritas[tot.moneda] ?? 0, moneda, tot.moneda) }))
    .filter((c) => cotizacionPorGuardar(c.valor, guardada(c.moneda)));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (aGuardar.length === 0) { onCerrar(); return; }
    setGuardando(true);
    setError('');
    try {
      const supabase = clienteNavegador();
      for (const c of aGuardar) {
        const { error: fallo } = await supabase.rpc('guardar_cotizacion_moneda', {
          p_empresa: empresaId, p_moneda: c.moneda, p_valor: c.valor,
        });
        if (fallo) throw fallo;
      }
      router.refresh();
      onCerrar();
    } catch (fallo) {
      setError(mensajeDeError(fallo, t.errores.generico));
    } finally {
      setGuardando(false);
    }
  }

  const unaSola = totales.length === 1;

  return (
    <Hoja
      titulo={unaSola ? pregunta(totales[0].moneda) : m.cotizacion}
      onCerrar={onCerrar} bloqueada={guardando} tamano="chico"
      formulario={{ onSubmit: guardar, noValidate: true }}
      pie={(
        <PieHoja>
          <button type="submit" className="boton-principal min-h-[48px]" disabled={guardando || aGuardar.length === 0}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </button>
        </PieHoja>
      )}
    >
      <div className="space-y-4">
        {totales.map((tot, i) => {
          const escrita = escritas[tot.moneda] ?? 0;
          const { chica } = parDe(moneda, tot.moneda);
          const previa = guardada(tot.moneda);
          const fecha = previa ? fechaLegible(diaDeLaCotizacion(previa.desde, zona), false, locale) : '';
          // «El dólar a 74» o «a 74.000» es un cero de menos o de más, y
          // después propone importes diez veces mal en Gastos. Para la
          // pareja guaraní/dólar se conoce lo habitual: se AVISA, con el
          // texto de «Pagué en dólares» (100), y no se frena: la cotización
          // es de la persona. De las demás parejas no hay un rango que usar.
          const dolarRaro = esParDolar(moneda, tot.moneda) && escrita > 0 && avisoDolar(escrita) !== 'ok';
          return (
            <div key={tot.moneda}>
              <label className="block">
                {unaSola
                  ? <span className="sr-only">{pregunta(tot.moneda)}</span>
                  : <span className="etiqueta">{pregunta(tot.moneda)}</span>}
                <CampoMonto
                  className="campo text-[22px] font-titulo font-extrabold" autoFocus={i === 0}
                  decimales={decimalesDelCambio(moneda, tot.moneda)}
                  placeholder={`${simboloDe(chica)} 0`}
                  valor={escrita}
                  alCambiar={(n) => setEscritas((antes) => ({ ...antes, [tot.moneda]: Math.max(0, n) }))}
                />
              </label>
              {escrita > 0 && tot.total !== 0 && !oculto && (
                <p className="mt-2 text-[14px] font-bold tabular-nums text-tinta">
                  {m.aprox(
                    dinero(tot.total, tot.moneda, true, locale),
                    dinero(aPropia(tot.total, cotizacionAGuardar(escrita, moneda, tot.moneda), moneda), moneda, true, locale),
                  )}
                </p>
              )}
              {dolarRaro && (
                <p className="mt-2 rounded-lg bg-ambar-claro px-3 py-2 text-[12.5px] font-medium text-ambar">
                  {t.gastosCampana.moneda.dolarRaro}
                </p>
              )}
              {fecha && <p className="mt-1 text-[12px] text-tinta/45">{m.cargadoEl(fecha)}</p>}
            </div>
          );
        })}
        <p className="text-[12.5px] leading-snug text-tinta/55">{m.cotizacionDetalle}</p>
      </div>
      <MensajeError texto={error} />
    </Hoja>
  );
}
