'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero, fechaLegible } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';
import { useTextos, useLocale } from '@/i18n/cliente';
import { Seccion, Vacio } from '@/components/Piezas';
import type {
  ResumenPersonal, IngresoFijo, GastoFijo, Ahorro, CategoriaDeCuenta,
} from '@/lib/tipos';

/**
 * PRESUPUESTO Y AHORRO · la pantalla de la cuenta personal
 *
 * Un solo número manda: cuánto queda disponible y para cuántos días. Todo lo
 * demás explica de dónde sale ese número o lo cambia.
 *
 * DÓNDE SE MANEJAN LOS INGRESOS
 *
 * Adentro de la tarjeta del número, colgando del renglón «Ingresos del
 * período». Antes eran una sección aparte más abajo, y estaba mal: el lugar
 * donde MIRÁS un número tiene que ser el lugar donde lo TOCÁS. Si abrís la
 * pantalla y ves que entraron 3.500.000, el impulso es tocar ahí para ver de
 * qué se compone — no bajar hasta otra tarjeta que repite el tema.
 *
 * Y ahí conviven dos cosas que se parecen pero no son iguales, así que la
 * pantalla las separa:
 *
 *   · INGRESO FIJO es una definición: «cobro 1.850.000 el 30». No carga
 *     plata; le dice a Orden cuándo empieza tu período.
 *   · INGRESO RECIBIDO es plata que entró de verdad: una bonificación, una
 *     comisión, horas extra.
 *
 * Si se mezclaran, el sistema mostraría plata que todavía no cobraste — la
 * única mentira que un sistema de plata no se puede permitir.
 */
