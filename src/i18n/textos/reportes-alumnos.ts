/**
 * TEXTOS DEL REPORTE DE clases y entrenamiento: el profe y el personal trainer (la jerga del trainer pone «sesión», «cliente» y «plan» encima).
 *
 * El diccionario lo incluye como `t.reportesAlumnos` (ver es.ts y pt.ts). Lo
 * llena el componente `src/components/reportes/ReporteAlumnos.tsx`; lo que es de
 * todos los reportes (rango, indicador, gráfico, descarga) está en
 * `reportes-comunes.ts`. Los textos del Excel NO van acá: el libro se
 * compila suelto para las pruebas y los lleva en src/lib/reportes.
 *
 * LAS PALABRAS DEL OFICIO (23/09). `conJerga` pisa el diccionario con las
 * palabras del trainer, pero su jerga (textos/entrenamiento.ts) no conoce
 * este reporte. En vez de repetir cada frase dos veces, las frases reciben
 * las palabras (`palabras.profe` o `palabras.trainer`) y el componente
 * elige según la ficha. Así «Clases dadas» es «Sesiones dadas» para el
 * trainer sin que nadie se olvide de traducir una.
 */

/** Las palabras que cambian entre el profe y el trainer. */
export interface PalabrasAlumnos {
  clase: string;
  clases: string;
  Clases: string;
  alumno: string;
  alumnos: string;
  Alumnos: string;
  paquete: string;
  Paquete: string;
  paquetes: string;
  Paquetes: string;
  materia: string;
}

const uno = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural);

