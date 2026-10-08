'use client';

import { useTextos } from '@/i18n/cliente';
import { monedasParaElegir } from '@/lib/monedas';

/**
 * EN QUÉ MONEDA ESTÁ LA CUENTA (131).
 *
 * Matías: «Tengo una cuenta bancaria en dólares con 10 mil dólares: ¿cómo la
 * guardo en mi billetera, si solo me aparece la opción de cargar en
 * guaraníes?». Era esto lo que faltaba: una fila más al crear la cuenta.
 *
 * La propia va primero y ya marcada, así quien no usa otra moneda no tiene
 * que tocar nada. Se elige una sola vez: la moneda de una cuenta no se
 * cambia después (la base tampoco lo deja), por eso esta fila existe solo al
 * crear.
 */
export function ElegirMoneda({
  propia, valor, alElegir, deshabilitado = false,
}: {
  /** La moneda del negocio: la primera de la fila. */
  propia: string;
  valor: string;
  alElegir: (moneda: string) => void;
  deshabilitado?: boolean;
}) {
  const t = useTextos();
  const m = t.monedas.billetera;
  return (
    <div role="group" aria-label={m.moneda}>
      <span className="etiqueta">{m.moneda}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {monedasParaElegir(propia).map((codigo) => (
          <button
            key={codigo} type="button" disabled={deshabilitado}
            aria-pressed={codigo === valor}
            onClick={() => alElegir(codigo)}
            className={`${codigo === valor ? 'chip-encendido' : 'chip-apagado'} disabled:opacity-50`}
          >
            {m.monedas[codigo] ?? codigo}
          </button>
        ))}
      </div>
    </div>
  );
}
