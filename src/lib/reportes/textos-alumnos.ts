import type { Jerga } from '../rubros';

/**
 * LO QUE DICE EL EXCEL DEL PROFE Y DEL PERSONAL TRAINER (23/09).
 *
 * Vive en src/lib y no en i18n por lo mismo que reporte-textos.ts: el libro
 * se compila suelto para las pruebas (probar:calculos), sin Next.
 *
 * Los dos oficios hacen lo mismo con otras palabras: el profe da clases a
 * alumnos que compran paquetes; el trainer da sesiones a clientes que pagan
 * un plan. En la pantalla eso lo resuelve `conJerga`; acá el libro recibe la
 * jerga (`DatosBaseLibro.jerga`) y elige el juego de palabras. Así el
 * archivo que baja un trainer no le habla de «alumnos».
 *
 * Los nombres de las hojas salen de acá, y `hojasAlumnos` los usa para la
 * tarjeta de descarga: la tarjeta no puede anunciar una hoja con otro nombre.
 */

interface Palabras {
  clase: string;
  clases: string;
  Clases: string;
  alumno: string;
  Alumno: string;
  alumnos: string;
  Alumnos: string;
  paquete: string;
  Paquete: string;
  paquetes: string;
  Paquetes: string;
  Materia: string;
}

const PROFE_ES: Palabras = {
  clase: 'clase', clases: 'clases', Clases: 'Clases',
  alumno: 'alumno', Alumno: 'Alumno', alumnos: 'alumnos', Alumnos: 'Alumnos',
  paquete: 'paquete', Paquete: 'Paquete', paquetes: 'paquetes', Paquetes: 'Paquetes',
  Materia: 'Materia',
};
const TRAINER_ES: Palabras = {
  clase: 'sesión', clases: 'sesiones', Clases: 'Sesiones',
  alumno: 'cliente', Alumno: 'Cliente', alumnos: 'clientes', Alumnos: 'Clientes',
  paquete: 'plan', Paquete: 'Plan', paquetes: 'planes', Paquetes: 'Planes',
  Materia: 'Objetivo',
};
const PROFE_PT: Palabras = {
  clase: 'aula', clases: 'aulas', Clases: 'Aulas',
  alumno: 'aluno', Alumno: 'Aluno', alumnos: 'alunos', Alumnos: 'Alunos',
  paquete: 'pacote', Paquete: 'Pacote', paquetes: 'pacotes', Paquetes: 'Pacotes',
  Materia: 'Matéria',
};
const TRAINER_PT: Palabras = {
  clase: 'sessão', clases: 'sessões', Clases: 'Sessões',
  alumno: 'cliente', Alumno: 'Cliente', alumnos: 'clientes', Alumnos: 'Clientes',
  paquete: 'plano', Paquete: 'Plano', paquetes: 'planos', Paquetes: 'Planos',
  Materia: 'Objetivo',
};

