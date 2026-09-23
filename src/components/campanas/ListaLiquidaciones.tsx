'use client';

import { useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useLocale, useTextos } from '@/i18n/cliente';
import { dinero } from '@/lib/formato';
import { Hoja, MensajeError } from '@/components/rutinas/panel/Piezas';
import { useAccion } from '@/components/rutinas/panel/useAccion';
import { fechaCorta } from '@/components/rutinas/panel/utiles';
import type { Liquidacion, MovimientoDeLote } from '@/lib/tipos';
import { dolarDicho, kilos, precioDicho } from './utiles';

/**
 * LAS LIQUIDACIONES DE UNA CAMPAÑA, con «Anular».
 *
 * Un papel de la cooperativa es un `grupo_id`: si juntó kilos de dos
 * campañas, cada una ve su parte, y anular deshace el papel entero (la
 * venta, los descuentos y lo que se cobró de las deudas, todo junto). Por
 * eso se agrupa por papel y no por fila, y se anula por grupo.
 *
 * Una liquidación cuya venta se anuló desde el historial ya no cuenta en
 * los números (`numeros_de_lote` mira la venta): se muestra como anulada.
 *
 * Lo que el silo se quedó (descuentos, deudas, grano) es de administración:
 * a quien no lo es le llega en null y no se muestra ni un guion.
 */
