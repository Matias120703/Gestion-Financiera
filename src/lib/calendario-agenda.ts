/**
 * LO QUE SE CALCULA DEL CALENDARIO DE LA AGENDA (072, 119), sin React ni base.
 *
 * Vive acá, y no en el componente, para que las pruebas lo corran de verdad
 * (pruebas/calculos.test.js lo compila con el resto de src/lib): qué dice
 * cada día, qué resumen va arriba y cuándo un día está fuera del horario.
 */
import { finDeMes, inicioDeSemana } from './fechas';

/**
 * Lo que dice la base de cada día (072, y la 119).
 *
 * 'sin_horario' (119): no hay con qué medir el lugar. La cuenta no cargó
 * ningún horario (el profe que agenda clases sin «horario de atención»), o
 * ese día nadie tiene horario y hay turnos. Antes eso salía «cerrado», gris,
 * y un profe con la semana llena de clases veía todo cerrado.
 */
export type EstadoDia = 'libre' | 'casi' | 'lleno' | 'cerrado' | 'sin_horario';

export interface DiaCalendario {
  fecha: string;
  turnos: number;
  /** (119) Horarios distintos: una clase en grupo, con tres alumnos, es una. */
  franjas?: number;
  /**
   * (119) Las franjas que no caen enteras en el horario de su profesional.
   * No cuentan en el lugar: la casilla las marca con un punto.
   */
  fuera?: number;
  abierto_min: number;
  ocupado_min: number;
  libre_min: number;
  /** (119) Si la cuenta cargó algún horario. Sin eso no hay «lugar» que contar. */
  con_horario?: boolean;
  /** (119) El motivo del feriado o las vacaciones, si está cerrado por eso. */
  motivo?: string | null;
  estado: EstadoDia;
}

/** Los textos que usa `describirDia` (los de `agenda` en es.ts y pt.ts). */
export interface TextosDelDia {
  palabraClase: (n: number) => string;
  palabraTurno: (n: number) => string;
  estadoCalendario: Record<EstadoDia, string>;
  fueraDeHorario: string;
  fueraN: (n: number) => string;
}

/**
 * Cuántos tiene un día. Una barbería cuenta turnos; un profe, clases: tres
 * alumnos en la misma clase en grupo son UNA clase en su calendario (la
 * lista del día los muestra a los tres).
 */
export function cantidadDelDia(d: DiaCalendario, deAlumnos: boolean): number {
  return deAlumnos ? (d.franjas ?? d.turnos) : d.turnos;
}

/**
 * Si la cuenta tiene horario. Antes de la 119 la base no lo decía: se toma
 * que sí, que es como se dibujaba siempre, y nada cambia hasta migrar.
 */
export function tieneHorario(dias: DiaCalendario[]): boolean {
  return dias.length === 0 || dias.some((d) => d.con_horario !== false);
}

/**
 * Lo que va marcado con el punto ámbar en un día que sí se mide (libre, casi
 * lleno o lleno): las clases o turnos fuera del horario. Sin horario no hay
 * «fuera»; un día cerrado o «Fuera de horario» entero ya lo dice de otra forma.
 */
export function fueraDelDia(d: DiaCalendario, conHorario: boolean): number {
  if (!conHorario || d.estado === 'cerrado' || d.estado === 'sin_horario') return 0;
  return Math.max(d.fuera ?? 0, 0);
}

/**
 * «2 clases · Libre», «Cerrado · Vacaciones», «1 turno · Fuera de horario»,
 * «3 clases · Libre · 1 fuera de horario».
 *
 * Dice lo mismo que la casilla: sin horario la casilla se pinta por cantidad,
 * sin «Libre» ni «Lleno», y esto tampoco lo dice, aunque la base mida un día
 * suelto (el «Abro en otro horario» de un profe sin horario de la semana).
 */
export function describirDia(d: DiaCalendario, deAlumnos: boolean, conHorario: boolean, a: TextosDelDia): string {
  const n = cantidadDelDia(d, deAlumnos);
  const palabra = deAlumnos ? a.palabraClase : a.palabraTurno;
  const partes: string[] = [];
  if (n > 0 || d.estado !== 'cerrado') partes.push(`${n} ${palabra(n)}`);
  if (d.estado === 'cerrado') partes.push(d.motivo ? `${a.estadoCalendario.cerrado} · ${d.motivo}` : a.estadoCalendario.cerrado);
  else if (!conHorario) { /* por cantidad: ni libre ni lleno */ }
  else if (d.estado === 'sin_horario') partes.push(a.fueraDeHorario);
  else {
    partes.push(a.estadoCalendario[d.estado]);
    const fuera = fueraDelDia(d, conHorario);
    if (fuera > 0) partes.push(a.fueraN(fuera));
  }
  return partes.join(' · ');
}

/**
 * De qué habla el resumen sin horario: «esta semana» solo si es la semana de
 * hoy; a otra semana se llega con las flechas, y es «esa semana».
 */
export type AlcanceResumen = 'semana' | 'otraSemana' | 'mes' | 'rango';

export interface ResumenCalendario {
  /** Clases o turnos del período (el mes cuenta solo sus días). */
  total: number;
  /** Días de hoy en adelante con lugar (libre o casi lleno). */
  conLugar: number;
  /**
   * El período terminó antes de hoy: «días con lugar» no tiene sentido. El
   * mes se mide hasta su último día, no hasta el domingo que completa la
   * grilla: septiembre, con hoy 1/10, ya pasó aunque su grilla llegue al 4/10.
   */
  yaPaso: boolean;
  alcance: AlcanceResumen;
}

export function resumirCalendario(
  dias: DiaCalendario[],
  o: { vista: 'semana' | 'mes' | 'rango'; desde: string; hasta: string; ancla: string; hoy: string; deAlumnos: boolean },
): ResumenCalendario {
  const mes = o.ancla.slice(0, 7);
  // El mes cuenta sus días, no los del mes de al lado que completan la grilla.
  const delAlcance = o.vista === 'mes' ? dias.filter((d) => d.fecha.slice(0, 7) === mes) : dias;
  const total = delAlcance.reduce((s, d) => s + cantidadDelDia(d, o.deAlumnos), 0);
  // Un día casi lleno todavía tiene lugar.
  const conLugar = delAlcance.filter((d) => (d.estado === 'libre' || d.estado === 'casi') && d.fecha >= o.hoy).length;
  const fin = o.vista === 'mes' ? finDeMes(o.ancla) : o.hasta;
  const alcance: AlcanceResumen = o.vista !== 'semana' ? o.vista
    : o.desde === inicioDeSemana(o.hoy) ? 'semana' : 'otraSemana';
  return { total, conLugar, yaPaso: fin < o.hoy, alcance };
}
