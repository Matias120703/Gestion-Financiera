'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { dinero, fechaLegible } from '@/lib/formato';
import { useTextos, useLocale } from '@/i18n/cliente';
import { Seccion, Vacio } from '@/components/Piezas';
import type { Lote, LoteDetalle, MovimientoSuelto } from '@/lib/tipos';

/**
 * LOTES · la plata ordenada por ciclo y no por día.
 *
 * Lo único que esta pantalla NO hace es cargar plata. Los gastos se cargan en
 * Gastos y las ventas en Vender, como siempre; acá se dice a qué ciclo
 * pertenece cada cosa y se mira cómo viene. Meter otra puerta de carga sería
 * tener dos lugares donde anotar el mismo gasto, y a la semana nadie sabe
 * cuál es el bueno.
 *
 * El número grande es el resultado del ciclo, y arranca en rojo. Es correcto
 * que arranque en rojo: durante siete meses pusiste plata y todavía no
 * vendiste. Un lote que mostrara cero mientras acumula gastos estaría
 * mintiendo.
 */
export function PantallaLotes({
  empresaId, moneda, esAdmin, hoy, lotes, sueltos,
}: {
  empresaId: string;
  moneda: string;
  esAdmin: boolean;
  hoy: string;
  lotes: Lote[];
  sueltos: MovimientoSuelto[];
}) {
  const t = useTextos();
  const router = useRouter();
  const [trabajando, setTrabajando] = useState('');
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);

  const ocupado = trabajando !== '';
  const sb = () => clienteNavegador();

  async function correr(marca: string, fn: () => Promise<{ error: unknown } | void>): Promise<boolean> {
    setTrabajando(marca);
    setError('');
    try {
      const r = await fn();
      const fallo = r && typeof r === 'object' && 'error' in r ? r.error : null;
      if (fallo) throw fallo;
      router.refresh();
      return true;
    } catch (e: unknown) {
      // Los mensajes de nuestras funciones ya vienen escritos para leerse y
      // pasan tal cual. Lo que traduce esto es la jerga que sale cuando falla
      // algo que no previmos: una policy, la sesión vencida, la red. Sin esta
      // línea, al que atiende el local le llegaba «new row violates row-level
      // security policy for table turnos_reserva», y con eso no desinstala la
      // pantalla: desinstala la app.
      setError(mensajeDeError(e, t.errores.generico));
      return false;
    } finally {
      setTrabajando('');
    }
  }

  const enCurso = lotes.filter((l) => l.estado === 'abierto');
  const cerrados = lotes.filter((l) => l.estado === 'cerrado');

  const tarjeta = (l: Lote) => (
    <TarjetaLote
      key={l.id}
      lote={l}
      empresaId={empresaId}
      moneda={moneda}
      esAdmin={esAdmin}
      sueltos={sueltos}
      ocupado={ocupado}
      correr={correr}
    />
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {error && (
        <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
          {error}
        </p>
      )}

      <Seccion
        titulo={t.lotes.enCurso}
        accion={esAdmin && (
          <button type="button" className="boton-texto text-[12.5px]" disabled={ocupado}
            onClick={() => setCreando((v) => !v)}>
            {creando ? t.comun.cancelar : t.lotes.nuevo}
          </button>
        )}
      >
        <p className="px-4 pb-3 text-[12.5px] leading-relaxed text-tinta/50">{t.lotes.detalle}</p>

        {creando && (
          <FormularioLote
            hoy={hoy}
            ocupado={ocupado}
            alGuardar={async (d) => {
              const hecho = await correr('nuevo', async () => sb().rpc('guardar_lote', {
                p_empresa: empresaId,
                p_nombre: d.nombre,
                p_unidad: d.unidad,
                p_cantidad: d.cantidad,
                p_notas: d.notas,
                p_abierto: d.abierto,
              }));
              if (hecho) setCreando(false);
            }}
          />
        )}

        {enCurso.length === 0 ? (
          <div className="px-4 pb-4">
            <Vacio titulo={t.lotes.sinLotes} detalle={t.lotes.sinLotesDetalle} />
          </div>
        ) : (
          <ul className="divide-y divide-borde border-t border-borde">{enCurso.map(tarjeta)}</ul>
        )}
      </Seccion>

      {cerrados.length > 0 && (
        <Seccion titulo={t.lotes.cerrados}>
          <p className="px-4 pb-2 text-[12.5px] leading-relaxed text-tinta/50">{t.lotes.cerradosDetalle}</p>
          <ul className="divide-y divide-borde border-t border-borde">{cerrados.map(tarjeta)}</ul>
        </Seccion>
      )}

      {sueltos.length > 0 && enCurso.length > 0 && (
        <p className="px-1 text-[12.5px] leading-relaxed text-tinta/45">
          {t.lotes.haySueltos(sueltos.length)}
        </p>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// UN LOTE
//
// Vive fuera de la pantalla y no adentro, aunque solo se use ahí: un
// componente declarado dentro de otro se vuelve a crear en cada render, así
// que el lote que la persona había desplegado se cerraría solo cada vez que
// se guarda algo.
//
// El detalle —los movimientos que tiene adentro— se pide recién al
// desplegarlo. Un ganadero puede tener veinte lotes con dos años de gastos
// cada uno; traerlos todos para mostrar una lista de nombres sería pagar por
// lo que casi nunca se mira.
// ════════════════════════════════════════════════════════════
function TarjetaLote({
  lote, empresaId, moneda, esAdmin, sueltos, ocupado, correr,
}: {
  lote: Lote;
  empresaId: string;
  moneda: string;
  esAdmin: boolean;
  sueltos: MovimientoSuelto[];
  ocupado: boolean;
  correr: (marca: string, fn: () => Promise<{ error: unknown } | void>) => Promise<boolean>;
}) {
  const t = useTextos();
  const locale = useLocale();
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState<LoteDetalle | null>(null);

  const plata = (n: number) => dinero(n, moneda, true, locale);
  const sb = () => clienteNavegador();

  async function traerDetalle() {
    const { data } = await sb().rpc('resumen_lote', { p_empresa: empresaId, p_lote: lote.id });
    setDetalle(data ? (data as LoteDetalle) : null);
  }

  async function alternar() {
    const siguiente = !abierto;
    setAbierto(siguiente);
    if (siguiente && !detalle) await traerDetalle();
  }

  const gano = lote.resultado > 0;
  const enRojo = lote.resultado < 0;

  return (
    <li className="px-4 py-3">
      <button type="button" className="flex w-full items-start justify-between gap-3 text-left"
        onClick={alternar}>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold">{lote.nombre}</span>
          <span className="mt-0.5 block text-[12.5px] text-tinta/50">
            {lote.cantidad > 0 && `${lote.cantidad} ${lote.unidad}`.trim()}
            {lote.cantidad > 0 && ' · '}
            {lote.estado === 'abierto' ? t.lotes.llevaDias(lote.dias) : t.lotes.duroDias(lote.dias)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={`block text-[16px] font-bold tabular-nums ${
            gano ? 'text-verde-fuerte' : enRojo ? 'text-rojo' : ''}`}>
            {plata(lote.resultado)}
          </span>
          <span className="mt-0.5 block text-[11.5px] text-tinta/45">
            {lote.por_unidad !== null && lote.unidad
              ? t.lotes.porUnidad(plata(Number(lote.por_unidad)), lote.unidad)
              : t.lotes.resultado}
          </span>
        </span>
      </button>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-tinta/55">
        <span>{t.lotes.puesto}: <b className="tabular-nums">{plata(lote.puesto)}</b></span>
        <span>{t.lotes.cobrado}: <b className="tabular-nums">{plata(lote.cobrado)}</b></span>
        <span>{t.lotes.cuantosMovimientos(lote.movimientos)}</span>
      </div>

      {abierto && (
        <div className="mt-3 space-y-3 rounded-xl border border-borde bg-arena/40 p-3">
          {lote.notas && <p className="text-[12.5px] leading-relaxed text-tinta/60">{lote.notas}</p>}

          {detalle === null ? (
            <p className="py-2 text-center text-[13px] text-tinta/45">{t.comun.cargando}</p>
          ) : detalle.movimientos.length === 0 ? (
            <p className="text-[13px] text-tinta/55">{t.lotes.todaviaSinNada}</p>
          ) : (
            <ul className="divide-y divide-borde/70">
              {detalle.movimientos.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className={`block truncate text-[13.5px] font-medium ${
                      m.estado === 'anulado' ? 'text-tinta/35 line-through' : ''}`}>
                      {m.descripcion || m.categoria}
                    </span>
                    <span className="text-[11.5px] text-tinta/45">
                      {fechaLegible(m.fecha, false, locale)} · {m.categoria}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className={`text-[13.5px] font-semibold tabular-nums ${
                      m.estado === 'anulado' ? 'text-tinta/35'
                        : m.tipo === 'gasto' ? 'text-rojo' : 'text-verde-fuerte'}`}>
                      {m.tipo === 'gasto' ? '−' : '+'}{plata(Number(m.monto))}
                    </span>
                    {m.estado === 'activo' && (
                      <button type="button" className="boton-texto text-[12px]" disabled={ocupado}
                        onClick={async () => {
                          const hecho = await correr('sacar', async () =>
                            sb().rpc('asignar_a_lote', { p_movimiento: m.id, p_lote: null }));
                          if (hecho) await traerDetalle();
                        }}>
                        {t.lotes.sacar}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* ---- sumarle algo que ya estaba cargado ---- */}
          {sueltos.length > 0 && (
            <div>
              <span className="etiqueta">{t.lotes.sumarAlgo}</span>
              <p className="mb-2 text-[12px] leading-relaxed text-tinta/45">{t.lotes.sumarAlgoDetalle}</p>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {sueltos.map((m) => (
                  <li key={m.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white px-2.5 py-1.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">
                        {m.descripcion || m.categoria}
                      </span>
                      <span className="text-[11.5px] text-tinta/45">
                        {fechaLegible(m.fecha, false, locale)} · {plata(Number(m.monto))}
                      </span>
                    </span>
                    <button type="button" className="boton-suave shrink-0 px-2.5 py-1 text-[12px]"
                      disabled={ocupado}
                      onClick={async () => {
                        const hecho = await correr('sumar', async () =>
                          sb().rpc('asignar_a_lote', { p_movimiento: m.id, p_lote: lote.id }));
                        if (hecho) await traerDetalle();
                      }}>
                      {t.lotes.sumar}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ---- cerrar, reabrir, borrar ---- */}
          {esAdmin && (
            <div className="flex flex-wrap gap-2 border-t border-borde pt-3">
              {lote.estado === 'abierto' ? (
                <button type="button" className="boton-principal px-3 py-1.5 text-[13px]" disabled={ocupado}
                  onClick={() => {
                    if (confirm(t.lotes.confirmarCerrar(lote.nombre))) {
                      correr('cerrar', async () =>
                        sb().rpc('cerrar_lote', { p_empresa: empresaId, p_id: lote.id }));
                    }
                  }}>
                  {t.lotes.cerrar}
                </button>
              ) : (
                <button type="button" className="boton-suave px-3 py-1.5 text-[13px]" disabled={ocupado}
                  onClick={() => correr('reabrir', async () =>
                    sb().rpc('reabrir_lote', { p_empresa: empresaId, p_id: lote.id }))}>
                  {t.lotes.reabrir}
                </button>
              )}

              {lote.movimientos === 0 && (
                <button type="button" className="boton-texto text-[13px]" disabled={ocupado}
                  onClick={() => correr('borrar', async () =>
                    sb().rpc('borrar_lote', { p_empresa: empresaId, p_id: lote.id }))}>
                  {t.comun.borrar}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ════════════════════════════════════════════════════════════
// ABRIR UN LOTE
//
// La unidad es texto libre —cabezas, hectáreas, bolsas, nada— porque cada
// oficio cuenta lo suyo. Una lista cerrada obligaría a elegir la menos mala,
// y el número por unidad dejaría de significar algo.
// ════════════════════════════════════════════════════════════
function FormularioLote({
  hoy, ocupado, alGuardar,
}: {
  hoy: string;
  ocupado: boolean;
  alGuardar: (d: {
    nombre: string; unidad: string; cantidad: number; notas: string; abierto: string;
  }) => void;
}) {
  const t = useTextos();
  const [nombre, setNombre] = useState('');
  const [unidad, setUnidad] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [notas, setNotas] = useState('');
  const [abierto, setAbierto] = useState(hoy);

  return (
    <div className="mx-4 mb-3 rounded-xl border border-borde bg-arena/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="etiqueta" htmlFor="lote-nombre">{t.lotes.nombre}</label>
          <input id="lote-nombre" className="campo" maxLength={80} value={nombre} disabled={ocupado}
            placeholder={t.lotes.nombreEjemplo}
            onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="etiqueta" htmlFor="lote-cant">{t.lotes.cantidad}</label>
            <input id="lote-cant" type="number" className="campo" min={0} step="any" value={cantidad}
              disabled={ocupado} onChange={(e) => setCantidad(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="etiqueta" htmlFor="lote-unidad">{t.lotes.unidad}</label>
            <input id="lote-unidad" className="campo" maxLength={20} value={unidad} disabled={ocupado}
              placeholder={t.lotes.unidadEjemplo}
              onChange={(e) => setUnidad(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="etiqueta" htmlFor="lote-desde">{t.lotes.abiertoEl}</label>
          <input id="lote-desde" type="date" className="campo" value={abierto} disabled={ocupado}
            onChange={(e) => setAbierto(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="etiqueta" htmlFor="lote-notas">{t.lotes.notas}</label>
          <input id="lote-notas" className="campo" maxLength={500} value={notas} disabled={ocupado}
            onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>

      <button type="button" className="boton-principal mt-3 px-4 py-2 text-[13.5px]"
        disabled={ocupado || nombre.trim() === ''}
        onClick={() => alGuardar({
          nombre, unidad, cantidad: Number(cantidad) || 0, notas, abierto,
        })}>
        {t.lotes.abrir}
      </button>
    </div>
  );
}
