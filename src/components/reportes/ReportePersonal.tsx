import type { Textos } from '@/i18n';
import { categoriaVisible } from '@/i18n/nombres';
import { clienteServidor } from '@/lib/supabase/servidor';
import {
  traerAhorroDelPeriodo, traerFiadoDelPeriodo, traerGastosPorCategoria, traerIngresosPorCategoria, traerSerieDiaria,
} from '@/lib/agregados';
import { traerResumenPersonal } from '@/lib/personal';
import { traerDeudas } from '@/lib/deudas';
import { traerResumenFiado } from '@/lib/fiado';
import { variacion, type FilaCategoria } from '@/lib/calculos';
import { dinero, dineroCorto, fechaLegible, porcentaje, type Moneda } from '@/lib/formato';
import { Barra, Seccion, Vacio } from '@/components/Piezas';
import { diaDeCobro } from '@/components/reportes/comunes/ciclo';
import type { PropsReporte } from '@/components/reportes/comunes/tipos';
import {
  barrasPorCiclo, ciclosDelRango, deudasDelReporte, enQueSeFue, entroDe, etiquetaTramo, fijosDelCiclo,
  metasDeAhorro, presupuestoAplica, salioDe, ultimosCiclos,
  type BarraCiclo, type ExtrasPersonal, type PagoDeudaDelReporte,
} from '@/lib/reportes/excel-personal';

/**
 * EL REPORTE DE LA CUENTA PERSONAL (23/09).
 *
 * Antes contestaba tres preguntas: cuánto entró y salió, de dónde vino y en
 * qué se fue. Le faltaban las que separan a Orden de una planilla: ¿me
 * alcanzó, voy mejor o peor que el ciclo pasado?, ¿me pasé del
 * presupuesto?, ¿pagué los fijos?, ¿llego a mis metas?, ¿cuánto debo?
 *
 * Mide de cobro a cobro (el rango «Este ciclo» lo arma la página). Cada
 * número que no viene hecho de la base sale de las funciones puras de
 * `src/lib/reportes/excel-personal.ts`, las mismas que arman el Excel: la
 * pantalla y el archivo no pueden decir dos cosas distintas.
 *
 * Los números van uno por fila con el monto entero a la derecha, como en el
 * panel personal (lo eligió Matías): en una cuadrícula, «Gs. 1,8 M» se
 * partía en renglones en un teléfono.
 */
