'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTextos } from '@/i18n/cliente';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { numero } from '@/lib/formato';
import { TOPES_CATALOGO, compactoALibro, type LibroPlanilla } from '@/lib/planilla';
import {
  TANDA_COTEJAR, TANDA_IMPORTAR, claveDeFila, filaParaGuardar, leerCatalogo,
  type CampoCatalogo, type FilaCatalogo, type ProblemaCatalogo,
} from '@/lib/catalogo-planilla';
import { Hoja, PieHoja } from '@/components/Hoja';
import { ElegirPlanilla } from '@/components/planilla/ElegirPlanilla';
import { RevisionCatalogo, type Cotejo } from './RevisionCatalogo';

const RUTA = '/api/productos/planilla';

type EstadoCotejo = 'nuevo' | 'existe' | 'pausado' | 'otro_tipo' | 'codigo_de_otro';
type Omitido = { fila: number; nombre: string; motivo: 'sin_precio' | 'otro_tipo' | 'nombre_repetido' | 'codigo_de_otro' };
/** Lo que ya está y no se toca: del otro tipo, o con el código de otro producto (cotejar_productos). */
const NO_SE_TOCA: readonly (EstadoCotejo | undefined)[] = ['otro_tipo', 'codigo_de_otro'];

interface Resumen {
  creados: number;
  actualizados: number;
  reactivados: number;
  sin_cambios: number;
  renombrados: { fila: number; nombre: string }[];
  omitidos: Omitido[];
}

const RESUMEN_VACIO: Resumen = { creados: 0, actualizados: 0, reactivados: 0, sin_cambios: 0, renombrados: [], omitidos: [] };

type Paso =
  | { tipo: 'elegir' }
  | { tipo: 'revision' }
  | { tipo: 'guardando'; hechas: number; total: number; resumen: Resumen }
  | { tipo: 'cortado'; hechas: number; total: number; resumen: Resumen; mensaje: string }
  | { tipo: 'listo'; total: number; resumen: Resumen };

/**
 * «SUBIR PLANILLA» EN PRODUCTOS (122).
 *
 * Matías: «Nadie va a anotar uno por uno sus miles de productos». La lista
 * del negocio, como la tenga, en tres pasos dentro de una sola ventana:
 *
 *   1. ELEGIR: el archivo (.xlsx o .csv) o el link de Google Sheets
 *      (`ElegirPlanilla`, el mismo de la rutina). El CSV se lee en el
 *      celular; el .xlsx y el link, en el servidor (/api/productos/planilla),
 *      que devuelve el libro en corto y no guarda nada.
 *   2. REVISAR: `leerCatalogo` entiende las columnas acá mismo, y
 *      `cotejar_productos` dice cuáles ya existen: «se crean 1.100, se
 *      actualizan 134». Cambiar una columna o una hoja vuelve a leer en el
 *      celular, sin subir nada (`RevisionCatalogo`).
 *   3. GUARDAR: directo a la base, por tandas de 1.000
 *      (`importar_productos`, todo o nada por tanda), con la barra de
 *      progreso. Guardar no pasa por Vercel: 20.000 productos son 20 pedidos
 *      chicos. Si una tanda falla, se dice cuántas quedaron y se sigue desde
 *      ahí; como lo que ya está no se duplica, seguir o volver a subir la
 *      misma planilla es seguro.
 *
 * El stock que trae la planilla no es una compra: no se anota ningún gasto.
 */
