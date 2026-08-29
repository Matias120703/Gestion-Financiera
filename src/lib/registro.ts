/**
 * LO QUE SE PREGUNTA AL REGISTRARSE
 *
 * El registro tiene dos pantallas: primero quién es la persona, después el
 * correo y la contraseña. Este archivo guarda lo de la primera mientras se
 * pasa a la segunda.
 *
 * ¿Por qué hace falta guardarlo? Porque la empresa no se puede crear hasta
 * que exista la sesión, y la sesión no existe hasta después del correo y la
 * contraseña. Y si Supabase pide confirmar el correo, entre una pantalla y
 * la otra la persona se va a su bandeja de entrada y vuelve por un enlace,
 * que abre una pestaña nueva. Por eso es `localStorage` y no memoria: la
 * memoria no sobrevive a ese viaje y la persona tendría que contestar todo
 * de nuevo, que es cuando la gente abandona.
 *
 * No se guarda ni el correo ni la contraseña. Nada de esto es secreto —es lo
 * mismo que va a contar en cuanto entre— pero una contraseña en el disco del
 * navegador no se justifica nunca.
 */
import type { Rubro } from './tipos';

export type DatosRegistro = {
  tipoCuenta: 'emprendedor' | 'personal';
  rubro: Rubro;
  nombre: string;        // el del negocio o el de la cuenta personal
  moneda: string;
  miNombre: string;      // nombre y apellido de la persona
  telefono: string;
  seDedica: string;
  comoNosConocio: string;
};

export const REGISTRO_EN_CURSO = 'orden_registro';

export const DATOS_VACIOS: DatosRegistro = {
  tipoCuenta: 'emprendedor',
  rubro: 'comercio',
  nombre: '',
  moneda: 'PYG',
  miNombre: '',
  telefono: '',
  seDedica: '',
  comoNosConocio: '',
};

/**
 * De dónde llegó la persona.
 *
 * La lista es larga a propósito: si alguien llegó por ChatGPT y la única
 * opción parecida es «Otro», ese dato se pierde, y era justamente el que te
 * decía dónde poner el esfuerzo. Las dos últimas se traducen; las demás son
 * nombres propios y no se tocan.
 */
export const CANALES = [
  'TikTok', 'Instagram', 'Facebook', 'WhatsApp', 'YouTube',
  'LinkedIn', 'ChatGPT', 'Claude', 'Google',
] as const;

/** Guarda las respuestas del primer paso, por si el camino se corta. */
export function guardarPendiente(datos: DatosRegistro) {
  try {
    localStorage.setItem(REGISTRO_EN_CURSO, JSON.stringify(datos));
  } catch {
    // Navegador con el almacenamiento bloqueado. Se sigue igual: lo único
    // que se pierde es el atajo si la persona cierra la pestaña.
  }
}

export function leerPendiente(): DatosRegistro | null {
  try {
    const crudo = localStorage.getItem(REGISTRO_EN_CURSO);
    if (!crudo) return null;
    const datos = JSON.parse(crudo) as Partial<DatosRegistro>;
    if (!datos || typeof datos.nombre !== 'string') return null;
    return { ...DATOS_VACIOS, ...datos };
  } catch {
    return null;
  }
}

export function limpiarPendiente() {
  try {
    localStorage.removeItem(REGISTRO_EN_CURSO);
  } catch {
    // Nada que hacer.
  }
}

/** Solo los dígitos y el +, que es lo único que sirve para escribirle. */
export function telefonoLimpio(valor: string): string {
  return valor.replace(/[^0-9+]/g, '');
}

/**
 * Un teléfono vacío está bien; uno de tres dígitos no.
 *
 * No se valida el formato de cada país: Orden se usa en Paraguay, Argentina
 * y Brasil, y una expresión regular demasiado estricta terminaría rechazando
 * el número correcto de alguien. Con que tenga largo de teléfono alcanza.
 */
export function telefonoValido(valor: string): boolean {
  const limpio = telefonoLimpio(valor);
  return limpio === '' || limpio.replace(/\D/g, '').length >= 7;
}

/**
 * La zona horaria que informa el navegador, o Asunción si no la sabe.
 *
 * Decide qué día es «hoy» para el cierre y la racha: un negocio en São Paulo
 * con la hora de Asunción vería el cierre del día equivocado durante una hora
 * todas las noches. Se corrige en Ajustes.
 */
export function zonaDelNavegador(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Asuncion';
  } catch {
    return 'America/Asuncion';
  }
}
