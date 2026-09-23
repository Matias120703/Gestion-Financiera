/**
 * TEXTOS DE RUTINAS (098): la página que abre el cliente del trainer desde WhatsApp (/rutina/[token]).
 *
 * Van en su propio archivo para que cada pantalla del módulo del trainer
 * tenga el suyo, en español y en portugués a la vez. El diccionario los
 * incluye como `t.rutinaPublica` (ver es.ts y pt.ts). El portugués se escribe con
 * el tipo del español: si falta una clave, no compila.
 *
 * Quien lee esto es el cliente del trainer, en el gimnasio y con el
 * celular en una mano: frases cortas y nada de palabras de Orden. Las
 * palabras que también usa el texto para WhatsApp («series», «Carga»,
 * «Descanso», «Copiar como texto») están en `t.rutinasComun` y se toman de
 * ahí, para que la página y el texto copiado digan lo mismo.
 *
 * El título y la descripción de la vista previa son genéricos a propósito:
 * WhatsApp los muestra a todo el chat, también en un grupo, y ahí no va el
 * nombre del cliente.
 */
export const rutinaPublicaEs = {
  metaTitulo: (negocio: string) => `Tu rutina · ${negocio}`,
  metaTituloSolo: 'Tu rutina',
  metaDescripcion: 'Abrila para ver tus ejercicios.',
  /** El nombre del ícono si la guarda en la pantalla de inicio (manifest y iPhone). */
  nombreApp: 'Mi rutina',

  hola: (nombre: string) => (nombre ? `Hola, ${nombre}` : 'Hola'),
  /** «Desde el 15/09 · actualizada el 20/09». Cualquiera de las dos puede faltar. */
  fechas: (desde: string | null, actualizada: string | null) => {
    if (desde && actualizada) return `Desde el ${desde} · actualizada el ${actualizada}`;
    if (desde) return `Desde el ${desde}`;
    if (actualizada) return `Actualizada el ${actualizada}`;
    return '';
  },
  indicaciones: 'Indicaciones',
  diasDeLaRutina: 'Días de tu rutina',
  paraEsteDia: 'Para este día',
  hechosHoy: (hechos: number, total: number) => `${hechos} de ${total} hechos hoy`,
  sinEjercicios: 'Este día todavía no tiene ejercicios.',
  hacelosSeguidos: 'Hacelos seguidos',
  sinDescanso: 'Sin descanso',
  comoSeHace: 'Cómo se hace',
  marcarHecho: 'Marcar como hecho',
  hecho: 'Hecho',
  /** El nombre del botón para un lector de pantalla; si ya está hecho lo dice `aria-pressed`. */
  marcarAria: (ejercicio: string) => `Marcar como hecho: ${ejercicio}`,
  listoPorHoy: '¡Listo por hoy! Buen entrenamiento.',
  tildesSoloAca: 'Lo que marcás queda solo en este celular y se borra al otro día.',
  noSePudoCopiar: 'No se pudo copiar solo: mantené apretado el texto para copiarlo.',
  siempreAlDia: 'Este link siempre muestra tu rutina al día: guardá el mensaje.',

  // Los estados sin rutina. Un link apagado, cambiado, que no existe o de
  // un cliente archivado se ven IGUAL: distinguirlos le diría a quien
  // prueba links cuál existió.
  inactivoTitulo: 'Este link ya no está activo.',
  inactivoTexto: 'Pedile uno nuevo a tu entrenador.',
  preparando: 'Tu entrenador está preparando tu rutina.',
  preparandoTexto: 'Cuando esté lista, la vas a ver en este mismo link.',
  renovar: 'Tu entrenador tiene que renovar su cuenta de Orden para que puedas ver tu rutina.',
  errorTitulo: 'No pudimos cargar tu rutina.',
  errorTexto: 'Revisá la señal y probá de nuevo.',
  reintentar: 'Probar de nuevo',
  cargando: 'Cargando…',
  pie: 'Rutinas con Orden',
};

export const rutinaPublicaPt: typeof rutinaPublicaEs = {
  metaTitulo: (negocio: string) => `Seu treino · ${negocio}`,
  metaTituloSolo: 'Seu treino',
  metaDescripcion: 'Abra para ver seus exercícios.',
  nombreApp: 'Meu treino',

  hola: (nombre: string) => (nombre ? `Olá, ${nombre}` : 'Olá'),
  fechas: (desde: string | null, actualizada: string | null) => {
    if (desde && actualizada) return `Desde ${desde} · atualizado em ${actualizada}`;
    if (desde) return `Desde ${desde}`;
    if (actualizada) return `Atualizado em ${actualizada}`;
    return '';
  },
  indicaciones: 'Orientações',
  diasDeLaRutina: 'Dias do seu treino',
  paraEsteDia: 'Para este dia',
  hechosHoy: (hechos: number, total: number) => `${hechos} de ${total} feitos hoje`,
  sinEjercicios: 'Este dia ainda não tem exercícios.',
  hacelosSeguidos: 'Faça em sequência',
  sinDescanso: 'Sem descanso',
  comoSeHace: 'Como se faz',
  marcarHecho: 'Marcar como feito',
  hecho: 'Feito',
  marcarAria: (ejercicio: string) => `Marcar como feito: ${ejercicio}`,
  // «Bom treino» se dice antes de entrenar, no al terminar.
  listoPorHoy: 'Treino do dia concluído! Mandou bem.',
  tildesSoloAca: 'O que você marca fica só neste celular e some no dia seguinte.',
  noSePudoCopiar: 'Não deu para copiar sozinho: segure o dedo no texto para copiar.',
  siempreAlDia: 'Este link sempre mostra o seu treino atualizado: guarde a mensagem.',

  inactivoTitulo: 'Este link não está mais ativo.',
  inactivoTexto: 'Peça um novo ao seu treinador.',
  preparando: 'Seu treinador está preparando o seu treino.',
  preparandoTexto: 'Quando estiver pronto, você vai vê-lo neste mesmo link.',
  renovar: 'Seu treinador precisa renovar a conta no Orden para você poder ver o seu treino.',
  errorTitulo: 'Não conseguimos carregar o seu treino.',
  errorTexto: 'Verifique o sinal e tente de novo.',
  reintentar: 'Tentar de novo',
  cargando: 'Carregando…',
  pie: 'Treinos com Orden',
};
