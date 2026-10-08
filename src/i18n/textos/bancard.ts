/**
 * TEXTOS DEL PAGO CON BANCARD (02/10/2026).
 *
 * Matías: que las suscripciones se paguen con tarjeta y QR por Bancard, sin
 * tener que escribirle por WhatsApp; y en el Premium «el propietario elige
 * cuántos funcionarios va a querer, y de acuerdo a eso aparece el precio».
 *
 * Va en su propio archivo, como el plan Gratis: atraviesa /plan, la ventana
 * de pago, la pantalla de vuelta, el comprobante, lo que contestan las rutas
 * y el correo del comprobante. El diccionario lo incluye como `t.bancard`
 * (es.ts y pt.ts). El portugués va tipado con el español: si falta una
 * clave, no compila.
 *
 * LO QUE ESTOS TEXTOS NO DICEN:
 *   · Nunca el número de autorización ni el código de respuesta de Bancard:
 *     el manual 1.23 prohíbe mostrarlos («No debe mostrarse al usuario»). La
 *     única palabra de Bancard que se le muestra a la persona es
 *     `response_description`.
 *   · Nunca un precio escrito acá: los importes salen de la base.
 *   · «PIX» solo si el formulario lo ofrece (NEXT_PUBLIC_BANCARD_PIX=1).
 *
 * El panel de administración está en español fijo, como el resto de /admin.
 */
