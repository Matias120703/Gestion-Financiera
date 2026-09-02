import Link from 'next/link';
import { contextoObligatorio } from '@/lib/sesion';
import { rangoDesdeParams, traerProductos, traerRetoActivo } from '@/lib/datos';
import {
  traerResumen, traerRanking, traerSerieDiaria, traerGastosPorCategoria, traerCobrosPorMetodo,
} from '@/lib/agregados';
import { rangoAnterior, diasDelRango, diffDias, hoyISO } from '@/lib/fechas';
import { variacion } from '@/lib/calculos';
import { dinero, dineroCorto, porcentaje, numero, fechaLegible, dineroQuizas } from '@/lib/formato';
import { SelectorRango } from '@/components/SelectorRango';
import { Indicador, GraficoDiario, Barra, Vacio, Seccion } from '@/components/Piezas';
import { permisosDe } from '@/lib/permisos';
import { textos, idiomaActual, FICHA } from '@/i18n';
import { traerResumenPersonal } from '@/lib/personal';
import { PanelPersonal } from '@/components/PanelPersonal';
import { traerRacha } from '@/lib/habito';
import { TarjetaRacha } from '@/components/Racha';
import { fichaDe } from '@/lib/rubros';
import { traerResumenDeudas } from '@/lib/deudas';

export const dynamic = 'force-dynamic';

