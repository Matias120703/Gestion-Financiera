'use client';

import { useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero, decimalesDe } from '@/lib/formato';
import { hoyISO, sumarDias, diffDias } from '@/lib/fechas';
import type { Medida, Reto } from '@/lib/tipos';
import { mensajeDeError } from '@/lib/errores';

export function EditorReto({
  empresaId, moneda, reto, puedeGestionar,
}: {
  empresaId: string;
  moneda: string;
  reto?: Reto;
  /** Definir la meta del negocio es cosa de administradores. */
  puedeGestionar: boolean;
}) {
  if (!puedeGestionar) {
    return (
      <p className="rounded-xl bg-arena px-4 py-3 text-[13px] leading-relaxed text-tinta/60">
        La meta la define un administrador del negocio. Vos podés seguir el avance y sumar ventas.
      </p>
    );
  }
  return <FormularioReto empresaId={empresaId} moneda={moneda} reto={reto} />;
}

function FormularioReto({
  empresaId, moneda, reto,
}: {
  empresaId: string;
  moneda: string;
  reto?: Reto;
}) {
  const t = useTextos();
  const router = useRouter();
  const dec = decimalesDe(moneda);
  const [abierto, setAbierto] = useState(!reto);

  const [nombre, setNombre] = useState(reto?.nombre ?? '10 millones en una semana');
  const [meta, setMeta] = useState<number>(Number(reto?.meta ?? (moneda === 'PYG' ? 10_000_000 : 1000)));
  const [medida, setMedida] = useState<Medida>(reto?.medida ?? 'ventas');
  const [inicio, setInicio] = useState(reto?.fecha_inicio ?? hoyISO());
  const [fin, setFin] = useState(reto?.fecha_fin ?? sumarDias(hoyISO(), 6));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const dias = Math.max(1, diffDias(inicio, fin) + 1);
  const porDia = meta / dias;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (meta <= 0) { setError('La meta tiene que ser mayor a cero.'); return; }
    if (fin < inicio) { setError('La fecha de fin no puede ser anterior al inicio.'); return; }

    setGuardando(true);
    try {
      const supabase = clienteNavegador();
      const fila = {
        empresa_id: empresaId,
        nombre: nombre.trim() || 'Mi reto',
        meta,
        medida,
        fecha_inicio: inicio,
        fecha_fin: fin,
        activo: true,
      };

      if (reto) {
        const { error } = await supabase.from('retos').update(fila).eq('id', reto.id);
        if (error) throw error;
      } else {
        // Solo puede haber un reto activo: cerramos los anteriores.
        await supabase.from('retos').update({ activo: false }).eq('empresa_id', empresaId).eq('activo', true);
        const { error } = await supabase.from('retos').insert(fila);
        if (error) throw error;
      }
      setAbierto(false);
      router.refresh();
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo guardar el reto.'));
    } finally {
      setGuardando(false);
    }
  }

  async function cerrarReto() {
    if (!reto) return;
    setGuardando(true);
    try {
      const supabase = clienteNavegador();
      const { error } = await supabase.from('retos').update({ activo: false }).eq('id', reto.id);
      if (error) throw error;
      router.refresh();
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo cerrar el reto.'));
    } finally {
      setGuardando(false);
    }
  }

  if (!abierto) {
    return (
      <div className="flex flex-wrap gap-2.5">
        <button className="boton-suave" onClick={() => setAbierto(true)}>{t.pantallas.editarReto}</button>
        {reto && (
          <button className="boton-suave text-rojo" onClick={cerrarReto} disabled={guardando}>
            Cerrar reto
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={guardar} className="space-y-3 text-left">
      <label className="block">
        <span className="etiqueta">{t.pantallas.nombreDelReto}</span>
        <input className="campo" maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>

      <label className="block">
        <span className="etiqueta">{t.pantallas.meta}</span>
        <input
          type="number" inputMode="decimal" min={0} step={dec === 0 ? 1000 : 0.01}
          className="campo text-[20px] font-bold tabular-nums"
          value={meta || ''} onChange={(e) => setMeta(Math.max(0, Number(e.target.value) || 0))}
        />
        <span className="mt-1 block text-[12.5px] text-tinta/50">{dinero(meta, moneda)}</span>
      </label>

      <div>
        <span className="etiqueta">{t.pantallas.queContamos}</span>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-arena p-1">
          {(['ventas', 'ganancia'] as const).map((v) => (
            <button
              key={v} type="button" onClick={() => setMedida(v)}
              className={`rounded-lg py-2 text-[13px] font-bold transition ${
                medida === v ? 'bg-white text-tinta shadow-sm' : 'text-tinta/50'
              }`}
            >
              {v === 'ventas' ? 'Lo vendido' : 'Ganancia neta'}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-tinta/45">
          {medida === 'ventas'
            ? 'Cuenta todo lo que facturás, sin descontar costos ni gastos.'
            : 'Cuenta lo que realmente te queda después de costos y gastos. Es más exigente.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="etiqueta">{t.pantallas.empieza}</span>
          <input type="date" className="campo py-2.5" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiqueta">{t.pantallas.termina}</span>
          <input type="date" className="campo py-2.5" value={fin} onChange={(e) => setFin(e.target.value)} />
        </label>
      </div>

      <div className="rounded-xl bg-verde-claro p-3.5">
        <p className="text-[13px] font-semibold text-verde-fuerte">
          Son {dias} día{dias === 1 ? '' : 's'}: necesitás {dinero(porDia, moneda)} por día.
        </p>
      </div>

      {error && <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

      <div className="flex gap-2.5">
        {reto && (
          <button type="button" className="boton-suave flex-1 py-3" onClick={() => setAbierto(false)}>{t.comun.cancelar}</button>
        )}
        <button type="submit" className="boton-principal flex-1 py-3" disabled={guardando}>
          {guardando ? 'Guardando…' : reto ? 'Guardar cambios' : 'Empezar el reto'}
        </button>
      </div>
    </form>
  );
}
