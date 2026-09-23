'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTextos } from '@/i18n/cliente';
import { mensajeDeError } from '@/lib/errores';

export type Resultado = { ok: true; data: unknown } | { ok: false };

/**
 * Correr una función de la base desde una pantalla de rutinas: marca
 * ocupado, muestra el error traducido y, si anduvo, refresca la página para
 * que lo de alrededor (la lista, la carpeta, «Para atender») se entere.
 *
 * Es el `correr()` de PaquetesAlumno hecho gancho, porque acá lo repiten
 * diez botones.
 */
export function useAccion() {
  const t = useTextos();
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const correr = useCallback(async (
    fn: () => PromiseLike<{ data: unknown; error: unknown }>,
    { refrescar = true }: { refrescar?: boolean } = {},
  ): Promise<Resultado> => {
    setOcupado(true);
    setError('');
    try {
      const { data, error: e } = await fn();
      if (e) throw e;
      if (refrescar) router.refresh();
      return { ok: true, data };
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
      return { ok: false };
    } finally {
      setOcupado(false);
    }
  }, [router, t]);

  return { ocupado, error, setError, correr };
}