export function PantallaOrganizacion({
  empresaId, moneda, resumen, categorias,
}: {
  empresaId: string;
  moneda: string;
  resumen: ResumenPersonal;
  categorias: CategoriaDeCuenta[];
}) {
  const t = useTextos();
  const locale = useLocale();
  const router = useRouter();
  const [trabajando, setTrabajando] = useState('');
  const [error, setError] = useState('');

  const plata = (n: number) => dinero(n, moneda, true, locale);
  const enRojo = resumen.disponible < 0;

  async function correr(marca: string, fn: () => Promise<{ error: unknown } | void>) {
    setTrabajando(marca);
    setError('');
    try {
      const r = await fn();
      const fallo = r && typeof r === 'object' && 'error' in r ? r.error : null;
      if (fallo) throw fallo;
      router.refresh();
    } catch (e: unknown) {
      const mensaje = e && typeof e === 'object' && 'message' in e
        ? String((e as { message: unknown }).message)
        : t.comun.error;
      setError(mensaje);
    } finally {
      setTrabajando('');
    }
  }

  const sb = () => clienteNavegador();
  const ocupado = trabajando !== '';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* ---------- el número, y todo lo que lo explica ---------- */}
      <section className="tarjeta p-5">
        {resumen.cobro_pendiente ? (
          <>
            <p className="titulo-seccion text-ambar">{t.organizacion.cobroPendiente}</p>
            <p className="mt-2 text-[15px] leading-relaxed text-tinta/65">
              {t.organizacion.cobroPendienteDetalle}
            </p>
          </>
        ) : (
          <>
            <p className="titulo-seccion">{t.organizacion.teQuedan}</p>
            <p className={`mt-1 text-[38px] font-bold leading-none tracking-tight ${
              enRojo ? 'text-rojo' : 'text-verde-fuerte'
            }`}>
              {plata(resumen.disponible)}
            </p>
            <p className="mt-2 text-[14.5px] leading-relaxed text-tinta/60">
              {t.organizacion.paraDias(resumen.dias_restantes)}
              {', '}
              {resumen.ingresos_fijos.length > 0
                ? t.organizacion.hastaEl(fechaLegible(resumen.hasta, false, locale))
                : t.organizacion.hastaFinDeMes(fechaLegible(resumen.hasta, false, locale))}
              .
            </p>
            {enRojo ? (
              <p className="mt-3 rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium text-rojo">
                {t.organizacion.enRojo}
              </p>
            ) : (
              <p className="mt-3 inline-block rounded-lg bg-arena px-2.5 py-1 text-[13px] font-semibold text-tinta/70">
                {t.organizacion.porDia(plata(resumen.por_dia))}
              </p>
            )}
          </>
        )}

        {/* De dónde sale. Sin esto el número grande es un oráculo, y a un
            número sobre tu plata que no podés verificar no le creés. */}
        <div className="mt-5 divide-y divide-borde border-t border-borde pt-1">
          <Ingresos
            total={resumen.entro}
            fijos={resumen.ingresos_fijos}
            categorias={categorias}
            moneda={moneda}
            ocupado={ocupado}
            alGuardarFijo={(d) => correr('entrada', async () => sb().rpc('guardar_ingreso_fijo', {
              p_empresa: empresaId,
              p_nombre: d.nombre,
              p_importe: d.importe,
              p_dia: d.dia,
              p_principal: d.principal,
              p_id: d.id ?? null,
            }))}
            alQuitarFijo={(id) => correr('entrada', async () => sb().rpc('borrar_ingreso_fijo', {
              p_empresa: empresaId,
              p_id: id,
            }))}
            alRegistrar={(d) => correr('ingreso', async () => sb().from('movimientos').insert({
              empresa_id: empresaId,
              tipo: 'ingreso',
              fecha: d.fecha,
              descripcion: d.concepto,
              categoria: d.categoria,
              // Un ingreso no lleva descuento: subtotal y monto son lo mismo.
              subtotal: d.monto,
              descuento: 0,
              monto: d.monto,
              costo_total: 0,
              metodo_pago: 'otro',
              contraparte: '',
              notas: '',
              origen: 'manual',
            }))}
          />

          <Renglon etiqueta={t.organizacion.salio} valor={`− ${plata(resumen.salio)}`} tono="text-rojo" />
          {resumen.fijos_por_pagar > 0 && (
            <Renglon
              etiqueta={t.organizacion.fijosPorPagar}
              valor={`− ${plata(resumen.fijos_por_pagar)}`}
              tono="text-rojo"
            />
          )}
          {resumen.cuotas_por_vencer > 0 && (
            <Renglon
              etiqueta={t.organizacion.cuotasPorVencer}
              valor={`− ${plata(resumen.cuotas_por_vencer)}`}
              tono="text-rojo"
            />
          )}
          {resumen.ahorrado_en_el_ciclo !== 0 && (
            <Renglon
              etiqueta={t.organizacion.ahorradoEsteCiclo}
              valor={resumen.ahorrado_en_el_ciclo > 0
                ? `− ${plata(resumen.ahorrado_en_el_ciclo)}`
                : `+ ${plata(Math.abs(resumen.ahorrado_en_el_ciclo))}`}
            />
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
          {error}
        </p>
      )}

      {/* ---------- gastos fijos ---------- */}
      <Salidas
        salidas={resumen.gastos_fijos}
        totalMes={resumen.fijo_mensual}
        porPagar={resumen.fijos_por_pagar}
        categorias={categorias}
        moneda={moneda}
        ocupado={ocupado}
        alGuardar={(datos) => correr('salida', async () => sb().rpc('guardar_gasto_fijo', {
          p_empresa: empresaId,
          p_nombre: datos.nombre,
          p_importe: datos.importe,
          p_categoria: datos.categoria,
          p_dia: datos.dia,
          p_notas: datos.notas,
          p_id: datos.id ?? null,
        }))}
        alQuitar={(id) => correr('salida', async () => sb().rpc('borrar_gasto_fijo', {
          p_empresa: empresaId,
          p_id: id,
        }))}
        alCrearCategoria={(nombre, pistas) => correr('categoria', async () =>
          sb().rpc('guardar_categoria_propia', {
            p_empresa: empresaId,
            p_nombre: nombre,
            p_clase: 'gasto',
            p_pistas: pistas,
          }))}
      />

      {/* ---------- ahorro ---------- */}
      <Ahorros
        fondos={resumen.ahorros}
        delCiclo={resumen.ahorrado_en_el_ciclo}
        moneda={moneda}
        ocupado={ocupado}
        alGuardarFondo={(d) => correr('ahorro', async () => sb().rpc('guardar_ahorro', {
          p_empresa: empresaId,
          p_nombre: d.nombre,
          p_meta: d.meta,
          p_fecha_limite: d.fecha_limite,
          p_id: d.id ?? null,
        }))}
        alMover={(id, tipo, monto) => correr('ahorro', async () => sb().rpc('mover_ahorro', {
          p_empresa: empresaId,
          p_ahorro: id,
          p_tipo: tipo,
          p_monto: monto,
        }))}
        alQuitarFondo={(id) => correr('ahorro', async () => sb().rpc('borrar_ahorro', {
          p_empresa: empresaId,
          p_id: id,
        }))}
      />
    </div>
  );
}

