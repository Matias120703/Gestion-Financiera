'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useTextos } from '@/i18n/cliente';
import { mensajeDeError } from '@/lib/errores';

/**
 * Zona horaria del negocio.
 *
 * Decide qué día es "hoy" para el cierre y la racha. Antes estaba clavada en
 * America/Asuncion: un negocio en São Paulo veía el cierre del día
 * equivocado durante una hora todas las noches, y la racha se le cortaba sola.
 *
 * La lista sale de `Intl.supportedValuesOf('timeZone')` cuando el navegador
 * la tiene, que es la lista completa y siempre actualizada. Los navegadores
 * viejos caen a un puñado de zonas de América y Europa, que cubre a quien
 * usa esto hoy.
 */
const RESPALDO = [
  'America/Asuncion', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo',
  'America/Santiago', 'America/Montevideo', 'America/La_Paz', 'America/Lima',
  'America/Bogota', 'America/Mexico_City', 'America/New_York', 'America/Los_Angeles',
  'Europe/Madrid', 'Europe/Lisbon', 'Europe/Berlin', 'Europe/Paris', 'Europe/Rome',
];

function zonas(): string[] {
  try {
    const todas = (Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined;
    if (todas?.length) return todas;
  } catch {
    // Navegador sin supportedValuesOf.
  }
  return RESPALDO;
}

export function SelectorZona({
  empresaId, zona, puedeEditar,
}: {
  empresaId: string;
  zona: string;
  puedeEditar: boolean;
}) {
  const t = useTextos();
  const router = useRouter();
  const [valor, setValor] = useState(zona);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  async function cambiar(nueva: string) {
    const anterior = valor;
    setValor(nueva);
    setGuardando(true);
    setError('');
    try {
      const supabase = clienteNavegador();
      const { error: e } = await supabase.rpc('actualizar_zona', { p_empresa: empresaId, p_zona: nueva });
      if (e) throw e;
      setMensaje(t.ajustes.guardado);
      setTimeout(() => setMensaje(''), 2500);
      router.refresh();
    } catch (e: any) {
      setValor(anterior);
      setError(mensajeDeError(e, t.errores.generico));
    } finally {
      setGuardando(false);
    }
  }

  // Qué hora es ahora allá. Es la forma más rápida de darse cuenta de que la
  // zona está mal puesta.
  let ahora = '';
  try {
    ahora = new Intl.DateTimeFormat(undefined, {
      timeZone: valor, hour: '2-digit', minute: '2-digit',
    }).format(new Date());
  } catch {
    ahora = '';
  }

  return (
    <div>
      <label className="block">
        <span className="etiqueta">{t.ajustes.zona}</span>
        <select
          className="campo"
          value={valor}
          disabled={!puedeEditar || guardando}
          onChange={(e) => cambiar(e.target.value)}
        >
          {zonas().map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
        </select>
      </label>

      <p className="mt-2 text-[12.5px] leading-relaxed text-tinta/45">
        {t.ajustes.zonaDetalle}
        {ahora && <> · <span className="font-semibold tabular-nums">{ahora}</span></>}
      </p>

      {mensaje && <p className="mt-2 text-[13px] font-semibold text-verde-fuerte">{mensaje}</p>}
      {error && <p className="mt-2 rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium text-rojo">{error}</p>}
    </div>
  );
}
