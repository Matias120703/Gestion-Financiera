import Link from 'next/link';
import { clienteServidor } from '@/lib/supabase/servidor';
import { exigir } from '@/lib/lectura';
import {
  traerReporteAlumnos, traerProgresoClientes, traerGastosPorCategoria, traerCobrosPorMetodo,
} from '@/lib/agregados';
import { asistenciaPct, conProgreso, loQueTeDeben, mapearPorCobrar } from '@/lib/reportes/excel-alumnos';
import { dinero, dineroCorto, fechaLegible, numero, porcentaje } from '@/lib/formato';
import { palabra } from '@/lib/rubros';
import { categoriaVisible, metodoVisible } from '@/i18n/nombres';
import { Barra, Indicador, Seccion, Vacio } from '@/components/Piezas';
import { IndicadorVariacion } from '@/components/reportes/comunes/IndicadorVariacion';
import type { PropsReporte } from '@/components/reportes/comunes/tipos';
import type { PalabrasAlumnos } from '@/i18n/textos/reportes-alumnos';
import type { ProgresoClientes } from '@/lib/tipos';

/**
 * EL REPORTE DEL PROFE Y DEL PERSONAL TRAINER (23/09).
 *
 * Hasta acá veían el de un almacén: ganancia bruta con margen del 100 %
 * (el paquete se guarda con costo 0), un ranking de «productos» que eran sus
 * paquetes y un «sin vender». Nada de eso contesta lo que un profe se
 * pregunta a fin de mes:
 *
 *   · ¿Cuánto cobré, cuánto gasté, cuánto me quedó? ¿Mejor que antes?
 *     (las tres cifras con su flecha, del `resumen_financiero`);
 *   · ¿Cuántas clases di y cuántas faltas hubo? (`reporte_alumnos`, que
 *     cuenta desde `clases_dadas` y no desde los turnos: `dar_clase` guarda
 *     clases sin turno y el panel las perdía);
 *   · ¿Cuánto me pagan por clase, de verdad? (cobrado ÷ clases dadas, de la
 *     base; sin clases dadas no hay número);
 *   · ¿Quién me debe? ¿A quién llamo para que renueve?
 *   · Y el trainer: ¿mis clientes mejoran? ¿A quién no medí? ¿Quién no
 *     tiene rutina?
 *
 * El Excel (`libroAlumnos`) dice lo mismo con las mismas lecturas: lo que
 * te deben sale de `loQueTeDeben` en los dos lados.
 *
 * Con las palabras del oficio: la jerga del trainer no conoce este reporte,
 * así que las frases reciben `palabras.trainer` («sesión», «cliente»,
 * «plan») o `palabras.profe`.
 */
