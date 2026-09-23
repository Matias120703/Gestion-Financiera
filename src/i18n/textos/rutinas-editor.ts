/**
 * TEXTOS DE RUTINAS (098): el editor de rutinas (/rutinas/[id]).
 *
 * Van en su propio archivo para que cada pantalla del módulo del trainer
 * tenga el suyo, en español y en portugués a la vez. El diccionario los
 * incluye como `t.rutinasEditor` (ver es.ts y pt.ts). El portugués se escribe con
 * el tipo del español: si falta una clave, no compila.
 *
 * El editor es del rubro entrenamiento: habla de «cliente» y de «sesión»,
 * nunca de «alumno» ni de «clase». Lo que dice «lo ve el cliente» está
 * escrito a propósito al lado de cada campo que termina en su link.
 *
 * Las palabras de la carga (kg, lb, Placa, Peso corporal) y de los grupos
 * de ejercicio están en `t.rutinasComun`: acá va solo lo del editor.
 */
import type { EstadoRutina } from '../../lib/tipos-rutinas';

/** «A», «B»… la letra de cada día, como se dice en el gimnasio. */
const letra = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String(i + 1));

export const rutinasEditorEs = {
  /** La barra de arriba del editor. */
  barra: {
    volver: 'Volver',
    estados: {
      plantilla: 'Plantilla',
      vigente: 'Rutina vigente',
      borrador: 'Próxima rutina',
      anterior: 'Rutina terminada',
    } satisfies Record<EstadoRutina, string>,
    nueva: {
      plantilla: 'Plantilla nueva',
      vigente: 'Rutina nueva',
      borrador: 'Próxima rutina',
      anterior: 'Rutina nueva',
    } satisfies Record<EstadoRutina, string>,
    de: (nombre: string) => `de ${nombre}`,
    sinTitulo: 'Sin nombre todavía',
    guardar: 'Guardar',
    guardando: 'Guardando…',
    sinGuardar: 'sin guardar',
    /** Después de guardar una que ya existía: el editor se queda abierto. */
    guardada: 'Guardada.',
    volverAPlantillas: 'Volver a plantillas',
  },

  /** Los avisos de arriba. */
  avisos: {
    salud: (nombre: string) => `Salud y lesiones de ${nombre}`,
    saludNoSeCopia: (nombre: string) =>
      `Esto no se copia a la rutina y ${nombre} no lo ve. Si importa para un ejercicio, escribilo en su nota.`,
    vigente: (nombre: string) =>
      `${nombre} ve estos cambios apenas guardás. Para cambios grandes, armá la próxima.`,
    irALaCarpeta: 'Ir a su carpeta',
    borrador: (nombre: string) =>
      `Es la próxima rutina de ${nombre}: todavía no la ve. Cuando esté lista, activala desde su carpeta.`,
    plantilla: 'Es una plantilla: no la ve nadie. Al usarla para un cliente se copia, y esta queda igual.',
    nuevaVigente: (nombre: string) => `Al guardarla, ${nombre} ya la puede ver en su link.`,
    seGuardaEnElCelular: 'Hasta que guardes, lo que cambiás queda en este celular.',
  },

  /** Una rutina que ya terminó no se edita. */
  terminada: {
    titulo: 'Esta rutina ya terminó',
    detalle: 'Queda como historia y no se cambia. Para usarla de nuevo, armá la próxima a partir de ella desde la carpeta.',
    ir: 'Ir a la carpeta',
  },

  /** «Recuperar lo que no guardaste». */
  recuperar: {
    titulo: 'Tenés cambios sin guardar',
    cuando: (fecha: string) => `Quedaron en este celular el ${fecha}.`,
    cambioDespues: 'Ojo: después alguien guardó esta rutina. Si recuperás y guardás, pisás esos cambios.',
    /** Con la versión de la que se partió: lo que no tocaste sale de la nueva (ver `mezclar`). */
    cambioDespuesSeJunta:
      'Ojo: después alguien guardó esta rutina (por ejemplo, subió una carga desde la agenda). Al recuperar, lo que no tocaste queda como lo guardó esa persona y se suma lo tuyo. Si los dos cambiaron lo mismo, queda lo tuyo: revisalo antes de guardar.',
    boton: 'Recuperar lo que no guardaste',
    descartar: 'Descartar',
  },

  /** Armar la próxima partiendo de la que tiene ahora. */
  partir: {
    titulo: (rutina: string) => `¿Partís de la rutina actual, «${rutina}»?`,
    detalle: 'Se copian acá sus días y ejercicios para que cambies lo que haga falta. La actual sigue igual hasta que actives esta.',
    boton: 'Copiar sus días',
  },

  /** Recién copiada (de una plantilla, de otro cliente o de una anterior): la base la dejó como su próxima. */
  copia: {
    titulo: 'Copiada como su próxima rutina',
    detalle: (nombre: string) => `${nombre} no la ve hasta que la actives desde su carpeta: revisala con calma y guardá lo que cambies.`,
    detalleSinNombre: 'No se ve en ningún link hasta que la actives desde la carpeta del cliente.',
    conNotas: 'Vinieron las notas de la original: revisalas antes de activarla, porque las ve el cliente.',
    /** La base le puso «Rutina» de respaldo, en español: en portugués se pide un nombre. */
    sinNombre: 'Al copiarla, el nombre quedó vacío: ponele uno antes de guardar.',
  },

  /** Nombre, indicaciones y semanas. */
  datos: {
    titulo: 'Nombre, indicaciones y semanas',
    cambiar: 'Cambiar',
    resumen: (semanas: number | null, conIndicaciones: boolean) =>
      `${semanas ? `Cambiarla en ${semanas} ${semanas === 1 ? 'semana' : 'semanas'}` : 'Sin fecha para cambiarla'}`
      + ` · ${conIndicaciones ? 'con indicaciones' : 'sin indicaciones'}`,
    nombre: 'Nombre de la rutina',
    nombreEjemplo: 'Ej.: Fuerza base',
    /** El nombre que se usa si se guarda sin ponerle uno. */
    nombrePorDefecto: 'Rutina',
    plantillaPorDefecto: 'Plantilla nueva',
    loVeElCliente: 'Lo ve el cliente',
    loVe: (nombre: string) => `Lo ve ${nombre}`,
    notas: 'Indicaciones generales',
    notasEjemplo: 'Ej.: Tomá agua entre series. Si algo duele, pará y avisame.',
    semanas: 'Cambiarla en',
    semanasNo: 'Sin fecha',
    semanasN: (n: number) => `${n} sem.`,
    semanasOtra: 'Otra',
    semanasUnidad: (n: number) => (n === 1 ? 'semana' : 'semanas'),
    semanasAyuda: 'Es solo un aviso para vos: cuando se cumplan, te recordamos cambiarla.',
  },

  /** Los días. */
  dias: {
    titulo: 'Días',
    porDefecto: (i: number) => `Día ${letra(i)}`,
    agregar: '+ Día',
    ejercicios: (n: number) => (n === 1 ? '1 ejercicio' : `${n} ejercicios`),
    nombre: 'Nombre del día',
    nombreEjemplo: 'Ej.: Día A · Piernas',
    notas: 'Entrada en calor y vuelta a la calma',
    notasEjemplo: 'Ej.: 10 min de bici suave y movilidad de cadera',
    agregarNotas: '+ Entrada en calor',
    opciones: 'Opciones del día',
    antes: 'Mover antes',
    despues: 'Mover después',
    duplicar: 'Duplicar',
    borrar: 'Borrar día',
    copia: (nombre: string) => `${nombre} (copia)`,
    borrarPregunta: (nombre: string) => `¿Borrar «${nombre}»?`,
    borrarDetalle: (n: number) =>
      (n === 1 ? 'Tiene 1 ejercicio, que se borra con el día.' : `Tiene ${n} ejercicios, que se borran con el día.`),
    siBorrar: 'Sí, borrarlo',
    vacio: 'Todavía no hay ejercicios en este día.',
    vacioDetalle: 'Escribilos abajo, uno por renglón, o pegá la rutina que ya tenés.',
    lleno: 'Este día ya tiene 30 ejercicios, el máximo.',
  },

  /** La tarjeta de cada ejercicio. */
  tarjeta: {
    editar: (nombre: string) => `Editar ${nombre}`,
    subir: 'Subir',
    bajar: 'Bajar',
    mas: 'Más opciones',
    junto: 'Junto al anterior',
    separar: 'Separar del anterior',
    duplicar: 'Duplicar',
    quitar: 'Quitar',
    sinUnidad: '¿kg o lb?',
  },

  /** El renglón rápido al pie de cada día. */
  renglon: {
    etiqueta: 'Agregar rápido',
    ejemplo: 'Press banca 4x10 40kg 90s',
    agregar: 'Agregar',
    ayuda: 'Nombre, series x repeticiones, carga con su unidad y descanso. Enter y queda.',
    vista: 'Queda así:',
    noEntendi: 'No encontré el nombre del ejercicio. Empezá por el nombre: «Sentadilla 4x10 40kg».',
    sinUnidad: '¿kg o lb? Escribí la unidad («40kg», «25lb»): un número solo se puede leer mal.',
    conDetalle: '+ Con más detalle',
    pegarTexto: 'Pegar texto',
  },

  /** La hoja para agregar o editar un ejercicio. */
  hoja: {
    nuevo: 'Nuevo ejercicio',
    editar: 'Editar ejercicio',
    nombre: 'Ejercicio',
    nombreEjemplo: 'Ej.: Sentadilla con barra',
    deTuLista: 'de tu lista',
    nuevoEnTuLista: 'Es nuevo: se suma a tu lista de ejercicios.',
    faltaNombre: 'Escribí el nombre del ejercicio.',
    series: 'Series',
    menos: 'Una serie menos',
    mas: 'Una serie más',
    reps: 'Repeticiones',
    repsEjemplo: 'Ej.: 10, 8-12, 45 s',
    atajosReps: ['8-10', '10-12', '12-15', '15', '20', '30 s', 'al fallo'],
    carga: 'Carga',
    cargaEjemplo: 'Ej.: 40 kg, placa 7, banda roja',
    cargaAyuda: 'Tocá la unidad: nunca se agrega sola.',
    cargaPrimeroNumero: 'Escribí primero el número, y después tocá la unidad.',
    descanso: 'Descanso',
    sinDescanso: 'Sin',
    segundos: (n: number) => `${n} s`,
    minutos: (n: number) => `${n} min`,
    descansoOtro: 'Otro',
    descansoEjemplo: 'Ej.: 45 o 1:30',
    descansoEs: (valor: string) => `= ${valor}`,
    descansoNoEntendi: 'No entendí el descanso: escribí segundos (45) o minutos (1:30), hasta 15 minutos.',
    nota: 'Nota',
    notaEjemplo: 'Ej.: Bajá lento, en 3 segundos',
    notaAyuda: 'La ve el cliente.',
    junto: 'Junto al anterior (superserie)',
    juntoAyuda: 'Se hacen seguidos, sin descanso entre los dos.',
    guardarYOtro: 'Guardar y otro',
    agregar: 'Agregar',
    listo: 'Listo',
    quitar: 'Quitar ejercicio',
    agregado: (nombre: string) => `Agregado: ${nombre}`,
  },

  /** «Pegar texto». */
  pegar: {
    titulo: 'Pegar texto',
    explicacion: 'Pegá la rutina como la tenés en Notas, en WhatsApp o en una planilla. Antes de usarla te mostramos lo que entendimos.',
    campo: 'Tu rutina',
    ejemplo: 'Día A · Piernas\nSentadilla 4x10 40kg 90s\nEstocadas 3x12 c/lado\n\nDía B · Torso\nPress banca 4x8-10 30kg 2 min',
    entendi: (dias: number, ejercicios: number) =>
      `Entendí ${dias === 1 ? '1 día' : `${dias} días`} y ${ejercicios === 1 ? '1 ejercicio' : `${ejercicios} ejercicios`}.`,
    nada: 'Todavía no encontré ningún ejercicio.',
    nombre: 'Nombre:',
    notas: 'Indicaciones generales',
    noEntendi: 'Estos renglones no los entendí y no se usan:',
    nuevos: (n: number) =>
      (n === 1 ? '1 ejercicio nuevo se suma a tu lista.' : `${n} ejercicios nuevos se suman a tu lista.`),
    reemplazar: 'Reemplazar mis días',
    agregar: 'Agregar a mis días',
    usar: 'Usar esta rutina',
    demasiadosDias: (n: number) => `Quedarían ${n} días, y el máximo es 10.`,
    demasiadosEjercicios: (dia: string) => `«${dia}» tiene más de 30 ejercicios: partilo en dos días.`,
  },

  /** Lo que frena antes de guardar. */
  problemas: {
    sinEjercicios: 'Agregá al menos un ejercicio antes de guardar.',
    muchosDias: 'Una rutina tiene hasta 10 días.',
    muchosEjercicios: (dia: string) => `«${dia}» tiene más de 30 ejercicios, el máximo.`,
    sinNombre: (dia: string) => `En «${dia}» hay un ejercicio sin nombre.`,
    cargaLarga: (ejercicio: string) => `La carga de «${ejercicio}» es muy larga: hasta 24 letras.`,
    repsLargas: (ejercicio: string) => `Las repeticiones de «${ejercicio}» son muy largas: hasta 20 letras.`,
    recargar: 'Recargar',
    choqueAyuda: 'Lo que cambiaste queda en este celular: al recargar te ofrecemos recuperarlo.',
  },

  /** Salir sin guardar. */
  salir: {
    pregunta: '¿Salir sin guardar?',
    detalle: 'Lo que cambiaste desde la última vez que guardaste se pierde.',
    si: 'Salir sin guardar',
  },

  /** Después de guardar una rutina que el cliente ya ve. */
  guardada: {
    titulo: 'Rutina guardada',
    nueva: (nombre: string) => `${nombre} ya la puede ver en su link. ¿Se la mandás?`,
    cambios: (nombre: string) => `${nombre} ya ve los cambios en su link. ¿Le avisás?`,
    volver: 'Volver a su carpeta',
    seguir: 'Seguir editando',
  },
};