function Renglon({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[13.5px] text-tinta/60">{etiqueta}</span>
      <span className={`text-[14px] font-semibold tabular-nums ${tono ?? ''}`}>{valor}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// INGRESOS · el renglón que se abre
// ════════════════════════════════════════════════════════════

type DatosFijo = { id?: string; nombre: string; importe: number; dia: number; principal: boolean };
type DatosIngreso = { concepto: string; monto: number; fecha: string; categoria: string };

function Ingresos({
  total, fijos, categorias, moneda, ocupado, alGuardarFijo, alQuitarFijo, alRegistrar,
}: {
  total: number;
  fijos: IngresoFijo[];
  categorias: CategoriaDeCuenta[];
  moneda: string;
  ocupado: boolean;
  alGuardarFijo: (d: DatosFijo) => void;
  alQuitarFijo: (id: string) => void;
  alRegistrar: (d: DatosIngreso) => void;
}) {
  const t = useTextos();
  const locale = useLocale();
  // Arranca abierto solo si no hay nada cargado: ahí sí hay que hacer algo.
  const [abierto, setAbierto] = useState(fijos.length === 0);
  const [editando, setEditando] = useState<IngresoFijo | null>(null);
  const [creandoFijo, setCreandoFijo] = useState(false);
  const [registrando, setRegistrando] = useState(false);

  const plata = (n: number) => dinero(n, moneda, true, locale);
  const cerrarFormularios = () => {
    setEditando(null);
    setCreandoFijo(false);
    setRegistrando(false);
  };

  return (
    <div className="py-2.5">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
      >
        <span className="flex items-center gap-1.5 text-[13.5px] text-tinta/60">
          {t.organizacion.entro}
          <svg
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 transition-transform ${abierto ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
        <span className="text-[14px] font-semibold tabular-nums text-verde-fuerte">{plata(total)}</span>
      </button>

      {abierto && (
        <div className="mt-3 rounded-xl bg-arena/60 p-3.5">
          <p className="titulo-seccion">{t.organizacion.loQueCobras}</p>

          {fijos.length === 0 ? (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-tinta/55">
              {t.organizacion.sinEntradasDetalle}
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-borde">
              {fijos.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => { cerrarFormularios(); setEditando(f); }}
                    disabled={ocupado}
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold">{f.nombre}</span>
                      {f.principal && (
                        <span className="pastilla shrink-0 bg-verde text-white">
                          {t.organizacion.marcaMiCiclo}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-tinta/50">
                      {t.organizacion.entraElDia(f.dia_del_mes)}
                    </span>
                  </button>
                  <span className="shrink-0 text-[14px] font-bold tabular-nums text-verde-fuerte">
                    {plata(f.importe)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Hay trabajos que pagan dos veces al mes: el sueldo a fin de mes y
              una comisión a los quince días. Van como dos ingresos fijos
              distintos, cada uno con su día, y uno marca el período. */}
          {fijos.length > 0 && (
            <p className="mt-2 text-[12px] leading-snug text-tinta/45">
              {t.organizacion.dosPagos}
            </p>
          )}

          {editando ? (
            <FormularioFijo
              fijo={editando}
              moneda={moneda}
              ocupado={ocupado}
              alCerrar={() => setEditando(null)}
              alGuardar={(d) => { alGuardarFijo(d); setEditando(null); }}
              alQuitar={() => {
                if (confirm(t.organizacion.confirmarQuitarEntrada(editando.nombre))) {
                  alQuitarFijo(editando.id);
                  setEditando(null);
                }
              }}
            />
          ) : creandoFijo ? (
            <FormularioFijo
              fijo={null}
              moneda={moneda}
              ocupado={ocupado}
              alCerrar={() => setCreandoFijo(false)}
              alGuardar={(d) => { alGuardarFijo(d); setCreandoFijo(false); }}
            />
          ) : registrando ? (
            <FormularioIngreso
              categorias={categorias}
              moneda={moneda}
              ocupado={ocupado}
              alCerrar={() => setRegistrando(false)}
              alRegistrar={(d) => { alRegistrar(d); setRegistrando(false); }}
            />
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button" className="boton-suave px-3 py-1.5 text-[13px]"
                onClick={() => { cerrarFormularios(); setCreandoFijo(true); }} disabled={ocupado}
              >
                {fijos.length === 0 ? t.organizacion.agregarEntrada : t.organizacion.agregarOtroIngreso}
              </button>
              <button
                type="button" className="boton-suave px-3 py-1.5 text-[13px]"
                onClick={() => { cerrarFormularios(); setRegistrando(true); }} disabled={ocupado}
              >
                {t.organizacion.registrarIngreso}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FormularioFijo({
  fijo, moneda, ocupado, alCerrar, alGuardar, alQuitar,
}: {
  fijo: IngresoFijo | null;
  moneda: string;
  ocupado: boolean;
  alCerrar: () => void;
  alGuardar: (d: DatosFijo) => void;
  alQuitar?: () => void;
}) {
  const t = useTextos();
  const [nombre, setNombre] = useState(fijo?.nombre ?? '');
  const [importe, setImporte] = useState(fijo ? String(fijo.importe) : '');
  const [dia, setDia] = useState(String(fijo?.dia_del_mes ?? 30));
  const [principal, setPrincipal] = useState(fijo?.principal ?? true);

  const valido = nombre.trim() !== '' && Number(importe.replace(',', '.')) > 0;

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-borde bg-white p-3">
      <div>
        <label className="etiqueta" htmlFor="fijo-nombre">{t.organizacion.queEs}</label>
        <input
          id="fijo-nombre" className="campo" maxLength={60} autoFocus
          placeholder={t.organizacion.queEsEjemplo}
          value={nombre} onChange={(e) => setNombre(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="etiqueta" htmlFor="fijo-importe">
            {t.organizacion.cuanto} <span className="font-normal text-tinta/40">· {moneda}</span>
          </label>
          <input
            id="fijo-importe" className="campo" inputMode="decimal"
            value={importe} onChange={(e) => setImporte(e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor="fijo-dia">{t.organizacion.queDiaEntra}</label>
          <select id="fijo-dia" className="campo" value={dia} onChange={(e) => setDia(e.target.value)}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-start gap-2.5 rounded-xl border border-borde p-3">
        <input
          type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-verde"
          checked={principal} onChange={(e) => setPrincipal(e.target.checked)}
        />
        <span>
          <span className="block text-[14px] font-semibold">{t.organizacion.marcaMiCiclo}</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-tinta/55">
            {t.organizacion.marcaMiCicloDetalle}
          </span>
        </span>
      </label>

      <div className="flex gap-2">
        <button type="button" className="boton-suave flex-1 py-2 text-[13px]" onClick={alCerrar} disabled={ocupado}>
          {t.comun.cancelar}
        </button>
        <button
          type="button" className="boton-principal flex-1 py-2 text-[13px]"
          disabled={ocupado || !valido}
          onClick={() => alGuardar({
            id: fijo?.id,
            nombre: nombre.trim(),
            importe: Number(importe.replace(',', '.')),
            dia: Number(dia),
            principal,
          })}
        >
          {ocupado ? t.comun.guardando : t.comun.guardar}
        </button>
      </div>

      {alQuitar && (
        <button
          type="button"
          className="w-full text-center text-[12.5px] font-semibold text-rojo hover:underline"
          onClick={alQuitar} disabled={ocupado}
        >
          {t.organizacion.quitarEntrada}
        </button>
      )}
    </div>
  );
}

/**
 * Plata que entró de verdad: una bonificación, una comisión, horas extra.
 *
 * A diferencia del ingreso fijo, esto SÍ crea un movimiento. Los dos viven en
 * el mismo lugar porque para quien mira son «lo que entra», pero el sistema
 * no los puede confundir nunca: uno es una expectativa y el otro es plata.
 */
function FormularioIngreso({
  categorias, moneda, ocupado, alCerrar, alRegistrar,
}: {
  categorias: CategoriaDeCuenta[];
  moneda: string;
  ocupado: boolean;
  alCerrar: () => void;
  alRegistrar: (d: DatosIngreso) => void;
}) {
  const t = useTextos();
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  // El mismo día que mira la base para decidir si acepta la fila. Un ingreso
  // futuro no es un ingreso: es plata que todavía no está, y mostrarla sería
  // la única mentira que Orden no se puede permitir. La base ya lo rechaza;
  // acá se frena antes, para que la persona lea el motivo y no un error crudo.
  const hoy = hoyISO();
  const [fecha, setFecha] = useState(hoy);
  const [categoria, setCategoria] = useState(categorias[0]?.nombre ?? 'Otros ingresos');

  const enElFuturo = fecha > hoy;
  const valido = concepto.trim() !== ''
    && Number(monto.replace(',', '.')) > 0
    && fecha !== ''
    && !enElFuturo;

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-verde/30 bg-white p-3">
      <p className="text-[12.5px] leading-relaxed text-tinta/60">
        {t.organizacion.registrarIngresoDetalle}
      </p>

      <div>
        <label className="etiqueta" htmlFor="ing-concepto">{t.organizacion.conceptoIngreso}</label>
        <input
          id="ing-concepto" className="campo" maxLength={80} autoFocus
          placeholder={t.organizacion.conceptoIngresoEjemplo}
          value={concepto} onChange={(e) => setConcepto(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="etiqueta" htmlFor="ing-monto">
            {t.organizacion.cuanto} <span className="font-normal text-tinta/40">· {moneda}</span>
          </label>
          <input
            id="ing-monto" className="campo" inputMode="decimal"
            value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor="ing-fecha">{t.organizacion.fechaIngreso}</label>
          <input
            id="ing-fecha" type="date" className="campo"
            min="2000-01-01" max={hoy}
            value={fecha} onChange={(e) => setFecha(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="etiqueta" htmlFor="ing-categoria">{t.captura.campoCategoria}</label>
        <select
          id="ing-categoria" className="campo" value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        >
          {categorias.map((c) => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
        </select>
      </div>

      {enElFuturo && (
        <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2 text-[12.5px] font-medium leading-snug text-rojo">
          {t.organizacion.fechaFutura}
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" className="boton-suave flex-1 py-2 text-[13px]" onClick={alCerrar} disabled={ocupado}>
          {t.comun.cancelar}
        </button>
        <button
          type="button" className="boton-principal flex-1 py-2 text-[13px]"
          disabled={ocupado || !valido}
          onClick={() => alRegistrar({
            concepto: concepto.trim(),
            monto: Number(monto.replace(',', '.')),
            fecha,
            categoria,
          })}
        >
          {ocupado ? t.comun.guardando : t.organizacion.registrar}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// GASTOS FIJOS
//
// Lo que se paga sí o sí. Orden los descuenta del disponible desde el inicio
// del período y deja de descontarlos cuando se registra el pago, comparando
// por categoría contra lo ya gastado. Así nunca cuenta dos veces.
// ════════════════════════════════════════════════════════════

type DatosSalida = {
  id?: string; nombre: string; importe: number; categoria: string;
  dia: number | null; notas: string;
};

function Salidas({
  salidas, totalMes, porPagar, categorias, moneda, ocupado,
  alGuardar, alQuitar, alCrearCategoria,
}: {
  salidas: GastoFijo[];
  totalMes: number;
  porPagar: number;
  categorias: CategoriaDeCuenta[];
  moneda: string;
  ocupado: boolean;
  alGuardar: (d: DatosSalida) => void;
  alQuitar: (id: string) => void;
  alCrearCategoria: (nombre: string, pistas: string) => void;
}) {
  const t = useTextos();
  const locale = useLocale();
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<GastoFijo | null>(null);

  const plata = (n: number) => dinero(n, moneda, true, locale);

  function abrir(salida: GastoFijo | null) {
    setEditando(salida);
    setAbierto(true);
  }

  return (
    <Seccion
      titulo={t.organizacion.salidas}
      accion={
        salidas.length > 0 ? (
          <button type="button" className="boton-texto" onClick={() => abrir(null)} disabled={ocupado}>
            {t.organizacion.agregarSalida}
          </button>
        ) : undefined
      }
    >
      {salidas.length === 0 ? (
        <div className="px-4 pb-4">
          <Vacio titulo={t.organizacion.sinSalidas} detalle={t.organizacion.sinSalidasDetalle} />
          <button type="button" className="boton-suave w-full py-2.5" onClick={() => abrir(null)} disabled={ocupado}>
            {t.organizacion.agregarSalida}
          </button>
        </div>
      ) : (
        <>
          <p className="px-4 pb-2 text-[12.5px] leading-relaxed text-tinta/50">
            {t.organizacion.salidasDetalle}
          </p>
          <ul className="divide-y divide-borde border-t border-borde">
            {salidas.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-arena/50"
                  onClick={() => abrir(g)}
                  disabled={ocupado}
                >
                  <span className="min-w-0 flex-1">
                    <span className="truncate text-[14.5px] font-semibold">{g.nombre}</span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-tinta/50">
                      {g.categoria}
                      {' · '}
                      {g.dia_del_mes ? t.organizacion.venceElDia(g.dia_del_mes) : t.organizacion.todoElMes}
                      {g.notas ? ` · ${g.notas}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-[14.5px] font-bold tabular-nums">
                    {plata(g.importe)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-borde px-4 py-3">
            <span className="text-[13px] font-semibold text-tinta/60">
              {t.organizacion.totalPorMes(plata(totalMes))}
            </span>
            <span className={`text-[13px] font-semibold ${porPagar > 0 ? 'text-rojo' : 'text-verde-fuerte'}`}>
              {porPagar > 0 ? t.organizacion.faltaPagarFijo(plata(porPagar)) : t.organizacion.yaPagado}
            </span>
          </div>
        </>
      )}

      {abierto && (
        <FormularioSalida
          salida={editando}
          categorias={categorias}
          moneda={moneda}
          ocupado={ocupado}
          alCerrar={() => setAbierto(false)}
          alGuardar={(d) => { alGuardar(d); setAbierto(false); }}
          alCrearCategoria={alCrearCategoria}
          alQuitar={editando ? () => {
            if (confirm(t.organizacion.confirmarQuitarSalida(editando.nombre))) {
              alQuitar(editando.id);
              setAbierto(false);
            }
          } : undefined}
        />
      )}
    </Seccion>
  );
}

function FormularioSalida({
  salida, categorias, moneda, ocupado, alCerrar, alGuardar, alQuitar, alCrearCategoria,
}: {
  salida: GastoFijo | null;
  categorias: CategoriaDeCuenta[];
  moneda: string;
  ocupado: boolean;
  alCerrar: () => void;
  alGuardar: (d: DatosSalida) => void;
  alQuitar?: () => void;
  alCrearCategoria: (nombre: string, pistas: string) => void;
}) {
  const t = useTextos();
  const [nombre, setNombre] = useState(salida?.nombre ?? '');
  const [importe, setImporte] = useState(salida ? String(salida.importe) : '');
  const [categoria, setCategoria] = useState(salida?.categoria ?? categorias[0]?.nombre ?? 'Otros');
  const [dia, setDia] = useState(salida?.dia_del_mes ? String(salida.dia_del_mes) : '');
  const [notas, setNotas] = useState(salida?.notas ?? '');

  /**
   * Crear una categoría propia, desde acá mismo.
   *
   * Cada persona entiende su plata a su manera. Alguien con un perro necesita
   * «Mascotas»; sin ella todo eso cae en «Otros». Y lo importante no es el
   * campo de texto: es que las pistas van al prompt, así que la IA también la
   * aprende y la usa sola al interpretar lo que dictes.
   */
  const [creandoCat, setCreandoCat] = useState(false);
  const [catNombre, setCatNombre] = useState('');
  const [catPistas, setCatPistas] = useState('');

  const valido = nombre.trim() !== '' && Number(importe.replace(',', '.')) > 0;

  return (
    <div className="border-t border-borde bg-arena/50 px-4 py-4">
      <div className="space-y-3">
        <div>
          <label className="etiqueta" htmlFor="salida-nombre">{t.organizacion.queGasto}</label>
          <input
            id="salida-nombre" className="campo" maxLength={60} autoFocus
            placeholder={t.organizacion.queGastoEjemplo}
            value={nombre} onChange={(e) => setNombre(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="etiqueta" htmlFor="salida-importe">
              {t.organizacion.cuanto} <span className="font-normal text-tinta/40">· {moneda}</span>
            </label>
            <input
              id="salida-importe" className="campo" inputMode="decimal"
              value={importe} onChange={(e) => setImporte(e.target.value.replace(/[^\d.,]/g, ''))}
            />
          </div>
          <div>
            <label className="etiqueta" htmlFor="salida-dia">{t.organizacion.queDiaEntra}</label>
            <select id="salida-dia" className="campo" value={dia} onChange={(e) => setDia(e.target.value)}>
              <option value="">{t.organizacion.sinDiaFijo}</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
        {dia === '' && (
          <p className="-mt-1 text-[12px] leading-snug text-tinta/45">{t.organizacion.sinDiaFijoDetalle}</p>
        )}

        {/* La categoría no es decoración: es lo que le permite a Orden saber
            si este gasto ya se pagó, comparándolo contra lo gastado en esta
            misma categoría durante el período. */}
        <div>
          <label className="etiqueta" htmlFor="salida-categoria">{t.captura.campoCategoria}</label>
          <select
            id="salida-categoria" className="campo" value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            {categorias.map((c) => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
          </select>

          {!creandoCat ? (
            <button
              type="button" className="boton-texto mt-2 text-[13px]"
              onClick={() => setCreandoCat(true)} disabled={ocupado}
            >
              {t.organizacion.categoriaPropia}
            </button>
          ) : (
            <div className="mt-3 rounded-xl border border-borde bg-white p-3">
              <p className="text-[12.5px] leading-relaxed text-tinta/55">
                {t.organizacion.categoriaPropiaDetalle}
              </p>
              <div className="mt-3">
                <label className="etiqueta" htmlFor="cat-nombre">{t.organizacion.nombreCategoria}</label>
                <input
                  id="cat-nombre" className="campo" maxLength={40}
                  placeholder={t.organizacion.nombreCategoriaEjemplo}
                  value={catNombre} onChange={(e) => setCatNombre(e.target.value)}
                />
              </div>
              <div className="mt-3">
                <label className="etiqueta" htmlFor="cat-pistas">{t.organizacion.pistasCategoria}</label>
                <input
                  id="cat-pistas" className="campo" maxLength={200}
                  placeholder={t.organizacion.pistasCategoriaEjemplo}
                  value={catPistas} onChange={(e) => setCatPistas(e.target.value)}
                />
                <p className="mt-1.5 text-[12px] leading-snug text-tinta/45">
                  {t.organizacion.pistasCategoriaDetalle}
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button" className="boton-suave flex-1 py-2 text-[13px]"
                  onClick={() => { setCreandoCat(false); setCatNombre(''); setCatPistas(''); }}
                  disabled={ocupado}
                >
                  {t.comun.cancelar}
                </button>
                <button
                  type="button" className="boton-principal flex-1 py-2 text-[13px]"
                  disabled={ocupado || catNombre.trim() === ''}
                  onClick={() => {
                    alCrearCategoria(catNombre.trim(), catPistas.trim());
                    setCategoria(catNombre.trim());
                    setCreandoCat(false);
                    setCatNombre('');
                    setCatPistas('');
                  }}
                >
                  {t.organizacion.crearCategoria}
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="etiqueta" htmlFor="salida-notas">
            {t.organizacion.detalleGasto}{' '}
            <span className="font-normal text-tinta/40">· {t.registro.opcional}</span>
          </label>
          <textarea
            id="salida-notas" className="campo min-h-[64px]" maxLength={500}
            placeholder={t.organizacion.detalleGastoEjemplo}
            value={notas} onChange={(e) => setNotas(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <button type="button" className="boton-suave flex-1 py-2.5" onClick={alCerrar} disabled={ocupado}>
            {t.comun.cancelar}
          </button>
          <button
            type="button" className="boton-principal flex-1 py-2.5"
            disabled={ocupado || !valido}
            onClick={() => alGuardar({
              id: salida?.id,
              nombre: nombre.trim(),
              importe: Number(importe.replace(',', '.')),
              categoria,
              dia: dia === '' ? null : Number(dia),
              notas: notas.trim(),
            })}
          >
            {ocupado ? t.comun.guardando : t.comun.guardar}
          </button>
        </div>

        {alQuitar && (
          <button
            type="button"
            className="w-full py-1 text-center text-[13px] font-semibold text-rojo hover:underline"
            onClick={alQuitar} disabled={ocupado}
          >
            {t.organizacion.quitarSalida}
          </button>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// AHORRO
//
// Guardar plata NO es gastarla: seguís teniéndola, y por eso un depósito no
// aparece como gasto en ningún reporte. Pero sí deja de estar disponible —no
// la podés gastar dos veces— así que baja el número de arriba. Retirar hace
// el camino inverso.
// ════════════════════════════════════════════════════════════

type DatosFondo = {
  id?: string;
  nombre: string;
  meta: number | null;
  fecha_limite: string | null;
};

function Ahorros({
  fondos, delCiclo, moneda, ocupado, alGuardarFondo, alMover, alQuitarFondo,
}: {
  fondos: Ahorro[];
  delCiclo: number;
  moneda: string;
  ocupado: boolean;
  alGuardarFondo: (d: DatosFondo) => void;
  alMover: (id: string, tipo: 'aporte' | 'retiro', monto: number) => void;
  alQuitarFondo: (id: string) => void;
}) {
  const t = useTextos();
  const locale = useLocale();
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Ahorro | null>(null);
  const plata = (n: number) => dinero(n, moneda, true, locale);

  const cerrar = () => { setCreando(false); setEditando(null); };
  const abrirNuevo = () => { setEditando(null); setCreando(true); };

  return (
    <Seccion
      titulo={t.organizacion.ahorros}
      accion={
        fondos.length > 0 ? (
          <button type="button" className="boton-texto" onClick={abrirNuevo} disabled={ocupado}>
            {t.organizacion.agregarAhorro}
          </button>
        ) : undefined
      }
    >
      {fondos.length === 0 ? (
        <div className="px-4 pb-4">
          <Vacio titulo={t.organizacion.sinAhorros} detalle={t.organizacion.sinAhorrosDetalle} />
          {!creando && (
            <button
              type="button" className="boton-suave w-full py-2.5"
              onClick={abrirNuevo} disabled={ocupado}
            >
              {t.organizacion.agregarAhorro}
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="px-4 pb-2 text-[12.5px] leading-relaxed text-tinta/50">
            {t.organizacion.ahorrosDetalle}
          </p>
          <ul className="divide-y divide-borde border-t border-borde">
            {fondos.map((f) => (
              <Fondo
                key={f.id}
                fondo={f}
                moneda={moneda}
                ocupado={ocupado}
                alEditar={() => { setCreando(false); setEditando(f); }}
                alMover={(tipo, monto) => alMover(f.id, tipo, monto)}
                alQuitar={() => {
                  if (confirm(t.organizacion.confirmarQuitarFondo(f.nombre))) alQuitarFondo(f.id);
                }}
              />
            ))}
          </ul>
          {delCiclo !== 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-borde px-4 py-3">
              <span className="text-[13px] font-semibold text-tinta/60">
                {t.organizacion.ahorradoEsteCiclo}
              </span>
              <span className="text-[14px] font-bold tabular-nums">{plata(delCiclo)}</span>
            </div>
          )}
        </>
      )}

      {(creando || editando) && (
        <div className="border-t border-borde bg-arena/50 px-4 py-4">
          <FormularioFondo
            fondo={editando}
            ocupado={ocupado}
            alCerrar={cerrar}
            alGuardar={(d) => { alGuardarFondo(d); cerrar(); }}
          />
        </div>
      )}
    </Seccion>
  );
}

/**
 * El mismo formulario para crear y para editar.
 *
 * Editar no es un lujo: en cuanto un fondo tiene una fecha, un año mal
 * tipeado quedaría clavado para siempre. Un fondo con plata adentro no se
 * puede borrar —y está bien que no se pueda, ver la 026— así que sin esta
 * puerta la única salida sería vaciarlo.
 */
function FormularioFondo({
  fondo, ocupado, alCerrar, alGuardar,
}: {
  fondo: Ahorro | null;
  ocupado: boolean;
  alCerrar: () => void;
  alGuardar: (d: DatosFondo) => void;
}) {
  const t = useTextos();
  const [nombre, setNombre] = useState(fondo?.nombre ?? '');
  const [meta, setMeta] = useState(fondo?.meta ? String(fondo.meta) : '');
  const [fecha, setFecha] = useState(fondo?.fecha_limite ?? '');

  // La base rechaza una fecha ya vencida, salvo que sea la que el fondo ya
  // tenía guardada. El tope de abajo dice exactamente eso, para que el
  // calendario no ofrezca algo que después va a fallar.
  const hoy = hoyISO();
  const minimo = fondo?.fecha_limite && fondo.fecha_limite < hoy ? fondo.fecha_limite : hoy;

  return (
    <div className="space-y-3">
      <div>
        <label className="etiqueta" htmlFor="fondo-nombre">{t.organizacion.nombreDelFondo}</label>
        <input
          id="fondo-nombre" className="campo" maxLength={60} autoFocus
          placeholder={t.organizacion.nombreDelFondoEjemplo}
          value={nombre} onChange={(e) => setNombre(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="etiqueta" htmlFor="fondo-meta">
            {t.organizacion.metaOpcional}{' '}
            <span className="font-normal text-tinta/40">· {t.registro.opcional}</span>
          </label>
          <input
            id="fondo-meta" className="campo" inputMode="decimal"
            value={meta} onChange={(e) => setMeta(e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </div>
        <div>
          <label className="etiqueta" htmlFor="fondo-fecha">
            {t.organizacion.fechaLimite}{' '}
            <span className="font-normal text-tinta/40">· {t.registro.opcional}</span>
          </label>
          <input
            id="fondo-fecha" type="date" className="campo"
            min={minimo} max="2100-12-31"
            value={fecha} onChange={(e) => setFecha(e.target.value)}
          />
        </div>
      </div>

      <p className="text-[12px] leading-snug text-tinta/45">
        {t.organizacion.fechaLimiteDetalle}
      </p>

      <div className="flex gap-2">
        <button type="button" className="boton-suave flex-1 py-2.5" onClick={alCerrar} disabled={ocupado}>
          {t.comun.cancelar}
        </button>
        <button
          type="button" className="boton-principal flex-1 py-2.5"
          disabled={ocupado || nombre.trim() === ''}
          onClick={() => {
            const n = Number(meta.replace(',', '.'));
            alGuardar({
              id: fondo?.id,
              nombre: nombre.trim(),
              meta: n > 0 ? n : null,
              fecha_limite: fecha === '' ? null : fecha,
            });
          }}
        >
          {ocupado ? t.comun.guardando : t.comun.guardar}
        </button>
      </div>
    </div>
  );
}

function Fondo({
  fondo, moneda, ocupado, alEditar, alMover, alQuitar,
}: {
  fondo: Ahorro;
  moneda: string;
  ocupado: boolean;
  alEditar: () => void;
  alMover: (tipo: 'aporte' | 'retiro', monto: number) => void;
  alQuitar: () => void;
}) {
  const t = useTextos();
  const locale = useLocale();
  const [accion, setAccion] = useState<'aporte' | 'retiro' | null>(null);
  const [monto, setMonto] = useState('');
  const plata = (n: number) => dinero(n, moneda, true, locale);

  const avance = fondo.meta && fondo.meta > 0
    ? Math.min(100, (fondo.saldo / fondo.meta) * 100)
    : null;

  // Los tres estados de una fecha, que se cuentan distinto. `por_mes` en cero
  // es la meta ya juntada; en null con la fecha pasada es que no llegó.
  const vencida = fondo.dias_para_limite !== null && fondo.dias_para_limite < 0;
  const cumplida = fondo.por_mes === 0;
  const cuando = fondo.fecha_limite ? fechaLegible(fondo.fecha_limite, true, locale) : '';

  return (
    <li className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[14.5px] font-semibold">{fondo.nombre}</span>
        <span className="shrink-0 text-[15px] font-bold tabular-nums">{plata(fondo.saldo)}</span>
      </div>

      {avance !== null ? (
        <>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-arena">
            <div className="h-full rounded-full bg-verde transition-all" style={{ width: `${avance}%` }} />
          </div>
          <p className="mt-1.5 text-[12.5px] text-tinta/55">
            {t.organizacion.deLaMeta(plata(fondo.meta!), Math.round(avance))}
            {fondo.falta !== null && fondo.falta > 0 && ` · ${t.organizacion.faltan(plata(fondo.falta))}`}
          </p>
        </>
      ) : (
        <p className="mt-0.5 text-[12.5px] text-tinta/45">{t.organizacion.sinMeta}</p>
      )}

      {/* El único renglón que le dice a alguien qué hacer este mes. */}
      {fondo.fecha_limite && (
        <p className={`mt-1 text-[12.5px] leading-snug ${vencida && !cumplida ? 'text-rojo' : 'text-tinta/60'}`}>
          {cumplida
            ? t.organizacion.metaCumplida
            : vencida
              ? t.organizacion.fechaVencida(plata(fondo.falta ?? 0))
              : fondo.por_mes !== null
                ? t.organizacion.ritmo(plata(fondo.por_mes), cuando)
                : t.organizacion.paraEl(cuando)}
        </p>
      )}

      {accion === null ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button" className="boton-suave px-3 py-1.5 text-[13px]"
            onClick={() => setAccion('aporte')} disabled={ocupado}
          >
            {t.organizacion.guardarPlata}
          </button>
          {fondo.saldo > 0 && (
            <button
              type="button" className="boton-suave px-3 py-1.5 text-[13px]"
              onClick={() => setAccion('retiro')} disabled={ocupado}
            >
              {t.organizacion.retirarPlata}
            </button>
          )}
          <button
            type="button" className="boton-suave px-3 py-1.5 text-[13px]"
            onClick={alEditar} disabled={ocupado}
          >
            {t.organizacion.editarFondo}
          </button>
          {fondo.saldo === 0 && (
            <button
              type="button"
              className="px-2 py-1.5 text-[12.5px] font-semibold text-tinta/40 hover:text-rojo"
              onClick={alQuitar} disabled={ocupado}
            >
              {t.organizacion.quitarFondo}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-end gap-2">
          <div className="min-w-[140px] flex-1">
            <label className="etiqueta">
              {accion === 'aporte' ? t.organizacion.cuantoGuardas : t.organizacion.cuantoRetiras}
            </label>
            <input
              className="campo py-2 text-[14px]" inputMode="decimal" autoFocus
              value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, ''))}
            />
          </div>
          <button
            type="button" className="boton-suave px-3 py-2 text-[13px]"
            onClick={() => { setAccion(null); setMonto(''); }} disabled={ocupado}
          >
            {t.comun.cancelar}
          </button>
          <button
            type="button" className="boton-principal px-4 py-2 text-[13px]"
            disabled={ocupado || Number(monto.replace(',', '.')) <= 0}
            onClick={() => {
              alMover(accion, Number(monto.replace(',', '.')));
              setAccion(null);
              setMonto('');
            }}
          >
            {t.comun.guardar}
          </button>
        </div>
      )}
    </li>
  );
}
