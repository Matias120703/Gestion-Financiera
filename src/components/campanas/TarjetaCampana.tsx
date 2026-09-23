'use client';

import { useState } from 'react';
import Link from 'next/link';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useIdioma, useLocale, useTextos } from '@/i18n/cliente';
import { cultivoPorNombre, sacasPorHa } from '@/lib/agricultura';
import { dinero, estaConvertida, fechaLegible, type Vista } from '@/lib/formato';
import { categoriaVisible } from '@/i18n/nombres';
import { mensajeDeError } from '@/lib/errores';
import { Barra } from '@/components/Piezas';
import { Confirmar } from '@/components/rutinas/panel/Piezas';
import { fechaCorta } from '@/components/rutinas/panel/utiles';
import type {
  CuentaParaElegir, Lote, LoteDetalle, MovimientoSuelto,
} from '@/lib/tipos';
import { FormularioCosecha, ListaCosechas } from './FormularioCosecha';
import { FormularioLiquidacion } from './FormularioLiquidacion';
import { ListaLiquidaciones } from './ListaLiquidaciones';
import {
  categoriaDeCampana, cultivoVisible, dolarDicho, kilos, precioDicho, unDecimal,
} from './utiles';

type Correr = (marca: string, fn: () => Promise<{ error: unknown } | void>) => Promise<boolean>;

/**
 * UNA CAMPAÑA (o un lote del ganadero).
 *
 * Vive fuera de la pantalla y no adentro, aunque solo se use ahí: un
 * componente declarado dentro de otro se vuelve a crear en cada render, así
 * que la campaña que la persona había desplegado se cerraría sola cada vez
 * que se guarda algo.
 *
 * El detalle —tickets, liquidaciones, deudas, movimientos— se pide recién
 * al desplegarla. Un productor puede tener diez campañas con dos años de
 * gastos cada una; traerlas todas para mostrar una lista de nombres sería
 * pagar por lo que casi nunca se mira.
 *
 * LA FICHA AGRÍCOLA, en el orden del flujo E: Costo (= Puesto + A cosecha),
 * Cobrado, UN SOLO Resultado (caja, regla de la 045) con el renglón gris
 * «si pagás lo que debés a cosecha», Cosechado con kg/ha (y sc/ha en soja,
 * maíz y trigo), y cuántos kg/ha hacen falta para cubrir. Todos los números
 * vienen de `numeros_de_lote`; lo que llega en null (los costos, para quien
 * no administra) no se muestra: se esconde el renglón, ni un guion.
 *
 * El ganadero conserva su tarjeta de siempre (resultado grande, por cabeza)
 * y suma lo que le aplica: el costo con lo que debe a la venta y sus deudas.
 */
