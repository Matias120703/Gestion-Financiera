/**
 * LOS TURNOS DICTADOS
 *
 * Del cuaderno del dueño: «Poder agendar un turno hablando». Y después, más
 * claro todavía: que sea en el micrófono de siempre, el mismo de las ventas
 * y los gastos, no en uno aparte adentro de la agenda.
 *
 * Se dice «Juan, mañana a las tres, corte con Pedro» y se abre la agenda con
 * el formulario de «Anotar un turno» completo. Quien reserva sigue siendo ese
 * formulario, con los horarios libres de la base: lo dictado pasa por las
 * mismas reglas que lo cargado a mano, y un turno mal entendido se corrige
 * antes de existir.
 *
 * Acá vive lo que se puede probar sin servidor: el calendario y las reglas
 * que se le dan al modelo, y el saneo de lo que devuelve.
 *
 * Este archivo NO importa nada del servidor a propósito.
 */

export type ServicioDictable = { id: string; nombre: string; duracion_min: number };
export type ProfesionalDictable = { id: string; nombre: string };

/** Lo que se entendió. Todo puede faltar: lo que falta se elige a mano. */
export interface TurnoDictado {
  cliente_nombre: string | null;
  /** Solo dígitos. */
  cliente_telefono: string | null;
  /** YYYY-MM-DD. */
  fecha: string | null;
  /** HH:MM, 24 horas, en la hora del negocio. */
  hora: string | null;
  servicio_id: string | null;
  profesional_id: string | null;
  confianza: number;
  aviso: string | null;
}

/** Lo que llega a la agenda. */
export interface TurnoRespuesta extends TurnoDictado {
  /** El cliente ya cargado, solo si se lo reconoció sin ninguna duda. */
  cliente: { id: string; nombre: string; telefono: string } | null;
  transcripcion: string | null;
}

/**
 * Cómo viaja lo dictado desde el micrófono hasta la agenda: por
 * sessionStorage, más un aviso por si la agenda ya estaba abierta. No por la
 * URL, porque lleva el nombre y el teléfono de un cliente, y una URL queda en
 * el historial y en los registros del servidor.
 */