export default async function PaginaPanel({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await contextoObligatorio();

  /**
   * UNA CUENTA PERSONAL TIENE SU PROPIO PANEL.
   *
   * Se corta acá arriba, antes de pedir un solo dato, y no con condicionales
   * repartidos por toda la pantalla. Ese fue el error que dejó el cierre del
   * día colgado meses en las cuentas personales: una pantalla sola tratando
   * de servir a todos, y el caso que nadie miró.
   *
   * Lo que hay más abajo —ganancia bruta, margen, ranking de productos,
   * ticket promedio— no significa nada para alguien que cobra un sueldo. Le
   * habla como si vendiera algo.
   */
  if (ctx.empresa.tipo_cuenta === 'personal') {
    const t = textos();
    if (!ctx.esAdmin) {
      return (
        <div className="mx-auto max-w-lg">
          <div className="tarjeta">
            <Vacio titulo={t.organizacion.titulo} detalle={t.deudas.soloAdmin} />
          </div>
        </div>
      );
    }

    // Las deudas son contexto: si fallan, el panel igual se muestra. Para el
    // número del que depende una decisión está la pantalla de Deudas, que sí
    // lanza si no puede leer.
    const [resumenPersonal, deudasPersonal] = await Promise.all([
      traerResumenPersonal(ctx.empresa.id),
      traerResumenDeudas(ctx.empresa.id).catch(() => null),
    ]);

    return (
      <PanelPersonal
        resumen={resumenPersonal}
        deudas={deudasPersonal}
        moneda={ctx.empresa.moneda}
        locale={FICHA[idiomaActual()].locale}
        t={t}
      />
    );
  }

  /**
   * Un negocio de ciclo largo no se mide por día.
   *
   * Un ganadero compra un ternero, gasta en maíz y sanidad durante dieciocho
   * meses, y recién ahí vende. Para él, «cómo vengo este mes contra el mes
   * pasado» es comparar cero contra cero — y los indicadores de comercio
   * (ticket promedio, unidades entregadas, operaciones) son números que no
   * significan nada cuando vendés tres veces al año.
   *
   * Peor todavía era la racha: le decía «0 días» todos los días, para
   * siempre. Le sacamos el recordatorio de la noche en la 021 y esto quedó
   * haciendo exactamente lo mismo en la pantalla que más mira.
   */
  // Ya no hace falta descartar la cuenta personal: si llegó hasta acá, es de
  // negocio. El corte de arriba se lo llevó.
  const cicloLargo = fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta).ciclosLargos;

  const rango = rangoDesdeParams(searchParams);
  const previo = rangoAnterior(rango);

  // Todos los números salen agregados de PostgreSQL. Ninguna de estas
  // llamadas devuelve más de unas pocas decenas de filas, así que el tope de
  // filas de la Data API no puede alterarlas por más movimientos que haya.
  const dias = diasDelRango(rango.desde, rango.hasta, 92);
  const rangoSerie = dias.length > 1
    ? { desde: dias[0], hasta: dias[dias.length - 1] }
    : { desde: rango.desde, hasta: rango.hasta };

  const [r, rPrevio, top, categorias, serie, cobros, productos, reto, racha] = await Promise.all([
    traerResumen(ctx.empresa.id, rango.desde, rango.hasta),
    traerResumen(ctx.empresa.id, previo.desde, previo.hasta),
    traerRanking(ctx.empresa.id, rango.desde, rango.hasta, 6),
    traerGastosPorCategoria(ctx.empresa.id, rango.desde, rango.hasta),
    traerSerieDiaria(ctx.empresa.id, rangoSerie.desde, rangoSerie.hasta),
    traerCobrosPorMetodo(ctx.empresa.id, rango.desde, rango.hasta),
    traerProductos(ctx.empresa.id),
    traerRetoActivo(ctx.empresa.id),
    traerRacha(ctx.empresa.id),
  ]);

  /**
   * En ciclo largo, lo que reemplaza a «cuántas ventas hice hoy» es «cuánto
   * llevo en el año» y «cuánto debo». Son las dos preguntas que sí tienen
   * respuesta cuando la plata entra tres veces al año.
   *
   * Si la lectura de deudas falla no se cae el panel: el indicador queda en
   * cero y el resto sigue. Es un dato de contexto, no un número financiero
   * del que dependa una decisión — para eso está la pantalla de Deudas, que
   * sí lanza si no puede leer.
   */
  const desdeAnio = `${hoyISO().slice(0, 4)}-01-01`;
  const [delAnio, deudas] = cicloLargo
    ? await Promise.all([
        traerResumen(ctx.empresa.id, desdeAnio, hoyISO()),
        traerResumenDeudas(ctx.empresa.id).catch(() => null),
      ])
    : [null, null];

  const m = ctx.empresa.moneda;
  const t = textos();
  const permisos = permisosDe(ctx.miembro.rol);
  const verRent = permisos.verRentabilidad && r.conCostos;
  const categoriasTop = categorias.slice(0, 5);
  const bajoStock = productos.filter((p) => p.controla_stock && p.stock <= p.stock_minimo);
  const mayorGasto = categorias[0] ?? null;

  // Progreso del reto activo
  const hoy = hoyISO();
  let retoInfo: {
    medible: boolean; logrado: number; falta: number;
    avance: number; diasRestantes: number; ritmo: number;
  } | null = null;
  if (reto) {
    const rReto = await traerResumen(ctx.empresa.id, reto.fecha_inicio, reto.fecha_fin);
    const logradoQuizas = reto.medida === 'ganancia'
      ? (rReto.conCostos ? rReto.gananciaNeta : null)
      : rReto.ventas;
    const logrado = logradoQuizas ?? 0;
    const falta = Math.max(0, Number(reto.meta) - logrado);
    const diasRestantes = Math.max(0, diffDias(hoy > reto.fecha_inicio ? hoy : reto.fecha_inicio, reto.fecha_fin) + (hoy <= reto.fecha_fin ? 1 : 0));
    retoInfo = {
      medible: logradoQuizas !== null,
      logrado,
      falta,
      avance: Number(reto.meta) > 0 ? (logrado / Number(reto.meta)) * 100 : 0,
      diasRestantes,
      ritmo: diasRestantes > 0 ? falta / diasRestantes : falta,
    };
  }

  const retoVisible = reto && retoInfo && retoInfo.medible;

  return (
    <div className="space-y-5">
      {/* La racha solo donde el hábito es diario. Ver el comentario de arriba. */}
      {!cicloLargo && <TarjetaRacha racha={racha} t={t} />}

      <SelectorRango clave={rango.clave} desde={rango.desde} hasta={rango.hasta} />

      <p className="text-[13px] font-semibold text-tinta/45">
        {rango.desde === rango.hasta
          ? fechaLegible(rango.desde)
          : `${fechaLegible(rango.desde)} — ${fechaLegible(rango.hasta)}`}
        {' · '}{numero(r.cantidadVentas)} venta{r.cantidadVentas === 1 ? '' : 's'}
      </p>

      {/* ---------------- Indicadores principales ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {verRent ? (
          <>
            <Indicador
              titulo={t.panel.gananciaNeta} destacado
              valor={dineroCorto(r.gananciaNeta, m)}
              detalle={dinero(r.gananciaNeta, m)}
              tono={r.gananciaNeta >= 0 ? 'bueno' : 'malo'}
              variacion={variacion(r.gananciaNeta, rPrevio.gananciaNeta)}
            />
            <Indicador
              titulo={t.panel.vendido}
              valor={dineroCorto(r.ventas, m)}
              detalle={t.panel.vendidoDetalle(r.cantidadVentas)}
              variacion={variacion(r.ventas, rPrevio.ventas)}
            />
            <Indicador
              titulo={t.panel.gastos}
              valor={dineroCorto(r.gastos, m)}
              detalle={mayorGasto ? t.panel.mayorGasto(mayorGasto.nombre.slice(0, 22)) : t.panel.sinGastos}
              tono={r.gastos > 0 ? 'malo' : 'neutro'}
              variacion={cicloLargo ? undefined : variacion(r.gastos, rPrevio.gastos)}
            />
            {cicloLargo ? (
              <Indicador
                titulo={t.panel.delAnio}
                valor={dineroCorto(delAnio?.gananciaNeta ?? 0, m)}
                detalle={t.panel.vendidoEnAnio(dineroCorto(delAnio?.ventas ?? 0, m))}
                tono={(delAnio?.gananciaNeta ?? 0) >= 0 ? 'bueno' : 'malo'}
              />
            ) : (
              <Indicador
                titulo={t.panel.gananciaBruta}
                valor={dineroCorto(r.gananciaBruta, m)}
                detalle={t.panel.margenDe(porcentaje(r.margenBruto, 0))}
              />
            )}
          </>
        ) : (
          <>
            <Indicador
              titulo={t.panel.vendido} destacado
              valor={dineroCorto(r.ventas, m)}
              detalle={dinero(r.ventas, m)}
              tono="bueno"
              variacion={variacion(r.ventas, rPrevio.ventas)}
            />
            <Indicador titulo={t.panel.operaciones} valor={numero(r.cantidadVentas)} detalle={t.panel.ventasCargadas} />
            <Indicador titulo={t.panel.ticketPromedio} valor={dineroCorto(r.ticketPromedio, m)} detalle={t.panel.porVenta} />
            <Indicador titulo={t.panel.unidades} valor={numero(r.unidadesVendidas)} detalle={t.panel.productosEntregados} />
          </>
        )}
      </div>

      {/* ---------------- Reto activo ---------------- */}
      {retoVisible && reto && retoInfo && (
        <Link href="/reto" className="tarjeta block p-4 transition hover:border-verde/50">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="titulo-seccion">{t.panel.retoActivo}</p>
              <p className="mt-1 truncate text-[16px] font-bold tracking-tight">{reto.nombre}</p>
            </div>
            <span className="shrink-0 text-[22px] font-bold tabular-nums text-verde-fuerte">
              {porcentaje(Math.min(retoInfo.avance, 999), 0)}
            </span>
          </div>
          <div className="mt-3"><Barra porcentaje={retoInfo.avance} /></div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] font-semibold text-tinta/55">
            <span>{dinero(retoInfo.logrado, m)} de {dinero(Number(reto.meta), m)}</span>
            {retoInfo.diasRestantes > 0 && retoInfo.falta > 0 && (
              <span>Faltan {retoInfo.diasRestantes} día{retoInfo.diasRestantes === 1 ? '' : 's'} · {dineroCorto(retoInfo.ritmo, m)} por día</span>
            )}
            {retoInfo.falta === 0 && <span className="text-verde-fuerte">{t.panel.metaAlcanzada}</span>}
          </div>
        </Link>
      )}

      {/* ---------------- Lo que se debe, en ciclo largo ----------------
          Cuando la plata entra tres veces al año, saber cuánto se debe y
          cuándo vence es más útil que cualquier promedio diario. */}
      {cicloLargo && deudas && deudas.total_debido > 0 && (
        <Link href="/deudas" className="tarjeta block p-4 transition hover:border-verde/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-tinta/55">{t.panel.loQueDebes}</p>
              <p className="mt-0.5 text-[22px] font-bold tabular-nums">{dinero(deudas.total_debido, m)}</p>
            </div>
            {deudas.vencidas > 0 ? (
              <span className="pastilla bg-rojo-claro text-rojo">
                {t.panel.vencidas(deudas.vencidas)}
              </span>
            ) : deudas.vence_pronto > 0 ? (
              <span className="pastilla bg-ambar-claro text-ambar">
                {t.panel.vencenSemana(deudas.vence_pronto)}
              </span>
            ) : null}
          </div>
        </Link>
      )}

      {/* ---------------- Movimiento diario ----------------
          En ciclo largo no se dibuja: son trescientos sesenta y cinco días
          planos con tres picos. Un gráfico que no muestra nada ocupa lugar y
          hace parecer que el sistema no tiene datos. */}
      {!cicloLargo && dias.length > 1 && (r.cantidadVentas > 0 || r.gastos > 0) && (
        <div className="tarjeta p-4">
          <h2 className="mb-4 text-[15px] font-bold tracking-tight">{t.panel.diaPorDia}</h2>
          <GraficoDiario datos={serie} moneda={m} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------------- Productos que más dejaron ---------------- */}
        <Seccion
          titulo={t.panel.masVendido}
          accion={<Link href="/reportes" className="boton-texto">{t.comun.verTodo}</Link>}
        >
          {top.length === 0 ? (
            <Vacio
              titulo={t.panel.sinVentas}
              detalle={t.panel.sinVentasDetalle}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>{t.panel.colProducto}</th>
                    <th className="num">{t.panel.colUnidades}</th>
                    <th className="num">{t.panel.colVendido}</th>
                    {verRent && <th className="num">{t.panel.colGanancia}</th>}
                  </tr>
                </thead>
                <tbody>
                  {top.map((p) => (
                    <tr key={p.producto_id ?? p.nombre}>
                      <td>
                        <span className="block font-semibold">{p.nombre}</span>
                        <span className="block text-[12px] text-tinta/45">{porcentaje(p.participacion, 0)} de lo vendido</span>
                      </td>
                      <td className="num font-semibold">{numero(p.unidades)}</td>
                      <td className="num tabular-nums">{dinero(p.ingresos, m, false)}</td>
                      {verRent && (
                        <td className={`num font-semibold tabular-nums ${
                          p.ganancia === null ? 'text-tinta/30' : p.ganancia >= 0 ? 'text-verde-fuerte' : 'text-rojo'
                        }`}>
                          {dineroQuizas(p.ganancia, m, false)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>

        {/* ---------------- En qué se fue la plata ---------------- */}
        {verRent ? (
        <Seccion titulo={t.panel.enQueSeFue} accion={<Link href="/gastos" className="boton-texto">{t.panel.cargarGasto}</Link>}>
          {categoriasTop.length === 0 ? (
            <Vacio titulo={t.panel.sinGastosCargados} detalle={t.panel.sinGastosDetalle} />
          ) : (
            <div className="space-y-3.5 px-4 pb-4 pt-3">
              {categoriasTop.map((c) => (
                <div key={c.nombre}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-[14px] font-semibold">{c.nombre}</span>
                    <span className="shrink-0 text-[13.5px] font-bold tabular-nums">{dinero(c.monto, m, false)}</span>
                  </div>
                  <Barra porcentaje={c.participacion} tono="rojo" />
                  <p className="mt-1 text-[11.5px] font-semibold text-tinta/40">
                    {porcentaje(c.participacion, 0)} · {c.operaciones} movimiento{c.operaciones === 1 ? '' : 's'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Seccion>
        ) : (
          <Seccion titulo={t.panel.tuActividad} accion={<Link href="/movimientos" className="boton-texto">{t.panel.verHistorial}</Link>}>
            <div className="px-4 pb-4 pt-3 text-[13.5px] leading-relaxed text-tinta/60">
              Podés cargar ventas y gastos, ver el stock y consultar el historial del negocio.
              El detalle de costos y rentabilidad queda para el propietario y los administradores.
            </div>
          </Seccion>
        )}
      </div>

      {/* ---------------- Alertas de stock ---------------- */}
      {bajoStock.length > 0 && (
        <Seccion titulo={t.panel.porAcabarse} accion={<Link href="/productos" className="boton-texto">{t.panel.irAProductos}</Link>}>
          <div className="flex flex-wrap gap-2 px-4 pb-4 pt-2">
            {bajoStock.slice(0, 12).map((p) => (
              <span key={p.id} className="pastilla bg-ambar-claro text-ambar">
                {p.nombre} · quedan {numero(p.stock)}
              </span>
            ))}
          </div>
        </Seccion>
      )}

      {/* ---------------- Resumen fino ---------------- */}
      {verRent ? (
      <div className="tarjeta p-4">
        <h2 className="mb-3 text-[15px] font-bold tracking-tight">{t.panel.comoSeArma}</h2>
        <dl className="space-y-2.5 text-[14px]">
          {r.descuentos > 0 ? (
            <>
              <Linea etiqueta={t.panel.aPrecioDeLista} valor={dinero(r.ventasBrutas, m)} />
              <Linea etiqueta={t.panel.descuentosQueDiste} valor={`− ${dinero(r.descuentos, m)}`} tono="malo" />
              <Linea etiqueta={t.panel.vendidoCobrado} valor={dinero(r.ventas, m)} fuerte />
            </>
          ) : (
            <Linea etiqueta={t.panel.vendido} valor={dinero(r.ventas, m)} />
          )}
          {r.otrosIngresos > 0 && <Linea etiqueta={t.panel.otrosIngresos} valor={dinero(r.otrosIngresos, m)} />}
          <Linea etiqueta={t.panel.costoDeLoVendido} valor={`− ${dinero(r.costoMercaderia, m)}`} tono="malo" />
          <Linea etiqueta={t.panel.gananciaBruta} valor={dinero(r.gananciaBruta, m)} fuerte />
          <Linea etiqueta={t.panel.gastosDelPeriodo} valor={`− ${dinero(r.gastos, m)}`} tono="malo" />
          <div className="!mt-3 border-t border-borde pt-3">
            <Linea
              etiqueta={t.panel.gananciaNeta} valor={dinero(r.gananciaNeta, m)} fuerte
              tono={r.gananciaNeta >= 0 ? 'bueno' : 'malo'}
            />
          </div>
        </dl>
        <p className="mt-4 text-[12.5px] leading-relaxed text-tinta/45">
          Ticket promedio {dinero(r.ticketPromedio, m)} · {numero(r.unidadesVendidas)} unidades vendidas ·
          margen neto {porcentaje(r.margenNeto, 1)}
          {r.ventasAnuladas > 0 && ` · ${r.ventasAnuladas} venta(s) anulada(s) que no suman`}
        </p>
      </div>
      ) : (
        <div className="tarjeta p-4">
          <h2 className="text-[15px] font-bold tracking-tight">{t.panel.tuResumen}</h2>
          <dl className="mt-3 space-y-2.5 text-[14px]">
            <Linea etiqueta={t.panel.vendido} valor={dinero(r.ventas, m)} fuerte />
            {r.descuentos > 0 && <Linea etiqueta={t.panel.descuentosQueDiste} valor={`− ${dinero(r.descuentos, m)}`} />}
            <Linea etiqueta={t.panel.operaciones} valor={numero(r.cantidadVentas)} />
            <Linea etiqueta={t.panel.unidadesEntregadas} valor={numero(r.unidadesVendidas)} />
            <Linea etiqueta={t.panel.ticketPromedio} valor={dinero(r.ticketPromedio, m)} />
          </dl>
          <p className="mt-4 text-[12.5px] leading-relaxed text-tinta/45">
            Los costos, márgenes y ganancias del negocio los ve la administración.
            {r.ventasAnuladas > 0 && ` Hay ${r.ventasAnuladas} venta(s) anulada(s) que no suman.`}
          </p>
        </div>
      )}
    </div>
  );
}

function Linea({
  etiqueta, valor, fuerte = false, tono = 'neutro',
}: {
  etiqueta: string;
  valor: string;
  fuerte?: boolean;
  tono?: 'neutro' | 'bueno' | 'malo';
}) {
  const color = tono === 'bueno' ? 'text-verde-fuerte' : tono === 'malo' ? 'text-rojo' : 'text-tinta';
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={fuerte ? 'font-bold' : 'text-tinta/60'}>{etiqueta}</dt>
      <dd className={`tabular-nums ${fuerte ? 'font-bold' : 'font-semibold'} ${color}`}>{valor}</dd>
    </div>
  );
}
