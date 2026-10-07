'use client';

import { useState } from 'react';
import { HojaPagar, type DatosDelPago } from './HojaPagar';

/**
 * «PAGAR CON TARJETA O QR» en la tarjeta de un plan (o «Renovar…» en el que
 * ya se paga). Abre la ventana de pago; todo lo demás pasa ahí.
 *
 * Lo ve solo quien puede pagar con Bancard en esta cuenta: eso lo decide el
 * servidor (`accesoBancard`) antes de dibujar el botón, y lo vuelve a decidir
 * la ruta que abre el pago.
 */
export function BotonPagarBancard({ etiqueta, datos }: { etiqueta: string; datos: DatosDelPago }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" className="boton-principal w-full" onClick={() => setAbierta(true)}>
        {etiqueta}
      </button>
      {abierta && <HojaPagar datos={datos} onCerrar={() => setAbierta(false)} />}
    </>
  );
}