export async function ReportePersonal({
  empresaId, rango, previo, resumen: r, resumenPrevio: rp, moneda, t, locale,
}: PropsReporte) {
  const dia = await diaDeCobro(empresaId);
  const tramos = ultimosCiclos(rango.hasta, dia, 6);

  const [[extras, ingresos, gastos, ahorro, serie], guardadoPorTramo] = await Promise.all([
    Promise.all([
      leerExtrasPersonal(empresaId, rango.desde, rango.hasta, previo, moneda, { dia }),
      traerIngresosPorCategoria(empresaId, rango.desde, rango.hasta),
      traerGastosPorCategoria(empresaId, rango.desde, rango.hasta),
      traerAhorroDelPeriodo(empresaId, rango.desde, rango.hasta),
      traerSerieDiaria(empresaId, tramos[0].desde, rango.hasta),
    ]),
    // Lo guardado en cada uno de los seis tramos de las barras: seis
    // lecturas chicas de `resumen_ahorro_periodo`, la misma que da «Guardé».
    Promise.all(tramos.map((x) => traerAhorroDelPeriodo(empresaId, x.desde, x.hasta).then((a) => a.neto))),
  ]);

  const tp = t.reportesPersonal;
  const plata = (n: number) => dinero(n, moneda, true, locale);
  const corto = (n: number) => dineroCorto(n, moneda, locale, t.formato);

  const entro = entroDe(r);
  const salio = salioDe(r);
  const teQuedo = entro - salio;
  const ciclos = ciclosDelRango(rango.desde, rango.hasta, dia);
  const gasto = enQueSeFue(gastos, extras.presupuesto, ciclos);
  const fijos = fijosDelCiclo(extras.fijos, gastos);
  const metas = metasDeAhorro(extras.fondos, ahorro);
  const deudas = deudasDelReporte(extras.deudas, extras.pagosDeuda);
  const barras = barrasPorCiclo(tramos, serie, guardadoPorTramo);

  return (
    <>
      {/* ---------- ¿Me alcanzó? Los cuatro números contra el período anterior ---------- */}
      <section className="tarjeta divide-y divide-borde">
        <FilaVariacion titulo={tp.numeros.entro} actual={entro} anterior={entroDe(rp)} plata={plata} t={t} tono="bueno" />
        <FilaVariacion titulo={tp.numeros.salio} actual={salio} anterior={salioDe(rp)} plata={plata} t={t} tono="malo" subirEsBueno={false} />
        <FilaVariacion
          titulo={tp.numeros.guarde} actual={ahorro.neto} anterior={extras.guardadoPrevio} plata={plata} t={t}
          detalle={tp.numeros.guardeDetalle}
        />
        <FilaVariacion
          titulo={tp.numeros.teQuedo} actual={teQuedo} anterior={entroDe(rp) - salioDe(rp)} plata={plata} t={t}
          tono={teQuedo >= 0 ? 'bueno' : 'malo'} detalle={tp.numeros.teQuedoDetalle} fuerte
        />
      </section>

      <p className="text-[13px] leading-relaxed text-tinta/55">
        {entro === 0 && salio === 0
          ? tp.frase.nada
          : teQuedo >= 0 ? tp.frase.sobro(plata(teQuedo)) : tp.frase.deMas(plata(Math.abs(teQuedo)))}
      </p>

      {/* ---------- Cómo viene: seis ciclos (o meses) ---------- */}
      <BarrasPorCiclo barras={barras} dia={dia} moneda={moneda} locale={locale} t={t} />

      {/* ---------- En qué se fue, con el presupuesto al lado ---------- */}
      <Seccion titulo={tp.enQueSeFue.titulo}>
        {gasto.filas.length === 0 ? (
          <Vacio titulo={tp.enQueSeFue.vacio} detalle={tp.enQueSeFue.vacioDetalle} />
        ) : (
          <>
            {presupuestoAplica(ciclos) && gasto.planeadoTotal > 0 && (
              <p className={`px-4 pt-1 text-[13px] font-semibold ${gasto.pasadas > 0 ? 'text-rojo' : 'text-verde-fuerte'}`}>
                {gasto.pasadas > 0 ? tp.enQueSeFue.pasadas(gasto.pasadas) : tp.enQueSeFue.ningunaPasada}
              </p>
            )}
            <ul className="mt-2 divide-y divide-borde border-t border-borde">
              {gasto.filas.map((g) => (
                <li key={g.nombre} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[14.5px] font-semibold">{categoriaVisible(t, g.nombre)}</span>
                    <span className="shrink-0 text-[14.5px] font-bold tabular-nums">
                      {g.monto > 0 ? plata(g.monto) : tp.enQueSeFue.planSinGastar}
                    </span>
                  </div>
                  <div className="mt-2">
                    <Barra
                      porcentaje={g.usado ?? g.participacion}
                      tono={g.semaforo === 'pasado' ? 'rojo' : g.semaforo === 'cerca' ? 'ambar' : g.semaforo ? 'verde' : 'rojo'}
                    />
                  </div>
                  <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-[12px] tabular-nums text-tinta/50">
                    {g.planeado !== null && g.diferencia !== null ? (
                      <>
                        <span>{tp.enQueSeFue.dePlan(plata(g.planeado))}</span>
                        <span className={`font-semibold ${g.diferencia < 0 ? 'text-rojo' : g.semaforo === 'cerca' ? 'text-ambar' : 'text-verde-fuerte'}`}>
                          {g.diferencia < 0 ? tp.enQueSeFue.tePasaste(plata(-g.diferencia)) : tp.enQueSeFue.quedan(plata(g.diferencia))}
                        </span>
                      </>
                    ) : (
                      <>
                        <span>{porcentaje(g.participacion, 0)}</span>
                        {presupuestoAplica(ciclos) && gasto.planeadoTotal > 0 && <span>{tp.enQueSeFue.sinPlan}</span>}
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
            {extras.presupuesto.length > 0 && (
              <p className="border-t border-borde px-4 py-3 text-[12.5px] leading-relaxed text-tinta/50">
                {presupuestoAplica(ciclos) ? tp.enQueSeFue.contraPlanDeHoy(ciclos) : tp.enQueSeFue.soloPorCiclo}
              </p>
            )}
          </>
        )}
      </Seccion>

      {/* ---------- De dónde vino ---------- */}
      <Seccion titulo={tp.deDondeVino.titulo}>
        <ListaCategorias filas={ingresos} plata={plata} t={t} vacio={tp.deDondeVino.vacio} detalleVacio={tp.deDondeVino.vacioDetalle} />
        {extras.teDeben && extras.teDeben.devuelto > 0 && (
          <p className="border-t border-borde px-4 py-3 text-[12.5px] leading-relaxed text-tinta/50">{tp.teDeben.notaDevuelto}</p>
        )}
      </Seccion>

      {/* ---------- Los fijos del ciclo ---------- */}
      {fijos.filas.length > 0 && (
        <Seccion
          titulo={ciclos === 1 ? tp.fijos.titulo : tp.fijos.tituloRango}
          accion={ciclos === 1 ? (
            <span className={`text-[12.5px] font-semibold ${fijos.falta > 0 ? 'text-rojo' : 'text-verde-fuerte'}`}>
              {fijos.falta > 0 ? tp.fijos.faltaTotal(corto(fijos.falta)) : tp.fijos.todoPagado}
            </span>
          ) : undefined}
        >
          <ul className="mt-2 divide-y divide-borde border-t border-borde">
            {fijos.filas.map((f, i) => (
              <li key={`${f.nombre}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-semibold">{f.nombre}</span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-tinta/50">
                    {categoriaVisible(t, f.categoria)} · {f.dia_del_mes ? tp.fijos.venceEl(f.dia_del_mes) : tp.fijos.sinDia}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[14.5px] font-bold tabular-nums">{plata(f.importe)}</span>
                  {ciclos === 1 ? (
                    <span className={`pastilla mt-1 ${f.estado === 'pagado' ? 'bg-verde-claro text-verde-fuerte' : f.estado === 'parcial' ? 'bg-ambar-claro text-ambar' : 'bg-rojo-claro text-rojo'}`}>
                      {f.estado === 'pagado' ? tp.fijos.pagado : f.estado === 'parcial' ? tp.fijos.falta(corto(f.falta)) : tp.fijos.pendiente}
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-[12px] tabular-nums text-tinta/50">{tp.fijos.gastadoCategoria(corto(f.gastadoCategoria))}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-borde px-4 py-3 text-[12.5px] leading-relaxed text-tinta/50">
            {ciclos === 1 ? tp.fijos.regla : tp.fijos.soloPorCiclo}
          </p>
        </Seccion>
      )}

      {/* ---------- Ahorro y metas ---------- */}
      {metas.length > 0 && (
        <Seccion titulo={tp.ahorro.titulo}>
          <ul className="mt-2 divide-y divide-borde border-t border-borde">
            {metas.map((m) => {
              // Un fondo en otra moneda se muestra en la suya (073), sin convertir.
              const deFondo = (n: number) => (m.moneda ? dinero(n, m.moneda, true, locale) : plata(n));
              const avance = m.meta && m.meta > 0 ? (m.saldo / m.meta) * 100 : null;
              return (
                <li key={m.nombre} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[14.5px] font-semibold">{m.nombre}</span>
                    <span className="shrink-0 text-[14.5px] font-bold tabular-nums">{deFondo(m.saldo)}</span>
                  </div>
                  <p className={`mt-0.5 text-[12.5px] tabular-nums ${m.guardadoEnPeriodo < 0 ? 'text-rojo' : m.guardadoEnPeriodo > 0 ? 'text-verde-fuerte' : 'text-tinta/45'}`}>
                    {m.guardadoEnPeriodo > 0 ? tp.ahorro.guardadoPeriodo(plata(m.guardadoEnPeriodo))
                      : m.guardadoEnPeriodo < 0 ? tp.ahorro.sacastePeriodo(plata(-m.guardadoEnPeriodo))
                        : tp.ahorro.sinMovimiento}
                  </p>
                  {m.meta !== null && avance !== null ? (
                    <>
                      <div className="mt-2"><Barra porcentaje={avance} /></div>
                      <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-[12px] tabular-nums text-tinta/50">
                        <span>
                          {tp.ahorro.meta(deFondo(m.meta))}
                          {m.fecha_limite ? ` ${tp.ahorro.paraEl(fechaLegible(m.fecha_limite, true, locale))}` : ''}
                        </span>
                        <span className="font-semibold">
                          {m.falta === 0 ? tp.ahorro.cumplida
                            : m.fecha_limite && m.por_mes === null ? `${tp.ahorro.fechaPasada} · ${tp.ahorro.falta(deFondo(m.falta ?? 0))}`
                              : m.por_mes !== null ? tp.ahorro.porMes(deFondo(m.por_mes))
                                : tp.ahorro.falta(deFondo(m.falta ?? 0))}
                        </span>
                      </p>
                    </>
                  ) : (
                    <p className="mt-0.5 text-[12px] text-tinta/40">{tp.ahorro.sinMeta}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Seccion>
      )}

      {/* ---------- Deudas y cuotas ---------- */}
      {deudas.filas.length > 0 && (
        <Seccion titulo={tp.deudas.titulo}>
          <div className="divide-y divide-borde">
            <FilaSimple titulo={tp.deudas.debesHoy} valor={plata(deudas.debesHoy)} tono="malo"
              detalle={deudas.proximoVencimiento ? tp.deudas.proximo(fechaLegible(deudas.proximoVencimiento, false, locale)) : undefined} />
            <FilaSimple titulo={tp.deudas.pagadoPeriodo} valor={plata(deudas.pagadoEnPeriodo)} />
          </div>
          <ul className="divide-y divide-borde border-t border-borde">
            {deudas.filas.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-semibold">{d.nombre}</span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-tinta/50">
                    {[
                      d.cuotas_totales ? tp.deudas.cuotas(d.cuotas_pagadas, d.cuotas_totales) : null,
                      d.monto_cuota ? tp.deudas.cuota(corto(d.monto_cuota)) : null,
                      d.saldo > 0 && d.vence_el
                        ? (d.vencida ? tp.deudas.vencio : tp.deudas.vence)(fechaLegible(d.vence_el, false, locale))
                        : null,
                    ].filter(Boolean).join(' · ') || ' '}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-[14.5px] font-bold tabular-nums ${d.saldo > 0 ? 'text-rojo' : 'text-verde-fuerte'}`}>
                    {d.saldo > 0 ? plata(d.saldo) : tp.deudas.saldada}
                  </span>
                  {d.pagadoEnPeriodo > 0 && (
                    <span className="mt-0.5 block text-[12px] tabular-nums text-tinta/50">{tp.deudas.pagaste(corto(d.pagadoEnPeriodo))}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {/* ---------- Lo que te deben ---------- */}
      {extras.teDeben && (extras.teDeben.totalHoy > 0 || extras.teDeben.devuelto > 0 || extras.teDeben.prestado > 0) && (
        <Seccion titulo={tp.teDeben.titulo}>
          <div className="mt-1 divide-y divide-borde border-t border-borde">
            <FilaSimple titulo={tp.teDeben.total} valor={plata(extras.teDeben.totalHoy)} tono="bueno"
              detalle={extras.teDeben.cuantos > 0 ? tp.teDeben.cuantos(extras.teDeben.cuantos) : undefined} />
            {extras.teDeben.prestado > 0 && <FilaSimple titulo={tp.teDeben.prestado} valor={plata(extras.teDeben.prestado)} />}
            {extras.teDeben.devuelto > 0 && (
              <FilaSimple titulo={tp.teDeben.devuelto} valor={plata(extras.teDeben.devuelto)} detalle={tp.teDeben.notaDevuelto} />
            )}
          </div>
        </Seccion>
      )}
    </>
  );
}

// =====================================================================
// LA LECTURA: la usan la pantalla y la ruta del Excel
// =====================================================================

/**
 * LO PROPIO DE LA CUENTA PERSONAL, LEÍDO PARA UN RANGO.
 *
 * Lo usan esta pantalla y la rama «personal» de `/api/excel`, así los dos
 * parten de lo mismo. Ninguna lectura nueva en la base: el presupuesto, los
 * fijos y los fondos con su meta salen de `resumen_personal` (su parte de
 * «hoy»: qué planeaste, qué fijos tenés, cuánto hay en cada fondo); lo del
 * rango lo calculan las funciones puras. Los pagos de deuda se leen de la
 * tabla (la 015 deja verlos a los miembros), página por página.
 *
 * Si CUALQUIER lectura falla, lanza: un «debés 0» o «te deben 0» porque no
 * se pudo leer es peor que no mostrar nada.
 *
 * `nombre`: cómo se escribe una categoría. La pantalla compara en español
 * (como se guardan); el Excel pasa `categoriaVisible`, porque sus categorías
 * de gasto llegan ya traducidas. `moneda`: de dónde sale la moneda propia,
 * para saber qué fondo está en otra.
 */
export async function leerExtrasPersonal(
  empresaId: string,
  desde: string,
  hasta: string,
  previo: { desde: string; hasta: string },
  moneda: Moneda,
  o: { dia?: number | null; nombre?: (categoria: string) => string } = {},
): Promise<ExtrasPersonal> {
  const nombre = o.nombre ?? ((c: string) => c);
  const propia = typeof moneda === 'string' ? moneda : moneda.propia;
  const [dia, personal, ahorroPrevio, deudas, pagosDeuda, fiado, fiadoPeriodo] = await Promise.all([
    o.dia === undefined ? diaDeCobro(empresaId) : Promise.resolve(o.dia),
    traerResumenPersonal(empresaId),
    traerAhorroDelPeriodo(empresaId, previo.desde, previo.hasta),
    traerDeudas(empresaId, true),
    traerPagosDeDeuda(empresaId, desde, hasta),
    traerResumenFiado(empresaId),
    traerFiadoDelPeriodo(empresaId, desde, hasta),
  ]);

  const num = (n: unknown) => Number(n ?? 0);
  const numQuizas = (n: unknown) => (n === null || n === undefined ? null : Number(n));

  return {
    diaCobro: dia,
    guardadoPrevio: ahorroPrevio.neto,
    presupuesto: (personal.plan ?? []).map((p) => ({ categoria: nombre(p.categoria), planeado: num(p.planeado) })),
    fijos: (personal.gastos_fijos ?? []).map((f) => ({
      nombre: f.nombre, categoria: nombre(f.categoria), importe: num(f.importe), dia_del_mes: f.dia_del_mes ?? null,
    })),
    fondos: (personal.ahorros ?? []).map((a) => ({
      nombre: a.nombre,
      moneda: a.moneda && a.moneda !== propia ? a.moneda : null,
      saldo: num(a.saldo),
      meta: numQuizas(a.meta),
      fecha_limite: a.fecha_limite ?? null,
      falta: numQuizas(a.falta),
      por_mes: numQuizas(a.por_mes),
    })),
    deudas: deudas.map((d) => ({
      id: d.id, tipo: d.tipo, nombre: d.nombre, acreedor: d.acreedor ?? '',
      monto_original: num(d.monto_original), saldo: num(d.saldo),
      cuotas_totales: d.cuotas_totales ?? null, cuotas_pagadas: num(d.cuotas_pagadas),
      monto_cuota: numQuizas(d.monto_cuota), vence_el: d.vence_el ?? null, vencida: !!d.vencida, activa: !!d.activa,
    })),
    pagosDeuda,
    teDeben: { totalHoy: fiado.total, cuantos: fiado.cuantos, devuelto: fiadoPeriodo.cobrado, prestado: fiadoPeriodo.otorgado },
  };
}

/** Los pagos de todas las deudas en el rango. La Data API recorta cada respuesta: se pide por páginas. */
async function traerPagosDeDeuda(empresaId: string, desde: string, hasta: string): Promise<PagoDeudaDelReporte[]> {
  const supabase = clienteServidor();
  const filas: PagoDeudaDelReporte[] = [];
  const TAMANO = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('pagos_deuda').select('id, deuda_id, fecha, monto, nota')
      .eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta)
      .order('fecha').order('id')
      .range(filas.length, filas.length + TAMANO - 1);
    if (error) throw error;
    if (!data || data.length === 0) return filas;
    filas.push(...data.map((p: any) => ({
      deuda_id: String(p.deuda_id), fecha: String(p.fecha), monto: Number(p.monto), nota: String(p.nota ?? ''),
    })));
  }
}

// =====================================================================
// LAS PIEZAS
// =====================================================================

/**
 * Un número por fila con su flecha contra el período anterior. Misma regla
 * que `IndicadorVariacion`: sin nada antes no inventa un porcentaje («Antes:
 * nada»), y en «Salió» subir se pinta de rojo.
 */
function FilaVariacion({
  titulo, actual, anterior, plata, t, detalle, tono, subirEsBueno = true, fuerte = false,
}: {
  titulo: string;
  actual: number;
  anterior: number;
  plata: (n: number) => string;
  t: Textos;
  detalle?: string;
  tono?: 'bueno' | 'malo';
  subirEsBueno?: boolean;
  fuerte?: boolean;
}) {
  const v = !actual && !anterior ? undefined : variacion(actual, anterior);
  const bueno = typeof v === 'number' && (v === 0 || (v > 0) === subirEsBueno);
  const color = tono === 'bueno' ? 'text-verde-fuerte' : tono === 'malo' ? 'text-rojo' : '';
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <span className="min-w-0">
        <span className={`block text-[14.5px] ${fuerte ? 'font-bold' : 'font-semibold'}`}>{titulo}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {typeof v === 'number' && (
            <span
              className={`pastilla ${bueno ? 'bg-verde-claro text-verde-fuerte' : 'bg-rojo-claro text-rojo'}`}
              title={t.reportesComunes.indicador.contraAnterior(porcentaje(Math.abs(v), 0), plata(anterior))}
            >
              <span aria-hidden="true">{v >= 0 ? '▲' : '▼'}</span> {porcentaje(Math.abs(v), 0)}
            </span>
          )}
          {v === null && <span className="text-[12px] font-semibold text-tinta/40">{t.reportesComunes.indicador.antesNada}</span>}
          {detalle && <span className="text-[12px] text-tinta/45">{detalle}</span>}
        </span>
      </span>
      <span className={`shrink-0 tabular-nums tracking-tight ${fuerte ? 'text-[18px] font-extrabold' : 'text-[16px] font-bold'} ${color}`}>
        {plata(actual)}
      </span>
    </div>
  );
}

function FilaSimple({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle?: string; tono?: 'bueno' | 'malo' }) {
  const color = tono === 'bueno' ? 'text-verde-fuerte' : tono === 'malo' ? 'text-rojo' : '';
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{titulo}</span>
        {detalle && <span className="mt-0.5 block text-[12.5px] leading-snug text-tinta/50">{detalle}</span>}
      </span>
      <span className={`shrink-0 text-[15px] font-bold tabular-nums ${color}`}>{valor}</span>
    </div>
  );
}

function ListaCategorias({ filas, plata, t, vacio, detalleVacio }: {
  filas: FilaCategoria[];
  plata: (n: number) => string;
  t: Textos;
  vacio: string;
  detalleVacio: string;
}) {
  if (filas.length === 0) return <Vacio titulo={vacio} detalle={detalleVacio} />;
  return (
    <ul className="mt-2 divide-y divide-borde border-t border-borde">
      {filas.map((f) => (
        <li key={f.nombre} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[14.5px] font-semibold">{categoriaVisible(t, f.nombre)}</span>
            <span className="shrink-0 text-[14.5px] font-bold tabular-nums text-verde-fuerte">{plata(f.monto)}</span>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <div className="flex-1"><Barra porcentaje={f.participacion} /></div>
            <span className="shrink-0 text-[12px] tabular-nums text-tinta/45">{porcentaje(f.participacion, 0)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Seis ciclos (o meses) con tres barras cada uno: entró, salió y guardé.
 * Sin librerías, como el gráfico diario. Lo guardado negativo (se sacó más
 * de lo que se puso) no se dibuja para abajo: la barra queda en cero y el
 * número exacto está al pasar el dedo. Sin un peso en los seis, no se
 * dibuja nada: un piso de barras vacías parece un dato.
 */
function BarrasPorCiclo({ barras, dia, moneda, locale, t }: {
  barras: BarraCiclo[];
  dia: number | null;
  moneda: Moneda;
  locale: string;
  t: Textos;
}) {
  const b = t.reportesPersonal.barras;
  const maximo = Math.max(...barras.map((x) => Math.max(x.entro, x.salio, x.guardo ?? 0)), 0);
  if (maximo <= 0) return null;
  const alto = (n: number) => `${Math.max(0, (n / maximo) * 100)}%`;
  const corto = (n: number) => dineroCorto(n, moneda, locale, t.formato);
  const conDia = !!dia && dia > 1;

  return (
    <Seccion titulo={conDia ? b.tituloCiclos : b.tituloMeses}>
      <div className="px-4 pb-4 pt-3">
        <div className="flex h-[140px] items-end gap-2">
          {barras.map((x) => {
            const etiqueta = etiquetaTramo(x.desde, dia, locale);
            const detalle = b.detalle(etiqueta, corto(x.entro), corto(x.salio), corto(x.guardo ?? 0));
            return (
              <div key={x.desde} className="flex h-full flex-1 items-end gap-[2px]" title={detalle} aria-label={detalle} role="img">
                <div className="w-full rounded-t bg-verde/85" style={{ height: alto(x.entro) }} />
                <div className="w-full rounded-t bg-rojo/40" style={{ height: alto(x.salio) }} />
                <div className="w-full rounded-t bg-ambar/70" style={{ height: alto(x.guardo ?? 0) }} />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          {barras.map((x) => (
            <span key={x.desde} className="flex-1 truncate text-center text-[11px] font-semibold text-tinta/40">
              {etiquetaTramo(x.desde, dia, locale)}
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-semibold text-tinta/50">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-verde/85" /> {b.entro}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rojo/40" /> {b.salio}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ambar/70" /> {b.guarde}</span>
        </div>
        <p className="mt-2 text-[12px] text-tinta/40">{b.hastaAca}</p>
      </div>
    </Seccion>
  );
}