export const bancardEs = {
  /** Los botones de las tarjetas de planes. */
  boton: {
    pagar: 'Pagar con tarjeta o QR',
    pagarConPix: 'Pagar con tarjeta, QR o PIX',
    renovar: 'Renovar con tarjeta o QR',
    renovarConPix: 'Renovar con tarjeta, QR o PIX',
    prefieroTransferir: 'Prefiero pagar por transferencia',
  },

  /** La ventana de pago. */
  hoja: {
    titulo: (plan: string) => `Pagar el plan ${plan}`,
    cargando: 'Calculando cuánto es…',
    noSeCotizo: 'No pudimos calcular el precio. Probá de nuevo en un momento.',
    cuantasPersonas: '¿Cuántas personas van a usar la cuenta?',
    menos: 'Una persona menos',
    mas: 'Una persona más',
    personas: (n: number) => (n === 1 ? '1 persona' : `${n} personas`),
    incluye: (n: number) => `Incluye ${n}: vos y ${n - 1} más.`,
    cadaPersonaMas: (precio: string) => `Cada persona más, ${precio} por mes.`,
    yaSonEnTuEquipo: (n: number) => `Hoy ya son ${n} en tu equipo: no se puede pagar por menos.`,
    maximo: (n: number) => `Hasta ${n} personas.`,
    // Decía «escribinos», y «Sumar personas» y «Bajar» ya existen (07/10/2026).
    personasFijas: (n: number) =>
      `Tu plan es por ${n} personas y se renueva igual. Para cambiar la cantidad, andá a «Tu equipo», más abajo.`,
    /** «Premium Gs. 250.000 + 2 personas más × Gs. 60.000 = Gs. 370.000», la cuenta entera. */
    frase: (plan: string, base: string, extras: number, porPersona: string, total: string, anual: boolean) =>
      `${plan} ${base} + ${extras} ${extras === 1 ? 'persona más' : 'personas más'} × ${porPersona}${anual ? ' × 11 meses' : ''} = ${total}`,
    planAnual: 'Plan anual: pagás 11 meses y usás 12.',
    referencia: (usd: string) => `≈ ${usd}`,
    activoHasta: (fecha: string) => `Tu plan queda activo hasta el ${fecha}.`,
    yaPagoHasta: (fecha: string) => `Tu plan ya está pago hasta el ${fecha}. Este pago le suma otro período.`,
    seCobraEnGuaranies: 'Se cobra en guaraníes.',
    vasAPagar: (importe: string) => `Vas a pagar ${importe}`,
    abriendo: 'Abriendo el formulario seguro de Bancard…',
    formularioSeguro: 'Cargás los datos en el formulario seguro de Bancard. Orden no ve ni guarda el número de tu tarjeta.',
    noSeAbrio: 'No se pudo abrir el pago. Probá de nuevo en un rato, o pagá por transferencia.',
    enCurso: 'Ya tenés un pago empezado que todavía no se confirmó. Esperá unos minutos antes de pagar de nuevo.',
    volver: 'Volver',
  },

  /** Las líneas del desglose. */
  desglose: {
    plan: (plan: string, anual: boolean) => (anual ? `${plan} · un año` : plan),
    personasMas: (n: number, precio: string, anual: boolean) =>
      `${n} ${n === 1 ? 'persona más' : 'personas más'} × ${precio}${anual ? ' × 11 meses' : ''}`,
    descuentoPrimerPago: (pct: number) => `Descuento de tu primer pago (−${pct} %)`,
    descuentoConstancia: (pct: number) => `Descuento por constancia (−${pct} %)`,
    total: 'Total',
  },

  /** El formulario de Bancard adentro de Orden. */
  formulario: {
    cargando: 'Cargando el formulario de Bancard…',
    noCargo: 'El formulario de Bancard no cargó.',
    ayudaSafari:
      'Si el formulario no carga: en iPhone, andá a Ajustes → Safari y desactivá «Impedir seguimiento entre sitios», o abrí Orden en Chrome. También podés pagar por transferencia.',
  },

  /** Después de pagar. */
  resultado: {
    confirmando: 'Estamos confirmando tu pago…',
    noVuelvasAPagar: 'Estamos confirmando tu pago. Te avisamos apenas esté; no vuelvas a pagar.',
    rechazado: (detalle: string) => `No se pudo cobrar: ${detalle}`,
    rechazadoSinDetalle: 'No se pudo cobrar.',
    noSeCompleto: 'Ese pago no se completó. Si querés, probá de nuevo.',
    revertido: 'Ese pago se devolvió.',
    probarDeNuevo: 'Probar de nuevo',
    listo: 'Listo',
    noExiste: 'No encontramos ese pago.',
  },

  /** El comprobante (manual: fecha y hora, número de pedido, importe y descripción). */
  comprobante: {
    titulo: 'Pago aprobado',
    fechaYHora: 'Fecha y hora',
    pedido: 'N.º de pedido',
    importe: 'Importe',
    descripcion: 'Descripción',
    concepto: 'Concepto',
    conceptoPlan: (plan: string, anual: boolean, personas: number | null) =>
      `Plan ${plan} ${anual ? 'anual' : 'mensual'}${personas ? ` · ${personas} personas` : ''}`,
    conceptoPersonas: (personas: number | null) =>
      `Personas de más en el Premium${personas ? ` · ${personas} en total` : ''}`,
    /** Un cambio de plan con días pagos (130): de qué a qué. «Activo hasta» es la misma fecha de antes. */
    conceptoCambio: (antes: string | null, despues: string, personas: number | null) =>
      `Cambio de plan: ${antes ? `de ${antes} a ${despues}` : `a ${despues}`}${personas ? ` · ${personas} personas` : ''}`,
    activoHasta: 'Activo hasta',
    pagadoCon: 'Pagado con',
    tarjeta: (marca: string, ultimos4: string) => `${marca} •••• ${ultimos4}`,
    sitio: 'Orden · orden.com.py',
    guardalo: 'Guardá el número de pedido por si tenés que hacer una consulta.',
  },

  /** La sección de contacto que pide el manual («para evacuar consultas referentes a las compras»). */
  contacto: {
    dudas: '¿Dudas con tu pago? Escribinos',
    mensaje: (pedido: string | null) =>
      pedido
        ? `Hola, tengo una consulta sobre mi pago de Orden (pedido N.º ${pedido}).`
        : 'Hola, tengo una consulta sobre un pago de Orden.',
    terminos: 'Términos y condiciones',
  },

  /** En /plan, si quedó un pago sin confirmar. */
  enCurso: {
    titulo: 'Tenés un pago en curso',
    detalle: 'Si ya pagaste, se confirma solo en unos segundos. Si no lo terminaste, podés volver a abrir el pago.',
    confirmado: '¡Listo! Tu pago se confirmó.',
    tresDs: 'Tu banco pide que confirmes el pago.',
    ver: 'Ver el pago',
  },

  /** El 3D Secure: el banco quiere que la persona confirme el cobro con la tarjeta guardada. */
  tresDs: {
    titulo: 'Tu banco pide que confirmes el pago',
    detalle: 'Es una verificación de seguridad de tu banco. Completala acá y el pago termina solo.',
    confirmar: 'Confirmar el pago',
    esperando: 'Cuando termines, te mostramos el comprobante.',
  },

  /** La tarjeta guardada y el cobro automático. */
  tarjeta: {
    titulo: 'Cobro automático',
    guardar: 'Guardar mi tarjeta para el cobro de cada mes',
    guardarAnual: 'Guardar mi tarjeta para el cobro de cada año',
    cuando: 'El día anterior al vencimiento cobramos tu plan de esta tarjeta. La quitás cuando quieras.',
    /**
     * SIN PLAN PAGO ACTIVO NO SE PROMETE NINGÚN COBRO (decisión del 07/10/2026).
     * Una cuenta en prueba puede guardar la tarjeta, pero no se le cobra sola:
     * toda prueba nace con el plan Pro, y cobrarla sola era cobrarle el Pro a
     * quien nunca eligió plan. La tarjeta le sirve para pagar con un toque
     * cuando elija; desde ese primer pago las renovaciones sí son automáticas.
     * Estas tres claves reemplazan a `guardar`, `cuando` y `guardadaDetalle`
     * mientras la suscripción no esté activa.
     */
    guardarSinCobro: 'Guardar mi tarjeta',
    enPrueba: 'Tu tarjeta queda guardada. Cuando termine la prueba elegís tu plan y pagás con un toque; desde ahí se renueva sola.',
    sinPlanActivo: 'Tu tarjeta queda guardada. Elegís tu plan y pagás con un toque; desde ahí se renueva sola.',
    tuTarjeta: (marca: string, ultimos4: string) => `${marca} •••• ${ultimos4}`,
    sinMarca: 'Tarjeta guardada',
    proximoCobro: (fecha: string, importe: string | null) =>
      (importe ? `Próximo cobro: ${fecha} · ${importe}` : `Próximo cobro: ${fecha}`),
    reintentamos: (fecha: string) => `Volvemos a intentar el ${fecha}.`,
    noPudimos: (error: string) => `No pudimos cobrar: ${error}`,
    noPudimosSinDetalle: 'No pudimos cobrar de esta tarjeta.',
    pausado: 'El cobro automático quedó pausado. Pagá vos desde tu plan y se vuelve a activar solo.',
    /** La administración devolvió un pago (07/10/2026): no es «no pudimos cobrar», y no se vuelve a cobrar solo. */
    pagoRevertido: 'Te devolvimos el último pago, así que el cobro automático quedó pausado. Pagá vos desde tu plan y se vuelve a activar solo.',
    requiere3ds: 'Tu banco pide que confirmes el cobro: tocá «Confirmar el pago» más arriba.',
    bloqueada: 'Esta tarjeta quedó bloqueada 30 días por los rechazos. Cambiala, o pagá con QR.',
    sinPlan: 'Cuando tengas un plan pago, lo cobramos de esta tarjeta en cada renovación.',
    cobrarAhora: 'Cobrar ahora',
    cambiar: 'Cambiar',
    quitar: 'Quitar',
    quitarTitulo: '¿Quitar la tarjeta?',
    quitarDetalle: 'Si la quitás, tu plan no se renueva solo: te avisamos antes de que venza para que pagues.',
    quitada: 'Listo: ya no se te cobra más de esa tarjeta.',
    quitadaPendiente: 'Listo: ya no se te cobra más. Bancard termina de borrarla en un rato.',
    noSeQuito: 'No se pudo quitar la tarjeta. Probá de nuevo.',
    hojaTitulo: 'Guardar mi tarjeta',
    formularioSeguro: 'Vas a cargar tu tarjeta en el formulario seguro de Bancard. Orden no ve ni guarda el número.',
    autorizo: 'Autorizo a Orden a cobrar de esta tarjeta el precio de mi plan en cada renovación, hasta que la quite.',
    tuCelular: 'Tu celular',
    celularAyuda: 'Bancard lo pide para registrar la tarjeta.',
    celularInvalido: 'Escribí un celular válido.',
    continuar: 'Continuar',
    abriendo: 'Abriendo el formulario de Bancard…',
    verificando: 'Comprobando con Bancard que la tarjeta quedó guardada…',
    guardada: (marca: string, ultimos4: string) => `Tarjeta guardada: ${marca} •••• ${ultimos4}`,
    guardadaSinDetalle: 'Tarjeta guardada.',
    guardadaDetalle: 'Desde ahora, el día anterior al vencimiento cobramos tu plan de esta tarjeta.',
    noSeGuardo: 'No se pudo guardar la tarjeta.',
    noSeGuardoDetalle: (detalle: string) => `No se pudo guardar la tarjeta. ${detalle}`,
    /** Debajo de «No se pudo guardar»: lo que contestó Bancard en su formulario, tal cual (07/10/2026). */
    bancardRespondio: (respuesta: string) => `Bancard respondió: ${respuesta}`,
    /** Solo en el ambiente de prueba: ahí Bancard acepta una única cédula. */
    ayudaDePruebas: 'En pruebas, la tarjeta se guarda solo con una tarjeta de prueba de Bancard y la cédula 9661000.',
    /**
     * Bancard contestó que esa tarjeta ya está guardada en el comercio (no deja
     * guardarla dos veces, esté en la cuenta que esté): qué puede hacer la
     * persona. Va debajo de «Bancard respondió: …» (07/10/2026).
     */
    yaCatastrada: 'Bancard ya tiene guardada esa tarjeta. Si la cargaste hoy, esperá un rato: puede aparecer acá sola. Si no aparece, probá con otra tarjeta o escribinos y la liberamos.',
    /** Lo mismo, solo en el ambiente de prueba: quien prueba es la administración. */
    yaCatastradaPruebas: 'En pruebas la liberás vos: Administración → Bancard → «Tarjetas olvidadas en Bancard».',
    /** El formulario dijo que la guardó y Bancard todavía no la lista: la vuelve a mirar la conciliación. */
    sinConfirmar: 'Bancard recibió tu tarjeta, pero todavía no nos la confirma. La volvemos a mirar solos en menos de una hora: no la cargues de nuevo.',
    probarDeNuevo: 'Probar de nuevo',
    pagarConGuardada: (marca: string, ultimos4: string) => `Pagar con mi ${marca} •••• ${ultimos4}`,
    guardarYPagar: 'Guardar mi tarjeta y que se cobre sola cada mes',
    guardarYPagarAnual: 'Guardar mi tarjeta y que se cobre sola cada año',
    /** En la ventana de pago: se guarda y se paga en el mismo paso. Vale también para una cuenta en prueba. */
    guardarYPagarDetalle: 'Tu tarjeta queda guardada y pagás este plan con ella. Desde ese pago se renueva sola; la quitás cuando quieras.',
    cobrando: 'Cobrando de tu tarjeta…',
    noSeCobroConGuardada: 'No se pudo cobrar con la tarjeta guardada. Probá con el formulario de Bancard.',
    vueltaComprobando: 'Comprobando tu tarjeta…',
    vueltaListo: 'Listo. Te llevamos a tu plan…',
  },

  /**
   * El equipo de un Premium pago por Bancard (con cantidad): sumar personas
   * se paga hoy, prorrateado por los días que faltan, y queda para las
   * renovaciones; bajar rige desde la próxima renovación y nunca por debajo
   * del equipo de hoy. (Regla propuesta a Matías, pregunta 8 del contrato.)
   */
  equipo: {
    titulo: 'Tu equipo',
    personas: (n: number, enUso: number) => `${n} ${n === 1 ? 'persona' : 'personas'} (${enUso} en uso)`,
    contratadas: 'Tu plan Premium se cobra por esta cantidad de personas.',
    sumar: 'Sumar personas',
    sumarTitulo: 'Sumar personas',
    cuantasEnTotal: '¿Cuántas personas en total?',
    sumadas: (n: number) => (n === 1 ? '1 persona más' : `${n} personas más`),
    sePagaHoy: (importe: string, dias: number) =>
      `Se paga hoy ${importe} por ${dias === 1 ? 'el día que falta' : `los ${dias} días que faltan`} del período.`,
    desdeProxima: (importe: string, anual: boolean) => `Desde la próxima renovación son ${importe} por ${anual ? 'año' : 'mes'}.`,
    entranYa: 'Las personas nuevas pueden entrar apenas se confirma el pago.',
    /** Sumar deshace una baja programada menor (03/10/2026): lo que se paga queda para las renovaciones. */
    cancelaBaja: (n: number) => `Al sumar personas se cancela la baja programada a ${n}: tu plan se renueva por la cantidad nueva.`,
    maximo: 'Ya tenés el máximo de personas que admite el plan.',
    bajar: 'Bajar desde la próxima renovación',
    bajarTitulo: 'Bajar personas',
    bajarDetalle: 'No se cobra nada ahora. Hasta la próxima renovación seguís con las personas que tenés; desde ahí, tu plan se cobra por la cantidad que elijas.',
    programar: 'Programar la baja',
    bajaProgramada: (n: number, fecha: string) => `Desde el ${fecha} tu plan pasa a ${n} personas.`,
    bajaLista: 'Listo: desde la próxima renovación tu plan se cobra por esa cantidad.',
    deshacer: 'Deshacer',
    deshecha: 'Listo: tu plan sigue con las personas de hoy.',
    noSePudo: 'No se pudo cambiar la cantidad. Probá de nuevo.',
  },

  /**
   * CAMBIAR DE PLAN CON DÍAS PAGOS (07/10/2026; migración 130).
   *
   * Matías: «Me suscribí al Básico. Si la persona quiere cambiar al Pro o al
   * Premium me lleva al WhatsApp. ¿No hay una forma de que se pueda pagar con
   * tarjeta o con QR?». La regla, en dos líneas:
   *
   *   · SUBIR se paga hoy: la diferencia entre los dos planes por los días
   *     que faltan. La fecha de renovación no cambia.
   *   · BAJAR no se paga ni se devuelve: rige desde la próxima renovación.
   *
   * Antes de pagar la persona lee cuánto paga hoy, que su plan sigue
   * venciendo el mismo día, y cuánto va a pagar desde la renovación (con y
   * sin su descuento, si lo tiene) y cuándo se le cobra. Ningún importe está
   * escrito acá: todos salen de la base. Donde dice {tope} o {personas} va
   * `hoja.personas(n)` («1 persona», «3 personas»).
   */
  cambio: {
    // ---- Subir (se paga hoy)
    subir: (plan: string) => `Cambiar al ${plan}`,
    subirTitulo: (plan: string) => `Cambiar al plan ${plan}`,
    deA: (antes: string, despues: string) => `De ${antes} a ${despues}`,
    sePagaHoy: (importe: string, dias: number) =>
      `Se paga hoy ${importe}: la diferencia entre los dos planes por ${dias === 1 ? 'el día que falta' : `los ${dias} días que faltan`}.`,
    /** Con días de prueba por delante se cobran solo los días pagos: no son «los que faltan». */
    sePagaHoyDias: (importe: string, dias: number) =>
      `Se paga hoy ${importe}: la diferencia entre los dos planes por ${dias === 1 ? '1 día' : `${dias} días`}.`,
    /** Recién pagado en un mes de 31 días (o un año de 366): nunca más que el período entero. */
    sePagaHoyEntero: (importe: string, anual: boolean) =>
      `Se paga hoy ${importe}: la diferencia de un ${anual ? 'año' : 'mes'} entero.`,
    pruebaNoSeCobra: (dias: number) =>
      (dias === 1 ? 'El día de prueba que te queda no se cobra.' : `Los ${dias} días de prueba que te quedan no se cobran.`),
    mismaFecha: (fecha: string) => `Tu plan sigue venciendo el ${fecha}. La fecha no cambia.`,
    desdeProxima: (importe: string, anual: boolean) =>
      `Desde la próxima renovación pagás ${importe} por ${anual ? 'año' : 'mes'}.`,
    /** Con un descuento ganado van los dos números: el de lista y el que se cobraría hoy. */
    desdeProximaConDescuento: (importe: string, conDescuento: string, anual: boolean, constancia: boolean) =>
      `Desde la próxima renovación pagás ${importe} por ${anual ? 'año' : 'mes'}; con tu descuento ${constancia ? 'de constancia ' : ''}de hoy, ${conDescuento}.`,
    /** Con la tarjeta guardada y el débito al día: qué día se cobra sola esa renovación. */
    debito: (fecha: string, tarjeta: string | null) =>
      (tarjeta ? `El ${fecha} se cobra solo de tu ${tarjeta}.` : `El ${fecha} se cobra solo de tu tarjeta guardada.`),
    sinDescuento: 'El cambio no lleva descuento. Tu descuento vuelve en la renovación.',
    sinDescuentoHoy: 'El cambio no lleva descuento.',
    /** El selector de arriba muestra un período y la cuenta tiene el otro: sobre cuál se calcula. */
    otroPeriodo: (anual: boolean): string => (anual
      ? 'Tu plan es anual: el cambio se calcula por año.'
      : 'Tu plan es mensual: el cambio se calcula por mes. Para pasar al año, renová después eligiendo «por año».'),
    seActiva: 'El plan nuevo se activa apenas se confirma el pago. Si el pago no entra, no cambia nada.',
    cancelaLoProgramado: 'Al cambiar se cancela la baja que tenías programada.',
    /** Se volvió a cotizar justo antes de cobrar y ya no es lo que la hoja mostraba: no se cobra sin otro toque. */
    cambioElImporte: (importe: string) => `El importe cambió: ahora son ${importe}. Revisalo y tocá de nuevo para pagar.`,
    cambioLaFecha: 'La fecha de tu plan cambió. Revisá los datos y tocá de nuevo para pagar.',

    // ---- Bajar (no se paga: se programa)
    bajar: (plan: string) => `Bajar al ${plan} desde la renovación`,
    bajarTitulo: (plan: string) => `Bajar al plan ${plan}`,
    bajarDetalle: (actual: string, nuevo: string, importe: string, anual: boolean) =>
      `No se cobra nada ahora. Seguís con el ${actual} hasta la próxima renovación; desde ahí tu plan es ${nuevo} y pagás ${importe} por ${anual ? 'año' : 'mes'}.`,
    bajarDetalleConDescuento: (actual: string, nuevo: string, importe: string, conDescuento: string, anual: boolean, constancia: boolean) =>
      `No se cobra nada ahora. Seguís con el ${actual} hasta la próxima renovación; desde ahí tu plan es ${nuevo} y pagás ${importe} por ${anual ? 'año' : 'mes'}; con tu descuento ${constancia ? 'de constancia ' : ''}de hoy, ${conDescuento}.`,
    bajarIncluye: (nuevo: string, personas: string, capturas: number) =>
      `El ${nuevo} es para ${personas} y trae ${capturas} capturas con IA por mes.`,
    bajarTope: (personas: string) => `Mientras esté programado, tu equipo no puede pasar de ${personas}.`,
    sinDevolucion: 'Lo que ya pagaste de este período no se devuelve.',
    /** Programar el plan borra la baja de personas, y deshacer no la devuelve: se avisa antes. */
    cancelaBajaDePersonas: (n: number) => `Se cancela la baja a ${n} personas que tenías programada.`,
    programar: 'Programar el cambio',
    pastilla: 'Desde la próxima renovación',
    programado: (plan: string, fecha: string) => `Desde la renovación (${fecha}) tu plan pasa a ${plan}.`,
    seguirCon: (plan: string) => `Seguir con el ${plan}`,
    deshacer: 'Deshacer',
    listo: (plan: string) => `Listo: desde la próxima renovación tu plan es ${plan}.`,
    /** Deshacer después del aviso de vencimiento cambia lo que se cobra: se dice cuánto. */
    deshecho: (plan: string, importe: string | null) =>
      (importe ? `Listo: seguís con el ${plan}. La renovación vuelve a ser de ${importe}.` : `Listo: seguís con el ${plan}.`),
    /** El plan programado solo se paga a mano los últimos días: al pagar, cambia ahí mismo. */
    alPagarCambia: (plan: string) => `Al pagar, tu plan pasa a ${plan} en el momento.`,
    equipoBloqueado: 'Tenés un cambio de plan programado. Deshacelo para cambiar la cantidad de personas.',
    /** Con un pago sin terminar no se programa ni se deshace: se espera. */
    esperaElPago: 'Hay un pago en curso. Cuando se confirme vas a poder cambiarlo.',
    noSePudo: 'No se pudo programar el cambio. Probá de nuevo.',

    // ---- El equipo tiene que entrar en el plan (se dice ANTES de llegar a pagar)
    equipoGrande: (plan: string, tope: string, miembros: number) =>
      `El ${plan} es para ${tope}. Hoy son ${miembros} en tu equipo: cuando sean menos vas a poder programar el cambio.`,
    equipoNoEntra: (plan: string, tope: string, miembros: number) =>
      `El ${plan} es para ${tope} y hoy son ${miembros} en tu equipo. Achicá el equipo o elegí un plan donde entren todos.`,
    /** Con la cuenta vencida no se puede entrar a achicar el equipo: primero se paga el plan donde entran. */
    equipoNoEntraVencida: (plan: string, tope: string, miembros: number) =>
      `El ${plan} es para ${tope} y hoy son ${miembros} en tu equipo. Elegí un plan donde entren todos; después podés achicar el equipo y bajar de plan.`,
  },

  /** Mientras Bancard está en pruebas. */
  pruebas: {
    soloVos: 'Solo lo ves vos · Bancard en pruebas',
    ambienteDePrueba: 'Ambiente de prueba: no se cobra plata real',
  },

  noDisponible: 'El pago con tarjeta todavía no está habilitado para tu cuenta.',
  /** «Cómo se paga», con Bancard. */
  comoSePaga: 'Con tarjeta o QR, en el formulario seguro de Bancard: se activa en el momento. Si preferís transferir, te atendemos por WhatsApp.',
  comoSePagaConPix: 'Con tarjeta, QR o PIX, en el formulario seguro de Bancard: se activa en el momento. Si preferís transferir, te atendemos por WhatsApp.',

  /** Lo que contestan las rutas. */
  servidor: {
    pedidoInvalido: 'Ese pedido de pago no es válido.',
    sinEmpresa: 'No encontramos tu cuenta.',
  },

  /** El correo del comprobante y los avisos del cobro automático. */
  avisos: {
    comprobanteAsunto: 'Comprobante de tu pago · Orden',
    comprobanteIntro: (cuenta: string) => `Recibimos el pago del plan de ${cuenta}. Este es tu comprobante.`,
    comprobantePie: 'Si tenés una consulta sobre este pago, escribinos con el número de pedido.',
    rechazoTitulo: 'No pudimos cobrar tu plan',
    rechazo: (detalle: string | null) => (detalle ? `No pudimos cobrar tu plan: ${detalle}.` : 'No pudimos cobrar tu plan.'),
    rechazoReintento: (fecha: string) => `Volvemos a intentar el ${fecha}. Si querés, pagá ahora con otra tarjeta o QR.`,
    rechazoTarjeta: 'Esa tarjeta no sirve: cambiala en Tu plan.',
    rechazoTitular: 'Tu banco pide algo más: entrá a Tu plan y pagá vos.',
    rechazoUltimo: (fecha: string | null) =>
      (fecha ? `Tu plan vence el ${fecha}: entrá a Tu plan y pagá para seguir.` : 'Entrá a Tu plan y pagá para seguir.'),
    tresDsTitulo: 'Confirmá el pago de tu plan',
    tresDs: 'Tu banco pide que confirmes el pago de tu plan. Entrá a Tu plan.',
    tarjetaVenceTitulo: 'Tu tarjeta está por vencer',
    tarjetaVence: (marca: string, ultimos4: string) => `Tu ${marca} •••• ${ultimos4} vence antes del próximo cobro. Cambiala en Tu plan.`,
  },
};

