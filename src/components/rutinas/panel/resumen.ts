/**
 * EL PROGRESO EN PALABRAS (098): lo que ve la pantalla de Progreso y el
 * resumen que el trainer le manda al cliente por WhatsApp.
 *
 * Puro (sin React ni directiva de cliente), con los textos de afuera: el
 * mismo cálculo sirve para la tarjeta «Cómo subieron las cargas» y para el
 * mensaje, y no hay dos lugares que puedan contar distinto.
 *
 * El resumen es un BORRADOR para el trainer: la pantalla lo muestra en un
 * cuadro que se puede cambiar, y solo sale lo que queda ahí cuando él toca
 * mandar. Nunca incluye «Salud y lesiones» ni la altura (no es progreso), y
 * es neutro: «−4 cm», sin «bien» ni «mal» (el objetivo de cada persona
 * quedó fuera de la fase 1).
 */
import { MEDIDAS, inicioContraAhora } from '@/lib/medidas';
import type { CambioCarga, ClaveMedida, Medicion, ProgresoCliente } from '@/lib/tipos-rutinas';
import { cargaSubio, cifra, conSigno, fechaCorta, primerNombre } from './utiles';

/** Cómo cambió un ejercicio: la carga y las repeticiones, de la primera vez a la última. */
export interface CambioResumido {
  antes: string;
  despues: string;
  /** La fecha del primer cambio: «desde el 15/08». */
  desde: string;
  /** Cada cambio, en orden: para mostrar el camino («40 → 45 → 50»). */
  pasos: { valor: string; fecha: string }[];
}

export function resumirCambios(cambios: readonly CambioCarga[]): { carga: CambioResumido | null; reps: CambioResumido | null } {
  const ordenados = [...cambios].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  const armar = (lista: CambioCarga[], antes: (c: CambioCarga) => string | null, despues: (c: CambioCarga) => string | null): CambioResumido | null => {
    const con = lista.filter((c) => (antes(c) ?? '').trim() !== (despues(c) ?? '').trim());
    if (con.length === 0) return null;
    return {
      antes: (antes(con[0]) ?? '').trim(),
      despues: (despues(con[con.length - 1]) ?? '').trim(),
      desde: con[0].fecha,
      pasos: con.map((c) => ({ valor: (despues(c) ?? '').trim(), fecha: c.fecha })),
    };
  };
  return {
    carga: armar(ordenados, (c) => c.carga_antes, (c) => c.carga_despues),
    reps: armar(ordenados, (c) => c.reps_antes, (c) => c.reps_despues),
  };
}

export interface TextosResumen {
  encabezado: (nombre: string, fecha: string) => string;
  medida: (nombre: string, inicio: string, ahora: string, diferencia: string) => string;
  cargas: string;
  carga: (ejercicio: string, antes: string, despues: string) => string;
  cierre: string;
  medidas: Record<ClaveMedida, { nombre: string; unidad: string }>;
}

/**
 * El texto para mandar: de cada medida que cambió, inicio → ahora con la
 * diferencia; después las cargas que SUBIERON (misma unidad, número más
 * alto). Vacío si no hay nada que contar: con un solo control no hay
 * diferencia, y un resumen sin nada adentro no se ofrece.
 */
export function armarResumen({
  nombre, mediciones, cargas, textos, locale, hoy,
}: {
  nombre: string;
  mediciones: readonly Medicion[];
  cargas: ProgresoCliente['cargas'];
  textos: TextosResumen;
  locale: string;
  hoy: string;
}): string {
  const ia = inicioContraAhora(mediciones);
  const lineas: string[] = [];
  const fechas: string[] = [];

  for (const def of MEDIDAS) {
    if (def.clave === 'altura_cm') continue;
    const x = ia[def.clave];
    if (!x || x.diferencia === null || x.diferencia === 0) continue;
    const u = textos.medidas[def.clave].unidad;
    const con = (n: number) => `${cifra(n, locale, def.decimales)} ${u}`;
    lineas.push(textos.medida(
      textos.medidas[def.clave].nombre, con(x.inicio), con(x.ahora), `${conSigno(x.diferencia, locale, def.decimales)} ${u}`,
    ));
    fechas.push(x.fechaInicio);
  }

  const subieron: string[] = [];
  for (const g of cargas) {
    const { carga } = resumirCambios(Array.isArray(g.cambios) ? g.cambios : []);
    if (carga && cargaSubio(carga.antes, carga.despues)) {
      subieron.push(textos.carga(g.nombre, carga.antes, carga.despues));
      fechas.push(carga.desde);
    }
  }

  if (lineas.length === 0 && subieron.length === 0) return '';

  const desde = [...fechas].sort()[0];
  const out = [textos.encabezado(primerNombre(nombre) || nombre, fechaCorta(desde, locale, hoy)), ...lineas];
  if (subieron.length) out.push('', textos.cargas, ...subieron);
  out.push('', textos.cierre);
  return out.join('\n');
}
