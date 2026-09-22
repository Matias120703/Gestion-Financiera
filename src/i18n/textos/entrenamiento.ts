import type { Parcial } from '../fusionar';
import type { Textos } from './es';

/**
 * LAS PALABRAS DEL PERSONAL TRAINER (097).
 *
 * El trainer usa las pantallas del profe tal cual: agendar a alguien con su
 * horario fijo, cobrarle el mes, marcar cada sesión. Pero no habla como un
 * profe. No tiene «alumnos» sino clientes, no da «clases» sino sesiones, y
 * no le «enseña» nada a nadie: trabaja con él piernas, fuerza o bajar de
 * peso.
 *
 * Esto NO es un diccionario entero: son solo las palabras que cambian, y se
 * pisan sobre el diccionario de siempre (ver i18n/jergas.ts). Lo que no está
 * acá se lee igual que para el profe, y está bien: «¿Ya te pagó?» o «Por
 * cobrar» se dicen igual en los dos oficios.
 *
 * Las notas del cliente se vuelven «Salud y lesiones»: es lo que un trainer
 * anota de cada persona, y lo que tiene que leer antes de empezar.
 */
export const entrenamientoEs: Parcial<Textos> = {
  inscribir: {
    titulo: 'Agendar a un cliente',
    boton: 'Agendar a un cliente',
    susClases: 'Sus sesiones',
    sinClases: 'Todavía no tiene sesiones agendadas.',
    alumno: 'Cliente',
    alumnoEjemplo: 'Nombre del cliente',
    faltaAlumno: 'Elegí o escribí el nombre del cliente.',
    materia: 'Qué están trabajando',
    materiaEjemplo: 'Piernas y glúteos, fuerza, bajar de peso…',
    salud: 'Salud y lesiones',
    saludEjemplo: 'Rodilla operada, sin saltos; presión alta…',
    resumen: (clases: number, horas: string) =>
      `${clases} ${clases === 1 ? 'sesión' : 'sesiones'} · ${horas} ${horas === '1' ? 'hora' : 'horas'} · total`,
    quedaPorCobrar: 'Queda por cobrar, y lo ves arriba de tus clientes hasta que te pague.',
    inscribir: 'Agendar',
    listo: (clases: number) => `Listo: ${clases} ${clases === 1 ? 'sesión' : 'sesiones'} en tu agenda.`,
    porCobrarDetalle: (n: number) => `${n} ${n === 1 ? 'cliente te debe' : 'clientes te deben'} su período`,
  },
  paquetes: {
    nombreEjemplo: '8 sesiones',
    clases: 'Cuántas sesiones',
    diUnaClase: 'Di una sesión',
    confirmarCerrar: (nombre: string) =>
      `¿Cerrar «${nombre}»? Las sesiones que quedan ya no se van a poder usar. Podés reabrirlo después.`,
    seCobraHoy: 'Cuenta entero como cobrado hoy, aunque las sesiones se den después.',
  },
  clientes: {
    notas: 'Salud y lesiones',
    notasEjemplo: 'Rodilla operada, sin saltos; presión alta…',
    // En su ficha, lo que viene y lo que pasó son sesiones, no turnos ni visitas.
    proximoTurno: 'Próxima sesión',
    // «Próxima sesión: ninguna», no «ninguno».
    ninguno: 'ninguna',
    turnos: 'Sesiones',
    sinTurnos: 'Todavía no tiene sesiones.',
    visitas: (n: number, cuando: string) => `${n} ${n === 1 ? 'sesión' : 'sesiones'} · la última ${cuando}`,
    turnoNoSeCancela: (cuando: string) => `Su sesión del ${cuando} no se cancela.`,
  },
  panel: {
    clasesDeHoy: 'Tus sesiones de hoy',
    sinClasesHoy: 'Hoy no tenés sesiones.',
    clasesDadas: (n: number) => `${n} ${n === 1 ? 'sesión dada' : 'sesiones dadas'}`,
    teDebenAlumnos: (n: number) => (n === 0 ? 'nadie te debe' : `${n} ${n === 1 ? 'cliente te debe' : 'clientes te deben'}`),
    alumnosActivos: 'Clientes activos',
  },
  agenda: {
    turnosDe: 'Sesiones del',
    sinTurnos: 'Sin sesiones para este día',
    sinTurnosProfe: 'Agendá a un cliente arriba y sus sesiones aparecen acá, en los días y horas que acordaron.',
    claseDada: 'Sesión dada',
    marcarDada: 'Sesión dada',
    marcarNoTenida: 'No se tuvo la sesión',
    preguntaDescontar: (nombre: string) =>
      `La sesión de ${nombre} no se tuvo. ¿Se la descontás del período?\n\nAceptar: sí, la pierde.\nCancelar: no, se la guardás.`,
    dictadoInscribir: 'Lo que dictaste ya está puesto: revisá los días, el período y el precio, y agendá.',
    empezarTitulo: 'Tu agenda de sesiones',
    empezarDetalle: 'Vos entrenás y lo que cobrás es todo tuyo: no hay equipo que armar ni comisiones que repartir. Empezá, y después agendá a cada cliente con sus días y su horario.',
  },
};