export const bancardPt: typeof bancardEs = {
  boton: {
    pagar: 'Pagar com cartão ou QR',
    pagarConPix: 'Pagar com cartão, QR ou Pix',
    renovar: 'Renovar com cartão ou QR',
    renovarConPix: 'Renovar com cartão, QR ou Pix',
    prefieroTransferir: 'Prefiro pagar por transferência',
  },

  hoja: {
    titulo: (plan) => `Pagar o plano ${plan}`,
    cargando: 'Calculando o valor…',
    noSeCotizo: 'Não deu pra calcular o preço. Tente de novo em um instante.',
    cuantasPersonas: 'Quantas pessoas vão usar a conta?',
    menos: 'Uma pessoa a menos',
    mas: 'Uma pessoa a mais',
    personas: (n) => (n === 1 ? '1 pessoa' : `${n} pessoas`),
    incluye: (n) => `Inclui ${n}: você e mais ${n - 1}.`,
    cadaPersonaMas: (precio) => `Cada pessoa a mais, ${precio} por mês.`,
    yaSonEnTuEquipo: (n) => `Sua equipe já tem ${n} pessoas: não dá pra pagar por menos.`,
    maximo: (n) => `Até ${n} pessoas.`,
    personasFijas: (n) =>
      `Seu plano é para ${n} pessoas e renova igual. Para mudar a quantidade, vá em «Sua equipe», mais abaixo.`,
    frase: (plan, base, extras, porPersona, total, anual) =>
      `${plan} ${base} + ${extras} ${extras === 1 ? 'pessoa a mais' : 'pessoas a mais'} × ${porPersona}${anual ? ' × 11 meses' : ''} = ${total}`,
    planAnual: 'Plano anual: você paga 11 meses e usa 12.',
    referencia: (usd) => `≈ ${usd}`,
    activoHasta: (fecha) => `Seu plano fica ativo até ${fecha}.`,
    yaPagoHasta: (fecha) => `Seu plano já está pago até ${fecha}. Este pagamento soma mais um período.`,
    seCobraEnGuaranies: 'A cobrança é em guaranis.',
    vasAPagar: (importe) => `Você vai pagar ${importe}`,
    abriendo: 'Abrindo o formulário seguro da Bancard…',
    formularioSeguro: 'Você preenche os dados no formulário seguro da Bancard. A Orden não vê nem guarda o número do seu cartão.',
    noSeAbrio: 'Não deu pra abrir o pagamento. Tente de novo daqui a pouco, ou pague por transferência.',
    enCurso: 'Você já tem um pagamento iniciado que ainda não foi confirmado. Espere alguns minutos antes de pagar de novo.',
    volver: 'Voltar',
  },

  desglose: {
    plan: (plan, anual) => (anual ? `${plan} · um ano` : plan),
    personasMas: (n, precio, anual) =>
      `${n} ${n === 1 ? 'pessoa a mais' : 'pessoas a mais'} × ${precio}${anual ? ' × 11 meses' : ''}`,
    descuentoPrimerPago: (pct) => `Desconto do seu primeiro pagamento (−${pct} %)`,
    descuentoConstancia: (pct) => `Desconto por constância (−${pct} %)`,
    total: 'Total',
  },

  formulario: {
    cargando: 'Carregando o formulário da Bancard…',
    noCargo: 'O formulário da Bancard não carregou.',
    ayudaSafari:
      'Se o formulário não carregar: no iPhone, vá em Ajustes → Safari e desative «Impedir rastreamento entre sites», ou abra a Orden no Chrome. Você também pode pagar por transferência.',
  },

  resultado: {
    confirmando: 'Estamos confirmando seu pagamento…',
    noVuelvasAPagar: 'Estamos confirmando seu pagamento. Avisamos assim que estiver pronto; não pague de novo.',
    rechazado: (detalle) => `Não deu pra cobrar: ${detalle}`,
    rechazadoSinDetalle: 'Não deu pra cobrar.',
    noSeCompleto: 'Esse pagamento não foi concluído. Se quiser, tente de novo.',
    revertido: 'Esse pagamento foi devolvido.',
    probarDeNuevo: 'Tentar de novo',
    listo: 'Pronto',
    noExiste: 'Não encontramos esse pagamento.',
  },

  comprobante: {
    titulo: 'Pagamento aprovado',
    fechaYHora: 'Data e hora',
    pedido: 'N.º do pedido',
    importe: 'Valor',
    descripcion: 'Descrição',
    concepto: 'Referente a',
    conceptoPlan: (plan, anual, personas) =>
      `Plano ${plan} ${anual ? 'anual' : 'mensal'}${personas ? ` · ${personas} pessoas` : ''}`,
    conceptoPersonas: (personas) =>
      `Pessoas a mais no Premium${personas ? ` · ${personas} no total` : ''}`,
    conceptoCambio: (antes, despues, personas) =>
      `Mudança de plano: ${antes ? `de ${antes} para ${despues}` : `para ${despues}`}${personas ? ` · ${personas} pessoas` : ''}`,
    activoHasta: 'Ativo até',
    pagadoCon: 'Pago com',
    tarjeta: (marca, ultimos4) => `${marca} •••• ${ultimos4}`,
    sitio: 'Orden · orden.com.py',
    guardalo: 'Guarde o número do pedido caso precise tirar alguma dúvida.',
  },

  contacto: {
    dudas: 'Dúvidas sobre o seu pagamento? Fale com a gente',
    mensaje: (pedido) =>
      pedido
        ? `Olá, tenho uma dúvida sobre meu pagamento da Orden (pedido N.º ${pedido}).`
        : 'Olá, tenho uma dúvida sobre um pagamento da Orden.',
    terminos: 'Termos e condições',
  },

  enCurso: {
    titulo: 'Você tem um pagamento em andamento',
    detalle: 'Se você já pagou, ele se confirma sozinho em alguns segundos. Se não terminou, pode abrir o pagamento de novo.',
    confirmado: 'Pronto! Seu pagamento foi confirmado.',
    tresDs: 'Seu banco pede que você confirme o pagamento.',
    ver: 'Ver o pagamento',
  },

  tresDs: {
    titulo: 'Seu banco pede que você confirme o pagamento',
    detalle: 'É uma verificação de segurança do seu banco. Complete aqui e o pagamento termina sozinho.',
    confirmar: 'Confirmar o pagamento',
    esperando: 'Quando terminar, mostramos o comprovante.',
  },

  tarjeta: {
    titulo: 'Cobrança automática',
    guardar: 'Salvar meu cartão para a cobrança de cada mês',
    guardarAnual: 'Salvar meu cartão para a cobrança de cada ano',
    cuando: 'No dia anterior ao vencimento cobramos seu plano neste cartão. Você remove quando quiser.',
    guardarSinCobro: 'Salvar meu cartão',
    enPrueba: 'Seu cartão fica salvo. Quando o teste terminar, você escolhe seu plano e paga com um toque; a partir daí ele renova sozinho.',
    sinPlanActivo: 'Seu cartão fica salvo. Você escolhe seu plano e paga com um toque; a partir daí ele renova sozinho.',
    tuTarjeta: (marca, ultimos4) => `${marca} •••• ${ultimos4}`,
    sinMarca: 'Cartão salvo',
    proximoCobro: (fecha, importe) =>
      (importe ? `Próxima cobrança: ${fecha} · ${importe}` : `Próxima cobrança: ${fecha}`),
    reintentamos: (fecha) => `Tentamos de novo em ${fecha}.`,
    noPudimos: (error) => `Não deu pra cobrar: ${error}`,
    noPudimosSinDetalle: 'Não deu pra cobrar neste cartão.',
    pausado: 'A cobrança automática ficou pausada. Pague você pela tela do seu plano e ela volta a ativar sozinha.',
    pagoRevertido: 'Devolvemos seu último pagamento, por isso a cobrança automática ficou pausada. Pague você pela tela do seu plano e ela volta a ativar sozinha.',
    requiere3ds: 'Seu banco pede que você confirme a cobrança: toque em «Confirmar o pagamento» mais acima.',
    bloqueada: 'Este cartão ficou bloqueado por 30 dias pelas recusas. Troque o cartão, ou pague com QR.',
    sinPlan: 'Quando você tiver um plano pago, cobramos neste cartão a cada renovação.',
    cobrarAhora: 'Cobrar agora',
    cambiar: 'Trocar',
    quitar: 'Remover',
    quitarTitulo: 'Remover o cartão?',
    quitarDetalle: 'Se você remover, seu plano não renova sozinho: avisamos antes de vencer pra você pagar.',
    quitada: 'Pronto: não cobramos mais nesse cartão.',
    quitadaPendiente: 'Pronto: não cobramos mais. A Bancard termina de apagá-lo daqui a pouco.',
    noSeQuito: 'Não deu pra remover o cartão. Tente de novo.',
    hojaTitulo: 'Salvar meu cartão',
    formularioSeguro: 'Você vai preencher seu cartão no formulário seguro da Bancard. A Orden não vê nem guarda o número.',
    autorizo: 'Autorizo a Orden a cobrar neste cartão o preço do meu plano a cada renovação, até que eu o remova.',
    tuCelular: 'Seu celular',
    celularAyuda: 'A Bancard pede pra registrar o cartão.',
    celularInvalido: 'Escreva um celular válido.',
    continuar: 'Continuar',
    abriendo: 'Abrindo o formulário da Bancard…',
    verificando: 'Confirmando com a Bancard que o cartão ficou salvo…',
    guardada: (marca, ultimos4) => `Cartão salvo: ${marca} •••• ${ultimos4}`,
    guardadaSinDetalle: 'Cartão salvo.',
    guardadaDetalle: 'A partir de agora, no dia anterior ao vencimento cobramos seu plano neste cartão.',
    noSeGuardo: 'Não deu pra salvar o cartão.',
    noSeGuardoDetalle: (detalle) => `Não deu pra salvar o cartão. ${detalle}`,
    bancardRespondio: (respuesta) => `A Bancard respondeu: ${respuesta}`,
    ayudaDePruebas: 'Em testes, o cartão só é salvo com um cartão de teste da Bancard e a cédula (documento) 9661000.',
    yaCatastrada: 'A Bancard já tem esse cartão salvo. Se você cadastrou hoje, espere um pouco: ele pode aparecer aqui sozinho. Se não aparecer, tente com outro cartão ou fale com a gente que liberamos.',
    yaCatastradaPruebas: 'Em testes é você quem libera: Administração → Bancard → «Tarjetas olvidadas en Bancard».',
    sinConfirmar: 'A Bancard recebeu seu cartão, mas ainda não confirmou pra gente. Conferimos de novo sozinhos em menos de uma hora: não cadastre outra vez.',
    probarDeNuevo: 'Tentar de novo',
    pagarConGuardada: (marca, ultimos4) => `Pagar com meu ${marca} •••• ${ultimos4}`,
    guardarYPagar: 'Salvar meu cartão e cobrar sozinho todo mês',
    guardarYPagarAnual: 'Salvar meu cartão e cobrar sozinho todo ano',
    guardarYPagarDetalle: 'Seu cartão fica salvo e você paga este plano com ele. A partir desse pagamento ele renova sozinho; você remove quando quiser.',
    cobrando: 'Cobrando no seu cartão…',
    noSeCobroConGuardada: 'Não deu pra cobrar no cartão salvo. Tente pelo formulário da Bancard.',
    vueltaComprobando: 'Conferindo seu cartão…',
    vueltaListo: 'Pronto. Levando você ao seu plano…',
  },

  equipo: {
    titulo: 'Sua equipe',
    personas: (n, enUso) => `${n} ${n === 1 ? 'pessoa' : 'pessoas'} (${enUso} em uso)`,
    contratadas: 'Seu plano Premium é cobrado por esta quantidade de pessoas.',
    sumar: 'Adicionar pessoas',
    sumarTitulo: 'Adicionar pessoas',
    cuantasEnTotal: 'Quantas pessoas no total?',
    sumadas: (n) => (n === 1 ? '1 pessoa a mais' : `${n} pessoas a mais`),
    sePagaHoy: (importe, dias) =>
      `Paga-se hoje ${importe} ${dias === 1 ? 'pelo dia que falta' : `pelos ${dias} dias que faltam`} do período.`,
    desdeProxima: (importe, anual) => `A partir da próxima renovação são ${importe} por ${anual ? 'ano' : 'mês'}.`,
    entranYa: 'As pessoas novas podem entrar assim que o pagamento for confirmado.',
    cancelaBaja: (n) => `Ao adicionar pessoas, a redução programada para ${n} é cancelada: seu plano renova pela quantidade nova.`,
    maximo: 'Você já tem o máximo de pessoas que o plano admite.',
    bajar: 'Reduzir a partir da próxima renovação',
    bajarTitulo: 'Reduzir pessoas',
    bajarDetalle: 'Nada é cobrado agora. Até a próxima renovação você continua com as pessoas que tem; a partir daí, seu plano é cobrado pela quantidade que escolher.',
    programar: 'Programar a redução',
    bajaProgramada: (n, fecha) => `A partir de ${fecha} seu plano passa a ${n} pessoas.`,
    bajaLista: 'Pronto: a partir da próxima renovação seu plano é cobrado por essa quantidade.',
    deshacer: 'Desfazer',
    deshecha: 'Pronto: seu plano continua com as pessoas de hoje.',
    noSePudo: 'Não deu pra mudar a quantidade. Tente de novo.',
  },

  cambio: {
    subir: (plan) => `Mudar para o ${plan}`,
    subirTitulo: (plan) => `Mudar para o plano ${plan}`,
    deA: (antes, despues) => `De ${antes} para ${despues}`,
    sePagaHoy: (importe, dias) =>
      `Paga-se hoje ${importe}: a diferença entre os dois planos ${dias === 1 ? 'pelo dia que falta' : `pelos ${dias} dias que faltam`}.`,
    sePagaHoyDias: (importe, dias) =>
      `Paga-se hoje ${importe}: a diferença entre os dois planos por ${dias === 1 ? '1 dia' : `${dias} dias`}.`,
    sePagaHoyEntero: (importe, anual) =>
      `Paga-se hoje ${importe}: a diferença de um ${anual ? 'ano' : 'mês'} inteiro.`,
    pruebaNoSeCobra: (dias) =>
      (dias === 1 ? 'O dia de teste que resta não é cobrado.' : `Os ${dias} dias de teste que restam não são cobrados.`),
    mismaFecha: (fecha) => `Seu plano continua vencendo em ${fecha}. A data não muda.`,
    desdeProxima: (importe, anual) =>
      `A partir da próxima renovação você paga ${importe} por ${anual ? 'ano' : 'mês'}.`,
    desdeProximaConDescuento: (importe, conDescuento, anual, constancia) =>
      `A partir da próxima renovação você paga ${importe} por ${anual ? 'ano' : 'mês'}; com seu desconto ${constancia ? 'de constância ' : ''}de hoje, ${conDescuento}.`,
    debito: (fecha, tarjeta) =>
      (tarjeta ? `Em ${fecha} a cobrança sai sozinha do seu ${tarjeta}.` : `Em ${fecha} a cobrança sai sozinha do seu cartão salvo.`),
    sinDescuento: 'A mudança não tem desconto. Seu desconto volta na renovação.',
    sinDescuentoHoy: 'A mudança não tem desconto.',
    otroPeriodo: (anual) => (anual
      ? 'Seu plano é anual: a mudança é calculada por ano.'
      : 'Seu plano é mensal: a mudança é calculada por mês. Para passar ao anual, renove depois escolhendo «por ano».'),
    seActiva: 'O plano novo é ativado assim que o pagamento for confirmado. Se o pagamento não entrar, nada muda.',
    cancelaLoProgramado: 'Ao mudar, a redução que você tinha programada é cancelada.',
    cambioElImporte: (importe) => `O valor mudou: agora são ${importe}. Confira e toque de novo para pagar.`,
    cambioLaFecha: 'A data do seu plano mudou. Confira os dados e toque de novo para pagar.',

    bajar: (plan) => `Passar para o ${plan} a partir da renovação`,
    bajarTitulo: (plan) => `Passar para o plano ${plan}`,
    bajarDetalle: (actual, nuevo, importe, anual) =>
      `Nada é cobrado agora. Você continua com o ${actual} até a próxima renovação; a partir daí seu plano é ${nuevo} e você paga ${importe} por ${anual ? 'ano' : 'mês'}.`,
    bajarDetalleConDescuento: (actual, nuevo, importe, conDescuento, anual, constancia) =>
      `Nada é cobrado agora. Você continua com o ${actual} até a próxima renovação; a partir daí seu plano é ${nuevo} e você paga ${importe} por ${anual ? 'ano' : 'mês'}; com seu desconto ${constancia ? 'de constância ' : ''}de hoje, ${conDescuento}.`,
    bajarIncluye: (nuevo, personas, capturas) =>
      `O ${nuevo} é para ${personas} e traz ${capturas} capturas com IA por mês.`,
    bajarTope: (personas) => `Enquanto estiver programado, sua equipe não pode passar de ${personas}.`,
    sinDevolucion: 'O que você já pagou deste período não é devolvido.',
    cancelaBajaDePersonas: (n) => `A redução para ${n} pessoas que você tinha programada é cancelada.`,
    programar: 'Programar a mudança',
    pastilla: 'A partir da próxima renovação',
    programado: (plan, fecha) => `A partir da renovação (${fecha}) seu plano passa a ${plan}.`,
    seguirCon: (plan) => `Continuar com o ${plan}`,
    deshacer: 'Desfazer',
    listo: (plan) => `Pronto: a partir da próxima renovação seu plano é ${plan}.`,
    deshecho: (plan, importe) =>
      (importe ? `Pronto: você continua com o ${plan}. A renovação volta a ser de ${importe}.` : `Pronto: você continua com o ${plan}.`),
    alPagarCambia: (plan) => `Ao pagar, seu plano passa a ${plan} na hora.`,
    equipoBloqueado: 'Você tem uma mudança de plano programada. Desfaça para mudar a quantidade de pessoas.',
    esperaElPago: 'Há um pagamento em andamento. Quando for confirmado você vai poder mudar.',
    noSePudo: 'Não deu pra programar a mudança. Tente de novo.',

    equipoGrande: (plan, tope, miembros) =>
      `O ${plan} é para ${tope}. Hoje são ${miembros} na sua equipe: quando forem menos você vai poder programar a mudança.`,
    equipoNoEntra: (plan, tope, miembros) =>
      `O ${plan} é para ${tope} e hoje são ${miembros} na sua equipe. Reduza a equipe ou escolha um plano em que caibam todos.`,
    equipoNoEntraVencida: (plan, tope, miembros) =>
      `O ${plan} é para ${tope} e hoje são ${miembros} na sua equipe. Escolha um plano em que caibam todos; depois você pode reduzir a equipe e baixar de plano.`,
  },

  pruebas: {
    soloVos: 'Só você vê isto · Bancard em testes',
    ambienteDePrueba: 'Ambiente de testes: não se cobra dinheiro de verdade',
  },

  noDisponible: 'O pagamento com cartão ainda não está liberado para a sua conta.',
  comoSePaga: 'Com cartão ou QR, no formulário seguro da Bancard: ativa na hora. Se preferir transferir, atendemos você pelo WhatsApp.',
  comoSePagaConPix: 'Com cartão, QR ou Pix, no formulário seguro da Bancard: ativa na hora. Se preferir transferir, atendemos você pelo WhatsApp.',

  servidor: {
    pedidoInvalido: 'Esse pedido de pagamento não é válido.',
    sinEmpresa: 'Não encontramos a sua conta.',
  },

  avisos: {
    comprobanteAsunto: 'Comprovante do seu pagamento · Orden',
    comprobanteIntro: (cuenta) => `Recebemos o pagamento do plano de ${cuenta}. Este é o seu comprovante.`,
    comprobantePie: 'Se tiver alguma dúvida sobre este pagamento, fale com a gente informando o número do pedido.',
    rechazoTitulo: 'Não deu pra cobrar seu plano',
    rechazo: (detalle) => (detalle ? `Não deu pra cobrar seu plano: ${detalle}.` : 'Não deu pra cobrar seu plano.'),
    rechazoReintento: (fecha) => `Tentamos de novo em ${fecha}. Se quiser, pague agora com outro cartão ou QR.`,
    rechazoTarjeta: 'Esse cartão não serve: troque em Seu plano.',
    rechazoTitular: 'Seu banco pede algo mais: entre em Seu plano e pague você.',
    rechazoUltimo: (fecha) =>
      (fecha ? `Seu plano vence em ${fecha}: entre em Seu plano e pague pra continuar.` : 'Entre em Seu plano e pague pra continuar.'),
    tresDsTitulo: 'Confirme o pagamento do seu plano',
    tresDs: 'Seu banco pede que você confirme o pagamento do seu plano. Entre em Seu plano.',
    tarjetaVenceTitulo: 'Seu cartão está pra vencer',
    tarjetaVence: (marca, ultimos4) => `Seu ${marca} •••• ${ultimos4} vence antes da próxima cobrança. Troque em Seu plano.`,
  },
};
