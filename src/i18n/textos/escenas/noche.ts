/**
 * LA ESCENA DE LA NOCHE EN LA PORTADA (02/10/2026): el cierre del día de una
 * barbería, a tamaño real, con los tres números que suben y la tarjeta que
 * se enciende. Lo que la pantalla real del cierre dice (Entró, Salió,
 * Ganancia Neta, «contra el mismo día de la semana pasada», la racha, el
 * botón «Cerrar el día») NO se repite acá: la escena lo lee de `t.cierre` y
 * `t.racha`, así dice lo mismo que la app en los dos idiomas. Acá vive solo
 * lo propio de la escena: el título, el apoyo, los datos de ejemplo y el
 * resumen para el lector de pantalla.
 *
 * Mismo patrón que vitrina.ts: `nocheEs`, el tipo sale del español y el
 * portugués tiene que tener la misma forma. Sin importar nada en ejecución
 * (la prueba lo compila suelto). Sin `as const`. Los importes son NÚMEROS y
 * los formatea el componente con `dinero(n, 'PYG', true, locale)`, el mismo
 * formateador que `/cierre`.
 *
 * Los números cierran a la vista porque es un negocio de servicios: no hay
 * renglón de mercadería, así que entró − salió = ganancia neta (el cierre
 * real calcula ventas − costo de mercadería + otros ingresos − gastos).
 * El 11/08/2026 es martes, el día de la barbería de la vitrina.
 */
export const nocheEs = {
  etiqueta: 'A la noche · en comercio y servicios',
  /** El título entero; `tituloResaltado` es la parte que va en degradé menta y tiene que estar adentro, letra por letra. */
  titulo: 'Diez segundos y sabés cómo te fue.',
  tituloResaltado: 'Diez segundos',
  apoyo: 'Cuánto entró, cuánto salió y cuánto te quedó, comparado con el mismo día de la semana pasada.',
  negocio: 'Barbería Don Ramón',
  fecha: 'Martes, 11 de agosto',
  // entró − salió = ganancia (servicios: sin mercadería).
  entro: 1850000,
  salio: 250000,
  ganancia: 1600000,
  // En %, positivos: el componente arma «18 % más» con t.cierre.masQue.
  vsSemana: 18,
  vsPromedio: 9,
  estrella: { nombre: 'Corte y barba', importe: 850000 },
  racha: { dias: 5, mejor: 12 },
  /** aria-label de las tres pastillas-compás que se encienden cuando cada número termina de subir. */
  compas: 'Lo que la pantalla te dice',
  tocaCerrar: 'Tocá «Cerrar el día» como lo harías en tu celular.',
  /** Lo que anuncia aria-live al tocar el botón. */
  cerrado: 'Día cerrado. Nos vemos mañana.',
  resumen: 'El cierre del día de una barbería, con datos de ejemplo: entró Gs. 1.850.000, salió Gs. 250.000, ganancia neta Gs. 1.600.000, 18 % más que el mismo día de la semana pasada.',
  pausar: 'Pausar',
  seguir: 'Seguir',
  verDeNuevo: 'Ver de nuevo',
};

export type TextosNoche = typeof nocheEs;

export const nochePt: TextosNoche = {
  etiqueta: 'À noite · no comércio e nos serviços',
  titulo: 'Dez segundos e você sabe como foi.',
  tituloResaltado: 'Dez segundos',
  apoyo: 'Quanto entrou, quanto saiu e quanto sobrou, comparado com o mesmo dia da semana passada.',
  negocio: 'Barbearia Dom Ramón',
  fecha: 'Terça-feira, 11 de agosto',
  entro: 1850000,
  salio: 250000,
  ganancia: 1600000,
  vsSemana: 18,
  vsPromedio: 9,
  estrella: { nombre: 'Corte e barba', importe: 850000 },
  racha: { dias: 5, mejor: 12 },
  compas: 'O que a tela te mostra',
  tocaCerrar: 'Toque em «Fechar o dia» como faria no seu celular.',
  cerrado: 'Dia fechado. Até amanhã.',
  resumen: 'O fechamento do dia de uma barbearia, com dados de exemplo: entrou Gs. 1.850.000, saiu Gs. 250.000, lucro líquido Gs. 1.600.000, 18 % a mais que o mesmo dia da semana passada.',
  pausar: 'Pausar',
  seguir: 'Continuar',
  verDeNuevo: 'Ver de novo',
};
