import { clienteServidor } from '@/lib/supabase/servidor';
import { exigirLista } from '@/lib/lectura';
import { traerLotes } from '@/lib/lotes';
import { traerGastosPorCategoria, traerCobrosPorMetodo } from '@/lib/agregados';
import { dinero, dineroCorto, numero, porcentaje, fechaLegible, precio, convertido, vistaDe } from '@/lib/formato';
import { cultivoPorNombre, sacasPorHa, unidadDePrecio, precioEnUnidad } from '@/lib/agricultura';
import { nombreDeCampana } from '@/lib/reporte';
import {
  campanasDelPeriodo, costoPorUnidad, esAgricola, porUnidadYDia,
} from '@/lib/reportes/excel-campo';
import { categoriaVisible, metodoVisible } from '@/i18n/nombres';
import { nombreLargo } from '@/components/campanas/utiles';
import { Indicador, Vacio, Seccion, Barra } from '@/components/Piezas';
import type { Lote } from '@/lib/tipos';
import type { PropsReporte } from './comunes/tipos';

/**
 * EL REPORTE DEL CAMPO: AGRICULTURA Y GANADERÍA (23/09).
 *
 * Hasta acá el productor veía el reporte de un almacén: «Sin ventas en este
 * periodo» el mes que liquidó la soja (la venta de una liquidación no tiene
 * items, y el ranking sale de ahí), costo de la mercadería en cero, margen
 * del 100 % y «sin vender» con un catálogo que no tiene. Para él la unidad
 * no es el mes: es la campaña (o el lote de novillos).
 *
 * Por eso arriba van las campañas o lotes que estuvieron abiertos en el
 * período, con los números de TODA la campaña (`numeros_de_lote`, los mismos
 * de la tarjeta, el panel y el Excel): costo y resultado por hectárea (o por
 * cabeza), rendimiento, kilos en el silo, lo que falta cubrir y lo que se
 * debe a cosecha. Después lo que se debe, y abajo, como apoyo, la caja de
 * estas fechas: cobrado (con las liquidaciones), gastos por categoría y cómo
 * te pagaron.
 *
 * Lo que NO hay, a propósito: ganancia del mes (lo gastado en una campaña
 * que se cosecha en marzo no es una pérdida de septiembre), flecha contra el
 * mes anterior (para el campo la comparación que sirve es zafra contra
 * zafra, no mes contra mes), ranking, margen, promedio por día ni día por
 * día. Lo que llega null (lo que es de administración) no se muestra.
 *
 * El Excel (`src/lib/reportes/excel-campo.ts`) trae lo mismo con más
 * detalle, y comparte con esta pantalla las cuentas que no vienen de la base
 * (qué campañas van, costo por cabeza, por cabeza y día).
 */