export const reportesAlumnosEs = {
  palabras: {
    profe: {
      clase: 'clase', clases: 'clases', Clases: 'Clases',
      alumno: 'alumno', alumnos: 'alumnos', Alumnos: 'Alumnos',
      paquete: 'paquete', Paquete: 'Paquete', paquetes: 'paquetes', Paquetes: 'Paquetes',
      materia: 'materia',
    } as PalabrasAlumnos,
    trainer: {
      clase: 'sesión', clases: 'sesiones', Clases: 'Sesiones',
      alumno: 'cliente', alumnos: 'clientes', Alumnos: 'Clientes',
      paquete: 'plan', Paquete: 'Plan', paquetes: 'planes', Paquetes: 'Planes',
      materia: 'objetivo',
    } as PalabrasAlumnos,
  },

  /** Los tres de arriba: Cobrado sale de la ficha (`palabra(…, 'ventas')`). */
  gastos: 'Gastos',
  teQuedo: 'Te quedó',

  /** La segunda fila: lo que el profe cuenta que no es plata. */
  clasesDadas: (p: PalabrasAlumnos) => `${p.Clases} dadas`,
  faltasYAsistencia: (faltas: number, pct: string | null) =>
    `${faltas} ${uno(faltas, 'falta', 'faltas')}${pct ? ` · ${pct} de asistencia` : ''}`,
  cobradoPorClase: (p: PalabrasAlumnos) => `Cobrado por ${p.clase}`,
  cobradoPorClaseDetalle: (p: PalabrasAlumnos) => `lo cobrado ÷ ${p.clases} dadas`,
  porCobrar: 'Por cobrar',
  porCobrarDetalle: (n: number, p: PalabrasAlumnos) =>
    n === 0 ? 'a hoy · nadie te debe' : `a hoy · ${n} ${uno(n, p.alumno, p.alumnos)}`,
  activos: (p: PalabrasAlumnos) => `${p.Alumnos} activos`,
  nuevos: (n: number) => (n === 0 ? 'ninguno nuevo en el período' : `${n} ${uno(n, 'nuevo', 'nuevos')} en el período`),

  /** Clases dadas contra faltas, semana por semana. */
  porSemana: {
    titulo: (p: PalabrasAlumnos) => `${p.Clases} y faltas por semana`,
    semanaDel: (fecha: string) => `Semana del ${fecha}`,
    detalle: (dadas: number, faltas: number, p: PalabrasAlumnos) =>
      `${dadas} ${uno(dadas, p.clase, p.clases)} · ${faltas} ${uno(faltas, 'falta', 'faltas')}`,
  },

  /** Los paquetes que se terminan o vencen: a quién llamar para renovar. */
  llamar: {
    titulo: 'A quién llamar',
    detalle: (p: PalabrasAlumnos) =>
      `${p.Paquetes} activos con 2 ${p.clases} o menos, o que vencen en los próximos 7 días.`,
    quedan: (n: number, p: PalabrasAlumnos) =>
      n === 0 ? `No le quedan ${p.clases}` : `${uno(n, 'Queda', 'Quedan')} ${n} ${uno(n, p.clase, p.clases)}`,
    vence: (fecha: string) => `vence el ${fecha}`,
  },

  /** Lo que te deben hoy. */
  deben: {
    titulo: 'Lo que te deben, a hoy',
    desde: (fecha: string) => `desde el ${fecha}`,
    fiado: 'Fiado',
    total: 'Total',
    esFoto: 'Es lo que se debe hoy, no solo en este período.',
  },

  /** Paquetes vendidos, terminados, vencidos y renovados en el período. */
  paquetes: {
    titulo: (p: PalabrasAlumnos) => `${p.Paquetes} del período`,
    vendidos: 'Vendidos',
    terminados: 'Se terminaron',
    vencidos: 'Vencieron',
    renovaron: (n: number, de: number) => `De ${de} que se terminaron o vencieron, ${n} ${uno(n, 'renovó', 'renovaron')}.`,
  },

  /** Cobrado por paquete (o plan), y por materia si enseña dos o más. */
  porPaquete: {
    titulo: (p: PalabrasAlumnos) => `Cobrado por ${p.paquete}`,
    colVendidos: 'Vendidos',
    colCobrado: 'Cobrado',
  },
  porMateria: {
    titulo: (p: PalabrasAlumnos) => `Cobrado por ${p.materia}`,
    sinMateria: (p: PalabrasAlumnos) => `Sin ${p.materia}`,
    alumnos: (n: number, p: PalabrasAlumnos) => `${n} ${uno(n, p.alumno, p.alumnos)}`,
  },

  /** Solo el trainer: cómo vienen sus clientes. */
  progreso: {
    titulo: 'Cómo vienen tus clientes',
    medidos: (n: number) => (n === 0 ? 'Nadie se midió en este período.' : `${n} ${uno(n, 'cliente se midió', 'clientes se midieron')} en este período.`),
    peso: 'Peso',
    cintura: 'Cintura',
    grasa: 'Grasa',
    promedioDe: (n: number) => `promedio de ${n} ${uno(n, 'cliente', 'clientes')}`,
    mismoMetodo: 'con el mismo método',
    sinComparar: 'Nadie tiene dos medidas en el período para comparar.',
    comoSeCuenta: 'Primera contra última medida del período, de quien tiene dos o más.',
    sinMedir: (n: number) => `${n} ${uno(n, 'cliente lleva', 'clientes llevan')} más de 30 días sin medirse`,
    nuncaMedido: 'nunca',
    dias: (n: number) => `${n} días`,
    sinRutina: (n: number) => `${n} sin rutina vigente`,
    armarRutina: 'Armar rutina',
  },

  /** Cómo te pagaron, con las palabras del profe (no «registrá ventas»). */
  sinCobros: 'Sin cobros en este período',
  sinCobrosDetalle: (p: PalabrasAlumnos) => `Cuando cobres un ${p.paquete} vas a ver acá cómo te pagan.`,
};

