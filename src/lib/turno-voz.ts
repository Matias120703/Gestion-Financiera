/**
 * DICTAR UN TURNO
 *
 * Del cuaderno del dueño: «Poder agendar un turno hablando». Se dice «Juan,
 * mañana a las tres, corte con Pedro» y el formulario de «Anotar un turno»
 * se completa solo. Quien reserva sigue siendo el formulario, con los
 * horarios libres de la base: lo dictado pasa por las mismas reglas que lo
 * cargado a mano, y un turno mal entendido se corrige antes de existir.
 *
 * Vive acá y no en la ruta por lo mismo que captura.ts: la ruta importa
 * next/server y no se puede probar suelta, y el prompt y el saneo son
 * exactamente lo que hay que poder probar.
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

/** Lo que la ruta le devuelve a la pantalla. */
export interface TurnoRespuesta extends TurnoDictado {
  /** El cliente ya cargado, solo si se lo reconoció sin ninguna duda. */
  cliente: { id: string; nombre: string; telefono: string } | null;
  transcripcion: string | null;
}

/** Esquema estricto: obliga al modelo a devolver exactamente esta forma. */
export const ESQUEMA_TURNO = {
  type: 'object',
  additionalProperties: false,
  required: [
    'cliente_nombre', 'cliente_telefono', 'fecha', 'hora',
    'servicio_id', 'profesional_id', 'confianza', 'aviso',
  ],
  properties: {
    cliente_nombre: { type: ['string', 'null'] },
    cliente_telefono: { type: ['string', 'null'] },
    fecha: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    hora: { type: ['string', 'null'], description: 'HH:MM, 24 horas' },
    servicio_id: { type: ['string', 'null'] },
    profesional_id: { type: ['string', 'null'] },
    confianza: { type: 'number' },
    aviso: { type: ['string', 'null'] },
  },
} as const;

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

export function instruccionesTurno(d: {
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

  return `Sos quien anota los turnos de un negocio de servicios en Paraguay: una peluquería, una barbería, un consultorio. Te dictan un turno —por teléfono, de memoria, apurado— y lo convertís en datos.

LOS PRÓXIMOS DÍAS (elegí la fecha SOLO de esta lista, nunca la calcules):
${calendario(d.hoy)}

SERVICIOS QUE SE RESERVAN:
${servicios}

EQUIPO:
${equipo}

REGLAS:

1. CLIENTE
   - "cliente_nombre": el nombre de quien viene, tal como lo dicen ("Juan", "Marta Benítez"). Sin "para", "turno" ni "el señor". Si no lo dicen, null.
   - "cliente_telefono": SOLO si dictan un número. Con dígitos y sin espacios: "cero nueve ocho uno, doscientos treinta y cuatro…" → "0981234…". Si no lo dicen, null. Nunca lo inventes.

2. FECHA — elegila de la lista de arriba.
   - "hoy", "mañana", "pasado mañana" → la que está marcada así.
   - "el jueves", "este jueves", "el jueves que viene" → el PRIMER jueves de la lista que no sea hoy.
   - "el 15", "el 15 de octubre" → esa fecha, si está en la lista. Si no está, null, y decilo en "aviso".
   - Si no dicen el día, null: la pantalla usa el día que se está mirando.

3. HORA — "HH:MM", 24 horas.
   - De 1 a 7 sin aclarar es de la TARDE: "a las tres" → "15:00", "a las 7" → "19:00".
   - De 8 a 11 sin aclarar es de la MAÑANA: "a las nueve" → "09:00".
   - "a las doce", "al mediodía" → "12:00".
   - "y media" suma 30, "y cuarto" suma 15, "menos cuarto" resta 15: "tres y media" → "15:30", "cinco menos cuarto" → "16:45".
   - "de la mañana", "de la tarde", "de la noche" mandan sobre todo lo anterior: "a las siete de la mañana" → "07:00".
   - Si no dicen la hora, null.

4. SERVICIO — el id EXACTO de la lista, aunque lo digan distinto ("corte" puede ser "Corte de pelo"; "la barba", "Barba"). Si no lo dicen, null. Si dicen uno que no está en la lista, null, y decilo en "aviso".

5. CON QUIÉN — el id EXACTO del equipo, solo si lo nombran ("con Pedro", "que lo atienda Pedro"). Si no lo nombran, null: no elijas a nadie por tu cuenta.

6. CONFIANZA (0 a 1)
   - 0.9+ si el nombre, el día, la hora y el servicio están claros.
   - Más baja si tuviste que suponer algo.
   - "aviso": una frase corta, en español rioplatense, con lo que no quedó claro. null si todo está claro.

7. Si lo que dicen no es un turno (una venta, un gasto, cualquier otra cosa), todo va en null, confianza 0, y en "aviso": "Eso no parece un turno."

Nunca inventes un dato que no esté en el mensaje.`;
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