export const entrenamientoPt: Parcial<Textos> = {
  inscribir: {
    titulo: 'Agendar um cliente',
    boton: 'Agendar um cliente',
    susClases: 'Sessões dele',
    sinClases: 'Ainda não tem sessões agendadas.',
    alumno: 'Cliente',
    alumnoEjemplo: 'Nome do cliente',
    faltaAlumno: 'Escolha ou escreva o nome do cliente.',
    materia: 'O que estão trabalhando',
    materiaEjemplo: 'Pernas e glúteos, força, emagrecer…',
    salud: 'Saúde e lesões',
    saludEjemplo: 'Joelho operado, sem saltos; pressão alta…',
    resumen: (clases: number, horas: string) =>
      `${clases} ${clases === 1 ? 'sessão' : 'sessões'} · ${horas} ${horas === '1' ? 'hora' : 'horas'} · total`,
    quedaPorCobrar: 'Fica a receber, e você vê isso em cima dos seus clientes até ele pagar.',
    inscribir: 'Agendar',
    listo: (clases: number) => `Pronto: ${clases} ${clases === 1 ? 'sessão' : 'sessões'} na sua agenda.`,
    porCobrarDetalle: (n: number) => `${n} ${n === 1 ? 'cliente te deve' : 'clientes te devem'} o período`,
  },
  paquetes: {
    nombreEjemplo: '8 sessões',
    clases: 'Quantas sessões',
    diUnaClase: 'Dei uma sessão',
    confirmarCerrar: (nombre: string) =>
      `Fechar «${nombre}»? As sessões que restam não vão mais poder ser usadas. Você pode reabrir depois.`,
    seCobraHoy: 'Conta inteiro como recebido hoje, mesmo que as sessões sejam dadas depois.',
  },
  clientes: {
    notas: 'Saúde e lesões',
    notasEjemplo: 'Joelho operado, sem saltos; pressão alta…',
    proximoTurno: 'Próxima sessão',
    ninguno: 'nenhuma',
    turnos: 'Sessões',
    sinTurnos: 'Ainda não tem sessões.',
    visitas: (n: number, cuando: string) => `${n} ${n === 1 ? 'sessão' : 'sessões'} · a última ${cuando}`,
    turnoNoSeCancela: (cuando: string) => `A sessão de ${cuando} não é cancelada.`,
  },
  panel: {
    clasesDeHoy: 'Suas sessões de hoje',
    sinClasesHoy: 'Hoje você não tem sessões.',
    clasesDadas: (n: number) => `${n} ${n === 1 ? 'sessão dada' : 'sessões dadas'}`,
    teDebenAlumnos: (n: number) => (n === 0 ? 'ninguém te deve' : `${n} ${n === 1 ? 'cliente te deve' : 'clientes te devem'}`),
    alumnosActivos: 'Clientes ativos',
  },
  agenda: {
    turnosDe: 'Sessões de',
    sinTurnos: 'Sem sessões marcadas pra este dia',
    sinTurnosProfe: 'Agende um cliente acima e as sessões dele aparecem aqui, nos dias e horários que combinaram.',
    claseDada: 'Sessão dada',
    marcarDada: 'Sessão dada',
    marcarNoTenida: 'Não houve sessão',
    preguntaDescontar: (nombre: string) =>
      `A sessão de ${nombre} não aconteceu. Desconta do período?\n\nOK: sim, perde a sessão.\nCancelar: não, fica guardada.`,
    dictadoInscribir: 'O que você ditou já está preenchido: confira os dias, o período e o preço, e agende.',
    empezarTitulo: 'Sua agenda de sessões',
    empezarDetalle: 'Você treina e o que recebe é todo seu: não há equipe para montar nem comissões para dividir. Comece, e depois agende cada cliente com seus dias e horário.',
  },
};
