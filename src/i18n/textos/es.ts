/**
 * Diccionario original. Es la forma que tienen que respetar los demás.
 *
 * Reglas al escribir textos acá:
 *   · Español rioplatense, voseo. "Cargá", no "Carga" ni "Cargue".
 *   · Frases cortas. Esto se lee en un celular, en la calle, con apuro.
 *   · Nada de jerga contable. "Lo que te quedó", no "resultado del ejercicio".
 *   · Un texto que necesita un número lleva una función, no concatenación
 *     en la pantalla: el orden de las palabras cambia con el idioma.
 */
export const es = {
  comun: {
    guardar: 'Guardar',
    cancelar: 'Cancelar',
    cerrar: 'Cerrar',
    volver: 'Volver',
    seguir: 'Seguir',
    listo: 'Listo',
    borrar: 'Borrar',
    reintentar: 'Probar de nuevo',
    cargando: 'Cargando…',
    guardando: 'Guardando…',
    sinDato: '—',
    hoy: 'Hoy',
    ayer: 'Ayer',
    verTodo: 'Ver todo',
    error: 'Algo salió mal',
  },

  /**
   * Abreviaturas de escala para los montos cortos de las tarjetas.
   * Ver el comentario de `dineroCorto` en lib/formato.ts sobre por qué no
   * se usa la notación compacta de Intl.
   */
  formato: {
    mil: 'mil',
    millon: 'M',
    milMillones: 'mil M',
  },

  rangos: {
    hoy: 'Hoy',
    ayer: 'Ayer',
    semana: 'Esta semana',
    semana_pasada: 'Semana pasada',
    mes: 'Este mes',
    mes_pasado: 'Mes pasado',
    anio: 'Este año',
    siempre: 'Todo',
    personalizado: 'Personalizado',
    todoElHistorial: 'Todo el historial',
  },

  nav: {
    panel: 'Panel',
    vender: 'Vender',
    gastos: 'Gastos',
    productos: 'Productos',
    historial: 'Historial',
    reto: 'Reto',
    reportes: 'Reportes',
    ajustes: 'Ajustes',
    cierre: 'Cierre del día',
    cierreCorto: 'Cierre',

    plan: 'Mi plan',
    miCuenta: 'Mi cuenta',
    cambiarEmpresa: 'Cambiar de empresa',
    activa: 'activa',
    mas: 'Más',
    todasLasSecciones: 'Todas las secciones',

    salir: 'Cerrar sesión',
  },

  captura: {
    titulo: '¿Qué querés anotar?',
    porVoz: 'Contámelo hablando',
    porVozDetalle: 'Tocá y decí lo que pasó',
    porFoto: 'Sacale una foto',
    porFotoDetalle: 'Ticket, factura o boleta',
    porTexto: 'Escribilo',
    porTextoDetalle: 'Como se lo contarías a alguien',
    grabando: 'Te escucho…',
    detener: 'Listo, interpretalo',
    interpretando: 'Entendiendo lo que dijiste…',
    subiendoFoto: 'Leyendo el comprobante…',
    revisar: 'Revisá antes de guardar',
    transcripcion: 'Lo que entendí',
    ejemplo: 'Ej: vendí dos perfumes a 150 mil cada uno',
    escribiMas: 'Escribí un poco más.',
    audioCorto: 'El audio salió muy corto. Probá de nuevo.',
    sinMicrofono: 'No pudimos usar el micrófono. Revisá los permisos del navegador.',
    guardarComprobante: 'Guardar la foto como respaldo',
    comprobanteGuardado: 'Comprobante guardado',
    // Se muestra cuando el plan no incluye adjuntos.
    comprobanteBloqueado: 'Guardar el comprobante es del plan Pro',
  },

  adjuntos: {
    titulo: 'Respaldo',
    ninguno: 'Sin comprobantes',
    agregarFoto: 'Agregar foto',
    notaDeVoz: 'Nota de voz',
    comprobante: 'Comprobante',
    borrarConfirmar: '¿Borrar este comprobante? No se puede deshacer.',
    subiendo: 'Subiendo…',
    pesada: 'La foto es muy pesada, incluso después de achicarla.',
    limite: (n: number) => `Un movimiento admite hasta ${n} comprobantes.`,
  },

  cierre: {
    titulo: 'Cierre del día',
    subtitulo: 'Diez segundos y sabés cómo te fue',
    entro: 'Entró',
    salio: 'Salió',
    quedo: 'Balance Actual',
    sinActividad: 'Hoy todavía no cargaste nada',
    sinActividadDetalle: 'Tocá el botón verde y contale al sistema tu primera venta del día.',
    vsSemanaPasada: 'contra el mismo día de la semana pasada',
    vsPromedio: 'contra un día normal tuyo',
    masQue: (p: string) => `${p} más`,
    menosQue: (p: string) => `${p} menos`,
    igualQue: 'igual que',
    estrella: 'Lo que más dejó hoy',
    marcar: 'Cerrar el día',
    cerrado: 'Día cerrado',
    volverManiana: 'Nos vemos mañana.',
  },

  racha: {
    dias: (n: number) => (n === 1 ? '1 día seguido' : `${n} días seguidos`),
    ninguna: 'Empezá tu racha hoy',
    enRiesgo: (n: number) =>
      n === 1
        ? 'Tenés 1 día de racha. Cargá algo hoy para no perderla.'
        : `Tenés ${n} días de racha. Cargá algo hoy para no perderla.`,
    mejor: (n: number) => `Tu mejor racha: ${n}`,
    nueva: '¡Racha nueva!',
  },

  plan: {
    titulo: 'Tu plan',
    gratis: 'Gratis',
    pro: 'Pro',
    negocio: 'Negocio',
    mensual: 'por mes',
    anual: 'por año',
    porMes: 'mes',
    porAnio: 'año',
    elegir: 'Elegir este plan',
    actual: 'Tu plan actual',
    ahorroAnual: 'Dos meses gratis',
    enPrueba: 'Estás probando Orden',
    diasDePrueba: (n: number) => (n === 1 ? 'Te queda 1 día de prueba' : `Te quedan ${n} días de prueba`),
    pruebaVence: 'Cuando termine, seguís teniendo todos tus datos y podés cargar a mano.',
    vencida: 'Tu plan pagado terminó',
    vencidaDetalle: 'Tus datos están intactos. Volvé a Pro cuando quieras para recuperar la captura por voz y foto.',
    sinTarjeta: 'Sin tarjeta para probar',
    cancelarCuando: 'Cancelás cuando quieras',
    capturasUsadas: (usadas: number, tope: number) => `${usadas} de ${tope} capturas con IA este mes`,
    capturasAgotadas: 'Se te acabaron las capturas con IA del mes',
    capturasAgotadasDetalle: 'Podés seguir cargando a mano todo lo que quieras. Con Pro, la voz y la foto no tienen tope.',
    incluye: 'Incluye',
    personas: (n: number) => (n === 1 ? '1 persona' : `Hasta ${n} personas`),
    capturasMes: (n: number) => `${n} capturas con IA por mes`,
    capturasLibres: 'Voz, foto y texto sin tope',
    conAdjuntos: 'Comprobantes guardados',
    conExcel: 'Excel de cinco hojas',
    soloManual: 'Carga manual sin límite',
    historialCompleto: 'Todo tu historial, siempre',
    irAPagar: 'Ir a pagar',
    pagoNoDisponible: 'Todavía no hay una forma de pago activa. Escribinos y lo arreglamos.',
    gestionar: 'Gestionar mi suscripción',
  },

  ajustes: {
    idioma: 'Idioma',
    idiomaDetalle: 'Cambia solo lo que ves vos. Cada persona del negocio elige el suyo.',
    zona: 'Zona horaria',
    zonaDetalle: 'Decide a qué hora termina tu día para el cierre y la racha.',
    avisos: 'Avisos',
    avisoCierre: 'Recordarme cerrar el día',
    avisoCierreDetalle: 'Solo si a esa hora todavía no cargaste nada.',
    avisoSemanal: 'Resumen de la semana por email',
    avisoSemanalDetalle: 'Los lunes, con lo que pasó los últimos siete días.',
    horaCierre: 'A qué hora recordarte',
    activarPush: 'Activar avisos en este dispositivo',
    pushActivo: 'Avisos activados acá',
    pushBloqueado: 'El navegador tiene los avisos bloqueados. Habilitalos desde sus ajustes.',
    pushNoSoportado: 'Este navegador no admite avisos.',
    pushIphone: 'En iPhone hay que agregar Orden a la pantalla de inicio para recibir avisos.',
    guardado: 'Guardado',
  },

  equipo: {
    titulo: 'Equipo',
    vos: '(vos)',
    desde: 'Desde',
    quitar: 'Sacar del equipo',
    quitarConfirmar: (nombre: string) => `¿Sacar a ${nombre} del equipo? Va a perder el acceso al instante. Todo lo que cargó queda como está.`,
    quitado: (nombre: string) => `${nombre} ya no está en el equipo.`,
    rotar: 'Cambiar el código',
    rotarConfirmar: '¿Generar un código nuevo? El actual deja de funcionar y va a haber que pasarle el nuevo a todo el que falte sumar.',
    rotarListo: 'Código nuevo generado.',
    soloPropietario: 'Solo el propietario puede cambiarlo.',
  },

  errores: {
    sesion: 'Necesitás iniciar sesión.',
    permiso: 'No tenés permiso para hacer eso.',
    red: 'No hay conexión. Lo intentamos de nuevo cuando vuelva.',
    generico: 'No se pudo completar. Probá de nuevo.',
  },

  sinConexion: {
    titulo: 'Sin conexión',
    detalle: 'No podemos llegar al servidor. Lo que ya cargaste está a salvo.',
  },

  email: {
    asuntoSemanal: (negocio: string) => `Tu semana en ${negocio}`,
    hola: (nombre: string) => `Hola ${nombre},`,
    resumenIntro: 'Esto es lo que pasó en tu negocio los últimos siete días.',
    vendido: 'Vendido',
    gastado: 'Gastado',
    ganancia: 'Te quedó',
    ventas: 'ventas',
    mejorDia: 'Tu mejor día',
    masVendido: 'Lo que más se vendió',
    abrir: 'Abrir Orden',
    bajarse: 'Si no querés recibir esto, apagalo en Ajustes.',
  },
};

/**
 * La forma que tienen que respetar los demás idiomas.
 *
 * OJO: este objeto NO lleva `as const`. Con `as const`, cada texto sería su
 * propio tipo literal ('Guardar' en vez de string) y ninguna traducción
 * compilaría: 'Speichern' no es asignable a 'Guardar'. Sin él, las claves
 * quedan igual de obligatorias y los valores son strings comunes.
 */
export type Textos = typeof es;
