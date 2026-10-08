import type { CuentaBorrada } from './tipos';

/**
 * LO QUE SE LE DICE A LA ADMINISTRACIÓN DESPUÉS DE BORRAR (129, 07/10/2026).
 *
 * Borrar una cuenta son varias cosas que pueden salir distinto: la cuenta
 * (una transacción), cada correo (un pedido a Auth por persona), la tarjeta
 * (Bancard) y los archivos (el depósito). Lo que no se pudo hacer no vuelve
 * atrás lo demás, así que el cartel tiene que decir, una por una, qué pasó
 * de verdad. Un «Listo» que tapa un correo que no se borró es justo el
 * problema que se vino a arreglar.
 *
 * Va acá, sin React ni Supabase, para poder probarlo
 * (pruebas/borrar-correo.test.js). Textos en español, como todo /admin.
 */

/** Por qué no se borra un correo, para completar «… no se borra: ____.» */
export function textoDeMotivo(motivo: string | null | undefined): string {
  switch (motivo) {
    case 'otro_negocio': return 'tiene otro negocio';
    case 'administracion': return 'administra Orden';
    case 'vos': return 'sos vos';
    case 'socio': return 'recomienda Orden';
    // Un motivo que este código todavía no conoce: se dice sin inventar cuál.
    default: return 'la base no lo permite';
  }
}

/** «a», «a y b», «a, b y c». */
export function enPalabras(lista: string[]): string {
  if (lista.length <= 1) return lista[0] ?? '';
  return `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
}

/**
 * ¿Lo que se escribió a mano es ese correo? Sin mirar mayúsculas ni los
 * espacios de los costados: la misma comparación que hace la base
 * (`correo_borrable`). Un correo vacío no coincide con nada.
 */
export function mismoCorreo(escrito: string, correo: string): boolean {
  const a = escrito.trim().toLowerCase();
  return a !== '' && a === correo.trim().toLowerCase();
}

/** ¿Quedó algo sin hacer? El cartel va en ámbar y no en verde. */
export function hayOjo(d: Pick<CuentaBorrada, 'correos' | 'tarjeta' | 'archivos_sin_borrar'>): boolean {
  return d.correos.some((c) => c.estado === 'fallo')
    || d.tarjeta === 'pendiente' || d.tarjeta === 'fallo' || d.tarjeta === 'sin_configurar'
    || d.archivos_sin_borrar > 0;
}

/** El cartel de arriba del panel después de borrar una cuenta. */
export function mensajeDeCuentaBorrada(d: CuentaBorrada): string {
  const frases = [`Listo: se borró «${d.nombre}».`];

  // «Ya no estaba» también es un correo que ya no existe: se cuenta igual.
  const borrados = d.correos.filter((c) => c.estado === 'borrado' || c.estado === 'ya_no_estaba').map((c) => c.correo);
  if (borrados.length === 1) frases.push(`También se borró el correo de ${borrados[0]}.`);
  else if (borrados.length > 1) frases.push(`También se borraron ${borrados.length} correos: ${enPalabras(borrados)}.`);

  for (const c of d.correos) {
    if (c.estado === 'se_queda') frases.push(`No se borró el correo de ${c.correo}: ${textoDeMotivo(c.motivo)}.`);
  }

  const fallaron = d.correos.filter((c) => c.estado === 'fallo').map((c) => c.correo);
  if (fallaron.length === 1) {
    frases.push(`Ojo: no se pudo borrar el correo de ${fallaron[0]}. Quedó más abajo, en «Correos sin cuenta».`);
  } else if (fallaron.length > 1) {
    frases.push(`Ojo: no se pudieron borrar ${fallaron.length} correos: ${enPalabras(fallaron)}. Quedaron más abajo, en «Correos sin cuenta».`);
  }

  if (d.tarjeta === 'quitada') frases.push('Bancard borró la tarjeta guardada.');
  if (d.tarjeta === 'pendiente') frases.push('Ojo: Bancard no confirmó que borró la tarjeta guardada. Orden ya no la puede cobrar.');
  if (d.tarjeta === 'fallo') frases.push('Ojo: no se le pudo pedir a Bancard que borre la tarjeta guardada.');
  if (d.tarjeta === 'sin_configurar') frases.push('Ojo: tenía una tarjeta guardada y este servidor no tiene Bancard: no se le pidió que la borre.');

  if (d.archivos_sin_borrar === 1) frases.push('Ojo: quedó 1 archivo sin borrar.');
  else if (d.archivos_sin_borrar > 1) frases.push(`Ojo: quedaron ${d.archivos_sin_borrar} archivos sin borrar.`);

  return frases.join(' ');
}

/** Cuando el pedido de borrar una cuenta se corta: no se sabe qué llegó a hacer. */
export const BORRADO_SIN_RESPUESTA =
  'Ojo: no llegó la respuesta del borrado. Fijate en la lista si la cuenta sigue; los correos que hayan quedado están en «Correos sin cuenta».';

/** El cartel después de borrar un correo de «Correos sin cuenta». */
export function mensajeDeCorreoBorrado(estado: string, correo: string): string {
  if (estado === 'ya_no_estaba') return 'Ese correo ya estaba borrado.';
  return `Listo: se borró el correo ${correo}. Ya se puede registrar de nuevo.`;
}
