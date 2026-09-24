import type { FichaRubro } from '../rubros';
import type { TipoCuenta } from '../tipos';

/**
 * QUÉ REPORTE LE TOCA A ESTA CUENTA (23/09).
 *
 * Hasta acá Reportes y el Excel tenían dos versiones: la de una persona y la
 * de «un negocio», que era la de un almacén. Al profe le mostraba ganancia
 * bruta con margen del 100 % (sus paquetes no tienen costo), y al agricultor
 * «Sin ventas en este periodo» el mismo mes que vendió la soja: la venta de
 * una liquidación no pasa por `movimiento_items`, que es de donde sale el
 * ranking. Números que se ven y son falsos.
 *
 * Cinco reportes, uno por forma de trabajar y no uno por rubro: el profe y
 * el trainer hacen lo mismo con otras palabras (la jerga), y el ganadero y
 * el agricultor también (los lotes, con cabezas o con hectáreas).
 *
 * Se decide por lo que la ficha DICE del rubro y no por su nombre, igual
 * que el panel: el día que se sume un rubro nuevo con agenda de alumnos o
 * con ciclos largos, cae solo en el reporte que le corresponde.
 *
 * El orden importa:
 *   1. La cuenta personal manda sobre el rubro (se le guarda 'comercio').
 *   2. Agenda de alumnos antes que agenda: el profe también tiene
 *      `/agenda`, pero no tiene equipo ni reparto.
 *   3. Ciclos largos antes que comercio: el ganadero tiene `/productos`.
 *   4. Servicios es el que reparte con un equipo (`/reparto`). No alcanza
 *      con `/agenda`: la tiene el profe, y el día que un comercio prenda la
 *      agenda para turnos no por eso tiene profesionales que liquidar.
 */
export type VarianteReporte = 'comercio' | 'servicios' | 'alumnos' | 'campo' | 'personal';

export const VARIANTES: readonly VarianteReporte[] = ['comercio', 'servicios', 'alumnos', 'campo', 'personal'];

export function varianteDeReporte(
  ficha: Pick<FichaRubro, 'agendaDeAlumnos' | 'ciclosLargos' | 'secciones'>,
  tipoCuenta: TipoCuenta,
): VarianteReporte {
  if (tipoCuenta === 'personal') return 'personal';
  if (ficha.agendaDeAlumnos) return 'alumnos';
  if (ficha.ciclosLargos) return 'campo';
  if (ficha.secciones['/reparto']) return 'servicios';
  return 'comercio';
}
