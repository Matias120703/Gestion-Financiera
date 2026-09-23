'use client';

import { useState } from 'react';
import { useTextos } from '@/i18n/cliente';

/**
 * Arranca el pago.
 *
 * No conoce ninguna pasarela: le pide al servidor a dónde mandar a la
 * persona. Así, cambiar de Pagopar a Stripe —o sumar una tercera— no toca
 * este archivo, y ninguna clave de comercio pasa por el navegador.
 *
 * El importe tampoco viaja desde acá: se manda qué plan y qué periodo, y el
 * servidor busca el precio en la tabla. Si el precio viajara en el pedido,
 * cualquiera podría pagar un guaraní.
 *
 * LA MONEDA TAMPOCO SE ELIGE (23/09): la suscripción se cobra siempre en
 * guaraníes, porque Bancard deja una sola moneda y Matías eligió guaraníes.
 * Antes la pantalla pasaba la moneda del selector Gs / US$; ahora el botón
 * manda PYG siempre. Va escrita acá y no importada de `lib/precios.ts`
 * porque ese módulo trae el cliente de Supabase del servidor, y este es un
 * componente de navegador (ver el comentario al final de `precios.ts`).
 */
const MONEDA_DEL_COBRO = 'PYG';

export function BotonPagar({
  plan, periodo, etiqueta, sinPasarela,
}: {
  plan: 'basico' | 'pro' | 'negocio';
  periodo: 'mensual' | 'anual';
  etiqueta: string;
  sinPasarela: string;
}) {
  const t = useTextos();
  const [yendo, setYendo] = useState(false);
  const [error, setError] = useState('');

  async function pagar() {
    setYendo(true);
    setError('');
    try {
      const r = await fetch('/api/pagos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, periodo, moneda: MONEDA_DEL_COBRO }),
      });
      const datos = await r.json();

      if (r.status === 501) {
        // Todavía no hay pasarela configurada. Es un estado esperable
        // mientras se define con qué se cobra en cada país, no un error.
        setError(sinPasarela);
        return;
      }
      if (!r.ok) throw new Error(datos?.error ?? t.errores.generico);

      if (datos?.url) window.location.href = datos.url;
      else throw new Error(t.errores.generico);
    } catch (e: any) {
      setError(e?.message ?? t.errores.generico);
    } finally {
      setYendo(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={pagar} disabled={yendo} className="boton-principal w-full">
        {yendo ? t.comun.cargando : etiqueta}
      </button>
      {error && (
        <p className="mt-2 rounded-xl bg-ambar-claro px-3 py-2 text-[12.5px] font-medium leading-snug text-ambar">
          {error}
        </p>
      )}
    </div>
  );
}
