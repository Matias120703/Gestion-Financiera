'use client';

import { useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { useTextos } from '@/i18n/cliente';
import { OpcionesTipo } from '@/components/OpcionesTipo';
import type { CapturaInterpretada, TipoCaptura, TipoCuenta } from '@/lib/tipos';

/**
 * «AGREGÁ A MARTA COMO CLIENTA, SU NÚMERO ES…»
 *
 * Un cliente nuevo por voz. Guarda con `guardar_cliente`, la misma función de
 * la pantalla de Clientes: si ese teléfono ya es de alguien, no se duplica,
 * se actualiza el que estaba (052).
 */
export function RevisionCliente({
  borrador, empresaId, tipoCuenta, onCambio, onCancelar, onListo,
}: {
  borrador: CapturaInterpretada;
  empresaId: string;
  tipoCuenta: TipoCuenta;
  onCambio: (c: CapturaInterpretada) => void;
  onCancelar: () => void;
  /** Guardado. Quien la abrió cierra y refresca. */
  onListo: () => void;
}) {
  const t = useTextos();
  const f = borrador.ficha;
  const [nombre, setNombre] = useState(f?.nombre || borrador.contraparte || '');
  const [telefono, setTelefono] = useState(f?.telefono ?? '');
  const [notas, setNotas] = useState(f?.notas ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const puede = nombre.trim() !== '' && !guardando;

  async function guardar() {
    if (!puede) return;
    setGuardando(true);
    setError('');
    try {
      const { error: err } = await clienteNavegador().rpc('guardar_cliente', {
        p_empresa: empresaId,
        p_nombre: nombre.trim(),
        p_telefono: telefono.trim(),
        p_notas: notas.trim(),
      });
      if (err) throw err;
      onListo();
    } catch (e: unknown) {
      setError(mensajeDeError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-h-[78vh] overflow-y-auto scroll-limpio">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-bold tracking-tight">{t.captura.revisar}</h2>
          <p className="mt-0.5 text-[13.5px] text-tinta/55">{t.captura.podesCorregir}</p>
        </div>
        <span className="pastilla shrink-0 bg-arena text-tinta/65">Cliente nuevo</span>
      </div>

      {borrador.transcripcion && (
        <p className="mb-4 rounded-xl bg-arena px-3.5 py-2.5 text-[13px] italic leading-relaxed text-tinta/60">
          &laquo;{borrador.transcripcion}&raquo;
        </p>
      )}
      {borrador.aviso && (
        <p className="mb-4 rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">{borrador.aviso}</p>
      )}

      <div className="space-y-3">
        <div>
          <label className="etiqueta">{t.captura.campoTipo}</label>
          <select
            className="campo" value={borrador.tipo}
            onChange={(e) => onCambio({ ...borrador, tipo: e.target.value as TipoCaptura })}
          >
            <OpcionesTipo tipoCuenta={tipoCuenta} />
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="etiqueta">Nombre</span>
            <input className="campo" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="block">
            <span className="etiqueta">Teléfono</span>
            <input
              className="campo" inputMode="tel" maxLength={40} placeholder="0981 234 567"
              value={telefono} onChange={(e) => setTelefono(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          <span className="etiqueta">Notas <span className="font-normal text-tinta/40">· opcional</span></span>
          <input
            className="campo" maxLength={1000} placeholder="Prefiere los martes, es alérgica a…"
            value={notas} onChange={(e) => setNotas(e.target.value)}
          />
        </label>
        <p className="text-[12.5px] leading-snug text-tinta/50">
          Si ese teléfono ya es de otro cliente, no se duplica: se actualiza el que ya estaba.
        </p>
      </div>

      {error && <p className="mt-4 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

      <div className="mt-5 grid grid-cols-2 gap-2.5 pb-1">
        <button className="boton-suave py-3" onClick={onCancelar} disabled={guardando}>{t.captura.atras}</button>
        <button className="boton-principal py-3" onClick={guardar} disabled={!puede}>
          {guardando ? t.comun.guardando : t.comun.guardar}
        </button>
      </div>
    </div>
  );
}