export async function ReporteCampo({
  empresaId, ficha, rango, resumen: r, moneda: m, t, idioma, locale, permisos,
}: PropsReporte) {
  const agro = esAgricola(ficha.jerga);
  const tr = t.reportesCampo;
  const oficio = agro ? tr.agro : tr.lotes;
  const verCostos = permisos.verRentabilidad;

  const [lotes, categorias, metodos, deudas] = await Promise.all([
    traerLotes(empresaId, true),
    traerGastosPorCategoria(empresaId, rango.desde, rango.hasta),
    traerCobrosPorMetodo(empresaId, rango.desde, rango.hasta),
    verCostos ? traerDeudasDeLotes(empresaId) : Promise.resolve([] as DeudaDeLoteLeida[]),
  ]);

  // Las mismas que la hoja del Excel. En curso primero, después las más nuevas.
  const delPeriodo = campanasDelPeriodo(lotes, rango.desde, rango.hasta).sort((a, b) =>
    a.estado !== b.estado ? (a.estado === 'abierto' ? -1 : 1) : a.abierto_el < b.abierto_el ? 1 : -1);
  const nombres = new Map(lotes.map((l) => [l.id, nombreDeCampana(l)]));
  const totalDeudas = deudas.reduce((s, d) => s + Number(d.saldo), 0);
  const corto = (n: number) => dineroCorto(n, m, locale);
  const conMercaderia = r.mercaderiaAparte && Number(r.comprasMercaderia) > 0;

  return (
    <>
      {/* ---------------- Las campañas o lotes del período ---------------- */}
      <section className="space-y-3" aria-labelledby="campo-del-periodo">
        <div>
          <h2 id="campo-del-periodo" className="text-[15px] font-bold tracking-tight">{oficio.titulo}</h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-tinta/50">{oficio.detalle}</p>
        </div>
        {delPeriodo.length === 0 ? (
          <div className="tarjeta"><Vacio titulo={oficio.vacio} detalle={oficio.vacioDetalle} /></div>
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              {delPeriodo.map((l) => (
                <TarjetaDelPeriodo key={l.id} l={l} agro={agro} props={{ m, t, idioma, locale, verCostos }} />
              ))}
            </div>
            <p className="text-[12px] leading-relaxed text-tinta/45">{tr.esDeCaja}</p>
          </>
        )}
      </section>

      {/* ---------------- Lo que se debe, atado a las campañas ----------------
          Foto de hoy: cerrar la campaña no salda la deuda con la casa de
          insumos. Solo administración (015). */}
      {verCostos && deudas.length > 0 && (
        <Seccion titulo={oficio.debes}>
          <p className="px-4 text-[12.5px] leading-snug text-tinta/50">{oficio.debesDetalle}</p>
          <ul className="mt-2 divide-y divide-borde">
            {deudas.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">{d.acreedor || d.nombre}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-tinta/50">
                    {[
                      d.acreedor ? d.nombre : null,
                      d.categoria ? categoriaVisible(t, d.categoria) : tr.sinCategoria,
                      nombres.get(d.lote_id) ?? null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[14px] font-bold tabular-nums text-rojo">{dinero(Number(d.saldo), m, true, locale)}</p>
                  <p className="text-[11.5px] text-tinta/45">
                    {d.vence_el ? tr.vence(fechaLegible(d.vence_el, true, locale)) : tr.sinVencimiento}
                  </p>
                </div>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 px-4 py-3">
              <span className="text-[13.5px] font-bold">{tr.total}</span>
              <span className="text-[15px] font-extrabold tabular-nums text-rojo">{dinero(totalDeudas, m, true, locale)}</span>
            </li>
          </ul>
        </Seccion>
      )}

      {/* ---------------- La caja de estas fechas, abajo y como apoyo ---------------- */}
      <section className="space-y-3" aria-labelledby="campo-caja">
        <div>
          <h2 id="campo-caja" className="text-[15px] font-bold tracking-tight">{tr.caja}</h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-tinta/50">{tr.cajaDetalle}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Indicador
            titulo={tr.cobrado} valor={corto(r.ventas)} tono="bueno" destacado
            detalle={oficio.ventasN(numero(r.cantidadVentas, locale))}
          />
          {verCostos && (
            <Indicador
              titulo={tr.gastos} valor={corto(r.gastos)} tono="malo"
              detalle={conMercaderia ? tr.masMercaderia(corto(Number(r.comprasMercaderia))) : undefined}
            />
          )}
          {r.otrosIngresos > 0 && (
            <Indicador titulo={tr.otrosIngresos} valor={corto(r.otrosIngresos)} detalle={tr.otrosIngresosDetalle} />
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {verCostos && (
            <Seccion titulo={t.pantallas.gastosPorCategoria}>
              {categorias.length === 0 ? (
                <Vacio titulo={t.pantallas.sinGastos} detalle={t.pantallas.sinGastosDetalle} />
              ) : (
                <div className="space-y-3.5 px-4 pb-4 pt-3">
                  {categorias.map((c) => (
                    <div key={c.nombre}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[14px] font-semibold">{categoriaVisible(t, c.nombre)}</span>
                        <span className="shrink-0 text-[13.5px] font-bold tabular-nums text-rojo">{dinero(c.monto, m, false, locale)}</span>
                      </div>
                      <Barra porcentaje={c.participacion} tono="rojo" />
                      <p className="mt-1 text-[11.5px] font-semibold text-tinta/40">{porcentaje(c.participacion, 0, locale)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Seccion>
          )}

          <Seccion titulo={t.pantallas.comoTePagaron}>
            {metodos.length === 0 ? (
              <Vacio titulo={t.pantallas.sinCobros} detalle={t.pantallas.sinCobrosDetalle} />
            ) : (
              <div className="space-y-3.5 px-4 pb-4 pt-3">
                {metodos.map(({ metodo, monto, participacion: p }) => (
                  <div key={metodo}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="text-[14px] font-semibold">{metodoVisible(t, metodo)}</span>
                      <span className="text-[13.5px] font-bold tabular-nums">{dinero(monto, m, false, locale)}</span>
                    </div>
                    <Barra porcentaje={p} />
                    <p className="mt-1 text-[11.5px] font-semibold text-tinta/40">{porcentaje(p, 0, locale)}</p>
                  </div>
                ))}
              </div>
            )}
          </Seccion>
        </div>
      </section>
    </>
  );
}

// =====================================================================
// LA TARJETA DE UNA CAMPAÑA (O LOTE) DEL PERÍODO
// =====================================================================

/**
 * La de siempre del panel (`PanelCampo`), con lo que el reporte agrega: si
 * está en curso o cuándo cerró, lo que falta cubrir y lo que se debe a
 * cosecha. En ganadería, el costo por cabeza y cuánto dejó cada cabeza por
 * día. Ningún número se calcula acá salvo esos dos, que salen de las mismas
 * funciones que usa el Excel.
 */
function TarjetaDelPeriodo({ l, agro, props }: {
  l: Lote;
  agro: boolean;
  props: { m: PropsReporte['moneda']; t: PropsReporte['t']; idioma: string; locale: string; verCostos: boolean };
}) {
  const { m, t, idioma, locale, verCostos } = props;
  const tj = t.panelCampo.tarjeta;
  const tr = t.reportesCampo;
  const plata = (n: number) => dinero(n, m, true, locale);
  const kilos = (n: number) => numero(Math.round(n), locale);

  const hectareas = l.hectareas === null ? null : Number(l.hectareas);
  const conHa = hectareas !== null && hectareas > 0;
  const cantidad = Number(l.cantidad);
  const unidad = l.unidad || '';
  const cultivo = cultivoPorNombre(l.cultivo);
  const sacas = (kgHa: number) => (cultivo.sacas ? ` · ${tj.sacas(numero(sacasPorHa(kgHa), locale))}` : '');
  // El precio en la unidad en que lo dice cada uno (US$/t, Gs/kg), convertido a la vista.
  const unidadPrecio = unidadDePrecio(vistaDe(m).propia);
  const precioVisible = (porTonelada: number) => {
    const texto = precio(convertido(precioEnUnidad(porTonelada, unidadPrecio), m), vistaDe(m).moneda, locale);
    return unidadPrecio === 'kg' ? tj.porKilo(texto) : tj.porTonelada(texto);
  };

  const titulo = [
    agro ? nombreLargo(l, idioma) : l.nombre,
    conHa ? tj.ha(numero(hectareas as number, locale)) : (unidad && cantidad > 0 ? `${numero(cantidad, locale)} ${unidad}` : null),
  ].filter(Boolean).join(' · ');
  const cerrada = l.estado === 'cerrado';
  const subtitulo = cerrada && l.cerrado_el
    ? tr.cerroEl(fechaLegible(l.cerrado_el, true, locale))
    : tj.llevaDias(Number(l.dias));

  const costo = verCostos && l.costo !== null ? Number(l.costo) : null;
  const resultado = Number(l.resultado ?? 0);
  const kgCosechados = Number(l.kg_cosechados ?? 0);
  const kgSinVender = Number(l.kg_sin_vender ?? 0);
  const aDeber = verCostos && l.a_cosecha !== null ? Number(l.a_cosecha) : 0;
  const falta = verCostos && l.falta_cubrir !== null ? Number(l.falta_cubrir) : null;
  const cpu = verCostos ? costoPorUnidad(l) : null;
  const pud = porUnidadYDia(l);

  const detalleCosto = l.costo_ha !== null && verCostos
    ? tj.porHa(plata(Number(l.costo_ha)))
    : (cpu !== null && unidad ? tr.costoPorUnidad(plata(cpu), unidad) : null);
  const detalleResultado = l.resultado_ha !== null
    ? tj.porHa(plata(Number(l.resultado_ha)))
    : (l.por_unidad !== null && unidad
      ? [t.lotes.porUnidad(plata(Number(l.por_unidad)), unidad), pud !== null ? tr.porUnidadYDia(plata(pud), unidad) : null]
        .filter(Boolean).join(' · ')
      : null);

  const verParaCubrir = verCostos && l.kg_ha_para_cubrir !== null && l.precio_ref !== null;
  const renglones = [
    verParaCubrir ? (
      <li key="cubrir">
        {tj.paraCubrir(kilos(Number(l.kg_ha_para_cubrir)), precioVisible(Number(l.precio_ref)))}
        {sacas(Number(l.kg_ha_para_cubrir))}
      </li>
    ) : null,
    falta !== null && costo !== null && costo > 0 ? (
      falta === 0
        ? <li key="falta"><span className="pastilla bg-verde-claro text-verde-fuerte">{tj.cubierto}</span></li>
        : <li key="falta" className="font-semibold text-tinta">{tr.faltaCubrir(plata(falta))}</li>
    ) : null,
    kgCosechados > 0 ? (
      <li key="cosecha">
        {tj.cosechado(kilos(kgCosechados))}
        {l.rendimiento !== null && <> · {tj.kgHa(kilos(Number(l.rendimiento)))}{sacas(Number(l.rendimiento))}</>}
      </li>
    ) : null,
    kgSinVender > 0 ? <li key="silo" className="font-semibold text-tinta">{tj.enElSilo(kilos(kgSinVender))}</li> : null,
    kgSinVender < 0 ? <li key="demas" className="font-semibold text-ambar">{tj.vendisteMas}</li> : null,
    aDeber > 0 ? (
      <li key="deber" className="text-rojo">{agro ? tr.aCosecha(plata(aDeber)) : tr.aLaVenta(plata(aDeber))}</li>
    ) : null,
  ].filter(Boolean);

  return (
    <article className="tarjeta p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-bold tracking-tight">{titulo}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-tinta/50">{subtitulo}</p>
        </div>
        <span className={`pastilla shrink-0 ${cerrada ? 'bg-arena text-tinta/60' : 'bg-verde-claro text-verde-fuerte'}`}>
          {cerrada ? tr.cerrada : tr.abierta}
        </span>
      </div>

      <dl className="mt-3 space-y-2.5">
        {costo !== null && <Renglon etiqueta={tj.costo} valor={plata(costo)} detalle={detalleCosto} />}
        <Renglon
          etiqueta={tj.resultado} valor={plata(resultado)} detalle={detalleResultado}
          tono={resultado >= 0 ? 'bueno' : 'malo'}
        />
      </dl>

      {renglones.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-borde pt-3 text-[13px] leading-snug text-tinta/70">
          {renglones}
        </ul>
      )}
    </article>
  );
}

function Renglon({ etiqueta, valor, detalle, tono = 'neutro' }: {
  etiqueta: string;
  valor: string;
  detalle?: string | null;
  tono?: 'neutro' | 'bueno' | 'malo';
}) {
  const color = tono === 'bueno' ? 'text-verde-fuerte' : tono === 'malo' ? 'text-rojo' : 'text-tinta';
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[13.5px] text-tinta/60">{etiqueta}</dt>
      <dd className="min-w-0 text-right">
        <span className={`block font-titulo text-[18px] font-extrabold tabular-nums tracking-tight ${color}`}>{valor}</span>
        {detalle && <span className="block text-[12px] tabular-nums text-tinta/50">{detalle}</span>}
      </dd>
    </div>
  );
}

// =====================================================================
// LO QUE SE DEBE, ATADO A LAS CAMPAÑAS
// =====================================================================

interface DeudaDeLoteLeida {
  id: string;
  lote_id: string;
  nombre: string;
  acreedor: string;
  categoria: string;
  saldo: number;
  vence_el: string | null;
}

/**
 * Las deudas activas con saldo atadas a una campaña o lote: las mismas que
 * suma `numeros_de_lote` en «a cosecha» y lista `resumen_lote`, leídas de
 * una vez para todas las campañas (y no una llamada por campaña). La policy
 * de la 015 deja leerlas a los miembros; esta pantalla es de administración.
 */
async function traerDeudasDeLotes(empresaId: string): Promise<DeudaDeLoteLeida[]> {
  const supabase = clienteServidor();
  const respuesta = await supabase
    .from('deudas')
    .select('id, lote_id, nombre, acreedor, categoria, saldo, vence_el')
    .eq('empresa_id', empresaId)
    .eq('activa', true)
    .gt('saldo', 0)
    .not('lote_id', 'is', null)
    .order('vence_el', { ascending: true, nullsFirst: false });
  return exigirLista(respuesta, 'las deudas de las campañas') as DeudaDeLoteLeida[];
}
