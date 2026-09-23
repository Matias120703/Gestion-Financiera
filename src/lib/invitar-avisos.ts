/**
 * CUÁNDO SE LE OFRECE A ALGUIEN PRENDER LOS AVISOS (23/09).
 *
 * Matías: «cuando una persona crea su cuenta, al ingresar, le tiene que
 * aparecer la opción de activar notificaciones, o que ya esté activado».
 *
 * «Que ya esté activado» no se puede: ninguna web prende los avisos sola. El
 * permiso del teléfono lo da la persona con un toque, y el navegador no deja
 * ni preguntarlo sin ese toque. Lo que sí ya nace prendido es lo nuestro —las
 * preferencias de aviso (010)—; lo que faltaba era pedir el permiso en un
 * lugar donde alguien lo vea, y no escondido en Ajustes › Avisos.
 *
 * Todo lo que decide está acá, sin React ni navegador, para poder probarlo
 * con números (pruebas/invitar-avisos.test.js). El componente que la dibuja
 * es components/InvitarAvisos.tsx.
 *
 * LAS REGLAS
 *
 *   · Solo si hay algo que hacer: el permiso se puede pedir ('apagado'), o es
 *     un iPhone que primero tiene que agregar Orden a la pantalla de inicio.
 *     Bloqueado, sin soporte, sin configurar o ya prendido: nada que ofrecer.
 *   · Tres veces como mucho, y cada una a tres días de la anterior. Cuenta
 *     cada vez que APARECE, no cada «Ahora no»: quien la ignora yéndose de la
 *     pantalla también dijo que no, y la promesa es no insistir más de tres
 *     veces.
 *   · Si el navegador la bloqueó desde la hoja, no vuelve nunca.
 *   · Sin localStorage (modo privado, datos bloqueados), una vez por sesión y
 *     nada más: sin memoria no hay forma de contar los tres días, y ante la
 *     duda se pregunta menos.
 */

/** Lo que dice el navegador sobre los avisos. Ver lib/push-cliente.ts. */
export type EstadoPush =
  | 'cargando'
  | 'sin-configurar'
  | 'no-soportado'
  | 'iphone-sin-instalar'
  | 'bloqueado'
  | 'apagado'
  | 'encendido';

export const DIAS_ENTRE_INVITACIONES = 3;
export const MAXIMO_DE_INVITACIONES = 3;
const UN_DIA = 24 * 60 * 60 * 1000;

/** Dónde se guarda, en el navegador. Es de este aparato, como el permiso. */
export const CLAVE_INVITACION = 'orden-invitar-avisos';

export interface HistorialInvitacion {
  /** Cuántas veces apareció. */
  veces: number;
  /** Cuándo apareció la última vez (ms), o null si nunca. */
  ultima: number | null;
  /** Se bloqueó desde la hoja: no se vuelve a ofrecer. */
  nunca: boolean;
}

export const HISTORIAL_VACIO: HistorialInvitacion = { veces: 0, ultima: null, nunca: false };

/**
 * Lo guardado, leído sin confiar en nada: puede venir vacío, roto o de una
 * versión vieja. Cualquier cosa rara es «nunca se mostró», salvo que diga
 * `nunca`, que se respeta aunque lo demás esté roto.
 */
export function leerHistorialInvitacion(texto: string | null | undefined): HistorialInvitacion {
  if (!texto) return { ...HISTORIAL_VACIO };
  try {
    const crudo = JSON.parse(texto);
    if (!crudo || typeof crudo !== 'object') return { ...HISTORIAL_VACIO };
    const veces = Number.isFinite(crudo.veces) && crudo.veces > 0 ? Math.floor(crudo.veces) : 0;
    const ultima = Number.isFinite(crudo.ultima) && crudo.ultima > 0 ? Number(crudo.ultima) : null;
    return { veces, ultima, nunca: crudo.nunca === true };
  } catch {
    return { ...HISTORIAL_VACIO };
  }
}

/** Una aparición más, ahora. */
export function anotarInvitacion(h: HistorialInvitacion, ahora: number): HistorialInvitacion {
  return { ...h, veces: h.veces + 1, ultima: ahora };
}

/** El navegador quedó bloqueado desde la hoja: no se ofrece más. */
export function noVolverAInvitar(h: HistorialInvitacion): HistorialInvitacion {
  return { ...h, nunca: true };
}

/**
 * ¿Aparece ahora?
 *
 * `historial` es null cuando el navegador no deja guardar nada: entonces
 * manda `yaEnEstaSesion`, que es lo único que se puede recordar.
 */
export function debeInvitar({
  estado, historial, ahora, yaEnEstaSesion,
}: {
  estado: EstadoPush;
  historial: HistorialInvitacion | null;
  ahora: number;
  yaEnEstaSesion: boolean;
}): boolean {
  if (estado !== 'apagado' && estado !== 'iphone-sin-instalar') return false;
  // Una vez por sesión siempre: volver al panel diez veces en una tarde no
  // es diez veces la misma pregunta.
  if (yaEnEstaSesion) return false;
  if (!historial) return true;
  if (historial.nunca) return false;
  if (historial.veces >= MAXIMO_DE_INVITACIONES) return false;
  if (historial.ultima !== null && ahora - historial.ultima < DIAS_ENTRE_INVITACIONES * UN_DIA) return false;
  return true;
}

