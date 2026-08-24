/**
 * Fusión de diccionarios parciales sobre uno completo.
 *
 * El problema que resuelve: queremos seis idiomas declarados sin tener que
 * traducir seis idiomas enteros hoy. Un idioma parcial se apoya en inglés,
 * y si mañana se completa, no hay que tocar ninguna pantalla.
 *
 * Lo que NO hace, a propósito: no devuelve la clave cruda cuando falta un
 * texto. Ver `plan.titulo` en pantalla sería peor que verlo en inglés.
 */

/** Como Partial, pero hacia adentro. Las funciones se reemplazan enteras. */
export type Parcial<T> = {
  [K in keyof T]?: T[K] extends (...args: any[]) => any
    ? T[K]
    : T[K] extends object
      ? Parcial<T[K]>
      : T[K];
};

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && typeof v !== 'function';
}

/**
 * Devuelve una copia de `base` con lo de `encima` pisado.
 * Recorre solo las claves de `base`: una clave sobrante en una traducción
 * (por ejemplo, una que se renombró y quedó vieja) se ignora en vez de
 * meterse en el resultado y confundir a quien lea el objeto.
 */
export function fusionar<T extends object>(base: T, encima: Parcial<T> | undefined): T {
  if (!encima) return base;

  const salida: Record<string, unknown> = { ...(base as Record<string, unknown>) };

  for (const clave of Object.keys(base as Record<string, unknown>)) {
    const valorBase = (base as Record<string, unknown>)[clave];
    const valorEncima = (encima as Record<string, unknown>)[clave];

    if (valorEncima === undefined || valorEncima === null || valorEncima === '') continue;

    if (esObjetoPlano(valorBase) && esObjetoPlano(valorEncima)) {
      salida[clave] = fusionar(valorBase as object, valorEncima as Parcial<object>);
    } else {
      salida[clave] = valorEncima;
    }
  }

  return salida as T;
}