export function ListaLiquidaciones({
  empresaId, moneda, liquidaciones, movimientos, esAdmin, hoy, onCambio,
}: {
  empresaId: string;
  moneda: string;
  liquidaciones: Liquidacion[];
  movimientos: MovimientoDeLote[];
  esAdmin: boolean;
  hoy: string;
  onCambio: (mensaje: string) => void;
}) {
  const t = useTextos();
  const l = t.campanas.liquidacion;
  const locale = useLocale();
  const { ocupado, error, setError, correr } = useAccion();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<Liquidacion | null>(null);
  const [motivo, setMotivo] = useState('');

  const plata = (n: number, m: string = moneda) => dinero(n, m, true, locale);

  if (liquidaciones.length === 0) return <p className="text-[13px] text-tinta/50">{l.sinLiquidaciones}</p>;

  // Una por papel: dentro de una campaña cada grupo tiene una sola fila,
  // pero se agrupa igual para que anular hable del papel y no de la fila.
  const grupos = new Map<string, Liquidacion[]>();
  for (const q of liquidaciones) grupos.set(q.grupo_id, [...(grupos.get(q.grupo_id) ?? []), q]);

  const ventaAnulada = (q: Liquidacion) =>
    movimientos.some((m) => m.id === q.movimiento_id && m.estado === 'anulado');

  return (
    <>
      <ul className="divide-y divide-borde/70">
        {[...grupos.entries()].map(([grupo, filas]) => {
          const q = filas[0];
          const kg = filas.reduce((a, x) => a + Number(x.kg), 0);
          const netoG = filas.reduce((a, x) => a + Number(x.neto), 0);
          const brutoG = filas.reduce((a, x) => a + Number(x.bruto), 0);
          const anulada = q.estado === 'anulada' || ventaAnulada(q);
          const suma = (k: 'descuentos' | 'compensado' | 'pagado_con_grano') =>
            (filas.every((x) => x[k] === null) ? null : filas.reduce((a, x) => a + Number(x[k] ?? 0), 0));
          const desc = suma('descuentos');
          const comp = suma('compensado');
          const gran = suma('pagado_con_grano');
          const seQuedo = desc === null ? null : (desc ?? 0) + (comp ?? 0) + (gran ?? 0);
          const expandida = abierta === grupo;

          return (
            <li key={grupo} className="py-2">
              <button type="button" className="flex min-h-[44px] w-full items-start justify-between gap-3 text-left"
                aria-expanded={expandida} onClick={() => setAbierta(expandida ? null : grupo)}>
                <span className="min-w-0">
                  <span className={`block truncate text-[14px] font-semibold ${anulada ? 'text-tinta/40 line-through' : ''}`}>
                    {l.renglon(kilos(kg, locale), precioDicho(Number(q.precio_tonelada), moneda, locale, t))}
                  </span>
                  <span className="block truncate text-[11.5px] text-tinta/45">
                    {[fechaCorta(q.fecha, locale, hoy), q.comprador].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {anulada ? (
                    <span className="pastilla bg-arena text-tinta/55">{l.anulada}</span>
                  ) : (
                    <>
                      <span className="block text-[13.5px] font-bold tabular-nums text-verde-fuerte">{l.netoCorto(plata(netoG))}</span>
                      {seQuedo !== null && seQuedo > 0 && (
                        <span className="block text-[11.5px] text-tinta/45">{l.seQuedo(plata(seQuedo))}</span>
                      )}
                    </>
                  )}
                </span>
              </button>

              {expandida && (
                <div className="mt-1.5 space-y-1 rounded-xl bg-superficie px-3 py-2.5 text-[12.5px]">
                  <Renglon texto={l.bruto} valor={plata(brutoG)} />
                  {desc !== null && desc > 0 && <Renglon texto={l.descuentosCorto} valor={`− ${plata(desc)}`} />}
                  {comp !== null && comp > 0 && <Renglon texto={l.compensado} valor={`− ${plata(comp)}`} />}
                  {gran !== null && gran > 0 && <Renglon texto={l.pagadoConGrano} valor={`− ${plata(gran)}`} />}
                  <Renglon texto={l.neto} valor={plata(netoG)} fuerte />
                  {q.moneda_original && q.precio_original !== null && q.cambio !== null && (
                    <p className="pt-1 text-[11.5px] text-tinta/45">
                      {t.gastosCampana.moneda.original(
                        precioDicho(Number(q.precio_original), q.moneda_original, locale, t),
                        dolarDicho(moneda, q.moneda_original, Number(q.cambio)).toLocaleString(locale),
                      )}
                    </p>
                  )}
                  {q.notas && <p className="pt-1 text-[11.5px] text-tinta/55">{q.notas}</p>}
                  {esAdmin && !anulada && q.estado === 'activa' && (
                    <div className="pt-1.5">
                      <button type="button" className="boton-texto min-h-[44px] text-[12.5px] text-rojo" disabled={ocupado}
                        onClick={() => { setError(''); setMotivo(''); setAnulando(q); }}>
                        {l.anular}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* No es el `Confirmar` de las rutinas: ese tiene el «no» fijo en
          t.comun.cancelar, y en pt «anular» también se dice «Cancelar».
          Acá el «no» y el «sí» dicen cosas distintas en los dos idiomas. */}
      {anulando && (
        <Hoja titulo={l.tituloAnular} onCerrar={() => setAnulando(null)} bloqueada={ocupado}>
          <div className="space-y-3 text-[14px] leading-relaxed text-tinta/70">
            <p>{l.confirmarAnular(fechaCorta(anulando.fecha, locale, hoy))}</p>
            <div>
              <label className="etiqueta" htmlFor="liq-motivo">{l.motivo}</label>
              <input id="liq-motivo" className="campo" maxLength={200} value={motivo} disabled={ocupado}
                onChange={(e) => setMotivo(e.target.value)} />
            </div>
          </div>
          <MensajeError texto={error} />
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button type="button" className="boton-suave min-h-[48px]" disabled={ocupado}
              onClick={() => setAnulando(null)}>
              {l.noAnular}
            </button>
            <button
              type="button" className="boton-peligro min-h-[48px]" disabled={ocupado}
              onClick={async () => {
                const r = await correr(() => clienteNavegador().rpc('anular_liquidacion', {
                  p_empresa: empresaId, p_grupo: anulando.grupo_id, p_motivo: motivo.trim(),
                }));
                if (r.ok) { setAnulando(null); onCambio(l.anuladaListo); }
              }}
            >
              {ocupado ? t.comun.guardando : l.siAnular}
            </button>
          </div>
        </Hoja>
      )}
    </>
  );
}

function Renglon({ texto, valor, fuerte = false }: { texto: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? 'border-t border-borde/70 pt-1 font-bold' : ''}`}>
      <span className="text-tinta/60">{texto}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}
