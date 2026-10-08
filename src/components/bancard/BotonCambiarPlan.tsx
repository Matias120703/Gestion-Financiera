'use client';

import { useState } from 'react';
import { HojaCambiarPlan, type DatosDelCambio } from './HojaCambiarPlan';

/**
 * «CAMBIAR AL PRO» / «CAMBIAR AL PREMIUM» en la tarjeta de un plan más alto
 * que el que la cuenta ya tiene pago (07/10/2026). Donde estaba el WhatsApp.
 * Abre la hoja del cambio; el importe, las fechas y el pago pasan ahí.
 *
 * Como `BotonPagarBancard`: lo dibuja el servidor solo para quien puede
 * pagar con Bancard en esta cuenta, y la ruta que abre el pago lo vuelve a
 * decidir.
 */
export function BotonCambiarPlan({ etiqueta, datos }: { etiqueta: string; datos: DatosDelCambio }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" className="boton-principal w-full" onClick={() => setAbierta(true)}>
        {etiqueta}
      </button>
      {abierta && <HojaCambiarPlan datos={datos} onCerrar={() => setAbierta(false)} />}
    </>
  );
}
