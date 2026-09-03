/**
 * ARMAR UN ENLACE DE WHATSAPP A PARTIR DE UN TELÉFONO ESCRITO A MANO.
 *
 * El teléfono del cliente lo tipea una persona apurada en el mostrador o el
 * propio cliente en el link público. Llega de todas las formas posibles:
 * `0981 111 111`, `0981-111111`, `+595 981 111111`, `(0981) 111111`.
 * WhatsApp, en cambio, quiere una sola: número internacional, sin `+`, sin
 * espacios y sin el cero de arranque.
 *
 * POR QUÉ EL PREFIJO SALE DE LA ZONA HORARIA
 *
 * Porque es el único dato de país que la cuenta ya tiene. `empresas` guarda
 * moneda y zona, no país: pedirle el país a alguien que ya eligió su zona
 * sería preguntarle dos veces lo mismo. La zona no es el país —Los Angeles y
 * Nueva York comparten el +1— pero para lo que hace falta acá alcanza.
 *
 * Si la zona no está en la lista, se devuelve lo que se pueda armar sin
 * inventar un prefijo. Antes que mandarle el mensaje al número equivocado de
 * otro país, es mejor no ofrecer el botón.
 */

/** Prefijo telefónico de las zonas que ofrece el selector de la cuenta. */
const PREFIJO_POR_ZONA: Record<string, string> = {
  'America/Asuncion': '595',
  'America/Argentina/Buenos_Aires': '54',
  'America/Sao_Paulo': '55',
  'America/Santiago': '56',
  'America/Montevideo': '598',
  'America/La_Paz': '591',
  'America/Lima': '51',
  'America/Bogota': '57',
  'America/Mexico_City': '52',
  'America/New_York': '1',
  'America/Los_Angeles': '1',
  'Europe/Madrid': '34',
  'Europe/Lisbon': '351',
  'Europe/Berlin': '49',
  'Europe/Paris': '33',
  'Europe/Rome': '39',
};

export function prefijoDeZona(zona: string): string {
  return PREFIJO_POR_ZONA[zona] ?? '';
}

/**
 * El número como lo quiere WhatsApp, o '' si no se puede armar con
 * confianza.
 *
 * El orden de las reglas importa: lo que la persona escribió manda sobre lo
 * que suponemos por la zona. Un número que ya vino en formato internacional
 * se respeta tal cual, aunque sea de otro país —el cliente que viaja existe—.
 */
export function telefonoInternacional(telefono: string, zona: string): string {
  const crudo = (telefono ?? '').trim();
  if (!crudo) return '';

  const internacional = crudo.startsWith('+') || crudo.startsWith('00');
  const digitos = crudo.replace(/\D/g, '');
  if (digitos.length < 6) return '';

  // Ya vino con código de país: se usa como está. El `00` es la otra forma de
  // escribir el `+`, así que se le saca.
  if (internacional) {
    const sinCeros = crudo.startsWith('00') ? digitos.replace(/^00/, '') : digitos;
    return sinCeros.length >= 6 ? sinCeros : '';
  }

  const prefijo = prefijoDeZona(zona);
  if (!prefijo) return '';

  // El cero de arranque es nacional: no viaja. `0981…` en Paraguay es
  // `595981…`, nunca `5950981…`.
  if (digitos.startsWith('0')) return prefijo + digitos.replace(/^0+/, '');

  // Ya trae el prefijo del país sin el `+`. Sin esta regla, un número
  // guardado como `595981111111` terminaría siendo `595595981111111`.
  if (digitos.startsWith(prefijo)) return digitos;

  return prefijo + digitos;
}

/**
 * El enlace que abre WhatsApp con el mensaje ya escrito, o '' si el número
 * no alcanza para armarlo. Devolver '' en vez de un enlace roto es a
 * propósito: la pantalla decide no mostrar el botón, en vez de mostrar uno
 * que abre una conversación con nadie.
 */
export function enlaceWhatsApp(telefono: string, zona: string, mensaje: string): string {
  const numero = telefonoInternacional(telefono, zona);
  if (!numero) return '';
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