export const reportesAlumnosPt: typeof reportesAlumnosEs = {
  palabras: {
    profe: {
      clase: 'aula', clases: 'aulas', Clases: 'Aulas',
      alumno: 'aluno', alumnos: 'alunos', Alumnos: 'Alunos',
      paquete: 'pacote', Paquete: 'Pacote', paquetes: 'pacotes', Paquetes: 'Pacotes',
      materia: 'matéria',
    },
    trainer: {
      clase: 'sessão', clases: 'sessões', Clases: 'Sessões',
      alumno: 'cliente', alumnos: 'clientes', Alumnos: 'Clientes',
      paquete: 'plano', Paquete: 'Plano', paquetes: 'planos', Paquetes: 'Planos',
      materia: 'objetivo',
    },
  },

  gastos: 'Despesas',
  teQuedo: 'Sobrou',

  clasesDadas: (p) => `${p.Clases} dadas`,
  faltasYAsistencia: (faltas, pct) =>
    `${faltas} ${uno(faltas, 'falta', 'faltas')}${pct ? ` · ${pct} de frequência` : ''}`,
  cobradoPorClase: (p) => `Recebido por ${p.clase}`,
  cobradoPorClaseDetalle: (p) => `o recebido ÷ ${p.clases} dadas`,
  porCobrar: 'A receber',
  porCobrarDetalle: (n, p) =>
    n === 0 ? 'hoje · ninguém te deve' : `hoje · ${n} ${uno(n, p.alumno, p.alumnos)}`,
  activos: (p) => `${p.Alumnos} ativos`,
  nuevos: (n) => (n === 0 ? 'nenhum novo no período' : `${n} ${uno(n, 'novo', 'novos')} no período`),

  porSemana: {
    titulo: (p) => `${p.Clases} e faltas por semana`,
    semanaDel: (fecha) => `Semana de ${fecha}`,
    detalle: (dadas, faltas, p) =>
      `${dadas} ${uno(dadas, p.clase, p.clases)} · ${faltas} ${uno(faltas, 'falta', 'faltas')}`,
  },

  llamar: {
    titulo: 'Pra quem ligar',
    detalle: (p) =>
      `${p.Paquetes} ativos com 2 ${p.clases} ou menos, ou que vencem nos próximos 7 dias.`,
    quedan: (n, p) =>
      n === 0 ? `Não restam ${p.clases}` : `${uno(n, 'Resta', 'Restam')} ${n} ${uno(n, p.clase, p.clases)}`,
    vence: (fecha) => `vence em ${fecha}`,
  },

  deben: {
    titulo: 'O que te devem, hoje',
    desde: (fecha) => `desde ${fecha}`,
    fiado: 'Fiado',
    total: 'Total',
    esFoto: 'É o que se deve hoje, não só neste período.',
  },

  paquetes: {
    titulo: (p) => `${p.Paquetes} do período`,
    vendidos: 'Vendidos',
    terminados: 'Terminaram',
    vencidos: 'Venceram',
    renovaron: (n, de) => `De ${de} que terminaram ou venceram, ${n} ${uno(n, 'renovou', 'renovaram')}.`,
  },

  porPaquete: {
    titulo: (p) => `Recebido por ${p.paquete}`,
    colVendidos: 'Vendidos',
    colCobrado: 'Recebido',
  },
  porMateria: {
    titulo: (p) => `Recebido por ${p.materia}`,
    sinMateria: (p) => `Sem ${p.materia}`,
    alumnos: (n, p) => `${n} ${uno(n, p.alumno, p.alumnos)}`,
  },

  progreso: {
    titulo: 'Como estão seus clientes',
    medidos: (n) => (n === 0 ? 'Ninguém se mediu neste período.' : `${n} ${uno(n, 'cliente se mediu', 'clientes se mediram')} neste período.`),
    peso: 'Peso',
    cintura: 'Cintura',
    grasa: 'Gordura',
    promedioDe: (n) => `média de ${n} ${uno(n, 'cliente', 'clientes')}`,
    mismoMetodo: 'com o mesmo método',
    sinComparar: 'Ninguém tem duas medidas no período pra comparar.',
    comoSeCuenta: 'Primeira contra última medida do período, de quem tem duas ou mais.',
    sinMedir: (n) => `${n} ${uno(n, 'cliente está', 'clientes estão')} há mais de 30 dias sem medir`,
    nuncaMedido: 'nunca',
    dias: (n) => `${n} dias`,
    sinRutina: (n) => `${n} sem treino vigente`,
    armarRutina: 'Montar treino',
  },

  sinCobros: 'Sem recebimentos neste período',
  sinCobrosDetalle: (p) => `Quando receber um ${p.paquete} você vai ver aqui como te pagam.`,
};