export function TarjetaCampana({
  lote, empresaId, moneda, vista, esAdmin, userId, agricola, hoy, sueltos, otrosAbiertos, cuentas,
  ocupado, correr, onEditar, onRepetir, onAviso,
}: {
  lote: Lote;
  empresaId: string;
  /** La moneda de los datos: los montos grandes van en esta. */
  moneda: string;
  /** La otra moneda, si el negocio mira también en otra (051): en gris. */
  vista: Vista;
  esAdmin: boolean;
  userId: string;
  agricola: boolean;
  hoy: string;
  sueltos: MovimientoSuelto[];
  /** Las otras campañas abiertas: un papel puede juntar kilos de más de una. */
  otrosAbiertos: Lote[];
  cuentas: CuentaParaElegir[];
  ocupado: boolean;
  correr: Correr;
  onEditar: (l: Lote) => void;
  onRepetir: (l: Lote) => void;
  onAviso: (mensaje: string) => void;
}) {
  const t = useTextos();
  const tj = t.campanas.tarjeta;
  const locale = useLocale();
  const idioma = useIdioma() === 'pt' ? 'pt' : 'es';
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState<LoteDetalle | null>(null);
  const [hoja, setHoja] = useState<'cosecha' | 'liquidacion' | 'canje' | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');
  const [trayendo, setTrayendo] = useState(false);

  const plata = (n: number) => dinero(n, moneda, true, locale);
  const enOtra = (n: number) => (estaConvertida(vista) ? tj.otraMoneda(dinero(n, vista, true, locale)) : null);
  const sb = () => clienteNavegador();
  const num = (n: number | null | undefined) => (n === null || n === undefined ? null : Number(n));

  /**
   * Sin señal o con la sesión vencida, `resumen_lote` falla: sin leer el
   * error la tarjeta se quedaría en «Cargando…» para siempre y los botones
   * que necesitan el detalle, apagados sin decir por qué. Si ya había un
   * detalle (se volvió a pedir tras guardar), se deja el que estaba y se
   * avisa igual: lo recién guardado ya está en la base.
   */
  async function traerDetalle() {
    setErrorDetalle('');
    setTrayendo(true);
    try {
      const { data, error } = await sb().rpc('resumen_lote', { p_empresa: empresaId, p_lote: lote.id });
      if (error) throw error;
      setDetalle(data ? (data as LoteDetalle) : null);
      if (!data) setErrorDetalle(t.errores.generico);
    } catch (e) {
      setErrorDetalle(mensajeDeError(e, t.errores.generico));
    } finally {
      setTrayendo(false);
    }
  }

  async function alternar() {
    const siguiente = !abierto;
    setAbierto(siguiente);
    if (siguiente && !detalle) await traerDetalle();
  }

  /** Una hoja guardó: se cierra, se trae el detalle de nuevo y se avisa arriba. */
  async function listo(mensaje: string) {
    setHoja(null);
    onAviso(mensaje);
    await traerDetalle();
  }

  // ---- los números (de la base; acá solo se dicen) ----
  const resultado = Number(lote.resultado);
  const costo = num(lote.costo);
  const aCosecha = num(lote.a_cosecha);
  const costoHa = num(lote.costo_ha);
  const resultadoHa = num(lote.resultado_ha);
  const kgCosechados = Number(lote.kg_cosechados) || 0;
  const kgVendidos = Number(lote.kg_vendidos) || 0;
  const kgSinVender = Number(lote.kg_sin_vender) || 0;
  const rendimiento = num(lote.rendimiento);
  const precioProm = num(lote.precio_promedio);
  const precioRef = num(lote.precio_ref);
  const costoTon = num(lote.costo_ton);
  const kgHaCubrir = num(lote.kg_ha_para_cubrir);
  const faltaCubrir = num(lote.falta_cubrir);
  const kgCubrir = num(lote.kg_para_cubrir);
  const conSacas = cultivoPorNombre(lote.cultivo).sacas;
  const debeACosecha = aCosecha !== null && aCosecha > 0;

  const gano = resultado > 0;
  const enRojo = resultado < 0;
  const precio = (p: number) => precioDicho(p, moneda, locale, t);
  const kgHaTexto = (kgHa: number) => (conSacas
    ? `${tj.kgHa(kilos(kgHa, locale))} ${tj.entreParentesis(tj.sacasHa(unDecimal(sacasPorHa(kgHa), locale)))}`
    : tj.kgHa(kilos(kgHa, locale)));

  const subtitulo = agricola
    ? [cultivoVisible(lote.cultivo, idioma), lote.campana, lote.hectareas ? tj.ha(Number(lote.hectareas).toLocaleString(locale)) : '']
      .filter(Boolean).join(' · ')
    : (Number(lote.cantidad) > 0 ? `${Number(lote.cantidad).toLocaleString(locale)} ${lote.unidad}`.trim() : '');
  const dias = lote.estado === 'abierto' ? t.lotes.llevaDias(lote.dias) : t.lotes.duroDias(lote.dias);

  const destinos = detalle
    ? [...detalle.cosechas.map((c) => c.destino), ...detalle.liquidaciones.map((q) => q.comprador)]
    : [];
  const fechaDeLiquidacion = (id: string) => detalle?.liquidaciones.find((q) => q.id === id)?.fecha ?? null;

  // ---- el aviso al cerrar: kilos sin vender o deudas a cosecha ----
  const avisoCierre = (() => {
    const kg = agricola && kgSinVender > 0 ? t.campanas.cierre.quedanKilos(kilos(kgSinVender, locale)) : null;
    const deuda = debeACosecha ? t.campanas.cierre.quedanDeudas(plata(aCosecha as number)) : null;
    if (!kg && !deuda) return null;
    const frase = kg && deuda ? t.campanas.cierre.yTambien(kg, deuda) : kg ?? t.campanas.cierre.todaviaDebes(deuda as string);
    return t.campanas.cierre.conCola(frase, t.campanas.cierre.seCorrige);
  })();

  const puedeBorrar = esAdmin && lote.movimientos === 0 && kgCosechados === 0 && kgVendidos === 0 && !debeACosecha;
  // Sin nada cargado, la tarjeta plegada no dice «US$ 0,00 · 0 movimientos»:
  // dice eso, que todavía no tiene nada (como el panel).
  const vacia = Number(lote.movimientos ?? 0) === 0 && kgCosechados === 0 && !debeACosecha;

  return (
    <li className="px-4 py-3">
      {/* ---------------- la cabeza, siempre a la vista ---------------- */}
      <button type="button" className="flex min-h-[44px] w-full items-start justify-between gap-3 text-left"
        aria-expanded={abierto} onClick={alternar}>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold">{lote.nombre}</span>
          <span className="mt-0.5 block text-[12.5px] text-tinta/50">
            {[subtitulo, dias].filter(Boolean).join(' · ')}
          </span>
        </span>
        {!vacia && (
          <span className="shrink-0 text-right">
            <span className={`block text-[16px] font-bold tabular-nums ${gano ? 'text-verde-fuerte' : enRojo ? 'text-rojo' : ''}`}>
              {plata(resultado)}
            </span>
            <span className="mt-0.5 block text-[11.5px] text-tinta/45">
              {agricola && resultadoHa !== null
                ? tj.porHa(plata(resultadoHa))
                : lote.por_unidad !== null && lote.unidad
                  ? t.lotes.porUnidad(plata(Number(lote.por_unidad)), lote.unidad)
                  : t.lotes.resultado}
            </span>
          </span>
        )}
      </button>

      {/* El resumen es para la tarjeta plegada: desplegada, el detalle de
          abajo dice lo mismo con más precisión y repetirlo confunde. */}
      {!abierto && (vacia ? (
        <p className="mt-2 text-[12.5px] text-tinta/55">{t.lotes.todaviaSinNada}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-tinta/55">
          {/* En la ficha agrícola, administración ve siempre «Costo» (puesto
              + a cosecha, aunque no deba nada): que la etiqueta no cambie
              según haya deudas. «Puesto» queda para quien no ve costos y
              para el ganadero que no debe nada a la venta. */}
          {costo !== null && (agricola || debeACosecha)
            ? <span>{tj.costo}: <b className="tabular-nums">{plata(costo)}</b></span>
            : <span>{t.lotes.puesto}: <b className="tabular-nums">{plata(Number(lote.puesto))}</b></span>}
          <span>{t.lotes.cobrado}: <b className="tabular-nums">{plata(Number(lote.cobrado))}</b></span>
          {agricola && rendimiento !== null
            ? <span className="tabular-nums">{kgHaTexto(rendimiento)}</span>
            : <span>{t.lotes.cuantosMovimientos(lote.movimientos)}</span>}
        </div>
      ))}

      {abierto && (
        <div className="mt-3 space-y-4 rounded-2xl border border-borde bg-arena/40 p-3">
          {lote.notas && <p className="text-[12.5px] leading-relaxed text-tinta/60">{lote.notas}</p>}

          {/* ---------------- los números, en el orden del flujo E ---------------- */}
          <dl className="space-y-2.5 text-[13px]">
            {costo !== null ? (
              <Fila titulo={tj.costo} valor={plata(costo)} extra={costoHa !== null ? tj.entreParentesis(tj.porHa(plata(costoHa))) : null}>
                {debeACosecha && tj.costoFormula(plata(Number(lote.puesto)), plata(aCosecha as number))}
              </Fila>
            ) : (
              <Fila titulo={tj.puesto} valor={plata(Number(lote.puesto))} extra={null} />
            )}
            <Fila titulo={tj.cobrado} valor={plata(Number(lote.cobrado))} extra={null}>
              {kgVendidos > 0 && precioProm !== null && tj.vendidosA(kilos(kgVendidos, locale), precio(precioProm))}
            </Fila>
            <Fila
              titulo={tj.resultado} valor={plata(resultado)} fuerte
              tono={gano ? 'text-verde-fuerte' : enRojo ? 'text-rojo' : ''}
              extra={resultadoHa !== null ? tj.entreParentesis(tj.porHa(plata(resultadoHa))) : null}
            >
              {[agricola && kgSinVender > 0 ? tj.enElSiloSinVender(kilos(kgSinVender, locale)) : '', enOtra(resultado) ?? '']
                .filter(Boolean).join(' · ') || null}
            </Fila>
            {/* El único segundo número del resultado, y en gris: no es otro «Resultado». */}
            {debeACosecha && (
              <p className="-mt-1.5 pl-[92px] text-[12px] text-tinta/45">{tj.siPagasLoQueDebes(plata(resultado - (aCosecha as number)))}</p>
            )}
            {agricola && kgSinVender < 0 && (
              <p className="rounded-xl bg-ambar-claro px-3 py-2 text-[12.5px] font-medium text-ambar">{tj.vendisteMasQueCosecha}</p>
            )}
            {agricola && kgCosechados > 0 && (
              <Fila titulo={tj.cosechado} valor={tj.kilos(kilos(kgCosechados, locale))} extra={null}>
                {[rendimiento !== null ? kgHaTexto(rendimiento) : '', costoTon !== null ? tj.teSalioLaTonelada(plata(costoTon)) : '']
                  .filter(Boolean).join(' · ') || null}
              </Fila>
            )}
            {agricola && esAdmin && (
              kgHaCubrir !== null && precioRef !== null ? (
                <p className="rounded-xl bg-superficie px-3 py-2 text-[12.5px] leading-snug text-tinta/70">
                  {conSacas
                    ? tj.paraCubrirSacas(kilos(kgHaCubrir, locale), unDecimal(sacasPorHa(kgHaCubrir), locale), precio(precioRef))
                    : tj.paraCubrir(kilos(kgHaCubrir, locale), precio(precioRef))}
                  {faltaCubrir !== null && faltaCubrir > 0 && kgCubrir !== null
                    ? ` · ${tj.teFaltanVender(kilos(kgCubrir, locale))}${kgSinVender > 0 ? ` ${tj.yTenesEnSilo(kilos(kgSinVender, locale))}` : ''}`
                    : faltaCubrir === 0 && costo !== null && costo > 0 ? ` · ${tj.costoCubierto}` : ''}
                </p>
              ) : costo !== null && costo > 0 && precioRef === null ? (
                <p className="text-[12.5px] text-tinta/50">{tj.sinPrecioAun}</p>
              ) : null
            )}
          </dl>

          {/* ---------------- lo que se carga desde acá ---------------- */}
          <div className="flex flex-wrap gap-2">
            {agricola && (
              <button type="button" className="boton-principal min-h-[44px] px-4 text-[13.5px]" disabled={ocupado}
                onClick={() => setHoja('cosecha')}>
                {tj.cosecha}
              </button>
            )}
            {agricola && esAdmin && (
              <button type="button" className="boton-suave min-h-[44px] px-4 text-[13.5px]" disabled={ocupado || !detalle}
                onClick={() => setHoja('liquidacion')}>
                {tj.liquidacion}
              </button>
            )}
            {/* Solo en las abiertas: Gastos ofrece nada más que campañas
                abiertas, y un ?lote= de una cerrada lo descarta y precarga
                la última campaña usada; el gasto se colgaría de otra sin
                que la persona la haya elegido. */}
            {lote.estado === 'abierto' && (
              <Link href={`/gastos?lote=${lote.id}`} className="boton-suave min-h-[44px] px-4 text-[13.5px]">
                {tj.cargarGasto}
              </Link>
            )}
            {agricola && esAdmin && (
              <button type="button" className="boton-texto min-h-[44px] px-1 text-[13px]" disabled={ocupado || !detalle}
                onClick={() => setHoja('canje')}>
                {t.campanas.liquidacion.entregueKilosPara}
              </button>
            )}
          </div>

          {errorDetalle && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rojo-claro px-3 py-2">
              <p className="text-[13px] font-medium text-rojo">{errorDetalle}</p>
              <button type="button" className="boton-texto min-h-[44px] px-2 text-[13px]" disabled={trayendo}
                onClick={() => void traerDetalle()}>
                {trayendo ? t.comun.cargando : t.comun.reintentar}
              </button>
            </div>
          )}

          {detalle === null ? (
            !errorDetalle && <p className="py-2 text-center text-[13px] text-tinta/45">{t.comun.cargando}</p>
          ) : (
            <>
              {/* ---------------- en qué se fue ---------------- */}
              {detalle.estructura && detalle.estructura.length > 0 && (
                <Bloque titulo={tj.estructura} detalle={tj.estructuraDetalle}>
                  <div className="space-y-2.5">
                    {(() => {
                      const total = detalle.estructura.reduce((a, e) => a + Number(e.monto), 0);
                      return detalle.estructura.map((e) => {
                        const pct = total > 0 ? (Number(e.monto) / total) * 100 : 0;
                        return (
                          <div key={e.categoria}>
                            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                              <span className="truncate font-medium">{categoriaDeCampana(t, e.categoria)}</span>
                              <span className="shrink-0 tabular-nums text-tinta/70">
                                {plata(Number(e.monto))} · {tj.porcentaje(Math.round(pct).toLocaleString(locale))}
                              </span>
                            </div>
                            <Barra porcentaje={pct} tono="rojo" />
                          </div>
                        );
                      });
                    })()}
                  </div>
                </Bloque>
              )}

              {/* ---------------- tickets y liquidaciones ---------------- */}
              {agricola && (
                <Bloque titulo={tj.tickets}>
                  <ListaCosechas
                    empresaId={empresaId} cosechas={detalle.cosechas} esAdmin={esAdmin} userId={userId} hoy={hoy}
                    onCambio={listo}
                  />
                </Bloque>
              )}
              {(agricola || detalle.liquidaciones.length > 0) && (
                <Bloque titulo={tj.liquidaciones}>
                  <ListaLiquidaciones
                    empresaId={empresaId} moneda={moneda} liquidaciones={detalle.liquidaciones}
                    movimientos={detalle.movimientos} esAdmin={esAdmin} hoy={hoy} onCambio={listo}
                  />
                </Bloque>
              )}

              {/* ---------------- lo que debe a cosecha ---------------- */}
              {detalle.deudas && detalle.deudas.length > 0 && (
                <Bloque titulo={t.campanas.deudas.titulo} detalle={t.campanas.deudas.detalle}>
                  <ul className="divide-y divide-borde/70">
                    {detalle.deudas.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium">{d.nombre}</span>
                          <span className="block truncate text-[11.5px] text-tinta/45">
                            {[d.acreedor && t.campanas.deudas.a(d.acreedor),
                              d.vence_el ? t.campanas.deudas.vence(fechaCorta(d.vence_el, locale, hoy)) : t.campanas.deudas.sinVence]
                              .filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-[13.5px] font-semibold tabular-nums text-rojo">{plata(Number(d.saldo))}</span>
                          <Link href="/deudas" className="boton-texto flex min-h-[44px] items-center px-1 text-[12.5px]">
                            {t.campanas.deudas.pagar}
                          </Link>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Bloque>
              )}

              {/* ---------------- los movimientos ---------------- */}
              <Bloque titulo={tj.movimientos}>
                {detalle.movimientos.length === 0 ? (
                  <p className="text-[13px] text-tinta/55">{tj.todaviaSinNada}</p>
                ) : (
                  <ul className="divide-y divide-borde/70">
                    {detalle.movimientos.map((m) => {
                      const deLiq = m.liquidacion_id ? fechaDeLiquidacion(m.liquidacion_id) : null;
                      return (
                        <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                          <span className="min-w-0">
                            <span className={`block truncate text-[13.5px] font-medium ${
                              m.estado === 'anulado' ? 'text-tinta/35 line-through' : ''}`}>
                              {m.descripcion || categoriaVisible(t, m.categoria)}
                            </span>
                            <span className="block truncate text-[11.5px] text-tinta/45">
                              {[
                                fechaLegible(m.fecha, false, locale),
                                categoriaDeCampana(t, m.categoria),
                                m.monto_original !== null && m.moneda_original && m.cambio !== null
                                  ? t.gastosCampana.moneda.original(
                                    dinero(Number(m.monto_original), m.moneda_original, true, locale),
                                    dolarDicho(moneda, m.moneda_original, Number(m.cambio)).toLocaleString(locale),
                                  ) : '',
                              ].filter(Boolean).join(' · ')}
                            </span>
                            {m.liquidacion_id && (
                              <span className="block truncate text-[11.5px] text-tinta/45">
                                {deLiq ? t.campanas.liquidacion.parteDe(fechaCorta(deLiq, locale, hoy)) : t.campanas.liquidacion.parteDeDetalle}
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className={`text-[13.5px] font-semibold tabular-nums ${
                              m.estado === 'anulado' ? 'text-tinta/35'
                                : m.tipo === 'gasto' ? 'text-rojo' : 'text-verde-fuerte'}`}>
                              {m.tipo === 'gasto' ? '−' : '+'}{plata(Number(m.monto))}
                            </span>
                            {/* Lo que nació en una liquidación se maneja desde la liquidación. */}
                            {m.estado === 'activo' && !m.liquidacion_id && (
                              <button type="button" className="boton-texto flex min-h-[44px] items-center px-1 text-[12px]"
                                disabled={ocupado}
                                onClick={async () => {
                                  const hecho = await correr('sacar', async () =>
                                    sb().rpc('asignar_a_lote', { p_movimiento: m.id, p_lote: null }));
                                  if (hecho) await traerDetalle();
                                }}>
                                {t.lotes.sacar}
                              </button>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Bloque>

              {/* ---------------- sumarle algo que ya estaba cargado ---------------- */}
              {sueltos.length > 0 && (
                <Bloque titulo={t.lotes.sumarAlgo} detalle={t.lotes.sumarAlgoDetalle}>
                  <ul className="max-h-56 space-y-1 overflow-y-auto">
                    {sueltos.map((m) => (
                      <li key={m.id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-superficie px-2.5 py-1.5">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">
                            {m.descripcion || categoriaVisible(t, m.categoria)}
                          </span>
                          <span className="text-[11.5px] text-tinta/45">
                            {fechaLegible(m.fecha, false, locale)} · {plata(Number(m.monto))}
                          </span>
                        </span>
                        <button type="button" className="boton-suave min-h-[44px] shrink-0 px-3 text-[12px]"
                          disabled={ocupado}
                          onClick={async () => {
                            const hecho = await correr('sumar', async () =>
                              sb().rpc('asignar_a_lote', { p_movimiento: m.id, p_lote: lote.id }));
                            if (hecho) await traerDetalle();
                          }}>
                          {t.lotes.sumar}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Bloque>
              )}
            </>
          )}

          {/* ---------------- la letra chica ---------------- */}
          <p className="text-[11.5px] leading-snug text-tinta/45">{esAdmin ? tj.costoDirecto : tj.soloAdminCostos}</p>

          {/* ---------------- editar, repetir, cerrar, reabrir, borrar ---------------- */}
          {esAdmin && (
            <div className="flex flex-wrap items-center gap-2 border-t border-borde pt-3">
              {lote.estado === 'abierto' ? (
                <button type="button" className="boton-principal min-h-[44px] px-4 text-[13px]" disabled={ocupado}
                  onClick={() => setCerrando(true)}>
                  {t.lotes.cerrar}
                </button>
              ) : (
                <button type="button" className="boton-suave min-h-[44px] px-4 text-[13px]" disabled={ocupado}
                  onClick={async () => {
                    const hecho = await correr('reabrir', async () =>
                      sb().rpc('reabrir_lote', { p_empresa: empresaId, p_id: lote.id }));
                    if (hecho) onAviso(t.campanas.cierre.reabierto);
                  }}>
                  {t.lotes.reabrir}
                </button>
              )}
              <button type="button" className="boton-suave min-h-[44px] px-4 text-[13px]" disabled={ocupado}
                onClick={() => onEditar(lote)}>
                {t.campanas.formulario.editar}
              </button>
              {lote.estado === 'cerrado' && (
                <button type="button" className="boton-suave min-h-[44px] px-4 text-[13px]" disabled={ocupado}
                  onClick={() => onRepetir(lote)}>
                  {t.campanas.formulario.repetir}
                </button>
              )}
              {puedeBorrar && (
                <button type="button" className="boton-texto min-h-[44px] px-1 text-[13px]" disabled={ocupado}
                  onClick={() => correr('borrar', async () =>
                    sb().rpc('borrar_lote', { p_empresa: empresaId, p_id: lote.id }))}>
                  {t.comun.borrar}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------------- las hojas ---------------- */}
      {hoja === 'cosecha' && (
        <FormularioCosecha
          empresaId={empresaId} lote={lote} hoy={hoy} destinos={destinos}
          onCerrar={() => setHoja(null)} onListo={listo}
        />
      )}
      {(hoja === 'liquidacion' || hoja === 'canje') && detalle && (
        <FormularioLiquidacion
          empresaId={empresaId} moneda={moneda} vista={vista} lote={lote} deudas={detalle.deudas ?? []}
          destinos={destinos} otrosLotes={otrosAbiertos} cuentas={cuentas} hoy={hoy} canje={hoja === 'canje'}
          onCerrar={() => setHoja(null)} onListo={listo}
        />
      )}
      {cerrando && (
        <Confirmar
          titulo={t.lotes.cerrar}
          detalle={avisoCierre ?? t.lotes.confirmarCerrar(lote.nombre)}
          si={avisoCierre ? t.campanas.cierre.cerrarIgual : t.lotes.cerrar}
          ocupado={ocupado}
          onNo={() => setCerrando(false)}
          onSi={async () => {
            const hecho = await correr('cerrar', async () =>
              sb().rpc('cerrar_lote', { p_empresa: empresaId, p_id: lote.id }));
            setCerrando(false);
            if (hecho) onAviso(t.campanas.cierre.cerrado);
          }}
        />
      )}
    </li>
  );
}

/** Un renglón de números: el título a la izquierda, el monto grande, y abajo el detalle gris. */
function Fila({
  titulo, valor, extra, fuerte = false, tono = '', children,
}: {
  titulo: string;
  valor: string;
  /** «(824/ha)», ya con sus paréntesis: al lado del monto. */
  extra: string | null;
  fuerte?: boolean;
  tono?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <dt className="w-20 shrink-0 text-[12.5px] font-semibold text-tinta/55">{titulo}</dt>
        <dd className={`min-w-0 tabular-nums ${fuerte ? 'text-[17px] font-extrabold' : 'text-[15px] font-bold'} ${tono}`}>
          {valor}
          {/* Un espacio de verdad antes del paréntesis, y el paréntesis entero
              en un renglón: a 375 px se partía en «(US$» / «308,00/ha)». */}
          {extra && <>{' '}<span className="whitespace-nowrap text-[12px] font-medium text-tinta/50">{extra}</span></>}
        </dd>
      </div>
      {children && <p className="mt-0.5 pl-[92px] text-[12px] leading-snug text-tinta/50">{children}</p>}
    </div>
  );
}

/** Un bloque del detalle: título chico, una línea de por qué, y lo suyo. */
function Bloque({ titulo, detalle, children }: { titulo: string; detalle?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-borde pt-3">
      <h3 className="text-[13px] font-bold">{titulo}</h3>
      {detalle && <p className="mb-2 mt-0.5 text-[12px] leading-snug text-tinta/45">{detalle}</p>}
      <div className={detalle ? '' : 'mt-2'}>{children}</div>
    </section>
  );
}
