'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { decimalesDe, dinero, fechaLegible } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';
import { useLocale, useTextos } from '@/i18n/cliente';
import { metodoVisible } from '@/i18n/nombres';
import { CampoMonto } from '@/components/CampoMonto';
import type { PaqueteAlumno } from '@/lib/tipos';

/** Las formas de pago de un paquete. `credito` es el fiado (055). */
const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'credito'] as const;

/**
 * LOS PAQUETES DE UN ALUMNO (088).
 *
 * Vive adentro de la ficha del alumno y no en una pantalla aparte, porque la
 * pregunta que se hace un profe es siempre sobre alguien: «¿cuántas clases le
 * quedan a Juan?». Una lista de paquetes suelta obligaría a buscarlo.
 *
 * LA PLATA NO SE CALCULA ACÁ
 *
 * Vender un paquete es una venta como cualquier otra (`vender_paquete` llama
 * a `registrar_venta`), y cuánto se usó lo dice la base. Esta pantalla no
 * suma ni resta nada: pide y muestra. Así no hay dos lugares que puedan
 * contestar distinto cuántas clases le quedan a alguien.
 */
export function PaquetesAlumno({
  empresaId, clienteId, moneda, zona, esAdmin,
}: {
  empresaId: string;
  clienteId: string;
  moneda: string;
  zona: string;
  esAdmin: boolean;
}) {
  const t = useTextos();
  const p = t.paquetes;
  const locale = useLocale();
  const router = useRouter();

  const [lista, setLista] = useState<PaqueteAlumno[] | null>(null);
  const [vendiendo, setVendiendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const plata = (n: number) => dinero(n, moneda, true, locale);
  // «1,5» y no «1.50»: las clases se cuentan, no se cobran.
  const cuantas = (n: number) => Number(n).toLocaleString(locale, { maximumFractionDigits: 2 });

  async function leer() {
    try {
      const { data, error: e } = await clienteNavegador()
        .rpc('paquetes_del_alumno', { p_empresa: empresaId, p_cliente: clienteId });
      if (e) throw e;
      setLista(Array.isArray(data) ? (data as PaqueteAlumno[]) : []);
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
      setLista([]);
    }
  }

  useEffect(() => { leer(); }, [empresaId, clienteId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Corre una acción, vuelve a leer y refresca lo de alrededor (el fiado, el panel). */
  async function correr(fn: () => PromiseLike<{ error: unknown }>) {
    setOcupado(true);
    setError('');
    try {
      const { error: e } = await fn();
      if (e) throw e;
      await leer();
      router.refresh();
      return true;
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const sb = () => clienteNavegador();

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="etiqueta">{p.titulo}</p>
        {!vendiendo && (
          <button type="button" onClick={() => setVendiendo(true)} className="boton-texto text-[13px]">
            + {p.vender}
          </button>
        )}
      </div>

      {error && <p className="mt-2 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

      {vendiendo && (
        <FormularioPaquete
          moneda={moneda}
          zona={zona}
          ocupado={ocupado}
          alCancelar={() => setVendiendo(false)}
          alGuardar={async (d) => {
            const listo = await correr(() => sb().rpc('vender_paquete', {
              p_empresa: empresaId, p_cliente: clienteId, p_nombre: d.nombre,
              p_clases: d.clases, p_precio: d.precio, p_metodo: d.metodo,
              p_fecha: null, p_vence: d.vence || null,
            }));
            if (listo) setVendiendo(false);
          }}
        />
      )}

      {lista === null && <p className="mt-1 text-[12.5px] text-tinta/45">{t.comun.cargando}</p>}
      {lista && lista.length === 0 && !vendiendo && (
        <p className="mt-1 text-[12.5px] text-tinta/45">{p.ninguno}</p>
      )}

      {lista && lista.length > 0 && (
        <ul className="mt-2 space-y-2">
          {lista.map((pq) => {
            const activo = pq.estado === 'activo';
            const avance = pq.clases > 0 ? Math.min(100, (Number(pq.usadas) / Number(pq.clases)) * 100) : 0;
            const ultima = pq.historia[0];
            return (
              <li key={pq.id} className={`rounded-xl bg-superficie px-3.5 py-3 ${activo ? '' : 'opacity-60'}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[14px] font-bold">{pq.nombre}</span>
                  <span className={`shrink-0 text-[12px] font-semibold ${activo ? 'text-verde-fuerte' : 'text-tinta/50'}`}>
                    {activo ? p.quedan(cuantas(pq.quedan)) : p.estados[pq.estado]}
                  </span>
                </div>

                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-arena">
                  <div className="h-full rounded-full bg-verde" style={{ width: `${avance}%` }} />
                </div>

                <p className="mt-1.5 text-[12px] text-tinta/50">
                  {[
                    p.usadasDe(cuantas(pq.usadas), cuantas(pq.clases)),
                    Number(pq.precio) > 0 ? plata(Number(pq.precio)) : '',
                    pq.vence_el ? p.venceEl(fechaLegible(pq.vence_el, true, locale)) : '',
                  ].filter(Boolean).join(' · ')}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {activo && (
                    <button
                      type="button" disabled={ocupado}
                      onClick={() => correr(() => sb().rpc('dar_clase', { p_paquete: pq.id }))}
                      className="boton-principal px-3.5 py-1.5 text-[13px] disabled:opacity-50"
                    >
                      {p.diUnaClase}
                    </button>
                  )}
                  {/* Deshacer solo la última: el error de todos los días es
                      tocar dos veces, y deshacer una del medio desordenaría
                      una historia que el alumno puede pedir ver. */}
                  {ultima && pq.estado !== 'cerrado' && (
                    <button
                      type="button" disabled={ocupado}
                      onClick={() => correr(() => sb().rpc('deshacer_clase', { p_clase: ultima.id }))}
                      className="text-[12.5px] font-semibold text-tinta/45 hover:text-tinta disabled:opacity-50"
                    >
                      {p.deshacer}
                    </button>
                  )}
                  {esAdmin && (pq.estado === 'activo' || pq.estado === 'cerrado') && (
                    <button
                      type="button" disabled={ocupado}
                      onClick={() => {
                        const cerrar = pq.estado !== 'cerrado';
                        if (cerrar && !confirm(p.confirmarCerrar(pq.nombre))) return;
                        correr(() => sb().rpc('cerrar_paquete', { p_paquete: pq.id, p_cerrado: cerrar }));
                      }}
                      className="ml-auto text-[12.5px] font-semibold text-tinta/40 hover:text-rojo disabled:opacity-50"
                    >
                      {pq.estado === 'cerrado' ? p.reabrir : p.cerrar}
                    </button>
                  )}
                </div>

                {pq.historia.length > 0 && (
                  <p className="mt-2 text-[11.5px] leading-relaxed text-tinta/40">
                    {pq.historia.slice(0, 8).map((c) =>
                      `${fechaLegible(c.fecha, false, locale)}${Number(c.cantidad) !== 1 ? ` (${cuantas(c.cantidad)})` : ''}${c.motivo === 'falta' ? ` · ${p.falta}` : ''}`,
                    ).join(' · ')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FormularioPaquete({
  moneda, zona, ocupado, alGuardar, alCancelar,
}: {
  moneda: string;
  zona: string;
  ocupado: boolean;
  alGuardar: (d: { nombre: string; clases: number; precio: number; metodo: string; vence: string }) => void;
  alCancelar: () => void;
}) {
  const t = useTextos();
  const p = t.paquetes;
  const [nombre, setNombre] = useState('');
  const [clases, setClases] = useState('8');
  const [precio, setPrecio] = useState(0);
  const [metodo, setMetodo] = useState<string>('efectivo');
  const [vence, setVence] = useState('');

  const numClases = Number(clases.replace(',', '.'));
  const valido = nombre.trim() !== '' && numClases > 0;

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-verde/30 bg-superficie p-3">
      <label className="block">
        <span className="etiqueta">{p.nombre}</span>
        <input className="campo mt-1" maxLength={80} autoFocus placeholder={p.nombreEjemplo}
          value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>

      <div className="grid grid-cols-2 gap-2.5">
        {/* Un número chico que se cuenta, no plata: se escribe tal cual. */}
        <label className="block">
          <span className="etiqueta">{p.clases}</span>
          <input className="campo mt-1 tabular-nums" inputMode="decimal"
            value={clases} onChange={(e) => setClases(e.target.value.replace(/[^\d.,]/g, ''))} />
        </label>
        <label className="block">
          <span className="etiqueta">{p.precio}</span>
          <CampoMonto className="campo mt-1" decimales={decimalesDe(moneda)} placeholder="0"
            valor={precio} alCambiar={setPrecio} />
        </label>
      </div>

      <div>
        <span className="etiqueta">{p.comoPago}</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {METODOS.map((m) => (
            <button key={m} type="button" onClick={() => setMetodo(m)}
              className={metodo === m ? 'chip-encendido' : 'chip-apagado'}>
              {/* En una venta, 'credito' es FIADO (055), no la tarjeta. La
                  pantalla de venta lo dice «Fiado»; acá también, para que
                  nadie crea que está cobrando con tarjeta de crédito. */}
              {m === 'credito' ? t.venta.metodoFiadoCorto : metodoVisible(t, m)}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="etiqueta">{p.vence}</span>
        <input type="date" className="campo mt-1" min={hoyISO(zona)}
          value={vence} onChange={(e) => setVence(e.target.value)} />
        <span className="mt-1 block text-[12px] text-tinta/45">{p.venceAyuda}</span>
      </label>

      {precio > 0 && <p className="text-[12px] leading-snug text-tinta/50">{p.seCobraHoy}</p>}

      <div className="flex gap-2">
        <button type="button" className="boton-principal flex-1 py-2.5" disabled={ocupado || !valido}
          onClick={() => alGuardar({ nombre: nombre.trim(), clases: numClases, precio, metodo, vence })}>
          {ocupado ? t.comun.guardando : p.vender}
        </button>
        <button type="button" className="boton-suave px-4 py-2.5" onClick={alCancelar} disabled={ocupado}>
          {t.comun.cancelar}
        </button>
      </div>
    </div>
  );
}
