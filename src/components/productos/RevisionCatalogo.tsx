'use client';

import { useMemo } from 'react';
import { useTextos } from '@/i18n/cliente';
import { dinero, numero } from '@/lib/formato';
import { ChipsDeHojas } from '@/components/planilla/ChipsDeHojas';
import {
  CAMPOS_CATALOGO,
  type BloqueCatalogo, type CampoCatalogo, type ListaProblemas, type ProblemaCatalogo, type ResultadoCatalogo,
} from '@/lib/catalogo-planilla';

/** Lo que dijo la base de lo que ya está (cotejar_productos), para «se crean N, se actualizan M». */
export type Cotejo =
  | { estado: 'nada' }
  | { estado: 'cargando' }
  | { estado: 'error' }
  | {
    estado: 'listo';
    nuevos: number;
    actualizados: number;
    vuelven: number;
    sinPrecioExisten: number;
    otroTipo: ProblemaCatalogo[];
    /** Su código es de un producto que ya está, y su nombre de OTRO: no se toca ninguno. */
    codigoDeOtro: ProblemaCatalogo[];
  };

/** Los datos que no tiene un servicio (no se piden en sus columnas). */
const SOLO_PRODUCTO: CampoCatalogo[] = ['costo', 'stock', 'stock_minimo'];
const MAS_DE = 50;

/**
 * El ejemplo de una columna, como se lee: el número de una celda de Excel
 * llega pelado («11700») y se muestra con sus puntos («11.700»), como el de
 * un CSV. Solo los enteros pelados: «9.800» de un CSV ya viene con sus
 * puntos (y no es 9,8). Un código no (un código de barras no es un monto),
 * ni lo que pasa de 9 cifras.
 */
function ejemplo(texto: string, esCodigo: boolean): string {
  if (esCodigo || !/^-?\d{4,9}$/.test(texto)) return texto.slice(0, 28);
  return numero(Number(texto));
}

/**
 * LO QUE SE ENTENDIÓ DE LA LISTA, ANTES DE GUARDAR (122).
 *
 * El molde es la revisión de la rutina (VistaLeida): arriba lo entendido en
 * verde, lo que no se carga en ámbar y con sus filas, nada en silencio.
 * Además, lo propio de una lista de productos:
 *
 *   · las hojas (chips), si la planilla trae varias;
 *   · «Se crean 1.100 · se actualizan 134»: lo que ya está no se duplica;
 *   · QUÉ ES CADA COLUMNA, con un selector para cambiarla si se leyó mal
 *     (cada opción con su título y un ejemplo). Las tablas con el mismo
 *     encabezado (una hoja por rubro) se cambian juntas;
 *   · los problemas (sin precio, sin nombre, montos que la base no acepta,
 *     precio menor al costo, repetidos, lo que ya está del otro tipo o trae
 *     el código de otro producto) y los avisos;
 *   · qué hacer con el stock de lo que ya existe;
 *   · los primeros 20, en una tabla.
 *
 * No guarda nada: todo lo que se toca acá vuelve a leer la planilla en el
 * celular (`leerCatalogo`), sin subirla de nuevo.
 */
