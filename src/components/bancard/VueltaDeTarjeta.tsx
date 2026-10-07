'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTextos } from '@/i18n/cliente';

/**
 * LA VUELTA DEL CATASTRO (el `return_url` de cards/new: /plan/tarjeta/[tarjeta]).
 *
 * Si la librería de Bancard navega acá en vez de avisar adentro de la hoja,
 * esta pantalla hace lo mismo que la hoja: le pide al servidor que compruebe
 * con Bancard si la tarjeta quedó (nada de lo que diga la dirección cuenta),
 * y vuelve a /plan, donde se ve el resultado.
 */
export function VueltaDeTarjeta({ tarjeta, empresaId }: { tarjeta: number; empresaId: string }) {
  const t = useTextos();
  const k = t.bancard.tarjeta;
  const router = useRouter();
  const [texto, setTexto] = useState(k.vueltaComprobando);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/pagos/bancard/tarjeta/verificar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ empresa: empresaId, tarjeta }),
        });
        const d = await r.json().catch(() => null);
        if (!vivo) return;
        setTexto(r.ok && d?.guardada === true
          ? (d.marca && d.ultimos4 ? k.guardada(d.marca, d.ultimos4) : k.guardadaSinDetalle)
          : k.noSeGuardo);
      } catch {
        if (vivo) setTexto(k.noSeGuardo);
      }
      window.setTimeout(() => { if (vivo) router.replace('/plan'); }, 1500);
    })();
    return () => { vivo = false; };
  }, [tarjeta]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-borde p-4" aria-live="polite">
      <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-verde border-t-transparent" aria-hidden />
      <p className="text-[14px] font-semibold leading-relaxed">{texto}</p>
    </div>
  );
}
