/**
 * ============================================================
 * LAS REGLAS DE /plan QUE SE PUEDEN PROBAR SIN DIBUJAR LA PANTALLA
 * ============================================================
 *
 * Revisión del 08/10/2026 sobre «cambiar de plan» (migración 130). Cuatro
 * cosas que la pantalla decidía con una línea suelta adentro de un
 * componente, y que estaban mal:
 *
 *   1. Con un formulario de pago abierto y dejado, escondía «Bajar…»,
 *      «Deshacer» y «Seguir con el…» hasta 40 minutos.
 *   2. El «Listo: …» de una tarjeta quedaba a la vista cuando la baja se
 *      cambiaba desde la OTRA tarjeta, diciendo lo contrario de lo que iba a
 *      pasar.
 *   3. A una cuenta vencida le desaparecía la tarjeta del plan que tenía si
 *      su rubro ya no lo ofrece, que era justo el plan donde entraba su
 *      equipo.
 *   4. Después de volver a cotizar, la hoja de subir seguía anunciando el
 *      cobro automático con la fecha del vencimiento anterior.
 *
 * Acá no se decide plata: qué se cobra y qué se puede hacer lo sigue
 * diciendo la base. Esto es qué se MUESTRA.
 *
 * Sin dependencias a propósito: lo compilan las pruebas con tsc suelto
 * (pruebas/bancard-fuentes.test.js lo corre) y lo importan una página del
 * servidor y componentes de navegador.
 */

/** Lo que hace falta saber de la operación sin terminar (`bancard_estado.viva`). */
export interface PagoSinTerminar {
  estado: string;
  medio: string;
}

/**
 * ¿HAY QUE ESPERAR ESE PAGO PARA PROGRAMAR O DESHACER UNA BAJA?
 *
 * Un formulario que la persona abrió y dejó ('formulario', 'creada') NO se
 * espera: nadie lo va a confirmar, vive media hora y la conciliación corre
 * cada diez minutos. Con el botón a la vista, la ruta le pregunta a Bancard
 * por ese formulario, lo cierra con la reversa (o lo activa, si estaba pago)
 * y recién ahí programa o deshace. Esconder el botón dejaba ese arreglo sin
 * nadie que lo dispare.
 *
 * Todo lo demás sí se espera: un cobro con la tarjeta guardada que el banco
 * puede estar procesando, un 3D Secure esperando a la persona, o un pago
 * que quedó incierto. Igual, la que decide es la base: si se toca el botón
 * con un pago que no se puede soltar, contesta «Hay un pago en curso».
 */
export function hayQueEsperarElPago(viva: PagoSinTerminar | null | undefined): boolean {
  if (!viva) return false;
  return !(viva.medio === 'formulario' && viva.estado === 'creada');
}

/** El «Listo: …» de un pie de tarjeta, y para qué estado de la baja se escribió. */
export interface AvisoDeBaja {
  texto: string;
  /** El valor de «programado» que este aviso anuncia (true: quedó programada; false: se deshizo). */
  para: boolean;
  /** La pantalla ya llegó a mostrar ese estado (volvió el refresco). */
  visto: boolean;
}

/**
 * EL «LISTO» NO VIVE MÁS QUE EL ESTADO QUE ANUNCIA.
 *
 * Cada tarjeta guarda su propio «Listo: …», y las dos se dibujan siempre
 * para que no se pierda cuando la pantalla se refresca. Pero la baja se
 * programa en la tarjeta del plan más bajo y se deshace también desde la del
 * plan actual («Seguir con el Pro»): el «Listo: desde la próxima renovación
 * tu plan es Básico» quedaba en verde al lado del botón «Bajar al Básico»,
 * con la baja ya deshecha y el próximo cobro otra vez en el Pro.
 *
 *   · Recién escrito, se muestra aunque la pantalla todavía no cambió (el
 *     refresco tarda un instante).
 *   · Cuando la pantalla muestra lo que anuncia, queda `visto`.
 *   · Si después la pantalla muestra OTRA cosa, alguien lo cambió desde otro
 *     lado: se borra (null), y no vuelve.
 *
 * Devuelve el mismo objeto cuando no cambia nada.
 */
export function avisoQueQueda(aviso: AvisoDeBaja | null, programado: boolean): AvisoDeBaja | null {
  if (!aviso) return null;
  if (aviso.para === programado) return aviso.visto ? aviso : { ...aviso, visto: true };
  return aviso.visto ? null : aviso;
}

/**
 * QUÉ TARJETAS DE PLAN SE VEN: las de su rubro, la del plan que está
 * pagando aunque su rubro ya no lo ofrezca (nunca se le quita nada a nadie),
 * y, con la cuenta VENCIDA, también la del plan que tenía.
 *
 * Lo último es de la revisión del 08/10: vencida, el plan «que está
 * pagando» ya no es ninguno, y a un profe que tenía el Pro con dos personas
 * le quedaba solo el Básico, que es para una. La base sí le acepta renovar
 * el plan que tenía (`precio_de_la_cuenta`, 124): faltaba mostrarlo.
 */
