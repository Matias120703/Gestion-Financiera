import Link from 'next/link';
import { type Moneda, dinero, dineroCorto, numero } from '@/lib/formato';
import { Indicador, Seccion, Barra } from '@/components/Piezas';
import { categoriaVisible } from '@/i18n/nombres';
import type { Textos } from '@/i18n/textos/es';
import type { PalabrasAlumnos } from '@/i18n/textos/reportes-alumnos';
import type { PanelProfe as Datos, ProductosDelPeriodo } from '@/lib/tipos';
import type { RutinasDeLaAgenda } from '@/lib/tipos-rutinas';
import { RutinaDeLaSesion } from '@/components/rutinas/HojaRutinaSesion';
import type { FilaCategoria, Resumen } from '@/lib/calculos';
import { SIN_PRODUCTOS, conGanancia, deClases, mapearProductos, mostrarProductos } from '@/lib/reportes/productos';

/**
 * LO QUE MIRA UN PROFE AL ABRIR ORDEN (092).
 *
 * Matías: «si entro como profesor no me puede aparecer lo vendido, ganancia
 * bruta, ganancia neta, lo que más se vendió. Tiene que estar adaptado a su
 * rubro».
 *
 * Un profe no vende cosas ni tiene margen sobre mercadería. Sus preguntas
 * son: ¿qué clases tengo hoy?, ¿cuánto cobré?, ¿quién me debe?, ¿cuántos
 * alumnos tengo activos?, ¿en qué se me fue la plata? Eso, y nada más.
 *
 * SALVO QUE TAMBIÉN VENDA PRODUCTOS (121): el profe de tenis con sus
 * raquetas, el trainer con su proteína. Entonces suma una tarjeta con lo de
 * sus clases y lo de sus productos por separado, y cuánto ganó con ellos.
 */
