/**
 * EL LINK DE LA RUTINA (098): qué es un token válido y dónde vive.
 *
 * Lo usan la página del cliente, su manifest y el componente que vuelve a
 * pedir la rutina desde el celular. Va acá y no repetido porque son las
 * puntas del mismo link: si una aceptara algo que la otra no, el ícono de la
 * pantalla de inicio abriría una página distinta de la que se guardó.
 */

/** El token es un uuid (`gen_random_uuid()` de la 098). */
const ES_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Si el texto puede ser un token. Uno que no lo es ni se le pregunta a la
 * base: termina en el mismo «este link ya no está activo» que uno que no
 * existe, como en /turno.
 */
export function esTokenDeRutina(token: string): boolean {
  return ES_TOKEN.test(token);
}

/** La dirección del link, tal como llegó: sin cambiarle mayúsculas, para que coincida con la que se abrió. */
export function rutaDeRutina(token: string): string {
  return `/rutina/${token}`;
}