export const CLAVE_TURNO_DICTADO = 'orden:turno-dictado';
export const EVENTO_TURNO_DICTADO = 'orden:turno-dictado';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Las cuentas del calendario van en UTC a propósito: una fecha YYYY-MM-DD no
// tiene hora, y hacerlas en la zona del servidor corre el día cerca de la
// medianoche.
function sumar(fecha: string, n: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

function diaDeSemana(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/**
 * Los próximos días con su nombre, ya calculados.
 *
 * Un modelo de lenguaje es malo haciendo cuentas con el calendario: «el
 * jueves» dicho un martes 29 le puede dar el 31 o el 1. No se le pide que
 * calcule: se le da la lista y se le pide que elija de ahí.
 */
export function calendario(hoy: string, dias = 15): string {
  return Array.from({ length: dias }, (_, n) => {
    const f = sumar(hoy, n);
    const marca = n === 0 ? ' (hoy)' : n === 1 ? ' (mañana)' : n === 2 ? ' (pasado mañana)' : '';
    return `- ${DIAS[diaDeSemana(f)]} ${f}${marca}`;
  }).join('\n');
}

/**
 * Lo que el modelo necesita para entender un turno, dentro de las
 * instrucciones de la captura: los próximos días ya calculados, qué se
 * reserva, quién atiende y cómo se leen las horas.
 */
export function bloqueTurnos(d: {
  hoy: string;
  servicios: ServicioDictable[];
  profesionales: ProfesionalDictable[];
}): string {
  const servicios = d.servicios.length
    ? d.servicios.slice(0, 60).map((s) => `- ${s.nombre} | id=${s.id} | dura ${s.duracion_min} min`).join('\n')
    : '(no hay servicios para reservar)';
  const equipo = d.profesionales.length
    ? d.profesionales.slice(0, 40).map((p) => `- ${p.nombre} | id=${p.id}`).join('\n')
    : '(no hay nadie en el equipo)';

  return `TURNOS — "turno" es anotar un turno a futuro para alguien. NO es una venta: todavía no se cobró nada.
   - "Juan, mañana a las tres, corte con Pedro"                 → turno
   - "anotame a Marta el jueves a las 10 para color"            → turno
   Si ya lo atendió y cobró ("le hice un corte a Juan, 50 mil"), es una VENTA, no un turno.

   LOS PRÓXIMOS DÍAS (elegí la fecha SOLO de esta lista, nunca la calcules):
${calendario(d.hoy)}

   SERVICIOS QUE SE RESERVAN:
${servicios}

   EQUIPO:
${equipo}

   En "turno":
   - "contraparte": el nombre de quien viene, tal como lo dicen ("Juan", "Marta Benítez"). Sin "para", "turno" ni "el señor".
   - "turno.telefono": SOLO si dictan un número, con dígitos y sin espacios. Si no, null. Nunca lo inventes.
   - "turno.fecha": de la lista de arriba. "hoy", "mañana", "pasado mañana" → la marcada así. "el jueves", "este jueves", "el jueves que viene" → el PRIMER jueves de la lista que no sea hoy. Si no dicen el día, null.
   - "turno.hora": "HH:MM", 24 horas.
     · De 1 a 7 sin aclarar es de la TARDE: "a las tres" → "15:00", "a las 7" → "19:00".
     · De 8 a 11 sin aclarar es de la MAÑANA: "a las nueve" → "09:00".
     · "a las doce", "al mediodía" → "12:00".
     · "y media" suma 30, "y cuarto" suma 15, "menos cuarto" resta 15: "tres y media" → "15:30".
     · "de la mañana", "de la tarde", "de la noche" mandan sobre todo lo anterior.
     · Si no dicen la hora, null.
   - "turno.servicio_id": el id EXACTO de la lista de servicios, aunque lo digan distinto ("corte" puede ser "Corte de pelo"). Si no lo dicen o no está, null; si dijeron uno que no está, decilo en "aviso".
   - "turno.profesional_id": el id EXACTO del equipo, solo si lo nombran ("con Pedro"). Si no, null: no elijas a nadie por tu cuenta.
   - "monto" va en 0 e "items" vacío.`;
}

/**
 * ¿Es el mismo nombre? Sin tildes, sin mayúsculas y sin espacios de más: la
 * transcripción escribe «Martin» y la ficha dice «Martín».
 */
export function mismoNombre(a: string, b: string): boolean {
  const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  return limpio(a) !== '' && limpio(a) === limpio(b);
}

/**
 * Nada de lo que devolvió el modelo llega a la pantalla sin pasar por acá.
 *
 * Un id que no es de este negocio se descarta, igual que en la captura: sin
 * esto, un servicio inventado viajaría hasta el formulario. Una hora
 * imposible, una fecha mal escrita o una que ya pasó, tampoco pasan.
 */
export function sanearTurno(
  datos: unknown,
  ctx: { hoy: string; servicios: ServicioDictable[]; profesionales: ProfesionalDictable[] },
): TurnoDictado {
  const d: any = datos && typeof datos === 'object' ? datos : {};
  const avisos: string[] = [];
  if (typeof d.aviso === 'string' && d.aviso.trim()) avisos.push(d.aviso.trim().slice(0, 200));

  const nombre = typeof d.cliente_nombre === 'string' ? d.cliente_nombre.trim().slice(0, 80) : '';
  const digitos = typeof d.cliente_telefono === 'string' ? d.cliente_telefono.replace(/\D/g, '') : '';

  let fecha: string | null = typeof d.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? d.fecha : null;
  if (fecha && fecha < ctx.hoy) {
    avisos.push('La fecha que entendí ya pasó. Elegí el día.');
    fecha = null;
  }

  const h = typeof d.hora === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(d.hora.trim()) : null;
  const hora = h && Number(h[1]) < 24 && Number(h[2]) < 60 ? `${h[1].padStart(2, '0')}:${h[2]}` : null;

  const deLaLista = (id: unknown, lista: { id: string }[]) =>
    typeof id === 'string' && lista.some((x) => x.id === id) ? id : null;

  return {
    cliente_nombre: nombre || null,
    // Menos de seis dígitos no es un teléfono: es un número a medio dictar.
    cliente_telefono: digitos.length >= 6 ? digitos.slice(0, 20) : null,
    fecha,
    hora,
    servicio_id: deLaLista(d.servicio_id, ctx.servicios),
    profesional_id: deLaLista(d.profesional_id, ctx.profesionales),
    confianza: Math.min(1, Math.max(0, Number(d.confianza) || 0)),
    aviso: avisos.length ? avisos.join(' ') : null,
  };
}
