/**
 * Todo el sistema trabaja con fechas 'YYYY-MM-DD' en la zona horaria del negocio.
 * Nunca usamos new Date('2026-08-13') porque JavaScript lo interpreta en UTC
 * y en Paraguay eso puede devolver el día anterior.
 */
export const ZONA = 'America/Asuncion';

export function hoyISO(zona: string = ZONA): string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return f.format(new Date());
}

export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

export function diffDias(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split('-').map(Number);
  const [a2, m2, d2] = hasta.split('-').map(Number);
  const x = Date.UTC(a1, m1 - 1, d1);
  const y = Date.UTC(a2, m2 - 1, d2);
  return Math.round((y - x) / 86_400_000);
}

export function inicioDeMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function finDeMes(iso: string): string {
  const [a, m] = iso.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(ultimo).padStart(2, '0')}`;
}

/** Lunes de la semana de `iso`. */
export function inicioDeSemana(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
  const retroceso = dia === 0 ? 6 : dia - 1;
  return sumarDias(iso, -retroceso);
}

export type ClaveRango =
  | 'hoy' | 'ayer' | 'semana' | 'semana_pasada'
  | 'mes' | 'mes_pasado' | 'anio' | 'siempre' | 'personalizado';

export interface Rango { desde: string; hasta: string; etiqueta: string; clave: ClaveRango }

export const ETIQUETAS_RANGO: Record<Exclude<ClaveRango, 'personalizado'>, string> = {
  hoy: 'Hoy',
  ayer: 'Ayer',
  semana: 'Esta semana',
  semana_pasada: 'Semana pasada',
  mes: 'Este mes',
  mes_pasado: 'Mes pasado',
  anio: 'Este año',
  siempre: 'Todo',
};

export function resolverRango(clave: ClaveRango, hoy = hoyISO(), personalizado?: { desde: string; hasta: string }): Rango {
  switch (clave) {
    case 'hoy':
      return { desde: hoy, hasta: hoy, etiqueta: 'Hoy', clave };
    case 'ayer': {
      const a = sumarDias(hoy, -1);
      return { desde: a, hasta: a, etiqueta: 'Ayer', clave };
    }
    case 'semana': {
      const l = inicioDeSemana(hoy);
      return { desde: l, hasta: hoy, etiqueta: 'Esta semana', clave };
    }
    case 'semana_pasada': {
      const l = sumarDias(inicioDeSemana(hoy), -7);
      return { desde: l, hasta: sumarDias(l, 6), etiqueta: 'Semana pasada', clave };
    }
    case 'mes':
      return { desde: inicioDeMes(hoy), hasta: hoy, etiqueta: 'Este mes', clave };
    case 'mes_pasado': {
      const finAnterior = sumarDias(inicioDeMes(hoy), -1);
      return { desde: inicioDeMes(finAnterior), hasta: finAnterior, etiqueta: 'Mes pasado', clave };
    }
    case 'anio':
      return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy, etiqueta: 'Este año', clave };
    case 'siempre':
      return { desde: '2000-01-01', hasta: hoy, etiqueta: 'Todo el historial', clave };
    default: {
      const desde = personalizado?.desde || hoy;
      const hasta = personalizado?.hasta || hoy;
      return { desde, hasta, etiqueta: 'Personalizado', clave: 'personalizado' };
    }
  }
}

/** Rango del mismo largo, inmediatamente anterior (para comparar "vs. periodo anterior"). */
export function rangoAnterior(r: { desde: string; hasta: string }): { desde: string; hasta: string } {
  const largo = diffDias(r.desde, r.hasta) + 1;
  return { desde: sumarDias(r.desde, -largo), hasta: sumarDias(r.desde, -1) };
}

export function diasDelRango(desde: string, hasta: string, tope = 400): string[] {
  const out: string[] = [];
  let actual = desde;
  let n = 0;
  while (actual <= hasta && n < tope) {
    out.push(actual);
    actual = sumarDias(actual, 1);
    n++;
  }
  return out;
}
