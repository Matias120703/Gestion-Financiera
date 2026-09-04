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
    deudas: 'Deudas',
    cierre: 'Cierre del día',
    cierreCorto: 'Cierre',
    organizacion: 'Presupuesto',
    reparto: 'Equipo y reparto',
    agenda: 'Agenda',
    lotes: 'Lotes',
    repartoCorto: 'Equipo',

    plan: 'Mi plan',
    miCuenta: 'Mi cuenta',
    sumarmeAOtro: 'Sumarme a otro negocio',
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

    // ---- lo que faltaba: estaba escrito en español adentro del componente ----
    botonAria: 'Registrar con voz, foto o texto',
    registrarRapido: 'Registrar rápido',
    hablaNormal: 'Hablá normal. Decí qué vendiste o gastaste y cuánto.',
    contameQuePaso: 'Contame qué pasó',
    ejemploLargo: 'Ej: vendí 3 perfumes Lattafa a 180 mil cada uno, pagó por transferencia',
    atras: 'Atrás',
    interpretar: 'Interpretar',
    tardaSegundos: 'Tarda unos segundos.',
    podesCorregir: 'Podés corregir cualquier campo.',
    bajaConfianza: 'No estoy del todo seguro de esto. Revisalo bien antes de guardar.',
    fotoPesada: 'La foto pesa más de 8 MB. Sacá una más liviana.',
    escribiUnPocoMas: 'Escribí un poco más para que pueda entender.',
    sinMicrofonoDetalle: 'No pude acceder al micrófono. Revisá los permisos del navegador.',

    campoTipo: 'Tipo',
    tipoVenta: 'Venta',
    tipoGasto: 'Gasto',
    tipoOtroIngreso: 'Otro ingreso',
    tipoIngreso: 'Ingreso',
    tipoDeuda: 'Deuda',
    tipoPagoDeuda: 'Pago de deuda',
    campoDescripcion: 'Descripción',
    campoNombreDeuda: 'Nombre de la deuda',
    campoFecha: 'Fecha',
    campoCategoria: 'Categoría',
    campoCobroPago: 'Cobro / pago',
    metodoEfectivo: 'Efectivo',
    metodoTransferencia: 'Transferencia',
    metodoTarjeta: 'Tarjeta',
    metodoCredito: 'Fiado / crédito',
    metodoOtro: 'Otro',

    datosDeuda: 'Datos de la deuda',
    claseDeuda: 'Clase',
    clasePrestamo: 'Préstamo',
    claseProveedor: 'Proveedor',
    aQuien: 'A quién',
    aQuienEjemplo: 'Banco, financiera…',
    cuotas: 'Cuotas',
    montoPorCuota: 'Monto por cuota',
    proximoVencimiento: 'Próximo vencimiento',
    sinVencimiento: 'Si lo dejás vacío, la deuda no te va a avisar cuándo pagar.',

    cualDeuda: '¿Cuál deuda estás pagando?',
    elegiUna: 'Elegí una…',
    sinDeudasCargadas: 'No hay deudas cargadas para imputar el pago. Cargá primero la deuda.',
    faltaPagar: (monto: string) => `falta ${monto}`,
    pagaDeMas: (monto: string) =>
      `Es más de lo que falta. Se va a aplicar solo ${monto} y la deuda queda saldada.`,
    anotarComoGasto: 'Anotar también como gasto del día',
    anotarComoGastoDetalle: 'La plata salió del cajón. Desmarcalo solo si llevás la contabilidad aparte.',

    productos: 'Productos',
    quitarProducto: 'Quitar producto',
    cantidad: 'Cantidad',
    precioCadaUno: 'Precio c/u',
    vinculadoAlCatalogo: '✓ vinculado a tu catálogo · descuenta stock',

    total: 'Total',
    cuantoDebes: 'Cuánto debés en total',
    cuantoPagaste: 'Cuánto pagaste',
    elegiLaDeuda: 'Elegí a cuál de tus deudas corresponde el pago.',
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

  /**
   * EL PANEL, la pantalla que se abre primero.
   *
   * Estaba escrita en español adentro del componente, así que cambiar de
   * idioma no la tocaba. Es la primera que ve cualquiera: si esa queda en
   * español, el idioma elegido no existió nunca.
   */
  /**
   * ENTRAR, REGISTRARSE Y RECUPERAR LA CONTRASEÑA.
   *
   * Es lo primero que ve cualquiera. Si esto queda en español, quien no lo
   * habla no llega ni a la segunda pantalla — el idioma elegido no importa
   * si la puerta está en otro.
   */
  acceso: {
    marca: 'Gestión financiera',
    entrarTitulo: 'Entrá a tu negocio.',
    crearTitulo: 'Creá tu cuenta.',
    bajada: 'Registrá lo que vendés y lo que gastás. El sistema calcula tu ganancia real.',
    correo: 'Correo electrónico',
    correoEjemplo: 'nombre@correo.com',
    contrasena: 'Contraseña',
    minimoSeis: 'Mínimo 6 caracteres',
    mostrarClave: 'Mostrar la contraseña',
    ocultarClave: 'Ocultar la contraseña',
    entrar: 'Entrar',
    crearCuenta: 'Crear cuenta',
    unMomento: 'Un momento…',
    sinCuenta: '¿Todavía no tenés cuenta?',
    yaTenesCuenta: '¿Ya tenés cuenta?',
    crearUna: 'Crear una',
    separacion: 'Cada empresa ve solo sus datos. La separación está aplicada en la base de datos, no en el navegador.',

    claveCorta: 'La contraseña necesita al menos 6 caracteres.',
    confirmaTuCorreo: 'Te mandamos un correo para confirmar tu dirección. Abrilo y volvé a entrar acá.',
    credencialesMal: 'Correo o contraseña incorrectos.',
    yaRegistrado: 'Ese correo ya tiene una cuenta. Probá entrar.',
    sinConfirmar: 'Confirmá tu correo antes de entrar.',

    olvide: '¿Te olvidaste la contraseña?',
    recuperarTitulo: 'Recuperar el acceso',
    recuperarBajada: 'Poné tu correo y te mandamos un enlace para poner una nueva. Tus datos quedan exactamente donde están.',
    mandarEnlace: 'Mandarme el enlace',
    mandando: 'Mandando…',
    revisaCorreo: 'Revisá tu correo',
    enCamino: 'Ya está en camino.',
    siHayCuenta: (correo: string) =>
      `Si hay una cuenta con ${correo}, te acabamos de mandar un enlace para poner una contraseña nueva.`,
    puedeTardar: 'Puede tardar un par de minutos. Si no lo ves, mirá en spam o correo no deseado.',
    volverAEntrar: 'Volver a entrar',
    noSePudoEnviar: 'No se pudo enviar. Probá de nuevo en un momento.',

    enlaceVencido: 'Enlace vencido',
    enlaceVencidoTitulo: 'Este enlace ya no sirve.',
    enlaceVencidoDetalle: 'Los enlaces para cambiar la contraseña duran poco, a propósito. Pedí uno nuevo y usalo apenas te llegue.',
    pedirOtro: 'Pedir otro enlace',
    casi: 'Casi',
    ponerNueva: 'Poné tu contraseña nueva.',
    claveNueva: 'Contraseña nueva',
    repetila: 'Repetila',
    laMismaDeArriba: 'La misma de arriba',
    guardarYEntrar: 'Guardar y entrar',
    noCoinciden: 'Las dos contraseñas no coinciden.',
    esLaMisma: 'Esa es la contraseña que ya tenías. Poné una distinta.',
    sesionVencida: 'El enlace venció. Pedí uno nuevo.',
    cambiada: 'Contraseña cambiada.',
    entrando: 'Te estamos haciendo entrar. Todo lo tuyo sigue donde estaba.',
  },

  /**
   * REGISTRO: las dos pantallas de crear la cuenta.
   *
   * Primero se pregunta quién es la persona y recién después el correo y la
   * contraseña. El orden importa: pedirle una contraseña a alguien que
   * todavía no sabe si el producto le sirve es la forma más rápida de
   * perderlo.
   */
  registro: {
    paso: (n: number, total: number) => `Paso ${n} de ${total}`,

    contanos: 'Contanos de vos.',
    contanosBajada: 'Son treinta segundos. Con esto Orden te queda armado para tu trabajo desde el primer día.',

    nombreApellido: 'Nombre y apellido',
    nombreApellidoEjemplo: 'Cómo te llamás',
    telefono: 'Teléfono',
    telefonoEjemplo: '0981 234 567',
    telefonoDetalle: 'Es por dónde te vamos a escribir si pasa algo con tu cuenta. No se lo damos a nadie.',
    aQueTeDedicas: 'A qué te dedicás',
    aQueTeDedicasEjemplo: 'Perfumería, taller mecánico, estancia…',
    opcional: 'Opcional',

    tuAcceso: 'Ahora, tu acceso.',
    tuAccesoBajada: 'Con esto entrás a Orden desde cualquier celular o computadora.',
    revisaDatos: 'Lo que pusiste',
    teInvitaron: '¿Te invitaron a un negocio que ya usa Orden?',
    entrarConCodigo: 'Entrar con mi código',
    sumarteAlEquipo: 'Sumarte a un equipo',
    sumateAlEquipo: 'Creá tu acceso',
    sumateAlEquipoBajada: 'Con esto entrás al negocio de quien te invitó. No hace falta que cargues ningún negocio propio.',
    despuesElCodigo: 'Apenas termines, te vamos a pedir el código que te pasaron.',
    prefieroCrearNegocio: 'Mejor quiero abrir mi propio negocio',
    editar: 'Editar',
    crearMiCuenta: 'Crear mi cuenta',
    creandoCuenta: 'Creando tu cuenta…',

    faltaNombre: 'Escribí tu nombre para seguir.',
    faltaNegocio: 'Falta el nombre del negocio.',
    faltaNombreCuenta: 'Ponele un nombre a tu cuenta.',
    telefonoRaro: 'Ese teléfono parece incompleto. Revisalo o dejalo vacío.',
    sinCuentaAun: '¿Todavía no tenés cuenta?',
    empezarAhora: 'Empezá ahora',
  },

  /**
   * ORGANIZACIÓN · la pantalla de la cuenta personal.
   *
   * Contesta una sola pregunta, y todo lo demás es el detalle de cómo se
   * llegó a ese número: cuánto te queda y para cuántos días. Un comercio
   * mira cómo le fue hoy; una persona con sueldo mira si llega a fin de mes.
   */
  organizacion: {
    titulo: 'Presupuesto y ahorro',

    teQuedan: 'Disponible',
    paraDias: (n: number) => (n === 1 ? 'para el último día del período' : `para los ${n} días restantes`),
    hastaEl: (fecha: string) => `hasta el ${fecha}, tu próxima fecha de cobro`,
    hastaFinDeMes: (fecha: string) => `hasta el ${fecha}`,
    porDia: (monto: string) => `${monto} por día`,
    enRojo: 'Tu gasto supera lo que te queda disponible para este período.',

    comoSaleEseNumero: 'Detalle del cálculo',
    entro: 'Ingresos del período',
    salio: 'Gastos registrados',
    cuotasPorVencer: 'Cuotas de deuda a vencer',
    fijosPorPagar: 'Gastos fijos pendientes',
    disponible: 'Disponible',

    cobroPendiente: 'Falta registrar tu ingreso',
    cobroPendienteDetalle:
      'No hay ingresos registrados en este período. Registralos y el disponible se calcula solo.',

    // ---- ingresos fijos ----
    entradas: 'Ingresos fijos',
    entradasDetalle:
      'Tu sueldo y cualquier ingreso que se repita cada mes. Definen la fecha en que arranca tu período: el mes se cuenta de cobro a cobro, no del 1 al 30.',
    sinEntradas: 'Sin ingresos fijos registrados',
    sinEntradasDetalle:
      'Registrá tu sueldo para que Orden calcule tu período desde tu fecha de cobro real.',
    agregarEntrada: 'Registrar ingreso fijo',
    queEs: 'Concepto',
    queEsEjemplo: 'Sueldo, alquiler que cobro, honorarios',
    cuanto: 'Importe',
    queDiaEntra: 'Día de acreditación',
    marcaMiCiclo: 'Define mi período',
    marcaMiCicloDetalle: 'Tu mes va a contarse desde este día hasta el mismo día del mes siguiente.',
    entraElDia: (d: number) => `se acredita el ${d}`,
    quitarEntrada: 'Eliminar',
    confirmarQuitarEntrada: (nombre: string) =>
      `¿Eliminar «${nombre}»? Tus movimientos registrados no se modifican.`,

    // ---- presupuesto ----
    elegiCategoria: 'Seleccioná una categoría',

    soloPersonal: 'Esta sección corresponde a las cuentas personales.',
    // ---- manejo de ingresos, dentro de la tarjeta de arriba ----
    verDetalle: 'Ver detalle',
    ocultarDetalle: 'Ocultar',
    loQueCobras: 'Lo que cobrás todos los meses',
    agregarOtroIngreso: 'Agregar otro ingreso fijo',
    dosPagos:
      'Si cobrás más de una vez al mes —sueldo a fin de mes y comisión a los quince días, por ejemplo— registrá cada uno por separado con su día. Marcá como «Define mi período» el que consideres tu cobro principal.',
    registrarIngreso: 'Registrar un ingreso recibido',
    registrarIngresoDetalle:
      'Una bonificación, una comisión, horas extra o algo que vendiste. A diferencia de los ingresos fijos, esto sí suma plata a tu período.',
    conceptoIngreso: 'Concepto',
    conceptoIngresoEjemplo: 'Bonificación de agosto, comisión, horas extra',
    fechaIngreso: 'Fecha',
    fechaFutura:
      'Esa fecha todavía no llegó. Un ingreso se registra el día que la plata entra: '
      + 'si lo cargás antes, Orden te muestra plata que todavía no tenés.',
    registrar: 'Registrar',


    // ---- gastos fijos ----
    salidas: 'Gastos fijos',
    salidasDetalle:
      'Alquiler, seguro, internet, línea del celular, transporte. Orden los descuenta de tu disponible desde el inicio del período y deja de descontarlos cuando registrás el pago.',
    sinSalidas: 'Sin gastos fijos registrados',
    sinSalidasDetalle:
      'Registrá lo que pagás todos los meses y vas a conocer tu disponible real desde el primer día del período.',
    agregarSalida: 'Registrar gasto fijo',
    queGasto: 'Concepto',
    queGastoEjemplo: 'Alquiler, seguro, internet, línea del celular',
    sinDiaFijo: 'Sin fecha fija',
    sinDiaFijoDetalle: 'Dejalo así para gastos diarios o sin vencimiento definido, como el transporte.',
    venceElDia: (d: number) => `vence el ${d}`,
    todoElMes: 'sin fecha fija',
    detalleGasto: 'Observaciones',
    detalleGastoEjemplo: 'Proveedor, número de contrato, plan contratado',
    yaPagado: 'al día',
    faltaPagarFijo: (monto: string) => `${monto} pendiente`,
    totalPorMes: (monto: string) => `${monto} mensuales`,
    quitarSalida: 'Eliminar',
    confirmarQuitarSalida: (nombre: string) =>
      `¿Eliminar «${nombre}»? Tus movimientos registrados no se modifican.`,

    // ---- ahorro ----
    cobrasteTrabajando: 'Lo que cobraste trabajando',
    cobrasteTrabajandoDetalle:
      'Ya te pagaron esto en otro negocio donde trabajás. Un toque y queda cargado acá, con la fecha real en que lo cobraste.',
    pagosSueltos: (n: number) => (n === 1 ? '1 pago sin traer' : `${n} pagos sin traer`),
    traerAMiCuenta: 'Traer a mi cuenta',
    ahorros: 'Ahorro',
    ahorrosDetalle:
      'El ahorro no es un gasto: la plata sigue siendo tuya, así que no figura como gasto en ningún reporte. Sí se descuenta del disponible, porque dejaste de tenerla para gastar.',
    sinAhorros: 'Sin fondos de ahorro',
    sinAhorrosDetalle: 'Creá un fondo —emergencias, un viaje, una compra— y destinale parte de tus ingresos.',
    agregarAhorro: 'Crear fondo',
    nombreDelFondo: 'Destino del fondo',
    nombreDelFondoEjemplo: 'Emergencias, viaje, vehículo',
    metaOpcional: 'Objetivo',
    metaDetalle: 'Dejalo vacío si querés ahorrar sin un objetivo definido.',
    fechaLimite: 'Para cuándo',
    fechaLimiteDetalle:
      'Si es para algo con fecha —un viaje, una cuota, un curso— ponela y te decimos cuánto guardar por mes para llegar.',
    paraEl: (fecha: string) => `Para el ${fecha}`,
    ritmo: (porMes: string, fecha: string) => `Guardá ${porMes} por mes para llegar al ${fecha}.`,
    faltan: (monto: string) => `Faltan ${monto}`,
    metaCumplida: 'Objetivo alcanzado.',
    fechaVencida: (falta: string) =>
      `La fecha ya pasó y faltaron ${falta}. Poné una fecha nueva o ajustá el objetivo.`,
    editarFondo: 'Editar',
    guardarPlata: 'Depositar',
    retirarPlata: 'Retirar',
    cuantoGuardas: 'Importe a depositar',
    cuantoRetiras: 'Importe a retirar',
    deLaMeta: (meta: string, pct: number) => `${pct}% de ${meta}`,
    sinMeta: 'sin objetivo definido',
    ahorradoEsteCiclo: 'Destinado a ahorro',
    quitarFondo: 'Eliminar fondo',
    confirmarQuitarFondo: (nombre: string) => `¿Eliminar el fondo «${nombre}»?`,

    // ---- categorías propias ----
    categoriaPropia: 'Crear una categoría',
    categoriaPropiaDetalle:
      'Si ninguna de las categorías representa tu gasto, definí la tuya. Orden la va a usar también al interpretar lo que dictes.',
    nombreCategoria: 'Nombre de la categoría',
    nombreCategoriaEjemplo: 'Mascotas, club, aporte familiar',
    pistasCategoria: 'Qué incluye',
    pistasCategoriaDetalle:
      'Escribí algunos ejemplos separados por coma. Sirven para que Orden clasifique solo lo que registres por voz o foto.',
    pistasCategoriaEjemplo: 'veterinaria, alimento balanceado, baño',
    crearCategoria: 'Crear categoría',
    eliminarCategoria: 'Eliminar categoría',
    confirmarEliminarCategoria: (nombre: string) =>
      `¿Eliminar la categoría «${nombre}»? Los movimientos ya registrados la conservan.`,
  },

  /**
   * EL PANEL DE UNA CUENTA PERSONAL.
   *
   * Nada de «ganancia bruta» ni «margen»: una persona no vende. Le queda
   * plata hasta fin de mes, y quiere saber cuánta.
   */
  panelPersonal: {
    guardado: 'Ahorro',
    esteMes: (monto: string) => `+${monto} este período`,
    venceEl: (fecha: string) => `próximo vencimiento: ${fecha}`,

    deDondeVino: 'Origen de tus ingresos',
    organizar: 'Administrar',
    sinEntradas: 'Sin ingresos registrados en este período',
    sinEntradasDetalle:
      'Registrá tu sueldo y cualquier otro ingreso. Podés dictarlo por voz y Orden lo clasifica solo.',
    fueraDeLoHabitual: (monto: string, principal: string) =>
      `${monto} de tus ingresos de este período no provienen de ${principal}.`,

    tusAhorros: 'Fondos de ahorro',
    sinAhorros: 'Sin fondos de ahorro',
    sinAhorrosDetalle: 'Los fondos que crees van a aparecer acá con su saldo y su progreso.',
    deLaMeta: (meta: string, pct: number) => `${pct}% de ${meta}`,
  },
  /** EL REPORTE DE UNA CUENTA PERSONAL. Nada de «ganancia»: una persona no
   *  produce ganancia, le queda o no le queda. */
  reportePersonal: {
    ingresos: 'Ingresos',
    gastos: 'Gastos',
    resultado: 'Resultado',
    ahorraste: (monto: string) => `En este período te sobraron ${monto} después de tus gastos.`,
    gastasteDeMas: (monto: string) => `En este período gastaste ${monto} más de lo que ingresaste.`,

    origen: 'Origen de tus ingresos',
    sinIngresos: 'Sin ingresos en este período',
    sinIngresosDetalle: 'Cuando registres lo que cobrás, vas a ver acá de dónde viene cada parte.',

    destino: 'Distribución de tus gastos',
    sinGastos: 'Sin gastos en este período',
    sinGastosDetalle: 'Cuando registres tus gastos, vas a ver acá cómo se reparten.',

    descarga: 'Descargar tus movimientos',
    descargaDetalle: 'Planilla con el detalle de todo lo que registraste en el período.',
  },


  /** VENDER: la pantalla de mostrador. */
  venta: {
    buscarProducto: 'Buscar producto…',
    sinProductos: 'Todavía no cargaste productos',
    sinProductosDetalle: 'Cargá tus productos con precio y costo para vender de dos toques y ver tu margen real.',
    cargarProductos: 'Cargar productos',
    nadaCoincide: 'Nada coincide',
    nadaCoincideDetalle: 'Probá con otra palabra o cambiá de categoría.',
    estaVenta: 'Esta venta',
    carritoVacio: 'Sin productos',
    carritoVacioDetalle: 'Tocá un producto para sumarlo.',
    restarUno: 'Restar uno',
    sumarUno: 'Sumar uno',
    comoTePagan: 'Cómo te pagan',
    descuento: 'Descuento',
    cliente: 'Cliente',
    opcional: 'Opcional',
    fecha: 'Fecha',
    subtotal: 'Subtotal',
    total: 'Total',
    teQueda: 'Te queda',
    ventaSuelta: 'Venta suelta',
    ventaSueltaDetalle: 'Algo que no está en tu catálogo.',
    precio: 'Precio',
    queEs: 'Qué es',
    queEsEjemplo: 'Ej. Cargador tipo C',
    teCosto: 'Te costó',
    agregar: 'Agregar',
  },

  /** PRODUCTOS: el catálogo. */
  productos: {
    activos: 'Productos activos',
    invertido: 'Invertido en stock',
    siVendesTodo: 'Si vendés todo',
    unidades: 'Unidades en stock',
    valorVenta: 'Valor a la venta',
    porReponer: 'Por reponer',
    buscar: 'Buscar…',
    colProducto: 'Producto',
    colCosto: 'Costo',
    colPrecio: 'Precio',
    colMargen: 'Margen',
    colStock: 'Stock',
    editar: 'Editar',
    poneNombre: 'Poné un nombre.',
    nombre: 'Nombre',
    categoria: 'Categoría',
    teCuesta: 'Te cuesta',
    loVendesA: 'Lo vendés a',
    ganasPorUnidad: 'Ganás por unidad',
    controlarStock: 'Controlar stock',
    controlarStockDetalle: 'Cada venta descuenta unidades automáticamente',
    // Un corte no tiene «costo de compra»: lo que se lleva quien lo hace
    // se define en Equipo y reparto —comisión, alquiler, sueldo— y cambia
    // según quién atienda. Ponerle acá un costo fijo sería inventar un
    // número que ni siquiera es el mismo todos los días.
    sinCostoServicio: 'Un servicio no tiene costo de compra: lo que se lleva quien lo hace se define en Equipo y reparto.',
    stockActual: 'Stock actual',
    avisarCuandoQuede: 'Avisar cuando quede',
  },

  /** Lo que queda: pantallas que también estaban escritas en español a mano. */
  pantallas: {
    // ---- crear cuenta ----
    primerPaso: 'Primer paso',
    empecemos: 'Empecemos.',
    creaTuCuenta: 'Creá tu cuenta o sumate a una con el código que te pasaron.',
    paraQueLoVasAUsar: '¿Para qué lo vas a usar?',
    paraMiNegocio: 'Para mi negocio',
    paraMiNegocioDetalle: 'Ventas, productos y stock. Podés sumar vendedores.',
    paraMi: 'Para mí',
    paraMiDetalle: 'Sueldo, gastos y deudas. Sin ventas ni productos.',
    diasPrueba: (n: number) => `${n} días de prueba`,
    enQueAndas: '¿En qué andás?',
    rubroDetalle: 'Adapta las categorías y las pantallas a tu trabajo. Se puede cambiar después.',
    poneleNombre: 'Ponele un nombre',
    nombreDelNegocio: 'Nombre del negocio',
    ejemploNegocio: 'Ej. Perfumería Aurora',
    ejemploPersonal: 'Ej. Mis finanzas',
    moneda: 'Moneda',
    tuNombre: 'Tu nombre',
    comoTeLlamamos: 'Cómo querés que te llamemos',
    comoTeVen: 'Cómo te ven tus colaboradores',
    crearEmpresa: 'Crear empresa',
    unirmeConCodigo: 'Unirme con código',
    codigoEmpresa: 'Código de la empresa',
    quienCargo: 'Para que sepan quién cargó cada venta',
    crearYEmpezar: 'Crear y empezar',
    unirme: 'Unirme',
    entrando: 'Entrando…',
    cerrarSesion: 'Cerrar sesión',
    comoNosConociste: '¿Cómo nos conociste?',
    prefieroNoDecir: 'Prefiero no decir',
    unConocido: 'Un conocido me lo recomendó',

    // ---- monedas ----
    monedaPYG: 'Guaraníes (Gs.)',
    monedaUSD: 'Dólares (US$)',
    monedaARS: 'Pesos argentinos ($)',
    monedaBRL: 'Reales (R$)',
    monedaEUR: 'Euros (€)',

    // ---- ajustes ----
    tuNegocio: 'Tu negocio',
    tuCuenta: 'Tu cuenta',
    sumarGente: 'Sumar gente al equipo',
    estadoSistema: 'Estado del sistema',
    estadoCaptura: 'Registro por voz, foto y texto',
    estadoCapturaOk: 'Funcionando. Tocá el botón verde y contale al sistema lo que pasó.',
    estadoCapturaMal: 'Falta configurar OPENAI_API_KEY en las variables de entorno del proyecto.',
    estadoTuyos: 'Tus datos son solo tuyos',
    estadoTuyosOk: 'Nadie más puede entrar a esta cuenta, ni siquiera quien administra Orden. La separación está aplicada en la base de datos, no en la pantalla.',
    estadoNumeros: 'Tus números no se pueden falsear',
    estadoNumerosOk: 'Un movimiento no se puede crear ni borrar salteando el sistema. Lo que se anula queda registrado y deja de sumar, pero no desaparece.',
    estadoSaldo: 'El saldo de una deuda solo baja pagando',
    estadoSaldoOk: 'No se puede editar a mano: cada pago queda con su fecha. Así el historial siempre explica el saldo.',
    estadoSeparados: 'Datos separados por empresa',
    estadoSeparadosOk: 'Cada empresa ve solo lo suyo. La separación está aplicada en la base de datos.',
    estadoVentas: 'Las ventas no se pueden falsear',
    estadoVentasOk: 'Los costos salen del catálogo, no del navegador. Una venta no se puede crear ni borrar salteando el sistema, y anular devuelve el stock exacto.',
    estadoCostos: 'Los costos no salen del servidor sin permiso',
    estadoCostosOk: 'Un vendedor no puede recuperar el costo de compra, el margen ni la ganancia, ni siquiera consultando la base directamente.',
    estadoApp: 'App instalable en el celular',
    estadoAppOk: 'En Android: menú de Chrome → Instalar app. En iPhone: Compartir → Agregar a inicio.',
    quienPuedeQue: 'Quién puede hacer qué',
    colAccion: 'Acción',
    colPropietario: 'Propietario',
    colAdmin: 'Admin',
    colVendedor: 'Vendedor',
    comoSeCalculan: 'Cómo se calculan tus números',
    entro: 'Entró',
    salio: 'Salió',
    teQuedo: 'Te quedó',
    administracionOrden: 'Administración de Orden',
    abrirPanel: 'Abrir el panel de cuentas',
    abrirPanelDetalle: 'Quién se registró, en qué plan está y a quién le vence la prueba. Los números de cada negocio no se ven desde ahí.',

    // ---- reportes ----
    descargarExcel: 'Descargar el Excel del periodo',
    rankingCompleto: 'Ranking completo de productos',
    sinVentasPeriodo: 'Sin ventas en este periodo',
    sinVentasPeriodoDetalle: 'Cambiá el rango o registrá tu primera venta.',
    comoTePagaron: 'Cómo te pagaron',
    sinCobros: 'Sin cobros',
    sinCobrosDetalle: 'Cuando registres ventas vas a ver acá cómo te pagan.',
    gastosPorCategoria: 'Gastos por categoría',
    sinGastos: 'Sin gastos',
    sinGastosDetalle: 'Registrar gastos es lo que vuelve real a la ganancia neta.',
    colUnidadesLargo: 'Unidades',
    colMov: 'Mov.',
    descuentos: 'Descuentos',

    // ---- reto ----
    sinReto: 'Todavía no tenés un reto',
    sinRetoDetalle: 'Poné una meta con fecha límite y el sistema calcula solo cuánto te falta y a qué ritmo tenés que ir.',
    retoEnCurso: 'Reto en curso',
    metaAlcanzadaDetalle: '¡Meta alcanzada! Todo lo que sigue es de más.',
    teFaltan: 'Te faltan',
    porDiaParaLlegar: 'Por día para llegar',
    ritmoActual: 'Ritmo actual',
    siSeguisAsi: 'Si seguís así',
    mejorDia: 'Mejor día',
    comoVieneCadaDia: 'Cómo viene cada día',
    loQueMasTira: 'Lo que más está tirando',
    sinVentasTodavia: 'Sin ventas todavía',
    sinVentasRetoDetalle: 'Registrá tu primera venta del reto y acá vas a ver qué producto rinde más.',
    ajustarReto: 'Ajustar el reto',
    retosAnteriores: 'Retos anteriores',
    editarReto: 'Editar reto',
    nombreDelReto: 'Nombre del reto',
    meta: 'Meta',
    queContamos: 'Qué contamos',
    empieza: 'Empieza',
    termina: 'Termina',

    // ---- gastos ----
    cuanto: '¿Cuánto?',
    enQue: '¿En qué?',
    otraCategoria: 'Otra categoría',
    detalle: 'Detalle',
    formaDePago: 'Forma de pago',
    nota: 'Nota',
    nadaPorAca: 'Nada por acá',
    nadaPorAcaDetalle: 'Los gastos que cargues en este periodo van a aparecer en esta lista.',
    anulado: 'ANULADO',
    anulada: 'ANULADA',
    anularMovimiento: 'Anular movimiento',
    gastosDelPeriodo: 'Gastos del periodo',
    movimientosAnulados: 'Movimientos anulados',
    categoriaMasPesada: 'Categoría más pesada',

    // ---- movimientos ----
    buscarMovimiento: 'Buscar por producto, categoría o cliente…',
    sinMovimientos: 'Sin movimientos',
    sinMovimientosDetalle: 'Cambiá el rango de fechas o cargá tu primer movimiento con el botón verde.',
    anular: 'Anular',
    colCant: 'Cant.',
    colPUnit: 'P. unit.',
    sinDetalleProductos: 'Movimiento sin detalle de productos.',
    movimientosValidos: 'Movimientos válidos',

    // ---- anular ----
    anularQueda: '· Queda en el historial marcada como anulada, no se borra.',
    anularDejaSumar: '· Deja de sumar en el panel, los reportes, el reto y el Excel.',
    anularVuelven: '· Vuelven',
    anularQuienFue: '· Queda registrado que la anulaste vos.',
    motivo: 'Motivo',
    motivoEjemplo: 'Para acordarte después',
    noDejarla: 'No, dejarla',

    // ---- aviso de cuenta ----
    pruebaTermino: 'Se te terminó la prueba',
    pruebaTerminoDetalle: 'Podés seguir entrando, viendo todo tu historial y bajando tu Excel. Para volver a cargar, activá tu plan.',
    verPlanes: 'Ver planes',
    ultimoDia: 'Hoy es el último día de tu prueba',
    ultimoDiaDetalle: 'Mañana vas a poder seguir viendo todo, pero no cargar. Activá tu plan y seguís donde estabas.',
    activarMiPlan: 'Activar mi plan',
    quedanDias: (n: number) => `Te queda${n === 1 ? '' : 'n'} ${n} día${n === 1 ? '' : 's'} de prueba`,
    quedanDiasDetalle: 'Después vas a poder seguir viendo todo lo tuyo, pero para cargar hace falta activar el plan.',

    // ---- varios ----
    desde: 'Desde',
    hasta: 'Hasta',
    inicio: 'Inicio',
    privacidad: 'Privacidad',
    terminos: 'Términos',
    comoSePaga: 'Cómo se paga',
    comoSePagaDetalle: 'Por transferencia. Tocás el botón, se abre un WhatsApp con nosotros y lo arreglamos ahí mismo: no hace falta cargar ninguna tarjeta. Apenas entra la transferencia te activamos la cuenta y seguís exactamente donde estabas.',
  },

  panel: {
    gananciaNeta: 'Ganancia neta',
    vendido: 'Vendido',
    gastos: 'Gastos',
    gananciaBruta: 'Ganancia bruta',
    delAnio: 'En lo que va del año',
    operaciones: 'Operaciones',
    ticketPromedio: 'Ticket promedio',
    unidades: 'Unidades',
    ventasCargadas: 'ventas cargadas',
    porVenta: 'por venta',
    productosEntregados: 'productos entregados',
    vendidoDetalle: (n: number) => `${n} ventas`,
    margenDe: (p: string) => `margen ${p}`,
    mayorGasto: (nombre: string) => `mayor: ${nombre}`,
    sinGastos: 'sin gastos',
    vendidoEnAnio: (m: string) => `${m} vendido`,

    retoActivo: 'Reto activo',
    metaAlcanzada: 'Meta alcanzada',

    loQueDebes: 'Lo que debés',
    vencidas: (n: number) => (n === 1 ? '1 vencida' : `${n} vencidas`),
    vencenSemana: (n: number) => (n === 1 ? '1 vence esta semana' : `${n} vencen esta semana`),

    diaPorDia: 'Día por día',

    masVendido: 'Lo que más se vendió',
    sinVentas: 'Todavía no hay ventas',
    sinVentasDetalle: 'Tocá el botón verde y contale al sistema tu primera venta.',
    colProducto: 'Producto',
    colUnidades: 'Unid.',
    colVendido: 'Vendido',
    colGanancia: 'Ganancia',

    enQueSeFue: 'En qué se fue la plata',
    cargarGasto: 'Cargar gasto',
    sinGastosCargados: 'Ningún gasto cargado',
    sinGastosDetalle: 'Registrar los gastos es lo que hace que la ganancia neta sea real.',

    tuActividad: 'Tu actividad',
    verHistorial: 'Ver historial',

    porAcabarse: 'Se te está por acabar',
    irAProductos: 'Ir a productos',

    comoSeArma: 'Cómo se arma tu ganancia',
    aPrecioDeLista: 'Vendido a precio de lista',
    descuentosQueDiste: 'Descuentos que diste',
    vendidoCobrado: 'Vendido (lo cobrado)',
    otrosIngresos: 'Otros ingresos',
    costoDeLoVendido: 'Costo de lo vendido',
    gastosDelPeriodo: 'Gastos del periodo',

    tuResumen: 'Tu resumen del periodo',
    unidadesEntregadas: 'Unidades entregadas',
  },

  cierre: {
    titulo: 'Cierre del día',
    subtitulo: 'Diez segundos y sabés cómo te fue',
    entro: 'Entró',
    salio: 'Salió',
    quedo: 'Ganancia Neta',
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
    ahorroAnual: (n: number) => (n === 1 ? 'Un mes gratis' : `${n} meses gratis`),
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
    soloVos: 'Tus deudas con sus vencimientos',
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
    // Una cuenta personal no cierra el día: su ciclo va de cobro a cobro. Lo
    // que sí necesita es que no se le escapen los gastos chicos, que son los
    // que más fácil se olvidan y los que más ensucian el número del final.
    avisoCarga: 'Recordarme cargar mis gastos',
    avisoCargaDetalle: 'Solo si a esa hora todavía no cargaste nada, y solo si venís cargando.',
    avisoSemanal: 'Resumen de la semana por email',
    avisoSemanalDetalle: 'Los lunes, con lo que pasó los últimos siete días.',
    avisoTurnos: 'Los turnos de mañana',
    avisoTurnosDetalle: 'Un aviso a la tarde con cuántos turnos tenés al día siguiente y a cuántos todavía no les avisaste.',
    horaCierre: 'A qué hora recordarte',
    activarPush: 'Activar avisos en este dispositivo',
    pushActivo: 'Avisos activados acá',
    pushBloqueado: 'El navegador tiene los avisos bloqueados. Habilitalos desde sus ajustes.',
    pushNoSoportado: 'Este navegador no admite avisos.',
    pushIphone: 'En iPhone hay que agregar Orden a la pantalla de inicio para recibir avisos.',
    guardado: 'Guardado',
  },

  deudas: {
    titulo: 'Deudas',
    subtitulo: 'Lo que debés, y cuándo vence',
    vacio: 'No tenés ninguna deuda cargada',
    vacioDetalle: 'Cargá tu tarjeta, un préstamo o lo que le debés al proveedor, y Orden te avisa antes de que venza.',

    totalDebido: 'Debés en total',
    proximoVence: 'Próximo vencimiento',
    sinVencimiento: 'Sin fecha',
    vencidas: (n: number) => (n === 1 ? '1 deuda vencida' : `${n} deudas vencidas`),
    vencePronto: (n: number) => (n === 1 ? '1 vence esta semana' : `${n} vencen esta semana`),

    tipoTarjeta: 'Tarjeta',
    tipoPrestamo: 'Préstamo',
    tipoProveedor: 'Proveedor',
    tipoOtro: 'Otro',

    nueva: 'Cargar una deuda',
    nombre: 'Qué es',
    nombreEjemplo: 'Ej: Visa Itaú, préstamo de la moto',
    acreedor: 'A quién le debés',
    acreedorEjemplo: 'Banco, financiera o proveedor',
    montoTotal: 'Cuánto es en total',
    saldoActual: 'Cuánto te falta pagar',
    saldoAyuda: 'Si ya venías pagando, poné lo que te queda. Si es nueva, dejalo igual al total.',
    cuotas: 'En cuántas cuotas',
    montoCuota: 'Cuánto es cada cuota',
    vence: 'Cuándo vence la próxima',
    notas: 'Nota',
    guardar: 'Guardar la deuda',

    pagar: 'Registrar un pago',
    cuantoPagaste: 'Cuánto pagaste',
    comoPagaste: 'Cómo lo pagaste',
    crearGasto: 'Anotarlo también como gasto',
    crearGastoDetalle: 'Recomendado: esa plata salió de tu bolsillo y así la vas a ver en tus números.',
    pagoListo: (saldo: string) => `Listo. Te quedan ${saldo}.`,
    pagoSaldada: '¡Listo, terminaste de pagarla!',
    sobrante: (monto: string) => `Pagaste ${monto} de más. Se aplicó solo lo que faltaba.`,

    saldo: 'Te falta',
    de: 'de',
    cuotaDe: (pagadas: number, totales: number) => `Cuota ${pagadas} de ${totales}`,
    venceEn: (dias: number) => (dias === 0 ? 'Vence hoy' : dias === 1 ? 'Vence mañana' : `Vence en ${dias} días`),
    vencioHace: (dias: number) => (dias === 1 ? 'Venció ayer' : `Venció hace ${dias} días`),
    saldada: 'Saldada',
    verPagos: 'Ver los pagos',
    sinPagos: 'Todavía no registraste ningún pago',
    archivar: 'Archivar',
    archivarConfirmar: 'La sacamos de la lista. Los pagos que registraste quedan.',
    verSaldadas: 'Ver también las saldadas',
    soloAdmin: 'Las deudas del negocio las ve y las maneja la administración.',
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

  soporte: {
    titulo: 'Ayuda',
    detalle: 'Si algo no anda o no entendés algo, escribinos. Contestamos nosotros, no un robot.',
    whatsapp: 'Escribinos por WhatsApp',
    email: 'Mandanos un correo',
    mensajeInicial: 'Hola, tengo una consulta sobre Orden.',
    horario: 'De lunes a sábado. Si escribís de noche, te contestamos a la mañana.',
  },

  reparto: {
    titulo: 'Equipo y reparto',
    intro:
      'Quién trabaja con vos y cómo se reparte lo que cobra cada uno. La parte del profesional no cuenta como ganancia tuya: se descuenta sola de tus números.',

    // ---- el desglose ----
    deDondeSalio: 'De dónde salió lo tuyo',
    misCortes: 'Mis servicios',
    misCortesDetalle: 'Lo que cobraste con tus propias manos',
    deMiEquipo: 'De mi equipo',
    deMiEquipoDetalle: 'Lo que te queda de lo que cobraron ellos',
    mercaderia: 'Productos vendidos',
    mercaderiaDetalle: 'Precio menos lo que te costó',
    otrosIngresos: 'Otros ingresos',
    otrosIngresosDetalle: 'Alquiler de sillas y todo lo que entra sin ser una venta',
    totalTuyo: 'Total que te queda',
    antesDeGastos: 'antes de los gastos del local',
    cierraConElPanel: 'Los tres primeros suman exactamente la ganancia bruta del panel.',

    // ---- el equipo ----
    equipo: 'El equipo',
    sinEquipo: 'Todavía no cargaste a nadie',
    sinEquipoDetalle: 'Agregá a quienes trabajan con vos y definí cómo se reparte lo que cobra cada uno.',
    agregar: 'Agregar a alguien',
    nombrePersona: 'Nombre',
    nombreEjemplo: 'Pedro, Ana, Luis',
    comoSeReparte: 'Cómo se reparte',
    repartoLocal: 'Todo para el local',
    repartoLocalDetalle: 'Tus propios servicios, o los de alguien cuyo cobro es entero del negocio.',
    repartoComision: 'Comisión',
    repartoComisionDetalle: 'Se lleva un porcentaje de lo que cobra; el resto queda en el local.',
    repartoAlquiler: 'Alquila la silla',
    repartoAlquilerDetalle: 'Se queda con el 100% y te paga una mensualidad. Sus cobros no entran a tu caja.',
    repartoSueldo: 'A sueldo',
    repartoSueldoDetalle: 'Cobra para el local y vos le pagás un sueldo aparte.',
    cuantoSeLleva: 'Cuánto se lleva',
    cuentaDeOrden: 'Su cuenta en Orden',
    sinCuenta: 'Sin cuenta · le cargás vos',
    cuentaDetalle: 'Si tiene cuenta puede cargar sus propios servicios y ver lo suyo, nunca lo tuyo.',
    quitar: 'Quitar del equipo',
    confirmarQuitar: (nombre: string) => `¿Quitar a ${nombre} del equipo?`,

    // ---- la liquidación ----
    liquidacion: 'Cuánto le toca a cada uno',
    liquidacionDetalle: 'En el período que estás mirando. Un servicio anulado no se le paga a nadie.',
    colPersona: 'Persona',
    colServicios: 'Servicios',
    colCobrado: 'Cobró',
    colLeToca: 'Le toca',
    colPagado: 'Ya le pagaste',
    colLeDebe: 'Le debés',
    pagar: 'Registrar pago',
    cuantoLePagas: 'Cuánto le pagás',
    pagarDetalle: 'Queda registrado como un gasto del negocio, con su nombre.',
    alDia: 'al día',

    // ---- cobrar un servicio ----
    cobrar: 'Cobrar un servicio',
    quienAtendio: 'Quién lo atendió',
    queServicio: 'Qué servicio',
    aQuien: 'A quién',
    aQuienEjemplo: 'Nombre del cliente',
    precioSugerido: 'Precio',
    seLleva: (persona: string, monto: string) => `${persona} se lleva ${monto}`,
    quedaEnElLocal: (monto: string) => `Queda en el local: ${monto}`,
    noEntraALaCaja: 'Alquila la silla: este cobro no entra a tu caja.',
    sinServicios: 'Cargá primero un servicio en Productos, sin control de stock.',

    // ---- lo del profesional ----
    loMio: 'Lo mío',
    loMioDetalle: 'Tus servicios del período y lo que te corresponde.',
    meCorresponde: 'Me corresponde',
    yaCobre: 'Ya cobré',
    meDeben: 'Me deben',
    sinCortes: 'Todavía no cargaste ningún servicio en este período',
  },
  agenda: {
    tuLink: 'Tu link de reservas',
    sinLink: 'Todavía no creaste tu link',
    sinLinkDetalle: 'Es la dirección que compartís en Instagram o WhatsApp para que tus clientes elijan día y horario solos.',
    crearLink: 'Crear mi link',
    linkDetalle: 'Compartilo donde quieras. Quien entre elige con quién, qué servicio y a qué hora, sin registrarse en nada.',
    copiar: 'Copiar',
    copiado: '¡Copiado!',
    linkActivo: 'Recibir reservas',
    verComoCliente: 'Ver como lo ve un cliente',
    editarLink: 'Editar',
    direccionDelLink: 'La dirección del link',
    cambiarLinkAviso: 'Si lo cambiás, los links que ya compartiste dejan de funcionar: los posteos viejos, tu biografía de Instagram y los estados de WhatsApp. El anterior no se le da a nadie más, pero tampoco vuelve.',
    direccionLocal: 'Dirección del local',
    mensaje: 'Un mensaje para tus clientes',
    mensajeEjemplo: 'Atendemos con turno. Llegá cinco minutos antes.',

    turnosDe: 'Turnos del',
    sinTurnos: 'Sin turnos para este día',
    sinTurnosDetalle: 'Los que reserven por tu link aparecen solos. Al que llame por teléfono, anotalo vos.',
    diaAnterior: 'Día anterior',
    diaSiguiente: 'Día siguiente',

    anotarTurno: 'Anotar un turno',
    anotarDetalle: 'Para el que llamó o escribió por WhatsApp. El horario sale de la agenda, así que no se puede pisar con otro turno ni caer fuera del horario de atención.',
    conQuien: 'Con quién',
    queServicio: 'Qué servicio',
    queDia: 'Qué día',
    elegir: 'Elegir…',
    horariosLibres: 'Horarios libres',
    sinHuecos: 'Ese día no queda ningún horario libre. Probá con otro.',
    nombreCliente: 'Nombre del cliente',
    telefonoCliente: 'Teléfono',
    confirmarTurno: 'Anotar el turno',
    sinReservablesDetalle: 'Ninguno de tus servicios está marcado para reservarse todavía, así que no hay horarios que ofrecer. Se marca más abajo, en «Qué se puede reservar».',
    porElLink: 'por el link',
    atender: 'Atendido, cobrar',
    atendido: 'Cobrado',
    noVino: 'No vino',
    confirmarNoVino: (nombre: string) => `¿Marcar que ${nombre} no vino?`,
    mover: 'Mover',
    avisar: 'Avisar',
    yaAvisado: 'Avisado ✓',
    sinAvisar: (n: number) => (n === 1
      ? 'A 1 todavía no le avisaste.'
      : `A ${n} todavía no les avisaste.`),
    /** Lo que se le manda por WhatsApp. Va con el enlace para cancelar:
        recordarle sin darle cómo avisar convierte al que no puede venir en
        un plantón, en vez de en un hueco libre para otro. */
    mensajeRecordatorio: (d: {
      cliente: string; negocio: string; fecha: string; hora: string;
      servicio: string; enlace: string;
    }) => `¡Hola ${d.cliente}! Te recordamos tu turno en ${d.negocio}: ${d.fecha} a las `
      + `${d.hora} (${d.servicio}). Si no podés venir, avisanos`
      + (d.enlace ? ` o cancelalo acá: ${d.enlace}` : '') + '.',
    mananaTenes: (turnos: number, sinAvisar: number) => {
      const cuantos = turnos === 1 ? 'Mañana tenés 1 turno' : `Mañana tenés ${turnos} turnos`;
      if (sinAvisar === 0) return `${cuantos}. Ya les avisaste a todos.`;
      return sinAvisar === 1
        ? `${cuantos}. A 1 todavía no le avisaste.`
        : `${cuantos}. A ${sinAvisar} todavía no les avisaste.`;
    },
    confirmarCancelar: (nombre: string) =>
      `¿Cancelar el turno de ${nombre}? El horario queda libre para otro.`,
    moverDetalle: 'Elegí el horario nuevo. Si cambiás con quién, el turno pasa a su agenda. El enlace que le mandaste al cliente sigue funcionando igual.',
    confirmarMover: 'Mover el turno',

    queSeReserva: 'Qué se puede reservar',
    queSeReservaDetalle: 'Cuánto dura cada servicio y cuáles aparecen en tu link. De la duración salen los horarios que se ofrecen.',
    seReserva: 'En el link',
    sinServicios: 'No tenés servicios cargados',
    sinServiciosDetalle: 'Creá uno en Productos con el control de stock apagado: eso es lo que distingue un servicio de algo que vendés.',

    horarios: 'Horarios de atención',
    horariosDetalle: 'Cuándo trabaja cada uno. Se pueden cargar varias franjas por día: si cerrás al mediodía, cargá la mañana y la tarde por separado.',
    sinHorario: 'Sin horario cargado, así que no aparece en el link',
    agregarFranja: 'Agregar franja',
    dia: 'Día',
    desde: 'Desde',
    hasta: 'Hasta',
    sinEquipo: 'Todavía no cargaste a nadie',
    sinEquipoDetalle: 'Agregá a tu equipo en Equipo y reparto, y después definí sus horarios acá.',

    diasEspeciales: 'Feriados y días libres',
    diasEspecialesDetalle: 'Los días que el local cierra, las vacaciones de cada uno, y los días que abrís en otro horario. Mientras estén cargados, tu link no ofrece turnos.',
    agregarDiaEspecial: 'Agregar',
    quienCierra: 'Quién',
    todoElLocal: 'Todo el local',
    cerradoTodoElDia: 'Cerrado',
    abroEnOtroHorario: 'Abro en otro horario',
    primerDia: 'Primer día',
    ultimoDia: 'Último día',
    motivo: 'Motivo (opcional)',
    motivoEjemplo: 'Vacaciones, feriado, médico…',
    volverAAbrir: 'Volver a abrir',
    avisoTurnosYaTomados: 'Cerrar un día no cancela los turnos que ya tenías anotados: esos hay que moverlos o cancelarlos uno por uno.',
    sinDiasEspeciales: 'No hay ningún día especial cargado',
    sinDiasEspecialesDetalle: 'Todo funciona con el horario de siempre.',
    rangoDeDias: (desde: string, hasta: string) => `Del ${desde} al ${hasta}`,
    abreDe: (desde: string, hasta: string) => `Abre de ${desde} a ${hasta}`,
  },

  lotes: {
    enCurso: 'Lotes en curso',
    detalle: 'Para lo que tarda meses en dar ganancia. Los gastos y las ventas se cargan donde siempre: acá se dice a qué ciclo pertenece cada uno y se ve cómo viene.',
    nuevo: 'Abrir un lote',
    sinLotes: 'No tenés ningún lote abierto',
    sinLotesDetalle: 'Un lote es un ciclo: los novillos de este corral, la soja de esta campaña, la obra de un cliente. Abrí uno y empezá a cargarle lo que le vas poniendo.',
    cerrados: 'Ya cerrados',
    cerradosDetalle: 'Quedan para comparar: cómo te fue esta zafra contra la anterior.',

    resultado: 'resultado',
    puesto: 'Puesto',
    cobrado: 'Cobrado',
    porUnidad: (monto: string, unidad: string) => `${monto} por ${unidad.replace(/s$/, '')}`,
    llevaDias: (n: number) => (n === 1 ? 'lleva 1 día' : `lleva ${n} días`),
    duroDias: (n: number) => (n === 1 ? 'duró 1 día' : `duró ${n} días`),
    cuantosMovimientos: (n: number) => (n === 1 ? '1 movimiento' : `${n} movimientos`),
    todaviaSinNada: 'Todavía no le cargaste nada.',

    sacar: 'Sacar',
    sumar: 'Sumar',
    sumarAlgo: 'Sumarle algo que ya cargaste',
    sumarAlgoDetalle: 'Gastos e ingresos de los últimos dos meses que todavía no son de ningún lote.',
    haySueltos: (n: number) => (n === 1
      ? 'Hay 1 movimiento que todavía no es de ningún lote. Abrí uno para sumárselo.'
      : `Hay ${n} movimientos que todavía no son de ningún lote. Abrí uno para sumárselos.`),

    cerrar: 'Cerrar el lote',
    reabrir: 'Volver a abrirlo',
    confirmarCerrar: (nombre: string) =>
      `¿Cerrar ${nombre}? Sale de la lista de lo que está en curso. Si después aparece un gasto que faltaba, el resultado se corrige igual.`,

    nombre: 'Nombre del lote',
    nombreEjemplo: 'Novillos corral 3, Soja campaña 26, Casa de Pérez',
    cantidad: 'Cuántos',
    unidad: 'De qué',
    unidadEjemplo: 'cabezas, hectáreas…',
    abiertoEl: 'Desde cuándo',
    notas: 'Notas',
    abrir: 'Abrir el lote',
  },

  zonaPeligro: {
    titulo: 'Zona delicada',
    detalle: 'Lo de acá abajo no se puede deshacer. No hay papelera ni forma de recuperarlo.',

    vaciarTitulo: 'Empezar de cero',
    vaciarDetalle: 'Borra todas las ventas, gastos, productos y comprobantes de este negocio. El equipo, tu plan y el código de invitación quedan como están.',
    vaciarBoton: 'Vaciar el negocio',
    vaciarPide: (nombre: string) => `Escribí ${nombre} para confirmar`,
    vaciarListo: (movs: number) => `Listo. Se borraron ${movs} movimientos y el negocio quedó en cero.`,
    soloPropietarioVaciar: 'Solo el propietario puede vaciar el negocio.',

    borrarTitulo: 'Borrar mi cuenta',
    borrarDetalle: 'Se va tu cuenta y todo lo que tengas cargado. Después de esto no hay vuelta atrás.',
    borrarBoton: 'Borrar mi cuenta para siempre',
    borrarPide: 'Escribí BORRAR para confirmar',
    seBorran: 'Se borran estos negocios, con todo lo que tienen adentro:',
    meVoyDe: 'Salís de estos negocios, pero siguen funcionando sin vos:',
    bloqueadas: 'No podés borrar tu cuenta todavía: hay gente trabajando en estos negocios. Sacalos del equipo primero.',
    movimientosQueSePierden: (n: number) => (n === 1 ? 'Se pierde 1 movimiento' : `Se pierden ${n} movimientos`),
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
