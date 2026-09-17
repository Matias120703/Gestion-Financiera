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
import { categoriaVisible } from '@/i18n/nombres';
import { traerResumenPersonal } from '@/lib/personal';
import { PanelPersonal } from '@/components/PanelPersonal';
import { traerRacha } from '@/lib/habito';
import { TarjetaRacha } from '@/components/Racha';
import { AvisoComision, type Novedad } from '@/components/AvisoComision';
import { TiraBilletera } from '@/components/TiraBilletera';
import { traerBilletera } from '@/lib/billetera';
import { clienteServidor } from '@/lib/supabase/servidor';
import { fichaDe } from '@/lib/rubros';
import { traerResumenDeudas } from '@/lib/deudas';
import { traerResumenFiado } from '@/lib/fiado';

export const dynamic = 'force-dynamic';

export default async function PaginaPanel({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await contextoObligatorio();

  /**
   * «Fulano pagó su primer mes, te tocan 95.000.»
   *
   * Se dispara acá y se espera abajo, así corre junto con todo lo demás y no
   * le agrega un viaje a la pantalla. Si falla, el panel ni se entera: es una
   * buena noticia, no un dato del que dependa una decisión.
   */
  const novedadComision = Promise.resolve(clienteServidor().rpc('novedad_comisiones'))
    .then((r) => (r.data as Novedad | null) ?? { hay: false })
    .catch((): Novedad => ({ hay: false }));

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
    const [resumenPersonal, deudasPersonal, billeteraPersonal] = await Promise.all([
      traerResumenPersonal(ctx.empresa.id),
      traerResumenDeudas(ctx.empresa.id).catch(() => null),
      // Contexto, como las deudas: si falla, el panel igual se muestra.
      traerBilletera(ctx.empresa.id).catch(() => null),
    ]);

    return (
      <div className="space-y-4">
        <AvisoComision novedad={await novedadComision} />
        {billeteraPersonal && <TiraBilletera billetera={billeteraPersonal} moneda={ctx.empresa.moneda} />}
        <PanelPersonal
          resumen={resumenPersonal}
          deudas={deudasPersonal}
          moneda={ctx.vista}
          locale={FICHA[idiomaActual()].locale}
          t={t}
        />
      </div>
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

  const rango = rangoDesdeParams(searchParams, ctx.zonaHoraria);
  const previo = rangoAnterior(rango);

  // Todos los números salen agregados de PostgreSQL. Ninguna de estas
  // llamadas devuelve más de unas pocas decenas de filas, así que el tope de
  // filas de la Data API no puede alterarlas por más movimientos que haya.
  const dias = diasDelRango(rango.desde, rango.hasta, 92);
  const rangoSerie = dias.length > 1
    ? { desde: dias[0], hasta: dias[dias.length - 1] }
    : { desde: rango.desde, hasta: rango.hasta };

  const [r, rPrevio, top, categorias, serie, cobros, productos, reto, racha, fiado] = await Promise.all([
    traerResumen(ctx.empresa.id, rango.desde, rango.hasta),
    traerResumen(ctx.empresa.id, previo.desde, previo.hasta),
    traerRanking(ctx.empresa.id, rango.desde, rango.hasta, 6),
    traerGastosPorCategoria(ctx.empresa.id, rango.desde, rango.hasta),
    traerSerieDiaria(ctx.empresa.id, rangoSerie.desde, rangoSerie.hasta),
    traerCobrosPorMetodo(ctx.empresa.id, rango.desde, rango.hasta),
    traerProductos(ctx.empresa.id),
    traerRetoActivo(ctx.empresa.id),
    traerRacha(ctx.empresa.id),
    // Si falla, el panel no se cae: es un dato de contexto. El número exacto
    // está en la pantalla de Fiado, que sí lanza si no puede leer.
    traerResumenFiado(ctx.empresa.id).catch(() => null),
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
  const desdeAnio = `${hoyISO(ctx.zonaHoraria).slice(0, 4)}-01-01`;
  const [delAnio, deudas] = cicloLargo
    ? await Promise.all([
        traerResumen(ctx.empresa.id, desdeAnio, hoyISO(ctx.zonaHoraria)),
        traerResumenDeudas(ctx.empresa.id).catch(() => null),
      ])
    : [null, null];

  /**
   * Se mira en la moneda de la vista (051): acá solo se informa, no se carga
   * nada. Las pantallas donde se ESCRIBE un importe siguen recibiendo
   * `ctx.empresa.moneda` a secas — un formulario en dólares que guardara el
   * número tal cual estaría guardando dólares como guaraníes.
   */
  const m = ctx.vista;
  const t = textos();
  const permisos = permisosDe(ctx.miembro.rol);
  const verRent = permisos.verRentabilidad && r.conCostos;
  const categoriasTop = categorias.slice(0, 5);
  const bajoStock = productos.filter((p) => p.controla_stock && p.stock <= p.stock_minimo);
  const mayorGasto = categorias[0] ?? null;

  // Progreso del reto activo
  const hoy = hoyISO(ctx.zonaHoraria);
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

  // Cuánto hay en cada banco (074). Solo para quien puede verlo, y si falla
  // el panel igual se muestra: es contexto, no el número del día.
  const billeteraNegocio = ctx.esAdmin ? await traerBilletera(ctx.empresa.id).catch(() => null) : null;

  return (
    <div className="space-y-5">
      <AvisoComision novedad={await novedadComision} />

      {/* Tu plata, arriba de todo, con el ojito (074). Solo quien puede verla. */}
      {billeteraNegocio && <TiraBilletera billetera={billeteraNegocio} moneda={ctx.empresa.moneda} />}

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

      {/* ---------------- Lo que te deben (054-056) ----------------
          La venta fiada ya está sumada en las ventas de arriba. Esto dice
          cuánto de lo que te deben todavía no entró: sin este número, el
          panel mostraba la venta como plata ganada y nada más.

          NO se resta de las ventas, y es a propósito: la venta existió, la
          mercadería salió, el vendedor ganó su comisión. Se pone al lado,
          que es donde se lee junto. */}
      {fiado && fiado.total > 0 && (
        <Link href="/fiado" className="tarjeta block p-4 transition hover:border-verde/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-tinta/55">{t.panel.teDeben}</p>
              <p className="mt-0.5 text-[22px] font-bold tabular-nums tracking-tight">{dinero(fiado.total, m)}</p>
              <p className="mt-0.5 text-[12.5px] text-tinta/50">
                {t.panel.clientesQueDeben(fiado.cuantos)} · {t.panel.plataQueNoEntro}
              </p>
            </div>
            <span className="shrink-0 text-[13px] font-semibold text-verde-fuerte">{t.panel.verFiado}</span>
          </div>
        </Link>
      )}

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
            <span>{t.panel.logradoDe(dinero(retoInfo.logrado, m), dinero(Number(reto.meta), m))}</span>
            {retoInfo.diasRestantes > 0 && retoInfo.falta > 0 && (
              <span>{t.panel.faltanDias(retoInfo.diasRestantes, dineroCorto(retoInfo.ritmo, m))}</span>
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
          <GraficoDiario datos={serie} moneda={m} textos={t.panel} locale={FICHA[idiomaActual()].locale} />
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
                        <span className="block text-[12px] text-tinta/45">{t.panel.deLoVendido(porcentaje(p.participacion, 0))}</span>
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
                    <span className="truncate text-[14px] font-semibold">{categoriaVisible(t, c.nombre)}</span>
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
              {t.panel.soloCargar}
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
                {p.nombre} · {t.panel.quedan(numero(p.stock))}
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
          {t.panel.resumenFino(dinero(r.ticketPromedio, m), numero(r.unidadesVendidas), porcentaje(r.margenNeto, 1))}
          {r.ventasAnuladas > 0 && ` · ${t.panel.anuladasNoSuman(r.ventasAnuladas)}`}
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
            {t.panel.costosLosVeAdmin}
            {r.ventasAnuladas > 0 && ` ${t.panel.hayAnuladas(r.ventasAnuladas)}`}
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