/**
 * QUÉ AVISOS LE LLEGAN DE VERDAD A ESTA PERSONA.
 *
 * La hoja dice por qué prenderlos con ejemplos, y un ejemplo que no llega es
 * una promesa rota. Esto sale de mirar quién recibe cada aviso hoy:
 *
 *   · cómo fue ayer / todavía no cargaste / cómo fue hoy (071, 076, 080):
 *     solo dueño y administradores, de cuentas personales o de rubros que
 *     cierran el día (comercio y servicios, `rubro_cierra_el_dia`);
 *   · la racha en riesgo (tareas/recordatorio): los mismos;
 *   · la prueba que se termina (071): dueño y administradores de cualquier
 *     cuenta, pero SOLO mientras está en prueba (pruebas_por_terminar filtra
 *     `estado = 'prueba'`). A una cuenta que ya pagó no le va a llegar, así
 *     que a ella no se le promete;
 *   · los turnos de mañana (043) y la reserva nueva por el link (046): TODO
 *     el equipo de una cuenta con agenda —el que atiende también avisa al
 *     cliente—. El profe y el trainer no tienen link público (089), así que
 *     a ellos solo les llega lo de mañana.
 *
 * El «plan activado» no se promete: hoy sale solo cuando la administración
 * activa a mano desde PanelAdmin (avisarActivacion), y el webhook de Stripe
 * no avisa nada. Quien paga con tarjeta no lo recibiría. Cuando el webhook
 * avise, se puede sumar a la lista.
 *
 * Null: a esta persona hoy no le llega ningún aviso (un vendedor de un
 * almacén, alguien del equipo de una cuenta personal o del campo, o el dueño
 * de un campo que ya pagó: lo único que le llegaba era el fin de la prueba).
 * No se le ofrece: pedirle el permiso para no mandarle nada es enseñarle que
 * nuestras preguntas no valen.
 */
export type CasoInvitacion =
  | 'negocio'        // comercio: el día (y la prueba, si está en prueba)
  | 'negocioAgenda'  // servicios: lo de arriba y además reservas y turnos
  | 'alumnos'        // clases y entrenamiento: las clases de mañana (y la prueba)
  | 'campo'          // ganadería y agricultura: solo el fin de la prueba
  | 'personal'       // cuenta personal: el día (y la prueba)
  | 'equipoAgenda'   // del equipo, con agenda y link: reservas y turnos
  | 'equipoAlumnos'; // del equipo del profe o del trainer: las clases de mañana

export function casoDeInvitacion({
  esPersonal, esAdmin, enPrueba, cierraElDia, tieneAgenda, agendaDeAlumnos,
}: {
  esPersonal: boolean;
  esAdmin: boolean;
  /** `suscripcion.en_prueba`: el único momento en que sale el fin de la prueba. */
  enPrueba: boolean;
  /** `secciones['/cierre']` de la ficha: el mismo corte que `rubro_cierra_el_dia`. */
  cierraElDia: boolean;
  tieneAgenda: boolean;
  /** Profe o trainer: agenda sin link público. */
  agendaDeAlumnos: boolean;
}): CasoInvitacion | null {
  if (esPersonal) return esAdmin ? 'personal' : null;
  if (esAdmin) {
    if (agendaDeAlumnos) return 'alumnos';
    if (cierraElDia) return tieneAgenda ? 'negocioAgenda' : 'negocio';
    // Al campo lo único que le llega es el fin de la prueba: ya pagado, nada.
    return enPrueba ? 'campo' : null;
  }
  if (!tieneAgenda) return null;
  return agendaDeAlumnos ? 'equipoAlumnos' : 'equipoAgenda';
}

/**
 * LA LISTA QUE SE LEE EN LA HOJA.
 *
 * `ejemplos` son los avisos que llegan pague o no pague; `prueba` es la línea
 * del fin de la prueba, que se suma solo si la cuenta sigue en prueba. Los
 * casos del equipo no la tienen: el fin de la prueba le llega al dueño y a
 * los administradores. El campo tampoco: `casoDeInvitacion` lo devuelve solo
 * en prueba, y su lista ya es esa línea.
 */
export function ejemplosDeInvitacion(
  tx: {
    ejemplos: Record<CasoInvitacion, readonly string[]>;
    prueba: Partial<Record<CasoInvitacion, string>>;
  },
  caso: CasoInvitacion,
  enPrueba: boolean,
): string[] {
  const linea = enPrueba ? tx.prueba[caso] : undefined;
  return linea ? [...tx.ejemplos[caso], linea] : [...tx.ejemplos[caso]];
}