export function SubirPlanilla({
  empresaId, moneda, tipo, irA, onCerrar, onGuardado,
}: {
  empresaId: string;
  moneda: string;
  /** La pestaña desde donde se subió: lo que es una tabla que no dice «Servicio» ni «Producto». */
  tipo: 'productos' | 'servicios';
  /** «Ir a Vender» o «Ir a Cobrar», con las palabras del rubro. */
  irA: string;
  onCerrar: () => void;
  /** Al terminar (también si se cortó a la mitad): la pantalla de atrás se refresca. */
  onGuardado: () => void;
}) {
  const t = useTextos();
  const r = t.productos.planilla;
  const [libro, setLibro] = useState<LibroPlanilla | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [paso, setPaso] = useState<Paso>({ tipo: 'elegir' });
  // Lo que se toca en la revisión (se reinicia con otro archivo).
  const [hojas, setHojas] = useState<Record<string, boolean>>({});
  const [mapeo, setMapeo] = useState<Record<string, Partial<Record<CampoCatalogo, number | null>>>>({});
  const [incluirOcultas, setIncluirOcultas] = useState(true);
  const [modoStock, setModoStock] = useState<'reemplazar' | 'no_tocar'>('reemplazar');
  const [estados, setEstados] = useState<Map<string, EstadoCotejo> | 'cargando' | 'error' | null>(null);
  // Lo que se está guardando, quieto: «Seguir desde ahí» sigue con ESTO, aunque la revisión cambie.
  const aGuardar = useRef<{ filas: FilaCatalogo[]; opciones: { tipo: string; stock: string } } | null>(null);

  const resultado = useMemo(
    () => (libro ? leerCatalogo(libro, { hojas, mapeo, incluirOcultas, tipo }) : null),
    [libro, hojas, mapeo, incluirOcultas, tipo],
  );

  // Cuáles ya existen: un pedido por cada 5.000, un rato después del último cambio.
  const paraCotejar = useMemo(() => (resultado ? [...resultado.productos, ...resultado.sinPrecio] : []), [resultado]);
  useEffect(() => {
    if (!paraCotejar.length) { setEstados(null); return; }
    let vigente = true;
    setEstados('cargando');
    const reloj = setTimeout(async () => {
      try {
        const supabase = clienteNavegador();
        const mapa = new Map<string, EstadoCotejo>();
        for (let i = 0; i < paraCotejar.length; i += TANDA_COTEJAR) {
          const tanda = paraCotejar.slice(i, i + TANDA_COTEJAR);
          const { data, error } = await supabase.rpc('cotejar_productos', {
            p_empresa: empresaId,
            p_filas: tanda.map((f) => ({ codigo: f.codigo, nombre: f.nombre, servicio: f.servicio })),
            p_tipo: tipo,
          });
          if (error) throw error;
          if (!vigente) return;
          (data as EstadoCotejo[]).forEach((e, k) => mapa.set(claveDeFila(tanda[k]), e));
        }
        if (vigente) setEstados(mapa);
      } catch {
        if (vigente) setEstados('error');
      }
    }, 350);
    return () => { vigente = false; clearTimeout(reloj); };
  }, [paraCotejar, empresaId, tipo]);

  const cotejo: Cotejo = useMemo(() => {
    if (!resultado || estados === null) return { estado: 'nada' };
    if (estados === 'cargando') return { estado: 'cargando' };
    if (estados === 'error') return { estado: 'error' };
    let nuevos = 0, actualizados = 0, vuelven = 0, sinPrecioExisten = 0;
    const otroTipo: ProblemaCatalogo[] = [];
    const codigoDeOtro: ProblemaCatalogo[] = [];
    const contar = (f: FilaCatalogo, conPrecio: boolean) => {
      const e = estados.get(claveDeFila(f));
      if (e === 'otro_tipo') { otroTipo.push({ fila: f.fila, hoja: f.hoja, nombre: f.nombre }); return; }
      if (e === 'codigo_de_otro') { codigoDeOtro.push({ fila: f.fila, hoja: f.hoja, nombre: f.nombre, valor: f.codigo ?? undefined }); return; }
      if (e === 'existe' || e === 'pausado') {
        actualizados++;
        if (e === 'pausado') vuelven++;
        if (!conPrecio) sinPrecioExisten++;
      } else if (conPrecio) {
        nuevos++;
      }
    };
    resultado.productos.forEach((f) => contar(f, true));
    resultado.sinPrecio.forEach((f) => contar(f, false));
    return { estado: 'listo', nuevos, actualizados, vuelven, sinPrecioExisten, otroTipo, codigoDeOtro };
  }, [resultado, estados]);

  /** Lo que se manda: los que tienen precio, y los sin precio que ya existen (se les actualiza lo demás). */
  const filasAGuardar = useMemo(() => {
    if (!resultado) return [];
    if (!(estados instanceof Map)) return resultado.productos;
    const ok = (f: FilaCatalogo) => !NO_SE_TOCA.includes(estados.get(claveDeFila(f)));
    const existe = (f: FilaCatalogo) => ['existe', 'pausado'].includes(estados.get(claveDeFila(f)) ?? '');
    return [...resultado.productos.filter(ok), ...resultado.sinPrecio.filter(existe)];
  }, [resultado, estados]);

  const guardando = paso.tipo === 'guardando';
  // Mientras guarda, salir de la página corta la subida: el navegador pregunta.
  useEffect(() => {
    if (!guardando) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [guardando]);

  function usarLibro(nuevo: LibroPlanilla) {
    setHojas({});
    setMapeo({});
    setIncluirOcultas(true);
    setModoStock('reemplazar');
    setLibro(nuevo);
    setPaso({ tipo: 'revision' });
  }

  function otroArchivo() {
    setLibro(null);
    setEstados(null);
    setPaso({ tipo: 'elegir' });
  }

  async function guardar(desde: number, resumenPrevio: Resumen) {
    const lote = aGuardar.current;
    if (!lote) return;
    const total = lote.filas.length;
    const resumen: Resumen = { ...resumenPrevio, renombrados: [...resumenPrevio.renombrados], omitidos: [...resumenPrevio.omitidos] };
    setPaso({ tipo: 'guardando', hechas: desde, total, resumen });
    const supabase = clienteNavegador();
    for (let i = desde; i < total; i += TANDA_IMPORTAR) {
      const tanda = lote.filas.slice(i, i + TANDA_IMPORTAR);
      try {
        const { data, error } = await supabase.rpc('importar_productos', {
          p_empresa: empresaId,
          p_filas: tanda.map(filaParaGuardar),
          p_opciones: lote.opciones,
        });
        if (error) throw error;
        const d = data as Resumen;
        resumen.creados += d.creados;
        resumen.actualizados += d.actualizados;
        resumen.reactivados += d.reactivados;
        resumen.sin_cambios += d.sin_cambios;
        resumen.renombrados.push(...(d.renombrados ?? []));
        resumen.omitidos.push(...(d.omitidos ?? []));
      } catch (e) {
        if (i > 0) onGuardado();
        setPaso({ tipo: 'cortado', hechas: i, total, resumen, mensaje: mensajeDeError(e) });
        return;
      }
      setPaso({ tipo: 'guardando', hechas: Math.min(i + tanda.length, total), total, resumen: { ...resumen } });
    }
    onGuardado();
    setPaso({ tipo: 'listo', total, resumen });
  }

  function empezar() {
    if (!filasAGuardar.length) return;
    aGuardar.current = { filas: filasAGuardar, opciones: { tipo, stock: modoStock } };
    void guardar(0, RESUMEN_VACIO);
  }

  const n = (x: number) => numero(x);
  const enRevision = paso.tipo === 'revision' && !!resultado;

  // En la revisión, «Guardar 5.000 productos» es lo importante: va más ancho,
  // y en una sola línea (mitad y mitad, en un celular se partía en dos).
  const pie = enRevision ? (
    <div className="flex gap-2.5">
      <button type="button" className="boton-suave min-h-[48px] shrink-0 px-4" onClick={otroArchivo}>{r.otroArchivo}</button>
      <button type="button" className="boton-principal min-h-[48px] min-w-0 flex-1 px-4" disabled={!filasAGuardar.length || cotejo.estado === 'cargando'} onClick={empezar}>
        {r.guardar(filasAGuardar.length, n(filasAGuardar.length))}
      </button>
    </div>
  ) : paso.tipo === 'guardando' ? (
    // Mientras guarda no hay nada que tocar: el avance está arriba, una sola vez.
    null
  ) : paso.tipo === 'cortado' ? (
    <PieHoja columnas={2}>
      <button type="button" className="boton-suave min-h-[48px]" onClick={onCerrar}>{r.cerrar}</button>
      <button type="button" className="boton-principal min-h-[48px]" onClick={() => void guardar(paso.hechas, paso.resumen)}>{r.seguir}</button>
    </PieHoja>
  ) : paso.tipo === 'listo' ? (
    <PieHoja columnas={2}>
      <button type="button" className="boton-suave min-h-[48px]" onClick={onCerrar}>{r.cerrar}</button>
      <Link href="/vender" className="boton-principal inline-flex min-h-[48px] items-center justify-center">{irA}</Link>
    </PieHoja>
  ) : null;

  return (
    <Hoja
      titulo={r.titulo} onCerrar={onCerrar} bloqueada={leyendo || guardando}
      tamano={paso.tipo === 'elegir' ? 'medio' : 'grande'}
      pie={pie}
    >
      {paso.tipo === 'elegir' && (
        <ElegirPlanilla
          empresaId={empresaId} ruta={RUTA} topes={TOPES_CATALOGO} leerRespuesta={compactoALibro}
          errores={t.planilla.errores} onLibro={usarLibro} onLeyendo={setLeyendo}
          explicacion={(
            <>
              <p>{tipo === 'servicios' ? r.explicacionServicios : r.explicacion}</p>
              <p className="mt-1.5 text-[12.5px] text-tinta/50">{r.ayudaColumnas}</p>
            </>
          )}
        />
      )}

      {enRevision && resultado && (
        <RevisionCatalogo
          resultado={resultado} cotejo={cotejo} moneda={moneda} servicios={tipo === 'servicios'}
          onMapeo={(firma, campo, columna) => setMapeo((m) => ({ ...m, [firma]: { ...m[firma], [campo]: columna } }))}
          onHoja={(nombre, usar) => setHojas((h) => ({ ...h, [nombre]: usar }))}
          incluirOcultas={incluirOcultas} onOcultas={setIncluirOcultas}
          modoStock={modoStock} onModoStock={setModoStock}
        />
      )}

      {(paso.tipo === 'guardando' || paso.tipo === 'cortado') && (
        <div className="space-y-3 pb-1 pt-2">
          {paso.tipo === 'guardando' && <p className="text-[15px] font-bold">{r.guardandoTitulo}</p>}
          <div className="flex items-baseline justify-between gap-3">
            <p role={paso.tipo === 'guardando' ? 'status' : undefined} className="text-[22px] font-titulo font-extrabold tabular-nums tracking-tight">
              {r.deTotal(n(paso.hechas), n(paso.total))}
            </p>
            <p className="text-[14px] font-semibold tabular-nums text-tinta/55">{paso.total ? Math.floor((paso.hechas / paso.total) * 100) : 0} %</p>
          </div>
          <div
            role="progressbar" aria-valuemin={0} aria-valuemax={paso.total} aria-valuenow={paso.hechas}
            aria-label={r.guardando(n(paso.hechas), n(paso.total))}
            className="h-2.5 overflow-hidden rounded-full bg-arena"
          >
            <div className={`h-full rounded-full transition-[width] duration-300 ${paso.tipo === 'cortado' ? 'bg-ambar' : 'bg-verde'}`} style={{ width: `${paso.total ? (paso.hechas / paso.total) * 100 : 0}%` }} />
          </div>
          {paso.tipo === 'guardando' ? (
            <p className="text-[12.5px] text-tinta/55">{r.noCerrar}</p>
          ) : (
            <div role="alert" className="rounded-xl bg-rojo-claro px-3.5 py-3">
              <p className="text-[14px] font-bold text-rojo">{r.seCorto(n(paso.hechas), n(paso.total - paso.hechas))}</p>
              <p className="mt-0.5 text-[13px] font-medium leading-snug text-rojo">{paso.mensaje}</p>
              <p className="mt-1.5 text-[12.5px] leading-snug text-tinta/70">{r.siSeCorta}</p>
            </div>
          )}
        </div>
      )}

      {paso.tipo === 'listo' && <Listo resumen={paso.resumen} />}
    </Hoja>
  );
}

/** Lo que pasó, al terminar. */
function Listo({ resumen }: { resumen: Resumen }) {
  const t = useTextos();
  const r = t.productos.planilla;
  const n = (x: number) => numero(x);
  return (
    <div className="space-y-3 pt-2">
      <div className="rounded-xl bg-verde-claro px-4 py-3">
        <p className="text-[15px] font-bold text-verde-fuerte">✓ {r.listo}</p>
        <p className="mt-0.5 text-[13.5px] font-semibold text-tinta/80">{r.resumen(resumen, n)}</p>
        <p className="mt-1 text-[12.5px] text-tinta/60">{r.yaEstan}</p>
      </div>
      {resumen.reactivados > 0 && <p className="text-[12.5px] text-tinta/60">{r.reactivados(resumen.reactivados, n(resumen.reactivados))}</p>}
      {resumen.renombrados.length > 0 && (
        <details className="rounded-xl bg-arena px-3 py-2.5">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-tinta/75">{r.renombrados(resumen.renombrados.length, n(resumen.renombrados.length))}</summary>
          <ul className="mt-1.5 space-y-0.5">
            {resumen.renombrados.slice(0, 50).map((x, i) => (
              <li key={i} className="text-[12.5px] text-tinta/70">{r.problemas.fila(x.fila, '')} · <span className="font-semibold">{x.nombre}</span></li>
            ))}
          </ul>
        </details>
      )}
      {resumen.omitidos.length > 0 && (
        <details className="rounded-xl bg-ambar-claro px-3 py-2.5">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-tinta/80">{r.noSeCargaron(resumen.omitidos.length, n(resumen.omitidos.length))}</summary>
          <ul className="mt-1.5 space-y-0.5">
            {resumen.omitidos.slice(0, 50).map((x, i) => (
              <li key={i} className="text-[12.5px] text-tinta/75">
                {r.problemas.fila(x.fila, '')} · <span className="font-semibold">{x.nombre}</span> — {r.motivos[x.motivo] ?? x.motivo}
              </li>
            ))}
            {resumen.omitidos.length > 50 && <li className="text-[12px] text-tinta/50">{r.problemas.yMas(n(resumen.omitidos.length - 50))}</li>}
          </ul>
        </details>
      )}
    </div>
  );
}