function es(p: Palabras) {
  return {
    hojaPorCobrar: 'Por cobrar',
    hojaCobros: 'Cobros',
    hojaAsistencia: 'Asistencia',
    hojaAlumnos: p.Alumnos,
    hojaProgreso: 'Progreso',

    // ---- Resumen ----
    resumenTitulo: 'RESUMEN DEL PERÍODO',
    columnaAhora: 'Este período',
    columnaAntes: 'Período anterior',
    plata: 'La plata',
    cobrado: 'Cobrado',
    otrosIngresos: 'Otros ingresos',
    otrosIngresosNota: 'préstamos, aportes: no son cobros',
    totalQueEntro: 'Total que entró',
    gastos: 'Gastos',
    teQuedo: 'Te quedó',
    tusClases: `Tus ${p.clases}`,
    clasesDadas: `${p.Clases} dadas`,
    faltas: 'Faltas',
    asistencia: 'Asistencia',
    cobradoPorClase: `Cobrado por ${p.clase}`,
    cobradoPorClaseNota: `lo cobrado ÷ ${p.clases} dadas`,
    tusAlumnos: `Tus ${p.alumnos}`,
    activos: `${p.Alumnos} con ${p.paquete} activo`,
    aHoy: 'a hoy',
    nuevos: `${p.Alumnos} nuevos`,
    nuevosNota: `su primer ${p.paquete} es de este período`,
    paquetesVendidos: `${p.Paquetes} vendidos`,
    paquetesTerminados: `${p.Paquetes} que se terminaron`,
    paquetesVencidos: `${p.Paquetes} que vencieron`,
    renovaron: 'De esos, renovaron',
    loQueTeDeben: 'Lo que te deben',
    inscripcionesSinCobrar: `${p.Paquetes} sin cobrar`,
    fiado: 'Fiado',
    totalPorCobrar: 'Total por cobrar',
    paraTenerEnCuenta: 'PARA TENER EN CUENTA',
    gastasteMasDeLoQueCobraste: 'En este período gastaste más de lo que entró.',
    sinCobros: 'No hubo cobros en este período.',
    anulados: (n: number) => `Se anularon ${n} movimiento(s): figuran en Orden pero no suman en ningún total.`,
    sinClasesNoHayPorClase: `Sin ${p.clases} dadas no hay «cobrado por ${p.clase}»: no se inventa.`,

    // ---- Por cobrar ----
    porCobrarTitulo: `LO QUE TE DEBEN, A HOY · ${p.Paquetes.toUpperCase()} SIN COBRAR Y FIADO`,
    columnasPorCobrar: [p.Alumno, p.Paquete, p.Materia, 'Desde', 'Vence', 'Debe'],
    filaFiado: 'Fiado (saldo)',
    nadieTeDebe: 'Nadie te debe nada a hoy.',
    porCobrarEsFoto: 'Es una foto de hoy, no del período: lo que se debe al bajar el archivo.',

    // ---- Cobros ----
    cobrosTitulo: 'COBROS DEL PERÍODO · LIBRO DE INGRESOS',
    columnasCobros: ['Fecha', p.Alumno, p.Paquete, 'Forma de pago', 'Cuenta', 'Monto'],
    totalCobrado: 'TOTAL COBRADO (sin anulados)',
    sinCobrosEnElPeriodo: 'No hubo cobros en este período.',
    cobrosNota: 'Solo cobros: los otros ingresos (préstamos, aportes) están en el Resumen y no son cobros.',

    // ---- Asistencia ----
    asistenciaTitulo: `${p.Clases.toUpperCase()} DADAS Y FALTAS`,
    porSemana: 'POR SEMANA',
    columnasSemana: ['Semana del', `${p.Clases} dadas`, 'Faltas', 'Asistencia'],
    porAlumno: `POR ${p.Alumno.toUpperCase()}`,
    columnasAsistenciaAlumno: [p.Alumno, `${p.Clases} dadas`, 'Faltas', 'Asistencia', `Última ${p.clase}`],
    total: 'TOTAL',
    sinClases: `No se marcaron ${p.clases} ni faltas en este período.`,

    // ---- Alumnos ----
    alumnosTitulo: `${p.Alumnos.toUpperCase()} · UNO POR FILA`,
    columnasAlumnos: [
      p.Alumno, `${p.Paquete} activo`, p.Materia, 'Usadas', 'Quedan', 'Vence',
      `${p.Clases} dadas`, 'Faltas', 'Cobrado', 'Debe hoy', `Última ${p.clase}`,
    ],
    alumnosNota: `«${p.Paquete} activo», «Usadas», «Quedan», «Vence» y «Debe hoy» son de hoy; `
      + `«${p.Clases} dadas», «Faltas» y «Cobrado», del período.`,
    sinAlumnos: `Todavía no hay ${p.alumnos} con ${p.paquetes}.`,

    // ---- Gastos: el detalle, debajo de las categorías ----
    cadaGasto: 'CADA GASTO DEL PERÍODO',
    columnasCadaGasto: ['Fecha', 'Descripción', 'Categoría', 'Forma de pago', 'Cuenta', 'Monto'],

    // ---- Progreso (solo el trainer) ----
    progresoTitulo: 'PROGRESO DE TUS CLIENTES EN EL PERÍODO',
    columnasProgreso: [
      'Cliente', 'Medidas', 'Peso inicial', 'Peso final', 'Cambio de peso',
      'Cintura inicial', 'Cintura final', 'Cambio de cintura',
      'Grasa inicial', 'Grasa final', 'Cambio de grasa', 'Método de grasa',
      'Última medida', 'Días sin medirse', 'Rutina vigente',
    ],
    promedio: 'PROMEDIO',
    progresoNota: 'Primera contra última medida del período, de quien tiene dos o más. '
      + 'La grasa se compara solo si las dos se midieron con el mismo método. Peso en kg, cintura en cm, grasa en %.',
    sinRutina: 'sin rutina',
    sinMedidas: 'Todavía no hay clientes con un plan activo ni medidas en este período.',
  };
}

type TextosAlumnos = ReturnType<typeof es>;