export const rutinasEditorPt: typeof rutinasEditorEs = {
  barra: {
    volver: 'Voltar',
    estados: {
      plantilla: 'Modelo',
      vigente: 'Treino vigente',
      borrador: 'Próximo treino',
      anterior: 'Treino encerrado',
    },
    nueva: {
      plantilla: 'Modelo novo',
      vigente: 'Treino novo',
      borrador: 'Próximo treino',
      anterior: 'Treino novo',
    },
    de: (nombre: string) => `de ${nombre}`,
    sinTitulo: 'Ainda sem nome',
    guardar: 'Salvar',
    guardando: 'Salvando…',
    sinGuardar: 'não salvo',
    guardada: 'Salvo.',
    volverAPlantillas: 'Voltar para os modelos',
  },

  avisos: {
    salud: (nombre: string) => `Saúde e lesões de ${nombre}`,
    saludNoSeCopia: (nombre: string) =>
      `Isto não é copiado para o treino e ${nombre} não vê. Se for importante para um exercício, escreva na observação dele.`,
    vigente: (nombre: string) =>
      `${nombre} vê estas mudanças assim que você salva. Para mudanças grandes, monte o próximo.`,
    irALaCarpeta: 'Ir para a pasta',
    borrador: (nombre: string) =>
      `É o próximo treino de ${nombre}: ainda não vê. Quando estiver pronto, ative na pasta do cliente.`,
    plantilla: 'É um modelo: ninguém vê. Ao usar para um cliente, ele é copiado e este continua igual.',
    nuevaVigente: (nombre: string) => `Ao salvar, ${nombre} já pode ver no link.`,
    seGuardaEnElCelular: 'Até você salvar, o que mudar fica guardado neste celular.',
  },

  terminada: {
    titulo: 'Este treino já foi encerrado',
    detalle: 'Fica como histórico e não se altera. Para usar de novo, monte o próximo a partir dele na pasta.',
    ir: 'Ir para a pasta',
  },

  recuperar: {
    titulo: 'Você tem mudanças não salvas',
    cuando: (fecha: string) => `Ficaram neste celular em ${fecha}.`,
    cambioDespues: 'Atenção: depois alguém salvou este treino. Se recuperar e salvar, você substitui essas mudanças.',
    cambioDespuesSeJunta:
      'Atenção: depois alguém salvou este treino (por exemplo, subiu uma carga pela agenda). Ao recuperar, o que você não mexeu fica como essa pessoa salvou e o seu é somado. Se os dois mudaram a mesma coisa, fica o seu: revise antes de salvar.',
    boton: 'Recuperar o que não foi salvo',
    descartar: 'Descartar',
  },

  partir: {
    titulo: (rutina: string) => `Começar a partir do treino atual, «${rutina}»?`,
    detalle: 'Os dias e exercícios dele são copiados aqui para você mudar o que precisar. O atual continua igual até você ativar este.',
    boton: 'Copiar os dias',
  },

  copia: {
    titulo: 'Copiado como o próximo treino',
    detalle: (nombre: string) => `${nombre} não vê até você ativar na pasta: revise com calma e salve o que mudar.`,
    detalleSinNombre: 'Não aparece em nenhum link até você ativar na pasta do cliente.',
    conNotas: 'As observações do original vieram junto: revise antes de ativar, porque o cliente vê.',
    sinNombre: 'Ao copiar, o nome ficou vazio: coloque um antes de salvar.',
  },

  datos: {
    titulo: 'Nome, orientações e semanas',
    cambiar: 'Alterar',
    resumen: (semanas: number | null, conIndicaciones: boolean) =>
      `${semanas ? `Trocar em ${semanas} ${semanas === 1 ? 'semana' : 'semanas'}` : 'Sem data para trocar'}`
      + ` · ${conIndicaciones ? 'com orientações' : 'sem orientações'}`,
    nombre: 'Nome do treino',
    nombreEjemplo: 'Ex.: Força base',
    nombrePorDefecto: 'Treino',
    plantillaPorDefecto: 'Modelo novo',
    loVeElCliente: 'O cliente vê',
    loVe: (nombre: string) => `${nombre} vê`,
    notas: 'Orientações gerais',
    notasEjemplo: 'Ex.: Beba água entre as séries. Se algo doer, pare e me avise.',
    semanas: 'Trocar em',
    semanasNo: 'Sem data',
    semanasN: (n: number) => `${n} sem.`,
    semanasOtra: 'Outra',
    semanasUnidad: (n: number) => (n === 1 ? 'semana' : 'semanas'),
    semanasAyuda: 'É só um lembrete para você: quando chegar a hora, avisamos para trocar.',
  },

  dias: {
    titulo: 'Dias',
    porDefecto: (i: number) => `Treino ${letra(i)}`,
    agregar: '+ Dia',
    ejercicios: (n: number) => (n === 1 ? '1 exercício' : `${n} exercícios`),
    nombre: 'Nome do dia',
    nombreEjemplo: 'Ex.: Treino A · Pernas',
    notas: 'Aquecimento e volta à calma',
    notasEjemplo: 'Ex.: 10 min de bike leve e mobilidade de quadril',
    agregarNotas: '+ Aquecimento',
    opciones: 'Opções do dia',
    antes: 'Mover para antes',
    despues: 'Mover para depois',
    duplicar: 'Duplicar',
    borrar: 'Excluir dia',
    copia: (nombre: string) => `${nombre} (cópia)`,
    borrarPregunta: (nombre: string) => `Excluir «${nombre}»?`,
    borrarDetalle: (n: number) =>
      (n === 1 ? 'Tem 1 exercício, que é excluído com o dia.' : `Tem ${n} exercícios, que são excluídos com o dia.`),
    siBorrar: 'Sim, excluir',
    vacio: 'Ainda não há exercícios neste dia.',
    vacioDetalle: 'Escreva abaixo, um por linha, ou cole o treino que você já tem.',
    lleno: 'Este dia já tem 30 exercícios, o máximo.',
  },

  tarjeta: {
    editar: (nombre: string) => `Editar ${nombre}`,
    subir: 'Subir',
    bajar: 'Descer',
    mas: 'Mais opções',
    junto: 'Junto com o anterior',
    separar: 'Separar do anterior',
    duplicar: 'Duplicar',
    quitar: 'Remover',
    sinUnidad: 'kg ou lb?',
  },

  renglon: {
    etiqueta: 'Adicionar rápido',
    ejemplo: 'Supino reto 4x10 40kg 90s',
    agregar: 'Adicionar',
    ayuda: 'Nome, séries x repetições, carga com a unidade e descanso. Enter e pronto.',
    vista: 'Fica assim:',
    noEntendi: 'Não encontrei o nome do exercício. Comece pelo nome: «Agachamento 4x10 40kg».',
    sinUnidad: 'kg ou lb? Escreva a unidade («40kg», «25lb»): um número sozinho pode ser lido errado.',
    conDetalle: '+ Com mais detalhes',
    pegarTexto: 'Colar texto',
  },

  hoja: {
    nuevo: 'Novo exercício',
    editar: 'Editar exercício',
    nombre: 'Exercício',
    nombreEjemplo: 'Ex.: Agachamento livre com barra',
    deTuLista: 'da sua lista',
    nuevoEnTuLista: 'É novo: entra na sua lista de exercícios.',
    faltaNombre: 'Escreva o nome do exercício.',
    series: 'Séries',
    menos: 'Uma série a menos',
    mas: 'Uma série a mais',
    reps: 'Repetições',
    repsEjemplo: 'Ex.: 10, 8-12, 45 s',
    atajosReps: ['8-10', '10-12', '12-15', '15', '20', '30 s', 'até a falha'],
    carga: 'Carga',
    cargaEjemplo: 'Ex.: 40 kg, placa 7, elástico vermelho',
    cargaAyuda: 'Toque na unidade: ela nunca é colocada sozinha.',
    cargaPrimeroNumero: 'Escreva primeiro o número e depois toque na unidade.',
    descanso: 'Descanso',
    sinDescanso: 'Sem',
    segundos: (n: number) => `${n} s`,
    minutos: (n: number) => `${n} min`,
    descansoOtro: 'Outro',
    descansoEjemplo: 'Ex.: 45 ou 1:30',
    descansoEs: (valor: string) => `= ${valor}`,
    descansoNoEntendi: 'Não entendi o descanso: escreva segundos (45) ou minutos (1:30), até 15 minutos.',
    nota: 'Observação',
    notaEjemplo: 'Ex.: Desça devagar, em 3 segundos',
    notaAyuda: 'O cliente vê.',
    junto: 'Junto com o anterior (bi-set)',
    juntoAyuda: 'São feitos em sequência, sem descanso entre os dois.',
    guardarYOtro: 'Salvar e mais um',
    agregar: 'Adicionar',
    listo: 'Pronto',
    quitar: 'Remover exercício',
    agregado: (nombre: string) => `Adicionado: ${nombre}`,
  },

  pegar: {
    titulo: 'Colar texto',
    explicacion: 'Cole o treino como você tem no Notas, no WhatsApp ou numa planilha. Antes de usar, mostramos o que entendemos.',
    campo: 'Seu treino',
    ejemplo: 'Treino A · Pernas\nAgachamento 4x10 40kg 90s\nAfundo 3x12 cada perna\n\nTreino B · Superiores\nSupino reto 4x8-10 30kg 2 min',
    entendi: (dias: number, ejercicios: number) =>
      `Entendi ${dias === 1 ? '1 dia' : `${dias} dias`} e ${ejercicios === 1 ? '1 exercício' : `${ejercicios} exercícios`}.`,
    nada: 'Ainda não encontrei nenhum exercício.',
    nombre: 'Nome:',
    notas: 'Orientações gerais',
    noEntendi: 'Estas linhas eu não entendi e não são usadas:',
    nuevos: (n: number) =>
      (n === 1 ? '1 exercício novo entra na sua lista.' : `${n} exercícios novos entram na sua lista.`),
    reemplazar: 'Substituir meus dias',
    agregar: 'Adicionar aos meus dias',
    usar: 'Usar este treino',
    demasiadosDias: (n: number) => `Ficariam ${n} dias, e o máximo é 10.`,
    demasiadosEjercicios: (dia: string) => `«${dia}» tem mais de 30 exercícios: divida em dois dias.`,
  },

  problemas: {
    sinEjercicios: 'Adicione pelo menos um exercício antes de salvar.',
    muchosDias: 'Um treino tem até 10 dias.',
    muchosEjercicios: (dia: string) => `«${dia}» tem mais de 30 exercícios, o máximo.`,
    sinNombre: (dia: string) => `Em «${dia}» há um exercício sem nome.`,
    cargaLarga: (ejercicio: string) => `A carga de «${ejercicio}» está longa demais: até 24 letras.`,
    repsLargas: (ejercicio: string) => `As repetições de «${ejercicio}» estão longas demais: até 20 letras.`,
    recargar: 'Recarregar',
    choqueAyuda: 'O que você mudou fica neste celular: ao recarregar, oferecemos recuperar.',
  },

  salir: {
    pregunta: 'Sair sem salvar?',
    detalle: 'O que você mudou desde a última vez que salvou será perdido.',
    si: 'Sair sem salvar',
  },

  guardada: {
    titulo: 'Treino salvo',
    nueva: (nombre: string) => `${nombre} já pode ver no link. Quer enviar?`,
    cambios: (nombre: string) => `${nombre} já vê as mudanças no link. Quer avisar?`,
    volver: 'Voltar para a pasta',
    seguir: 'Continuar editando',
  },
};
