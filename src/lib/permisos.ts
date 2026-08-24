import type { Rol } from './tipos';

/**
 * Espejo en TypeScript de lo que ya impone la base de datos.
 *
 * IMPORTANTE: esto es solo para la interfaz — para no mostrar botones que van
 * a fallar. La seguridad real está en PostgreSQL: RLS, triggers, funciones
 * transaccionales y privilegios por columna. Si alguien cambia este archivo,
 * no gana ningún permiso: los costos ni siquiera salen de la base para un
 * vendedor, llegan en null.
 */

export interface Permisos {
  vender: boolean;
  registrarGasto: boolean;
  registrarIngreso: boolean;
  anularPropioDelDia: boolean;
  anularCualquiera: boolean;
  gestionarProductos: boolean;   // crear, editar costo/precio/stock, pausar
  gestionarReto: boolean;
  gestionarEmpresa: boolean;     // nombre, moneda
  gestionarEquipo: boolean;      // ver código de invitación, cambiar roles
  verCodigoEquipo: boolean;
  /** Costo de compra, margen unitario y ganancia por producto. */
  verCostos: boolean;
  /** Ganancia bruta y neta, márgenes, costo de mercadería. */
  verRentabilidad: boolean;
  verReportesOperativos: boolean; // ventas, unidades, stock
  descargarExcel: boolean;        // el Excel trae costos: solo administración
  cambiarPlan: boolean;           // siempre false: lo decide el backend
}

export function permisosDe(rol: Rol): Permisos {
  const admin = rol === 'propietario' || rol === 'admin';
  return {
    vender: true,
    registrarGasto: true,
    registrarIngreso: true,
    anularPropioDelDia: true,
    anularCualquiera: admin,
    gestionarProductos: admin,
    gestionarReto: admin,
    gestionarEmpresa: admin,
    gestionarEquipo: admin,
    verCodigoEquipo: admin,
    verCostos: admin,
    verRentabilidad: admin,
    verReportesOperativos: true,
    descargarExcel: admin,
    cambiarPlan: false,
  };
}

export const NOMBRE_ROL: Record<Rol, string> = {
  propietario: 'Propietario',
  admin: 'Administrador',
  vendedor: 'Vendedor',
};

/** ¿Este movimiento lo puede anular esta persona? Misma regla que la RPC. */
export function puedeAnular(
  { rol, userId }: { rol: Rol; userId: string },
  movimiento: { creado_por: string | null; fecha: string; estado: string },
  hoy: string,
): boolean {
  if (movimiento.estado === 'anulado') return false;
  if (permisosDe(rol).anularCualquiera) return true;
  return movimiento.creado_por === userId && movimiento.fecha === hoy;
}