function pt(p: Palabras): TextosAlumnos {
  return {
    hojaPorCobrar: 'A receber',
    hojaCobros: 'Recebimentos',
    hojaAsistencia: 'Frequência',
    hojaAlumnos: p.Alumnos,
    hojaProgreso: 'Progresso',

    resumenTitulo: 'RESUMO DO PERÍODO',
    columnaAhora: 'Este período',
    columnaAntes: 'Período anterior',
    plata: 'O dinheiro',
    cobrado: 'Recebido',
    otrosIngresos: 'Outras entradas',
    otrosIngresosNota: 'empréstimos, aportes: não são recebimentos',
    totalQueEntro: 'Total que entrou',
    gastos: 'Despesas',
    teQuedo: 'Sobrou',
    tusClases: `Suas ${p.clases}`,
    clasesDadas: `${p.Clases} dadas`,
    faltas: 'Faltas',
    asistencia: 'Frequência',
    cobradoPorClase: `Recebido por ${p.clase}`,
    cobradoPorClaseNota: `o recebido ÷ ${p.clases} dadas`,
    tusAlumnos: `Seus ${p.alumnos}`,
    activos: `${p.Alumnos} com ${p.paquete} ativo`,
    aHoy: 'hoje',
    nuevos: `${p.Alumnos} novos`,
    nuevosNota: `o primeiro ${p.paquete} é deste período`,
    paquetesVendidos: `${p.Paquetes} vendidos`,
    paquetesTerminados: `${p.Paquetes} que terminaram`,
    paquetesVencidos: `${p.Paquetes} que venceram`,
    renovaron: 'Desses, renovaram',
    loQueTeDeben: 'O que te devem',
    inscripcionesSinCobrar: `${p.Paquetes} sem receber`,
    fiado: 'Fiado',
    totalPorCobrar: 'Total a receber',
    paraTenerEnCuenta: 'PRA LEVAR EM CONTA',
    gastasteMasDeLoQueCobraste: 'Neste período você gastou mais do que entrou.',
    sinCobros: 'Não houve recebimentos neste período.',
    anulados: (n: number) => `${n} movimento(s) cancelado(s): aparecem no Orden mas não entram em nenhum total.`,
    sinClasesNoHayPorClase: `Sem ${p.clases} dadas não há «recebido por ${p.clase}»: não se inventa.`,

    porCobrarTitulo: `O QUE TE DEVEM, HOJE · ${p.Paquetes.toUpperCase()} SEM RECEBER E FIADO`,
    columnasPorCobrar: [p.Alumno, p.Paquete, p.Materia, 'Desde', 'Vence', 'Deve'],
    filaFiado: 'Fiado (saldo)',
    nadieTeDebe: 'Ninguém te deve nada hoje.',
    porCobrarEsFoto: 'É uma foto de hoje, não do período: o que se deve ao baixar o arquivo.',

    cobrosTitulo: 'RECEBIMENTOS DO PERÍODO · LIVRO DE ENTRADAS',
    columnasCobros: ['Data', p.Alumno, p.Paquete, 'Forma de pagamento', 'Conta', 'Valor'],
    totalCobrado: 'TOTAL RECEBIDO (sem cancelados)',
    sinCobrosEnElPeriodo: 'Não houve recebimentos neste período.',
    cobrosNota: 'Só recebimentos: as outras entradas (empréstimos, aportes) estão no Resumo e não são recebimentos.',

    asistenciaTitulo: `${p.Clases.toUpperCase()} DADAS E FALTAS`,
    porSemana: 'POR SEMANA',
    columnasSemana: ['Semana de', `${p.Clases} dadas`, 'Faltas', 'Frequência'],
    porAlumno: `POR ${p.Alumno.toUpperCase()}`,
    columnasAsistenciaAlumno: [p.Alumno, `${p.Clases} dadas`, 'Faltas', 'Frequência', `Última ${p.clase}`],
    total: 'TOTAL',
    sinClases: `Não foram marcadas ${p.clases} nem faltas neste período.`,

    alumnosTitulo: `${p.Alumnos.toUpperCase()} · UM POR LINHA`,
    columnasAlumnos: [
      p.Alumno, `${p.Paquete} ativo`, p.Materia, 'Usadas', 'Restam', 'Vence',
      `${p.Clases} dadas`, 'Faltas', 'Recebido', 'Deve hoje', `Última ${p.clase}`,
    ],
    alumnosNota: `«${p.Paquete} ativo», «Usadas», «Restam», «Vence» e «Deve hoje» são de hoje; `
      + `«${p.Clases} dadas», «Faltas» e «Recebido», do período.`,
    sinAlumnos: `Ainda não há ${p.alumnos} com ${p.paquetes}.`,

    cadaGasto: 'CADA DESPESA DO PERÍODO',
    columnasCadaGasto: ['Data', 'Descrição', 'Categoria', 'Forma de pagamento', 'Conta', 'Valor'],

    progresoTitulo: 'PROGRESSO DOS SEUS CLIENTES NO PERÍODO',
    columnasProgreso: [
      'Cliente', 'Medidas', 'Peso inicial', 'Peso final', 'Mudança de peso',
      'Cintura inicial', 'Cintura final', 'Mudança de cintura',
      'Gordura inicial', 'Gordura final', 'Mudança de gordura', 'Método da gordura',
      'Última medida', 'Dias sem medir', 'Treino vigente',
    ],
    promedio: 'MÉDIA',
    progresoNota: 'Primeira contra última medida do período, de quem tem duas ou mais. '
      + 'A gordura só se compara se as duas foram medidas com o mesmo método. Peso em kg, cintura em cm, gordura em %.',
    sinRutina: 'sem treino',
    sinMedidas: 'Ainda não há clientes com um plano ativo nem medidas neste período.',
  };
}

/** Los textos del libro en el idioma de quien lo baja y con las palabras de su oficio. */
export function textosAlumnosExcel(idioma?: string, jerga?: Jerga | null): TextosAlumnos {
  const trainer = jerga === 'entrenamiento';
  if (idioma === 'pt') return pt(trainer ? TRAINER_PT : PROFE_PT);
  return es(trainer ? TRAINER_ES : PROFE_ES);
}

export type { TextosAlumnos };
