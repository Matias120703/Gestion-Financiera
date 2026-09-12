'use client';

import { useEffect, useState } from 'react';
import { guardarRef, leerRef, limpiarCodigo, limpiarRef } from '@/lib/referido';

/**
 * «¿Alguien te recomendó Orden?»
 *
 * El código llega de dos maneras: por el enlace —y entonces ya está guardado y
 * este campo aparece completo, que es la única señal de que el enlace
 * funcionó— o dictado por WhatsApp, y entonces se escribe acá.
 *
 * No se valida contra la base mientras escribe. A propósito: sería una
 * consulta pública que permite adivinar códigos ajenos de a uno, y el premio
 * por adivinar es la comisión de otro. Lo comprueba `usar_codigo_referido`
 * cuando la cuenta ya existe y hay una persona identificada del otro lado.
 *
 * Es opcional y se ve opcional. Quien no tenga código no puede quedarse
 * trabado acá: es el último paso antes de crear la cuenta.
 */
export function CampoCodigoRef({ etiqueta, ayuda }: { etiqueta: string; ayuda: string }) {
  const [codigo, setCodigo] = useState('');

  // El valor guardado se lee después del montaje: en el servidor no hay
  // localStorage, y pintar algo distinto en cada lado rompe la hidratación.
  useEffect(() => { setCodigo(leerRef() ?? ''); }, []);

  function cambiar(valor: string) {
    const limpio = limpiarCodigo(valor);
    setCodigo(limpio);
    if (limpio.length === 8) guardarRef(limpio, true);
    else if (limpio.length === 0) limpiarRef();
  }

  return (
    <div>
      <label className="etiqueta" htmlFor="ref">{etiqueta}</label>
      <input
        id="ref" className="campo uppercase tracking-widest" maxLength={8}
        placeholder="ABCD1234" autoComplete="off"
        value={codigo} onChange={(e) => cambiar(e.target.value)}
      />
      <p className="mt-1 text-[12px] leading-snug text-tinta/45">{ayuda}</p>
    </div>
  );
}