export function planesALaVista<P extends string>(
  todos: readonly P[],
  delRubro: readonly string[],
  pagado: P | null,
  vencido: P | null,
): P[] {
  return todos.filter((p) => delRubro.includes(p) || p === pagado || p === vencido);
}

/**
 * ¿ENTRA EL EQUIPO DE HOY EN ALGUNO DE LOS PLANES QUE LA CUENTA VE?
 *
 * Si no entra en ninguno, la tarjeta no puede decir «elegí un plan donde
 * entren todos»: no hay. Dice que escriba. `lugaresDe` contesta cuántas
 * personas admite cada plan (en el Premium, su tope).
 */
export function algunPlanAlcanza<P extends string>(planes: readonly P[], lugaresDe: (plan: P) => number, equipo: number): boolean {
  return planes.some((p) => equipo <= lugaresDe(p));
}

/**
 * ¿SE EXIGE QUE EL EQUIPO DE HOY ENTRE EN EL PLAN QUE SE PAGA? HOY, NO.
 *
 * Es la «decisión 4» de cambiar de plan (migración 130): no pagar por
 * Bancard un plan con menos lugares que el equipo. Matías la dejó APAGADA
 * el 08/10/2026: quien probó con 2 o 3 personas y deja vencer no podría
 * pagar el Básico con tarjeta, y con la cuenta vencida no tiene pantalla
 * para sacar gente del equipo. Se va a prender junto con esa pantalla.
 *
 * ESPEJO DE LA BASE. La llave de la base es la función
 * `public.pago_de_plan_exige_lugar` (supabase/migrations/130_cambiar_de_plan.sql):
 * apagada, su cuerpo empieza con `return;`. Las dos se cambian JUNTAS:
 *
 *   · false acá  ⇔  la función de la base empieza con `return;`
 *   · true acá   ⇔  una migración nueva la vuelve a definir sin esa línea
 *
 * Si se prende solo acá, la tarjeta dice «tu equipo no entra» y esconde un
 * botón que la base sí dejaría usar; si se prende solo en la base, el botón
 * se ofrece y termina en un error. pruebas/bancard-fuentes.test.js comprueba
 * que las dos digan lo mismo.
 *
 * La BAJA de plan no depende de esto: programar un plan más bajo exige
 * siempre que el equipo entre (BajaDePlan.tsx y `bancard_programar_plan`).
 *
 * Lleva el tipo `boolean` escrito a propósito: sin él TypeScript la toma
 * como «siempre false» y da por muerto lo que cuelga de ella.
 */
export const PAGO_DE_PLAN_EXIGE_LUGAR: boolean = false;

/**
 * ¿HAY QUE DECIR «TU EQUIPO NO ENTRA EN ESTE PLAN» EN VEZ DEL BOTÓN DE PAGAR?
 *
 * Solo si la decisión de arriba está prendida y el equipo de hoy es más
 * grande que los lugares del plan. Apagada, contesta siempre que no: a nadie
 * se le dice que su equipo no entra ni se le esconde un botón de pagar por
 * eso. `exige` existe para que las pruebas corran las dos posiciones.
 */
export function equipoNoEntraEnElPlan(equipo: number, lugares: number, exige: boolean = PAGO_DE_PLAN_EXIGE_LUGAR): boolean {
  return exige && equipo > lugares;
}

/**
 * Cuántos días antes del vencimiento sale el primer cobro automático.
 * Espejo de `bancard_dias_de_cobro()` en la base (125), que empieza en -1.
 */
export const DIAS_ANTES_DEL_PRIMER_COBRO = 1;

/**
 * ¿LA FECHA DEL COBRO AUTOMÁTICO QUE TRAE LA PANTALLA ES LA DE ESTE VENCIMIENTO?
 *
 * La hoja de subir de plan vuelve a cotizar justo antes de cobrar. Si en el
 * medio la cuenta se renovó, la cotización trae el vencimiento nuevo, pero
 * la fecha del cobro automático es la que la página leyó al dibujarse: la
 * hoja decía «Tu plan sigue venciendo el 9 de noviembre… El 8 de octubre se
 * cobra solo de tu Visa», un cobro que ya salió.
 *
 * El cobro automático nunca sale antes del día anterior al vencimiento (los
 * reintentos son después). Una fecha anterior a esa es de otro vencimiento:
 * no se muestra.
 *
 * `fechaDelDebito` es 'AAAA-MM-DD' (una fecha, no un instante);
 * `venceHasta` es el instante del vencimiento que dice la cotización, y se
 * mira en la zona de la cuenta, como hace la base.
 */
export function debitoSigueVigente(fechaDelDebito: string | null | undefined, venceHasta: string, zona: string): boolean {
  if (!fechaDelDebito) return false;
  const instante = new Date(venceHasta);
  if (Number.isNaN(instante.getTime())) return false;
  let vence: string;
  try {
    // 'en-CA' escribe AAAA-MM-DD.
    vence = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
  } catch {
    return false;
  }
  const [a, m, d] = vence.split('-').map(Number);
  if (!a || !m || !d) return false;
  const primerCobro = new Date(Date.UTC(a, m - 1, d - DIAS_ANTES_DEL_PRIMER_COBRO)).toISOString().slice(0, 10);
  return String(fechaDelDebito).slice(0, 10) >= primerCobro;
}