export function RevisionCatalogo({
  resultado, cotejo, moneda, servicios, onMapeo, onHoja, incluirOcultas, onOcultas, modoStock, onModoStock,
}: {
  resultado: ResultadoCatalogo;
  cotejo: Cotejo;
  moneda: string;
  /** Se subió desde la pestaña Servicios. */
  servicios: boolean;
  onMapeo: (firma: string, campo: CampoCatalogo, columna: number | null) => void;
  onHoja: (nombre: string, usar: boolean) => void;
  incluirOcultas: boolean;
  onOcultas: (incluir: boolean) => void;
  modoStock: 'reemplazar' | 'no_tocar';
  onModoStock: (modo: 'reemplazar' | 'no_tocar') => void;
}) {
  const t = useTextos();
  const r = t.productos.planilla;
  const n = (x: number) => numero(x);

  // Lo leído, con y sin precio: los sin precio se explican abajo (un nuevo no
  // se crea; uno que ya existe actualiza lo demás, como en una planilla de
  // solo stock).
  const leidos = [...resultado.productos, ...resultado.sinPrecio];
  const productos = leidos.filter((p) => !p.servicio).length;
  const servs = leidos.length - productos;

  // Una sección de columnas por encabezado distinto. Sin ninguna tabla usada
  // (no se entendió nada), las de la primera hoja: para elegir a mano.
  const grupos = useMemo(() => {
    let tablas = resultado.bloques.filter((b) => b.usado);
    if (!tablas.length) {
      const hoja = resultado.bloques[0]?.hoja;
      tablas = resultado.bloques.filter((b) => b.hoja === hoja && b.columnas.some((c) => c.titulo || c.ejemplo));
    }
    const porFirma = new Map<string, BloqueCatalogo[]>();
    for (const b of tablas) porFirma.set(b.firma, [...(porFirma.get(b.firma) ?? []), b]);
    return [...porFirma.values()].slice(0, 4);
  }, [resultado.bloques]);

  // Los primeros con precio; si no hay ninguno (una planilla de solo stock), los sin precio.
  const primeros = (resultado.productos.length ? resultado.productos : resultado.sinPrecio).slice(0, 20);
  const hayCodigo = primeros.some((p) => p.codigo);
  const hayCosto = primeros.some((p) => p.costo !== null);
  const hayStock = primeros.some((p) => p.stock !== null);
  const conStock = resultado.bloques.some((b) => b.usado && b.mapeo.stock !== undefined && !b.servicio);
  const existen = cotejo.estado === 'listo' ? cotejo.actualizados : 0;
  // El otro precio y la columna de códigos rotos tienen su aviso propio, abajo.
  const conAviso = resultado.avisos.flatMap((a) => (a.codigo === 'otro_precio_no_usado' || a.codigo === 'codigos_no_usados' ? a.columnas : []));
  const noUsadas = resultado.columnasNoUsadas.filter((c) => !conAviso.includes(c));

  return (
    <div className="space-y-4" aria-live="polite">
      {leidos.length > 0 ? (
        <p className={`text-[15px] font-bold ${resultado.productos.length ? 'text-verde-fuerte' : 'text-tinta/70'}`}>
          {servicios && !productos
            ? r.entendiServicios(servs, n(servs))
            : `${r.entendi(productos, n(productos))}${servs ? r.yServicios(servs, n(servs)) : ''}`}
        </p>
      ) : (
        <div className="rounded-xl bg-ambar-claro px-3.5 py-3">
          <p className="text-[14px] font-bold text-ambar">{r.nada}</p>
          <p className="mt-1 text-[12.5px] leading-snug text-tinta/70">{r.nadaAyuda}</p>
        </div>
      )}

      {resultado.hojas.length > 1 && (
        <ChipsDeHojas
          hojas={resultado.hojas.map((h) => ({ nombre: h.nombre, usada: h.usada, activable: h.esCatalogo }))}
          etiqueta={t.planilla.hojas} noUsada={r.hojaSinProductos} onHoja={onHoja}
        />
      )}

      {leidos.length > 0 && (
        <p className="text-[13.5px] font-semibold text-tinta/75">
          {cotejo.estado === 'cargando' && <span className="text-tinta/55">{r.comparando}</span>}
          {cotejo.estado === 'error' && <span className="font-medium text-tinta/60">{r.noSePudoComparar}</span>}
          {cotejo.estado === 'listo' && (
            <>
              {/* «Se crean 15 · se actualizan 0» no dice nada del 0: todos nuevos o todos ya estaban, en palabras. */}
              {!cotejo.actualizados && cotejo.nuevos
                ? r.todosNuevos(cotejo.nuevos, n(cotejo.nuevos))
                : !cotejo.nuevos && cotejo.actualizados
                  ? r.todosExisten(cotejo.actualizados, n(cotejo.actualizados))
                  : `${r.seCrean(cotejo.nuevos, n(cotejo.nuevos))} · ${r.seActualizan(cotejo.actualizados, n(cotejo.actualizados))}`}
              {cotejo.vuelven > 0 && <span className="block text-[12.5px] font-medium text-tinta/55">{r.vuelven(cotejo.vuelven, n(cotejo.vuelven))}</span>}
            </>
          )}
        </p>
      )}

      {/* Qué es cada columna. */}
      {grupos.map((tablas) => {
        const b = tablas[0];
        const soloServicios = tablas.every((x) => x.servicio);
        const campos = CAMPOS_CATALOGO.filter((c) => !(soloServicios && SOLO_PRODUCTO.includes(c)));
        const hojas = [...new Set(tablas.map((x) => x.hoja).filter(Boolean))];
        // La categoría que no tiene columna pero sale de las hojas o de los subtítulos (02, 03, 13).
        const categoriaDeTitulos = b.mapeo.categoria === undefined && leidos.some((p) => p.categoria);
        return (
          <section key={b.firma} className="tarjeta p-3.5">
            <h3 className="text-[14px] font-bold">{grupos.length > 1 && hojas.length ? r.columnasDe(hojas.join(', ')) : r.columnas}</h3>
            <p className="mt-0.5 text-[12.5px] leading-snug text-tinta/55">{r.columnasAyuda}</p>
            {/* Una fila por dato: el nombre a la izquierda y la columna al lado.
                Apiladas (título arriba, selector abajo) ocupaban la primera
                pantalla entera del celular y la lista no se veía. */}
            <div className="mt-2.5 grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
              {campos.map((campo) => {
                const k = b.mapeo[campo];
                return (
                  <label key={campo} className="flex min-w-0 items-center gap-2.5">
                    <span className="w-[5.5rem] shrink-0 text-[13px] font-semibold leading-tight text-tinta/70">{r.campos[campo]}</span>
                    {/* 16 px con el dedo (con menos, el iPhone y el iPad agrandan la
                        pantalla al tocar); con mouse, 14, para que entre el ejemplo. */}
                    <select
                      className={`campo min-h-[44px] min-w-0 flex-1 py-2 [@media(pointer:fine)]:text-[14px] ${k === undefined ? 'text-tinta/45' : ''}`}
                      value={k === undefined ? '' : String(k)}
                      onChange={(e) => onMapeo(b.firma, campo, e.target.value === '' ? null : Number(e.target.value))}
                    >
                      <option value="">{campo === 'categoria' && categoriaDeTitulos ? r.categoriaDeTitulos : r.noEsta}</option>
                      {b.columnas.map((c, i) => (c.titulo || c.ejemplo ? (
                        <option key={i} value={String(i)}>
                          {`${c.titulo || r.columnaN(i + 1)}${c.oculta ? ` (${r.oculta})` : ''}${c.ejemplo ? ` — ${ejemplo(c.ejemplo, i === b.mapeo.codigo)}` : ''}`}
                        </option>
                      ) : null))}
                    </select>
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}
      {/* Lo que no se usa, una sola vez: el otro precio tiene su aviso propio, abajo. */}
      {noUsadas.length > 0 && (
        <p className="text-[12.5px] leading-snug text-tinta/55">{r.noUsamos(noUsadas.join(', '))}</p>
      )}

      {/* Lo que no se carga, o se carga con un aviso. */}
      <Problema
        moneda={moneda}
        lista={resultado.problemas.sin_precio}
        titulo={r.problemas.sinPrecio(resultado.problemas.sin_precio.cuantos, n(resultado.problemas.sin_precio.cuantos))}
        detalle={cotejo.estado === 'listo' && cotejo.sinPrecioExisten > 0 ? r.problemas.sinPrecioExisten(cotejo.sinPrecioExisten, n(cotejo.sinPrecioExisten)) : undefined}
      />
      <Problema moneda={moneda} lista={resultado.problemas.sin_nombre} titulo={r.problemas.sinNombre(resultado.problemas.sin_nombre.cuantos, n(resultado.problemas.sin_nombre.cuantos))} />
      {/* Negativo o enorme: la base no lo acepta. Se dice acá, y no frena la tanda al guardar (29). */}
      <Problema moneda={moneda} lista={resultado.problemas.monto_invalido} titulo={r.problemas.montoInvalido(resultado.problemas.monto_invalido.cuantos, n(resultado.problemas.monto_invalido.cuantos))} />
      <Problema moneda={moneda} lista={resultado.problemas.precio_menor_costo} titulo={r.problemas.precioMenorCosto(resultado.problemas.precio_menor_costo.cuantos, n(resultado.problemas.precio_menor_costo.cuantos))} />
      <Problema moneda={moneda} lista={resultado.problemas.repetidos} titulo={r.problemas.repetidos(resultado.problemas.repetidos.cuantos, n(resultado.problemas.repetidos.cuantos))} />
      {cotejo.estado === 'listo' && (
        <>
          <Problema
            moneda={moneda}
            lista={{ cuantos: cotejo.otroTipo.length, ejemplos: cotejo.otroTipo.slice(0, 100) }}
            titulo={r.problemas.otroTipo(cotejo.otroTipo.length, n(cotejo.otroTipo.length))}
          />
          <Problema
            moneda={moneda}
            lista={{ cuantos: cotejo.codigoDeOtro.length, ejemplos: cotejo.codigoDeOtro.slice(0, 100) }}
            titulo={r.problemas.codigoDeOtro(cotejo.codigoDeOtro.length, n(cotejo.codigoDeOtro.length))}
          />
        </>
      )}

      {resultado.avisos.map((a, i) => {
        const caja = 'rounded-xl bg-ambar-claro px-3 py-2.5 text-[12.5px] leading-snug text-tinta/80';
        switch (a.codigo) {
          case 'formulas_sin_calcular': return <p key={i} className={caja}>{r.avisos.formulasSinCalcular(a.columnas.map((c) => `«${c}»`).join(', '))}</p>;
          case 'filas_ocultas': return (
            <div key={i} className={`${caja} flex flex-wrap items-center justify-between gap-x-3 gap-y-1`}>
              <span>{a.incluidas ? r.avisos.ocultasIncluidas(a.cuantas, n(a.cuantas)) : r.avisos.ocultasAfuera(a.cuantas, n(a.cuantas))}</span>
              <button type="button" className="boton-texto min-h-[40px]" onClick={() => onOcultas(!incluirOcultas)}>
                {incluirOcultas ? r.avisos.dejarlasAfuera : r.avisos.sumarlas}
              </button>
            </div>
          );
          case 'sin_encabezado': return <p key={i} className={caja}>{r.avisos.sinTitulos}</p>;
          case 'sin_costo': return <p key={i} className={caja}>{r.avisos.sinCosto}</p>;
          case 'recortada': return <p key={i} className={caja}>{r.avisos.recortada}</p>;
          case 'nombre_largo': return <p key={i} className={caja}>{r.avisos.nombreLargo(a.cuantos, n(a.cuantos))}</p>;
          // Otro precio que quedó afuera puede ser justo el de venta («Precio | Venta»): en ámbar, para mirarlo.
          case 'otro_precio_no_usado': return <p key={i} className={caja}>{r.avisos.otroPrecio(a.columnas.map((c) => `«${c}»`).join(', '))}</p>;
          // Los códigos que Excel rompió (7,79E+12) o que se repiten en productos distintos: se empareja por el nombre (22).
          case 'codigos_no_usados': {
            const columnas = a.columnas.map((c) => `«${c}»`).join(', ');
            return <p key={i} className={caja}>{a.cientificos ? r.avisos.codigosCientificos(columnas) : r.avisos.codigosRepetidos(columnas)}</p>;
          }
          // Ya están en «No usamos: …», arriba.
          case 'datos_no_usados': return null;
        }
        return null;
      })}

      {/* El stock de lo que ya existe: solo si hay stock en la planilla y algo ya está. */}
      {conStock && existen > 0 && (
        <fieldset className="rounded-xl border border-borde/70 px-3 py-2.5">
          <legend className="px-1 text-[13px] font-semibold">{r.stock.pregunta}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {(['reemplazar', 'no_tocar'] as const).map((m) => (
              <button
                key={m} type="button" aria-pressed={modoStock === m} onClick={() => onModoStock(m)}
                className={`${modoStock === m ? 'chip-encendido' : 'chip-apagado'} min-h-[40px] px-3.5 text-[13px]`}
              >
                {m === 'reemplazar' ? r.stock.reemplazar : r.stock.dejar}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {primeros.length > 0 && (
        <section>
          <h3 className="text-[13px] font-semibold text-tinta/60">{r.primeros(primeros.length)}</h3>
          {/* Como la tabla de Productos: el nombre con su categoría y su código
              abajo, y los montos al lado. Con una columna por dato, en el
              celular el precio quedaba afuera, a la derecha, justo lo que hay
              que mirar. */}
          <div className="tarjeta mt-1.5 overflow-x-auto">
            <table className="tabla text-[13.5px] [&_tbody_td]:px-2.5 [&_thead_th]:px-2.5 sm:[&_tbody_td]:px-3 sm:[&_thead_th]:px-3">
              <thead>
                <tr>
                  <th>{r.tabla.producto}</th>
                  {hayCosto && <th className="num">{r.campos.costo}</th>}
                  <th className="num">{r.tabla.precio}</th>
                  {hayStock && <th className="num">{r.campos.stock}</th>}
                </tr>
              </thead>
              <tbody>
                {primeros.map((p) => (
                  <tr key={`${p.hoja}:${p.fila}`}>
                    <td className="min-w-[8.5rem]">
                      <span className="block font-semibold leading-snug">{p.nombre}</span>
                      <span className="block text-[12px] leading-snug text-tinta/50">
                        {p.categoria ?? r.sinCategoria}
                        {/* El código, desde la tableta: en el celular partía la fila en tres líneas. */}
                        {hayCodigo && p.codigo && <span className="hidden tabular-nums sm:inline"> · {p.codigo}</span>}
                      </span>
                    </td>
                    {hayCosto && <td className="num whitespace-nowrap text-tinta/60">{p.costo === null ? '—' : dinero(p.costo, moneda, false)}</td>}
                    <td className="num whitespace-nowrap font-semibold">{p.precio === null ? '—' : dinero(p.precio, moneda, false)}</td>
                    {hayStock && <td className="num whitespace-nowrap">{p.stock === null ? '—' : numero(p.stock)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/** Un problema en ámbar, con sus filas a mano (hasta 50, y «y N más»). */
function Problema({ lista, titulo, detalle, moneda }: { lista: ListaProblemas; titulo: string; detalle?: string; moneda: string }) {
  const t = useTextos();
  const r = t.productos.planilla;
  if (!lista.cuantos) return null;
  const vistos = lista.ejemplos.slice(0, MAS_DE);
  return (
    <details className="rounded-xl bg-ambar-claro px-3 py-2.5">
      <summary className="cursor-pointer text-[12.5px] font-semibold leading-snug text-tinta/85">
        {titulo}
        {detalle && <span className="font-medium text-tinta/65"> {detalle}</span>}
        <span className="ml-1.5 font-semibold text-verde-fuerte">{r.problemas.verFilas}</span>
      </summary>
      <ul className="mt-1.5 space-y-0.5">
        {vistos.map((p, i) => (
          <li key={i} className="break-words text-[12.5px] text-tinta/75">
            <span className="text-tinta/50">{r.problemas.fila(p.fila, p.hoja)}</span>
            {p.nombre && <span className="font-semibold"> · {p.nombre}</span>}
            {/* Lo que hace falta para entenderlo sin abrir la planilla: los dos montos, o qué fila queda. */}
            {p.costo !== undefined && p.precio !== undefined
              ? <span> — {r.problemas.costoYPrecio(dinero(p.costo, moneda, false), dinero(p.precio, moneda, false))}</span>
              : p.queda
                ? <span> — {r.problemas.queda(p.queda.fila, p.queda.hoja !== p.hoja ? p.queda.hoja : '')}</span>
                : p.valor && <span className="font-mono"> — «{p.valor}»</span>}
          </li>
        ))}
        {lista.cuantos > vistos.length && <li className="text-[12px] text-tinta/50">{r.problemas.yMas(numero(lista.cuantos - vistos.length))}</li>}
      </ul>
    </details>
  );
}
