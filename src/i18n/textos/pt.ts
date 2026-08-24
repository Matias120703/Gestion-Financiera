/**
 * Português (Brasil). Parcial: lo que falta cae a inglés.
 * Para completarlo, copiar las claves que falten de `es.ts` y traducirlas.
 */
import type { Parcial } from '../fusionar';
import type { Textos } from './es';

export const pt: Parcial<Textos> = {
  comun: {
    guardar: 'Salvar',
    cancelar: 'Cancelar',
    cerrar: 'Fechar',
    volver: 'Voltar',
    seguir: 'Continuar',
    listo: 'Pronto',
    borrar: 'Excluir',
    reintentar: 'Tentar de novo',
    cargando: 'Carregando…',
    guardando: 'Salvando…',
    hoy: 'Hoje',
    ayer: 'Ontem',
    verTodo: 'Ver tudo',
    error: 'Algo deu errado',
  },

  formato: { mil: 'mil', millon: 'mi', milMillones: 'bi' },

  rangos: {
    hoy: 'Hoje', ayer: 'Ontem', semana: 'Esta semana', semana_pasada: 'Semana passada',
    mes: 'Este mês', mes_pasado: 'Mês passado', anio: 'Este ano', siempre: 'Tudo',
    personalizado: 'Personalizado', todoElHistorial: 'Todo o histórico',
  },

  nav: {
    panel: 'Painel',
    vender: 'Vender',
    gastos: 'Despesas',
    productos: 'Produtos',
    historial: 'Histórico',
    reto: 'Meta',
    reportes: 'Relatórios',
    ajustes: 'Ajustes',
    cierre: 'Fechamento do dia',
    plan: 'Meu plano',
    miCuenta: 'Minha conta',
    cambiarEmpresa: 'Trocar de negócio',
    activa: 'ativa',
    salir: 'Sair',
  },

  captura: {
    titulo: 'O que você quer anotar?',
    porVoz: 'Me conte falando',
    porVozDetalle: 'Toque e diga o que aconteceu',
    porFoto: 'Tire uma foto',
    porFotoDetalle: 'Cupom, nota ou recibo',
    porTexto: 'Escreva',
    porTextoDetalle: 'Como você contaria para alguém',
    grabando: 'Estou ouvindo…',
    detener: 'Pronto, interprete',
    interpretando: 'Entendendo o que você disse…',
    subiendoFoto: 'Lendo o comprovante…',
    revisar: 'Confira antes de salvar',
    transcripcion: 'O que eu entendi',
    ejemplo: 'Ex: vendi dois perfumes a 150 cada',
  },

  cierre: {
    titulo: 'Fechamento do dia',
    subtitulo: 'Dez segundos e você sabe como foi',
    entro: 'Entrou',
    salio: 'Saiu',
    quedo: 'Sobrou',
    sinActividad: 'Você ainda não anotou nada hoje',
    sinActividadDetalle: 'Toque no botão verde e conte a primeira venda do dia.',
    vsSemanaPasada: 'contra o mesmo dia da semana passada',
    vsPromedio: 'contra um dia normal seu',
    masQue: (p: string) => `${p} a mais`,
    menosQue: (p: string) => `${p} a menos`,
    igualQue: 'igual a',
    estrella: 'O que mais rendeu hoje',
    marcar: 'Fechar o dia',
    cerrado: 'Dia fechado',
    volverManiana: 'Até amanhã.',
  },

  racha: {
    dias: (n: number) => (n === 1 ? '1 dia seguido' : `${n} dias seguidos`),
    ninguna: 'Comece sua sequência hoje',
    enRiesgo: (n: number) =>
      n === 1
        ? 'Você tem 1 dia de sequência. Anote algo hoje para não perder.'
        : `Você tem ${n} dias de sequência. Anote algo hoje para não perder.`,
    mejor: (n: number) => `Sua melhor sequência: ${n}`,
    nueva: 'Sequência nova!',
  },

  plan: {
    titulo: 'Seu plano',
    gratis: 'Grátis',
    pro: 'Pro',
    negocio: 'Negócio',
    mensual: 'por mês',
    anual: 'por ano',
    porMes: 'mês',
    porAnio: 'ano',
    elegir: 'Escolher este plano',
    actual: 'Seu plano atual',
    ahorroAnual: 'Dois meses grátis',
    enPrueba: 'Você está testando o Orden',
    diasDePrueba: (n: number) => (n === 1 ? 'Falta 1 dia de teste' : `Faltam ${n} dias de teste`),
    pruebaVence: 'Quando terminar, seus dados continuam com você e dá para anotar à mão.',
    vencida: 'Seu plano pago terminou',
    sinTarjeta: 'Sem cartão para testar',
    cancelarCuando: 'Cancele quando quiser',
    incluye: 'Inclui',
    personas: (n: number) => (n === 1 ? '1 pessoa' : `Até ${n} pessoas`),
    capturasMes: (n: number) => `${n} capturas com IA por mês`,
    capturasLibres: 'Voz, foto e texto sem limite',
    conAdjuntos: 'Comprovantes guardados',
    conExcel: 'Excel de cinco abas',
    soloManual: 'Registro manual sem limite',
    historialCompleto: 'Todo o seu histórico, sempre',
    irAPagar: 'Ir para o pagamento',
  },

  ajustes: {
    idioma: 'Idioma',
    zona: 'Fuso horário',
    avisos: 'Avisos',
    avisoCierre: 'Lembrar de fechar o dia',
    avisoSemanal: 'Resumo da semana por email',
    horaCierre: 'A que horas te lembrar',
    guardado: 'Salvo',
  },

  errores: {
    sesion: 'Você precisa entrar na sua conta.',
    permiso: 'Você não tem permissão para isso.',
    red: 'Sem conexão. Tentamos de novo quando voltar.',
    generico: 'Não deu certo. Tente de novo.',
  },

  sinConexion: {
    titulo: 'Sem conexão',
    detalle: 'Não conseguimos chegar ao servidor. O que você já salvou está seguro.',
  },
};