export function PanelProfe({
  datos, categorias, moneda, locale, t, rangoTexto, notasALaVista = false, empresaId, rutinas = {},
  vendeProductos = false, resumen = null, palabras,
}: {
  datos: Datos;
  categorias: FilaCategoria[];
  moneda: Moneda;
  locale: string;
  t: Textos;
  rangoTexto: string;
  /** Las lesiones de cada cliente en sus sesiones de hoy: el trainer (097). */
  notasALaVista?: boolean;
  /** Para abrir la rutina de cada sesión (098). */
  empresaId?: string;
  /** La rutina vigente del cliente de cada sesión de hoy, por id de reserva: el trainer (098). */
  rutinas?: RutinasDeLaAgenda;
  /** «También vendo productos» prendido (121): la ficha tiene `/productos`. */
  vendeProductos?: boolean;
  /**
   * El resumen del período (`resumen_financiero`), solo para administración
   * (121). Con él, «Te queda» sigue la regla de la 106: resta el costo de lo
   * vendido y no la compra de mercadería. Sin él (vendedor, o si falló),
   * cobrado − gastado, como siempre.
   */
  resumen?: Resumen | null;
  /** Las palabras del profe o del trainer, para la tarjeta de productos. */
  palabras: PalabrasAlumnos;
}) {
  const p = t.panel;
  const vp = t.vendoProductos.panel;
  const plata = (n: number) => dinero(n, moneda, true, locale);
  const corta = (n: number) => dineroCorto(n, moneda);
  const cobrado = Number(datos.cobrado);
  const gastado = Number(datos.gastado);
  // Con el resumen, la ganancia neta de la base (106); sin productos es el
  // mismo número que cobrado − gastado.
  const conResultado = Boolean(resumen?.conCostos);
  const queda = resumen && conResultado ? resumen.gananciaNeta : cobrado - gastado;
  const conCostoDeLoVendido = Boolean(resumen && conResultado && resumen.costoMercaderia > 0);
  const mercaderiaAparte = resumen && conResultado && resumen.mercaderiaAparte && resumen.comprasMercaderia > 0
    ? resumen.comprasMercaderia : 0;

  // Lo de los productos (121). Sin la 121 en la base no llega: sin productos.
  const productos: ProductosDelPeriodo = datos.productos ? mapearProductos(datos.productos) : SIN_PRODUCTOS;
  const verProductos = mostrarProductos(vendeProductos, productos);

  return (
    <>
      {/* ---------------- Las clases de hoy ---------------- */}
      <Seccion
        titulo={p.clasesDeHoy}
        accion={<Link href="/agenda" className="boton-texto">{p.verAgenda}</Link>}
      >
        {datos.hoy.length === 0 ? (
          <p className="px-4 pb-4 pt-3 text-[13.5px] text-tinta/55">{p.sinClasesHoy}</p>
        ) : (
          <ul className="divide-y divide-borde">
            {datos.hoy.map((c) => (
              <li key={c.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  {/* La materia debajo del nombre y no al lado: en un celular, al
                      lado, el nombre se partía en tres renglones angostos. */}
                  <span className="flex min-w-0 items-baseline gap-3">
                    <span className="shrink-0 text-[15px] font-bold tabular-nums">{c.hora}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-semibold">{c.alumno}</span>
                      {c.materia && <span className="block truncate text-[12.5px] text-tinta/50">{c.materia}</span>}
                      {/* Hasta dos renglones: el resumen del día. Entera, en la agenda. */}
                      {notasALaVista && c.notas && (
                        <span className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-snug text-tinta/75">
                          <span aria-hidden className="text-ambar">⚠ </span><span className="sr-only">{t.inscribir.salud}: </span>{c.notas}
                        </span>
                      )}
                    </span>
                  </span>
                  {c.estado === 'atendida' && (
                    <span className="pastilla shrink-0 whitespace-nowrap bg-verde text-sobre-verde">{t.agenda.claseDada}</span>
                  )}
                  {c.estado === 'no_vino' && (
                    <span className="pastilla shrink-0 whitespace-nowrap bg-rojo-claro text-rojo">{t.agenda.claseNoTenida}</span>
                  )}
                </div>
                {/* La rutina de la sesión, para darla con el celular en la mano (098). */}
                {empresaId && rutinas[c.id] && (
                  <RutinaDeLaSesion
                    className="mt-1.5"
                    empresaId={empresaId}
                    rutinaId={rutinas[c.id].rutina_id}
                    nombre={rutinas[c.id].nombre}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <p className="text-[13px] font-semibold text-tinta/45">{rangoTexto}</p>

      {/* ---------------- Los números del período ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          titulo={p.cobrado} destacado
          valor={corta(Number(datos.cobrado))}
          detalle={p.clasesDadas(datos.clases_periodo)}
          tono="bueno"
        />
        <Indicador
          titulo={p.gastadoProfe}
          valor={corta(Number(datos.gastado))}
          detalle={categorias[0] ? p.mayorGasto(categoriaVisible(t, categorias[0].nombre).slice(0, 22)) : p.sinGastos}
          tono={Number(datos.gastado) > 0 ? 'malo' : 'neutro'}
        />
        <Link href="/clientes" className="block">
          <Indicador
            titulo={p.porCobrar}
            valor={corta(Number(datos.por_cobrar))}
            detalle={p.teDebenAlumnos(datos.deben)}
            tono={Number(datos.por_cobrar) > 0 ? 'malo' : 'neutro'}
          />
        </Link>
        <Indicador
          titulo={p.alumnosActivos}
          valor={String(datos.alumnos_activos)}
          detalle={p.conPeriodoVigente}
        />
      </div>

      {/* ---------------- Clases y productos (121) ---------------- */}
      {verProductos && (
        <TarjetaProductos
          productos={productos}
          cobradoClases={deClases(datos.cobrado_clases, cobrado, productos)}
          cobrado={cobrado}
          vendeProductos={vendeProductos}
          palabras={palabras}
          plata={plata}
          corta={corta}
          locale={locale}
          t={t}
        />
      )}

      {/* ---------------- Lo que te queda ---------------- */}
      <div className="tarjeta p-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[14px] font-bold">{p.teQueda}</span>
          <span className={`font-titulo text-[22px] font-extrabold tabular-nums tracking-tight ${queda >= 0 ? 'text-verde-fuerte' : 'text-rojo'}`}>
            {plata(queda)}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] text-tinta/45">
          {conCostoDeLoVendido ? vp.teQuedaConProductos : p.cobradoMenosGastado}
        </p>
        {mercaderiaAparte > 0 && (
          <p className="mt-1 text-[12.5px] text-tinta/45">{vp.mercaderiaAparte(plata(mercaderiaAparte))}</p>
        )}
      </div>

      {/* ---------------- En qué se fue la plata ---------------- */}
      {categorias.length > 0 && (
        <Seccion titulo={p.enQueSeFue} accion={<Link href="/gastos" className="boton-texto">{p.cargarGasto}</Link>}>
          <div className="space-y-3.5 px-4 pb-4 pt-3">
            {categorias.slice(0, 5).map((c) => (
              <div key={c.nombre}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="truncate text-[14px] font-semibold">{categoriaVisible(t, c.nombre)}</span>
                  <span className="shrink-0 text-[13.5px] font-bold tabular-nums">{dinero(c.monto, moneda, false, locale)}</span>
                </div>
                <Barra porcentaje={c.participacion} tono="rojo" />
              </div>
            ))}
          </div>
        </Seccion>
      )}
    </>
  );
}

/**
 * LO DE LAS CLASES Y LO DE LOS PRODUCTOS, POR SEPARADO (121).
 *
 * «Con los productos ganaste Gs. 340.000»: lo vendido del catálogo menos lo
 * que costó, que es la pregunta de Matías. La ganancia solo para quien ve
 * costos; a un vendedor, lo vendido y las unidades. Con el interruptor
 * prendido y nada vendido todavía, el camino a Vender.
 *
 * Sale también con el interruptor apagado si en el período hubo ventas del
 * catálogo: apagarlo no borra lo vendido, y sin esta tarjeta «Cobrado» no
 * cerraría con lo de las clases.
 */
function TarjetaProductos({
  productos, cobradoClases, cobrado, vendeProductos, palabras, plata, corta, locale, t,
}: {
  productos: ProductosDelPeriodo;
  cobradoClases: number;
  cobrado: number;
  vendeProductos: boolean;
  palabras: PalabrasAlumnos;
  plata: (n: number) => string;
  corta: (n: number) => string;
  locale: string;
  t: Textos;
}) {
  const vp = t.vendoProductos.panel;
  // Lo que entró y no es ni clase ni producto: un aporte, un préstamo.
  const otros = cobrado - cobradoClases - productos.vendido;
  const unidades = vp.unidades(productos.unidades, numero(productos.unidades, locale));

  return (
    <div className="tarjeta p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-bold tracking-tight">{vp.titulo(palabras)}</h2>
        {vendeProductos && <Link href="/productos" className="boton-texto">{vp.verProductos}</Link>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-arena px-3 py-2.5">
          <p className="text-[12px] font-semibold text-tinta/55">{vp.deTusClases(palabras)}</p>
          <p className="mt-1 font-titulo text-[19px] font-extrabold tabular-nums leading-none">{corta(cobradoClases)}</p>
        </div>
        <div className="rounded-xl bg-arena px-3 py-2.5">
          <p className="text-[12px] font-semibold text-tinta/55">{vp.deProductos}</p>
          <p className="mt-1 font-titulo text-[19px] font-extrabold tabular-nums leading-none">{corta(productos.vendido)}</p>
        </div>
      </div>
      {otros > 0.5 && (
        <p className="mt-2 text-[12.5px] text-tinta/50">{vp.otrosIngresos}: {plata(otros)}</p>
      )}

      {productos.vendido > 0 || productos.operaciones > 0 ? (
        conGanancia(productos) ? (
          <div className={`mt-3 rounded-xl px-3.5 py-3 ${productos.ganancia >= 0 ? 'bg-verde-claro' : 'bg-rojo-claro'}`}>
            <p className={`text-[13px] font-semibold ${productos.ganancia >= 0 ? 'text-verde-fuerte' : 'text-rojo'}`}>
              {productos.ganancia >= 0 ? vp.ganaste : vp.perdiste}
            </p>
            <p className={`mt-0.5 font-titulo text-[22px] font-extrabold tabular-nums tracking-tight ${
              productos.ganancia >= 0 ? 'text-verde-fuerte' : 'text-rojo'
            }`}>
              {plata(Math.abs(productos.ganancia))}
            </p>
            {/* La cuenta en dos renglones —lo vendido, lo que costó—: en uno solo,
                en el celular se partía en «14 / unidades». */}
            <p className="mt-0.5 text-[12.5px] text-tinta/60">{vp.vendiste(plata(productos.vendido), unidades)}</p>
            <p className="text-[12.5px] text-tinta/60">{vp.teCostaron(plata(productos.costo))}</p>
          </div>
        ) : (
          <p className="mt-3 text-[12.5px] text-tinta/55">{vp.vendiste(plata(productos.vendido), unidades)}</p>
        )
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-arena px-3.5 py-3">
          <p className="min-w-0 text-[13px] leading-snug text-tinta/60">{vp.sinVentas}</p>
          {vendeProductos && (
            <Link href="/vender" className="boton-principal shrink-0 px-5 py-2.5 text-[14px]">{vp.vender}</Link>
          )}
        </div>
      )}
    </div>
  );
}