export async function ReporteAlumnos({
  empresaId, rubro, tipoCuenta, ficha, rango, resumen: r, resumenPrevio: rp, moneda: m, t, idioma, locale, permisos,
}: PropsReporte) {
  const trainer = conProgreso(ficha);
  const [alumnos, porCobrar, progreso, categorias, metodos] = await Promise.all([
    traerReporteAlumnos(empresaId, rango.desde, rango.hasta),
    // Lo que falta cobrar de las inscripciones, a hoy (094): la misma lista
    // que ve arriba de sus alumnos, y la misma que baja en el Excel.
    clienteServidor().rpc('por_cobrar_alumnos', { p_empresa: empresaId })
      .then((res) => mapearPorCobrar(exigir(res, 'por cobrar de los alumnos'))),
    trainer ? traerProgresoClientes(empresaId, rango.desde, rango.hasta) : Promise.resolve(null),
    traerGastosPorCategoria(empresaId, rango.desde, rango.hasta),
    traerCobrosPorMetodo(empresaId, rango.desde, rango.hasta),
  ]);

  const ta = t.reportesAlumnos;
  const p: PalabrasAlumnos = ficha.jerga === 'entrenamiento' ? ta.palabras.trainer : ta.palabras.profe;
  const cobrado = palabra(rubro, tipoCuenta, 'ventas', t.panel.vendido, idioma);
  const corto = (n: number) => dineroCorto(n, m, locale);
  const fecha = (iso: string) => fechaLegible(iso, false, locale);
  const verRent = permisos.verRentabilidad;
  const conResultado = verRent && r.conCostos;

  const deben = loQueTeDeben({ alumnos, porCobrar });
  const cuantosDeben = new Set([...deben.lista.map((x) => x.cliente_id), ...deben.fiados.map((x) => x.cliente_id)]).size;
  const pct = asistenciaPct(alumnos.clases_dadas, alumnos.faltas);
  const cerrados = alumnos.paquetes.terminados + alumnos.paquetes.vencidos;
  const hayPaquetes = alumnos.paquetes.vendidos + cerrados > 0;

  return (
    <>
      {/* La plata, con su flecha contra el período anterior. */}
      <div className={`grid grid-cols-2 gap-3 ${conResultado ? 'lg:grid-cols-3' : ''}`}>
        <IndicadorVariacion
          titulo={cobrado} valor={corto(r.ventas)} actual={r.ventas} anterior={rp.ventas} formato={corto} t={t}
          destacado tono="bueno"
        />
        {verRent && (
          <IndicadorVariacion
            titulo={ta.gastos} valor={corto(r.gastos)} actual={r.gastos} anterior={rp.gastos} formato={corto} t={t}
            subirEsBueno={false} tono="malo"
          />
        )}
        {conResultado && (
          <div className="col-span-2 lg:col-span-1">
            <IndicadorVariacion
              titulo={ta.teQuedo} valor={corto(r.gananciaNeta)} formato={corto} t={t}
              actual={r.gananciaNeta} anterior={rp.conCostos ? rp.gananciaNeta : null}
              tono={r.gananciaNeta >= 0 ? 'bueno' : 'malo'}
            />
          </div>
        )}
      </div>

      {/* Lo que no es plata: clases, lo cobrado por clase, lo que te deben, los activos. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          titulo={ta.clasesDadas(p)} valor={numero(alumnos.clases_dadas, locale)}
          detalle={ta.faltasYAsistencia(alumnos.faltas, pct === null ? null : porcentaje(pct, 0, locale))}
        />
        {/* Sin clases dadas no hay «por clase»: no se muestra un cero que parece dato. */}
        {alumnos.cobrado_por_clase !== null && (
          <Indicador
            titulo={ta.cobradoPorClase(p)} valor={corto(alumnos.cobrado_por_clase)}
            detalle={ta.cobradoPorClaseDetalle(p)}
          />
        )}
        <Indicador
          titulo={ta.porCobrar} valor={corto(deben.total)} tono={deben.total > 0 ? 'malo' : 'neutro'}
          detalle={ta.porCobrarDetalle(cuantosDeben, p)}
        />
        <Indicador
          titulo={ta.activos(p)} valor={numero(alumnos.activos, locale)} detalle={ta.nuevos(alumnos.nuevos)}
        />
      </div>

      {alumnos.por_semana.length > 0 && (
        <Seccion titulo={ta.porSemana.titulo(p)}>
          <ul className="space-y-3.5 px-4 pb-4 pt-3">
            {alumnos.por_semana.map((s) => {
              const pctSemana = asistenciaPct(s.dadas, s.faltas);
              return (
                <li key={s.semana}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-semibold">{ta.porSemana.semanaDel(fecha(s.semana))}</span>
                    <span className="text-[12.5px] tabular-nums text-tinta/55">{ta.porSemana.detalle(s.dadas, s.faltas, p)}</span>
                  </div>
                  <Barra porcentaje={pctSemana ?? 0} tono={pctSemana !== null && pctSemana < 75 ? 'ambar' : 'verde'} />
                </li>
              );
            })}
          </ul>
        </Seccion>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {alumnos.por_terminar.length > 0 && (
          <Seccion titulo={ta.llamar.titulo}>
            <p className="px-4 text-[12.5px] text-tinta/50">{ta.llamar.detalle(p)}</p>
            <ul className="divide-y divide-borde px-4 pb-2 pt-1">
              {alumnos.por_terminar.map((x) => (
                <li key={x.paquete} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">{x.alumno}</span>
                    <span className="block truncate text-[12.5px] text-tinta/50">{x.nombre}</span>
                  </span>
                  <span className="shrink-0 text-right text-[12.5px] font-semibold text-ambar">
                    {ta.llamar.quedan(x.quedan, p)}
                    {x.vence_el && <span className="block font-normal text-tinta/50">{ta.llamar.vence(fecha(x.vence_el))}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Seccion>
        )}

        {deben.total > 0 && (
          <Seccion titulo={ta.deben.titulo}>
            <p className="px-4 text-[12.5px] text-tinta/50">{ta.deben.esFoto}</p>
            <ul className="divide-y divide-borde px-4 pt-1">
              {deben.lista.map((x) => (
                <li key={x.paquete} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">{x.alumno}</span>
                    <span className="block truncate text-[12.5px] text-tinta/50">
                      {x.nombre}{x.desde ? ` · ${ta.deben.desde(fecha(x.desde))}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13.5px] font-bold tabular-nums text-rojo">{dinero(x.monto, m, false)}</span>
                </li>
              ))}
              {deben.fiados.map((x) => (
                <li key={`fiado-${x.cliente_id}`} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">{x.alumno}</span>
                    <span className="block text-[12.5px] text-tinta/50">{ta.deben.fiado}</span>
                  </span>
                  <span className="shrink-0 text-[13.5px] font-bold tabular-nums text-rojo">{dinero(x.monto, m, false)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between gap-3 border-t border-borde px-4 py-3">
              <span className="text-[13px] font-bold">{ta.deben.total}</span>
              <span className="text-[14px] font-extrabold tabular-nums text-rojo">{dinero(deben.total, m)}</span>
            </div>
          </Seccion>
        )}
      </div>

      {hayPaquetes && (
        <Seccion titulo={ta.paquetes.titulo(p)}>
          <div className="grid grid-cols-3 gap-2 px-4 pb-2 pt-3">
            {[
              [ta.paquetes.vendidos, alumnos.paquetes.vendidos],
              [ta.paquetes.terminados, alumnos.paquetes.terminados],
              [ta.paquetes.vencidos, alumnos.paquetes.vencidos],
            ].map(([etiqueta, n]) => (
              <div key={etiqueta} className="rounded-xl bg-arena px-3 py-2.5">
                <p className="text-[20px] font-titulo font-extrabold tabular-nums leading-none">{numero(Number(n), locale)}</p>
                <p className="mt-1 text-[12px] text-tinta/55">{etiqueta}</p>
              </div>
            ))}
          </div>
          {cerrados > 0 && (
            <p className="px-4 pb-4 pt-1 text-[13px] text-tinta/60">{ta.paquetes.renovaron(alumnos.paquetes.renovaron, cerrados)}</p>
          )}
        </Seccion>
      )}

      {(alumnos.por_paquete.length > 0 || alumnos.por_materia.length > 0) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {alumnos.por_paquete.length > 0 && (
            <Seccion titulo={ta.porPaquete.titulo(p)}>
              <div className="overflow-x-auto">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>{p.Paquete}</th>
                      <th className="num">{ta.porPaquete.colVendidos}</th>
                      <th className="num">{ta.porPaquete.colCobrado}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alumnos.por_paquete.map((x) => (
                      <tr key={x.nombre}>
                        <td className="font-semibold">{x.nombre}</td>
                        <td className="num tabular-nums">{numero(x.vendidos, locale)}</td>
                        <td className="num font-semibold tabular-nums">{dinero(x.cobrado, m, false)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Seccion>
          )}
          {alumnos.por_materia.length > 0 && (
            <Seccion titulo={ta.porMateria.titulo(p)}>
              <ul className="divide-y divide-borde px-4 pb-2 pt-1">
                {alumnos.por_materia.map((x) => (
                  <li key={x.materia ?? ''} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{x.materia ?? ta.porMateria.sinMateria(p)}</span>
                      <span className="block text-[12.5px] text-tinta/50">{ta.porMateria.alumnos(x.alumnos, p)}</span>
                    </span>
                    <span className="shrink-0 text-[13.5px] font-bold tabular-nums">{dinero(x.cobrado, m, false)}</span>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
        </div>
      )}

      {progreso && <Progreso progreso={progreso} t={t} locale={locale} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo={t.pantallas.comoTePagaron}>
          {metodos.length === 0 ? (
            <Vacio titulo={ta.sinCobros} detalle={ta.sinCobrosDetalle(p)} />
          ) : (
            <div className="space-y-3.5 px-4 pb-4 pt-3">
              {metodos.map(({ metodo, monto, participacion }) => (
                <div key={metodo}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-semibold">{metodoVisible(t, metodo)}</span>
                    <span className="text-[13.5px] font-bold tabular-nums">{dinero(monto, m, false)}</span>
                  </div>
                  <Barra porcentaje={participacion} />
                  <p className="mt-1 text-[11.5px] font-semibold text-tinta/40">{porcentaje(participacion, 0, locale)}</p>
                </div>
              ))}
            </div>
          )}
        </Seccion>

        {verRent && (
          <Seccion titulo={t.pantallas.gastosPorCategoria}>
            {categorias.length === 0 ? (
              <Vacio titulo={t.pantallas.sinGastos} detalle={t.pantallas.sinGastosDetalle} />
            ) : (
              <div className="overflow-x-auto">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>{t.productos.categoria}</th>
                      <th className="num">{t.venta.total}</th>
                      <th className="num">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categorias.map((c) => (
                      <tr key={c.nombre}>
                        <td className="font-semibold">{categoriaVisible(t, c.nombre)}</td>
                        <td className="num font-semibold tabular-nums text-rojo">{dinero(c.monto, m, false)}</td>
                        <td className="num tabular-nums text-tinta/60">{porcentaje(c.participacion, 0, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Seccion>
        )}
      </div>
    </>
  );
}

/**
 * CÓMO VIENEN LOS CLIENTES DEL TRAINER (106, `progreso_clientes`).
 *
 * El cambio promedio es el de la base: primera contra última medida del
 * período, solo de quien tiene dos; la grasa, solo con el mismo método.
 * Lo que no se puede comparar no se muestra (un «0 kg» diría que no cambió).
 * Debajo, a quién hay que medir y a quién armarle la rutina, con el botón
 * que lleva a hacerlo.
 */
function Progreso({ progreso: g, t, locale }: {
  progreso: ProgresoClientes;
  t: PropsReporte['t'];
  locale: string;
}) {
  const tp = t.reportesAlumnos.progreso;
  const cambio = (n: number, unidad: string) =>
    `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString(locale, { maximumFractionDigits: 1 })} ${unidad}`;
  const cifras = [
    g.cambio_peso !== null && { titulo: tp.peso, valor: cambio(g.cambio_peso, 'kg'), detalle: tp.promedioDe(g.con_peso) },
    g.cambio_cintura !== null && { titulo: tp.cintura, valor: cambio(g.cambio_cintura, 'cm'), detalle: tp.promedioDe(g.con_cintura) },
    g.cambio_grasa !== null && {
      titulo: tp.grasa, valor: cambio(g.cambio_grasa, '%'), detalle: `${tp.promedioDe(g.con_grasa)}, ${tp.mismoMetodo}`,
    },
  ].filter(Boolean) as { titulo: string; valor: string; detalle: string }[];

  const sinMedir = g.clientes.filter((c) => c.sin_medir_30);
  const sinRutina = g.clientes.filter((c) => c.activo && !c.rutina_vigente);

  return (
    <Seccion titulo={tp.titulo}>
      <div className="space-y-4 px-4 pb-4 pt-2">
        <p className="text-[13.5px] text-tinta/60">{tp.medidos(g.medidos)}</p>

        {cifras.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {cifras.map((c) => (
                <div key={c.titulo} className="rounded-xl bg-arena px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-tinta/55">{c.titulo}</p>
                  <p className="mt-1 text-[20px] font-titulo font-extrabold tabular-nums leading-none">{c.valor}</p>
                  <p className="mt-1 text-[11.5px] text-tinta/50">{c.detalle}</p>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-tinta/45">{tp.comoSeCuenta}</p>
          </>
        ) : (
          g.medidos > 0 && <p className="text-[13px] text-tinta/50">{tp.sinComparar}</p>
        )}

        {sinMedir.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-bold text-ambar">{tp.sinMedir(sinMedir.length)}</p>
            <div className="flex flex-wrap gap-2">
              {sinMedir.map((c) => (
                <Link
                  key={c.cliente_id}
                  href={`/rutinas/cliente/${c.cliente_id}?ver=progreso&anotar=1`}
                  className="chip-apagado"
                >
                  {c.nombre} · {c.dias_sin_medir === null ? tp.nuncaMedido : tp.dias(c.dias_sin_medir)}
                </Link>
              ))}
            </div>
          </div>
        )}

        {sinRutina.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-bold text-ambar">{tp.sinRutina(sinRutina.length)}</p>
            <div className="flex flex-wrap gap-2">
              {sinRutina.map((c) => (
                <Link
                  key={c.cliente_id}
                  href={`/rutinas/nueva?cliente=${c.cliente_id}`}
                  className="chip-apagado"
                  aria-label={`${tp.armarRutina}: ${c.nombre}`}
                >
                  {c.nombre}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </Seccion>
  );
}
