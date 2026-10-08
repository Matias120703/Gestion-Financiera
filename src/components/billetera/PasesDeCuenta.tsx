'use client';

import { useEffect, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero, fechaLegible } from '@/lib/formato';
import { useLocale, useTextos } from '@/i18n/cliente';
import type { PaseDeCuenta } from '@/lib/tipos';

/**
 * LOS ÚLTIMOS PASES DE UNA CUENTA EN OTRA MONEDA (131).
 *
 * Una cuenta en dólares casi no recibe gastos ni ventas: se mueve pasándole
 * plata desde otra y sacándosela. Si esa lista no se ve, el saldo es un
 * número sin historia; y si un pase salió mal (un cero de más en «Entran»),
 * tiene que poder deshacerse entero, no «arreglarse» con otro pase al revés
 * a un cambio distinto.
 *
 * Cada renglón dice los DOS importes tal como se guardaron, cada uno en su
 * moneda: «+US$ 500,00 (Gs. 3.700.000)». Nada convertido acá.
 *
 * Se pide al abrir la fila y cada vez que cambia el saldo. Si la base
 * todavía no tiene la función, o falla, no se dibuja nada: es contexto, no
 * un dato del que dependa una decisión.
 */
export function PasesDeCuenta({
  empresaId, cuentaId, saldo, oculto, ocupado, alDeshacer,
}: {
  empresaId: string;
  cuentaId: string;
  /** El saldo de la cuenta: cuando cambia, la lista se vuelve a pedir. */
  saldo: number;
  oculto: boolean;
  ocupado: boolean;
  /** Pide confirmación y deshace (lo resuelve la pantalla). */
  alDeshacer: (par: string) => void;
}) {
  const t = useTextos();
  const m = t.monedas.billetera;
  const locale = useLocale();
  const [pases, setPases] = useState<PaseDeCuenta[]>([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data, error } = await clienteNavegador().rpc('transferencias_de_cuenta', {
          p_empresa: empresaId, p_cuenta: cuentaId,
        });
        if (vivo) setPases(!error && Array.isArray(data) ? (data as PaseDeCuenta[]) : []);
      } catch {
        if (vivo) setPases([]);
      }
    })();
    return () => { vivo = false; };
  }, [empresaId, cuentaId, saldo]);

  if (pases.length === 0) return null;

  const plata = (n: number, moneda: string) => (oculto ? '••••••' : dinero(Math.abs(n), moneda, true, locale));

  return (
    <div className="mt-3 border-t border-borde/70 pt-2.5">
      <p className="text-[12px] font-semibold text-tinta/55">{m.ultimosPases}</p>
      <ul className="mt-1 divide-y divide-borde/60">
        {pases.map((p) => {
          const entro = Number(p.monto) > 0;
          return (
            <li key={p.par} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">
                  {entro ? m.paseDesde(p.otra_cuenta) : m.paseHacia(p.otra_cuenta)}
                </span>
                <span className="block text-[12px] tabular-nums text-tinta/50">
                  {fechaLegible(p.fecha, false, locale)}
                  {' · '}
                  <span className={`font-semibold ${entro ? 'text-verde-fuerte' : 'text-rojo'}`}>
                    {entro ? '+' : '−'}{plata(Number(p.monto), p.moneda)}
                  </span>
                  {p.otra_moneda !== p.moneda && ` (${plata(Number(p.otro_monto), p.otra_moneda)})`}
                </span>
              </span>
              <button
                type="button" disabled={ocupado} onClick={() => alDeshacer(p.par)}
                className="boton-texto min-h-[40px] shrink-0 px-1 text-[12.5px] disabled:opacity-50"
              >
                {m.deshacer}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
