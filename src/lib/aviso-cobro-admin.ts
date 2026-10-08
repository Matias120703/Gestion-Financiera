/**
 * EL TEXTO DEL AVISO «ENTRÓ UN PAGO» PARA LA ADMINISTRACIÓN DE ORDEN (08/10/2026).
 *
 * Puro y sin imports, para poder probarlo: `avisos-bancard.ts` junta los
 * datos y manda el push. El panel de administración está en español, así que
 * este aviso también.
 *
 * Dice cuánto entró, quién pagó, qué pagó y cómo. En el ambiente de prueba va
 * marcado «Prueba», para que un pago de mentira no se lea como plata de
 * verdad. Nunca lleva un dato de la tarjeta.
 */
export interface DatosDelCobro {
  importe: unknown;
  /** El nombre del negocio (o de la cuenta personal) que pagó. */
  nombre: unknown;
  /** Qué pagó, ya en palabras: «Plan Pro, por mes», «Cambio de plan: de Básico a Pro»… */
  concepto: string;
  /** 'produccion' es plata de verdad; cualquier otra cosa se marca como prueba. */
  entorno: unknown;
  /** 'automatico' cuando lo cobró la tarea con la tarjeta guardada. */
  origen: unknown;
  /** 'token' = con la tarjeta guardada; si no, el formulario (tarjeta o QR). */
  medio: unknown;
}

export function textoDelCobroParaLaAdministracion(d: DatosDelCobro): { titulo: string; cuerpo: string } {
  const monto = Number(d.importe);
  const guaranies = `Gs. ${(Number.isFinite(monto) ? monto : 0).toLocaleString('es-PY', { maximumFractionDigits: 0 })}`;
  const como = d.origen === 'automatico' ? 'cobro automático'
    : d.medio === 'token' ? 'con su tarjeta guardada'
    : 'con tarjeta o QR';
  const nombre = typeof d.nombre === 'string' ? d.nombre.trim().slice(0, 60) : '';
  return {
    titulo: `${d.entorno === 'produccion' ? '' : 'Prueba · '}Cobraste ${guaranies}`,
    cuerpo: [nombre, d.concepto, como].filter(Boolean).join(' · '),
  };
}
