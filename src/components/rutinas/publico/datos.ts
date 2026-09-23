import type { RutinaPublica } from '@/lib/tipos-rutinas';

type ConRutina = Extract<RutinaPublica, { existe: true }>;
type Rutina = NonNullable<ConRutina['rutina']>;
type Dia = Rutina['dias'][number];
type Ejercicio = Dia['ejercicios'][number];

/**
 * LO QUE LLEGA A LA PÁGINA DEL CLIENTE, Y NADA MÁS (098).
 *
 * `rutina_por_token` ya devuelve lo justo. Esto lo vuelve a recortar del
 * lado de la pantalla, con las claves EXACTAS de `RutinaPublica`, por dos
 * motivos:
 *
 *   · Lo que el servidor le pasa a un componente del navegador viaja
 *     escrito en el HTML. Si mañana alguien le suma a la función una clave
 *     para otra pantalla —el teléfono, «Salud y lesiones»—, sin este filtro
 *     quedaría en el código de una página que se abre sin cuenta aunque
 *     nada la muestre. Con el filtro, lo que no está en el tipo no pasa.
 *   · La misma respuesta se vuelve a pedir desde el celular (al volver a la
 *     pestaña). Una respuesta rara —un proxy, una versión vieja de la
 *     función— no tiene que romper la pantalla que el cliente está usando
 *     en el gimnasio.
 *
 * Devuelve null cuando la respuesta no se entiende: no es lo mismo que un
 * link inactivo (ver RutinaDelCliente).
 */
export function limpiarRutinaPublica(crudo: unknown): RutinaPublica | null {
  if (!esObjeto(crudo)) return null;
  if (crudo.existe === false) return { existe: false };
  if (crudo.existe !== true) return null;

  const renovar = crudo.renovar === true;
  return {
    existe: true,
    negocio: texto(crudo.negocio),
    nombre: texto(crudo.nombre),
    renovar,
    // Con la cuenta vencida no se muestra la rutina aunque viniera.
    actualizada: renovar ? null : textoONull(crudo.actualizada),
    rutina: renovar ? null : rutina(crudo.rutina),
  };
}

function rutina(v: unknown): Rutina | null {
  if (!esObjeto(v)) return null;
  return {
    nombre: texto(v.nombre),
    notas: texto(v.notas),
    desde: textoONull(v.desde),
    dias: lista(v.dias).map(dia).filter((d): d is Dia => d !== null),
  };
}

function dia(v: unknown): Dia | null {
  if (!esObjeto(v)) return null;
  return {
    orden: numero(v.orden) ?? 0,
    nombre: texto(v.nombre),
    notas: texto(v.notas),
    ejercicios: lista(v.ejercicios).map(ejercicio).filter((e): e is Ejercicio => e !== null),
  };
}

function ejercicio(v: unknown): Ejercicio | null {
  // Sin id no hay dónde guardar el tilde: un renglón así no se muestra a
  // medias, se descarta (la base siempre lo manda).
  if (!esObjeto(v) || typeof v.id !== 'string' || !v.id) return null;
  return {
    id: v.id,
    orden: numero(v.orden) ?? 0,
    nombre: texto(v.nombre),
    series: numero(v.series),
    reps: texto(v.reps),
    carga: texto(v.carga),
    descanso_seg: numero(v.descanso_seg),
    nota: texto(v.nota),
    junto: v.junto === true,
    video: textoONull(v.video),
    como: texto(v.como),
  };
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function textoONull(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
