/**
 * EL AVISO DE QUE SE VENCE EL PLAN (107): QUÉ SE DICE Y CÓMO.
 *
 * Lógica pura, sin Supabase, sin Next y sin diccionarios importados: los
 * textos llegan como parámetro (`t`, el `t.avisoVencimiento` del idioma de
 * cada persona). Así se prueba con números en `probar:calculos`, igual que
 * `frases-del-dia.ts`, y el reparto —quién, cuándo, una sola vez— queda en
 * `avisos-diarios.ts`.
 *
 * Dos clases de vencimiento (ver la migración 107):
 *   · 'periodo' → el que PAGA: se le vence el período. Push y correo.
 *   · 'prueba'  → la prueba se termina. El push ya sale desde la 071; acá
 *     se arma el correo.
 *
 * Y dos clases de cuenta (110, 28/09/2026): al negocio que no paga se le
 * pausa la cuenta; la personal pasa al plan Gratis. Para la personal la
 * frase del correo y el cuerpo del push lo dicen y nombran lo que se
 * cierra. Asunto, precio, botón y pie son los mismos.
 */

export type TipoVencimiento = 'periodo' | 'prueba';

export interface DestinatarioVencimiento {
  user_id: string;
  idioma: string;
  nombre: string;
  email: string | null;
}

/** La tarjeta de la que se va a cobrar, si la cuenta tiene el débito al día (126). */
export interface DebitoDelAviso {
  marca: string | null;
  ultimos4: string | null;
  /**
   * El ambiente de Bancard de esa tarjeta ('staging' o 'produccion'). La base
   * no sabe en cuál está el servidor: lo compara `segunElServidor`.
   */
  entorno?: string;
  /** 'AAAA-MM-DD': el día del cobro (el anterior al vencimiento, o el próximo reintento). */
  fecha_cobro: string;
}

/** Una fila de `vencimientos_por_avisar()`. */
export interface Vencimiento {
  tipo: TipoVencimiento;
  empresa_id: string;
  nombre: string;
  tipo_cuenta: string;
  plan: string;
  periodo: string;
  fin: string;
  /** 'AAAA-MM-DD' en la zona del negocio. */
  fecha_fin: string;
  dias: number;
  moneda: string;
  /** Precio de lista en guaraníes; null si no hay: entonces no se dice ningún número. */
  precio: number | null;
  destinatarios: DestinatarioVencimiento[];
  /** 126: lo que de verdad se le cobra (sus personas, su descuento), o null. */
  importe?: number | null;
  /** 126: la tarjeta guardada con el débito al día, o null: paga la persona. */
  debito?: DebitoDelAviso | null;
  /** 126: si la administración le habilitó el pago con Bancard. */
  bancard?: boolean;
  /**
   * 130: el plan que se va a cobrar en la renovación y su precio de lista.
   * Con una baja de plan programada NO son los de hoy: `plan` y `precio`
   * siguen diciendo el plan que la cuenta tiene, e `importe` ya es lo que se
   * cobra. Sin nada programado son iguales a `plan` y `precio`.
   */
  plan_renovacion?: string | null;
  precio_renovacion?: number | null;
}

/**
 * EL PLAN AL QUE PASA EN LA RENOVACIÓN, SI NO ES EL QUE TIENE (130, 07/10/2026).
 *
 * Quien programó «Bajar al Básico desde la renovación» tiene hoy el Pro, y lo
 * que se le va a cobrar es el Básico. El aviso nombra los dos: «Tu plan Pro
 * vence mañana» y «Se renueva como Básico: Gs. 110.000 por mes». Sin esto
 * decía «Renovación: Gs. 190.000», que no es lo que se le cobra.
 *
 * Null si no hay nada programado (o la fila viene de una base sin la 130):
 * entonces el aviso es el de siempre, letra por letra.
 */
export function planQueSeRenueva(v: Pick<Vencimiento, 'tipo' | 'plan' | 'plan_renovacion'>): string | null {
  if (v.tipo === 'prueba') return null;
  const nuevo = typeof v.plan_renovacion === 'string' ? v.plan_renovacion : '';
  return nuevo && nuevo !== v.plan ? nuevo : null;
}

/**
 * CÓMO SE PAGA, FILA POR FILA (02/10/2026, Bancard).
 *
 * Hasta la 126 era una constante: todos pagaban por transferencia. Ahora lo
 * dice cada fila: 'debito' si la cuenta tiene una tarjeta guardada con el
 * débito al día (se le cobra solo); 'tarjeta' si ve el botón de Bancard (la
 * cuenta está habilitada, o está abierto a todos); si no, 'transferencia',
 * como siempre. Cada idioma tiene su texto en `comoPagar`.
 *
 * LA PRUEBA NUNCA ES 'debito' (decisión del 07/10/2026). Una cuenta en prueba
 * puede guardar la tarjeta, pero no se le cobra sola: toda prueba nace con
 * el plan Pro, y cobrarla sola era cobrarle el Pro a quien nunca eligió plan.
 * La base ya manda `debito: null` para la prueba; acá se repite para que el
 * correo no pueda prometer un cobro aunque una fila lo traiga.
 */
export type ComoSePaga = 'transferencia' | 'tarjeta' | 'debito';

export function comoSePaga(
  v: Pick<Vencimiento, 'debito' | 'bancard'> & { tipo?: TipoVencimiento },
  abierto = false,
): ComoSePaga {
  if (v.tipo !== 'prueba' && v.debito && typeof v.debito === 'object' && v.debito.fecha_cobro) return 'debito';
  if (v.bancard === true || abierto) return 'tarjeta';
  return 'transferencia';
}

/**
 * LO QUE DICE LA BASE, PASADO POR LO QUE EL SERVIDOR PUEDE CUMPLIR (07/10/2026).
 *
 * La base sabe que la cuenta tiene una tarjeta con el débito al día, pero no
 * sabe si este servidor va a cobrarla. No la cobra si Bancard no está
 * configurado (se apagó borrando BANCARD_ENTORNO, o una clave quedó mal
 * cargada: la tarea contesta «omitida») ni si la tarjeta es del otro ambiente
 * (la que se guardó en staging durante la certificación, con el servidor ya
 * en producción). En esos casos el aviso decía «cobramos de tu Visa, no
 * tenés que hacer nada», nadie cobraba y el plan se cortaba; y la
 * administración tampoco recibía el «atentos a la transferencia».
 *
 * `entornoDelServidor`: el de `configBancard()`, o null sin configuración.
 *   · sin configuración → sin débito y sin botón de Bancard: transferencia;
 *   · tarjeta de otro ambiente → sin débito (paga la persona).
 * Así el push, el correo y el aviso a la administración caen solos al camino
 * de siempre.
 */
export function segunElServidor<T extends Pick<Vencimiento, 'debito' | 'bancard'>>(
  v: T, entornoDelServidor: string | null,
): T {
  const debito = entornoDelServidor && v.debito && typeof v.debito === 'object'
    && v.debito.entorno === entornoDelServidor ? v.debito : null;
  return { ...v, debito, bancard: entornoDelServidor ? v.bancard === true : false };
}

/** A dónde lleva el botón del correo y el toque del push. */
export const RUTA_PARA_PAGAR = '/plan';

export interface TextosAvisoVencimiento {
  planes: Record<string, string>;
  porMes: string;
  porAnio: string;
  cuando: (dias: number, fecha: string) => string;
  periodo: {
    titulo: (dias: number) => string;
    cuerpo: (plan: string, precio: string | null) => string;
    /** La cuenta personal no se corta: pasa al plan Gratis (110). Dice qué se cierra. */
    cuerpoPersonal: (plan: string, precio: string | null) => string;
    asunto: (plan: string, cuando: string) => string;
    frase: (plan: string, cuando: string) => string;
    /** Ídem en el correo; ya dice que lo cargado queda guardado. */
    frasePersonal: (plan: string, cuando: string) => string;
    /** Con el débito al día: no hay que renovar nada, se cobra solo. */
    fraseDebito: (plan: string, cuando: string) => string;
    precio: (precio: string) => string;
    /** 130: con una baja de plan programada, el push dice a qué plan pasa y cuánto es. */
    cuerpoOtroPlan: (plan: string, nuevo: string, precio: string | null) => string;
    /** 130: lo mismo en una línea: va en el correo (en vez de «Renovación: …») y al final del push del débito. */
    seRenuevaComo: (nuevo: string, precio: string | null) => string;
    boton: string;
    botonDebito: string;
    pie: string;
  };
  prueba: {
    asunto: (cuando: string) => string;
    frase: (cuando: string) => string;
    /** La prueba de la cuenta personal termina en el plan Gratis (110); ya dice que lo cargado queda guardado. */
    frasePersonal: (cuando: string) => string;
    precio: (plan: string, precio: string) => string;
    boton: string;
    pie: string;
  };
  hola: (nombre: string) => string;
  guardado: string;
  comoPagarTitulo: string;
  comoPagar: {
    transferencia: string;
    tarjeta: string;
    /** «El 13 de noviembre cobramos Gs. 370.000 de tu Visa •••• 0016. No tenés que hacer nada.» */
    debito: (fecha: string, importe: string | null, tarjeta: string) => string;
  };
}

/**
 * Guaraníes sin decimales y con el separador de miles del idioma, como en
 * el aviso de plan activo. No se usa `dinero()` a propósito: aplica la vista
 * de moneda del negocio (051), y esto es lo que nos paga a nosotros, que es
 * siempre en guaraníes (105).
 */
export function precioEnGuaranies(importe: number, locale: string): string {
  return `Gs. ${Math.round(importe).toLocaleString(locale, { maximumFractionDigits: 0 })}`;
}

/** '2026-09-28' → «28 de septiembre» / «28 de setembro». Sin año: son días de distancia. */
export function fechaDelAviso(iso: string, locale: string): string {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return String(iso);
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long' })
    .format(new Date(Date.UTC(a, m - 1, d)));
}

export function nombreDelPlan(plan: string, t: TextosAvisoVencimiento): string {
  return t.planes[plan] ?? t.planes.pro ?? plan;
}

/**
 * «Gs. 190.000 por mes», o null si no hay precio que sostener. Es el precio
 * de lo que se RENUEVA: con una baja de plan programada (130), el del plan
 * nuevo y no el del que tiene hoy.
 */
export function precioDelPlan(v: Vencimiento, t: TextosAvisoVencimiento, locale: string): string | null {
  const crudo = planQueSeRenueva(v) ? v.precio_renovacion : v.precio;
  const n = crudo === null || crudo === undefined ? NaN : Number(crudo);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${precioEnGuaranies(n, locale)} ${v.periodo === 'anual' ? t.porAnio : t.porMes}`;
}

/**
 * La clave de «una sola vez» para `reservar_envio`.
 *
 * El push va por cuenta (un aviso por negocio, como el de la prueba); el
 * correo, por persona. La fecha de fin entra en la clave: si paga y el
 * período se corre un mes, el próximo vencimiento vuelve a avisarse.
 */
export function claveDeEnvio(v: Vencimiento, canal: 'push' | 'email', userId?: string): string {
  // El push de la prueba no sale de acá (su clave es la de la 071); el de
  // la prueba solo tiene correo: `prueba_correo:…`.
  const base = v.tipo === 'prueba' ? 'prueba' : 'vence';
  return canal === 'push'
    ? `${base}:${v.empresa_id}:${v.fecha_fin}:${v.dias}`
    : `${base}_correo:${v.empresa_id}:${userId ?? ''}:${v.fecha_fin}:${v.dias}`;
}

/**
 * ¿Es una cuenta personal? Desde la 110 (28/09/2026) la personal que no paga
 * pasa al plan Gratis y no a la cuenta pausada: sus avisos dicen eso y qué se
 * cierra. Un negocio sigue con los textos de siempre.
 */
function esPersonal(v: Vencimiento): boolean {
  return v.tipo_cuenta === 'personal';
}

/**
 * La frase del débito: qué día, cuánto y de qué tarjeta. El importe es el que
 * de verdad se cobra (`importe`, con sus personas y su descuento); si no
 * vino, el de lista; si tampoco, sin número.
 */
export function textoDelDebito(v: Vencimiento, t: TextosAvisoVencimiento, locale: string): string {
  const d = v.debito as DebitoDelAviso;
  const n = Number(v.importe ?? v.precio);
  const importe = Number.isFinite(n) && n > 0 ? precioEnGuaranies(n, locale) : null;
  const tarjeta = `${(d.marca ?? '').trim()} •••• ${(d.ultimos4 ?? '····').trim()}`.trim();
  return t.comoPagar.debito(fechaDelAviso(d.fecha_cobro, locale), importe, tarjeta);
}

/** El push del período pago. La prueba no pasa por acá: su push es el de la 071. */
export function pushDeVencimiento(
  v: Vencimiento, t: TextosAvisoVencimiento, locale: string, abierto = false,
): { titulo: string; cuerpo: string } {
  // 130: con una baja de plan programada se dice a qué plan pasa. Si no,
  // «cobramos Gs. 110.000» a quien tiene el Pro no se entiende.
  const nuevo = planQueSeRenueva(v);
  if (comoSePaga(v, abierto) === 'debito') {
    const debito = textoDelDebito(v, t, locale);
    return {
      titulo: t.periodo.titulo(v.dias),
      cuerpo: nuevo ? `${debito} ${t.periodo.seRenuevaComo(nombreDelPlan(nuevo, t), null)}` : debito,
    };
  }
  if (nuevo) {
    return {
      titulo: t.periodo.titulo(v.dias),
      cuerpo: t.periodo.cuerpoOtroPlan(nombreDelPlan(v.plan, t), nombreDelPlan(nuevo, t), precioDelPlan(v, t, locale)),
    };
  }
  const cuerpo = esPersonal(v) ? t.periodo.cuerpoPersonal : t.periodo.cuerpo;
  return {
    titulo: t.periodo.titulo(v.dias),
    cuerpo: cuerpo(nombreDelPlan(v.plan, t), precioDelPlan(v, t, locale)),
  };
}

const TINTA = '#0d1b16';
const VERDE = '#17795a';
const SUAVE = '#6b7a73';
const BORDE = '#e3e7e4';

/**
 * El correo, en texto y en HTML.
 *
 * Mismo criterio que el resumen del lunes (correo-semanal.ts): tablas y
 * estilos en línea, porque los clientes de correo no entienden otra cosa, y
 * siempre con su versión en texto plano, que un correo solo-HTML cae más
 * en spam.
 */
export function correoDeVencimiento(
  v: Vencimiento,
  d: DestinatarioVencimiento,
  t: TextosAvisoVencimiento,
  locale: string,
  sitio: string,
  abierto = false,
): { asunto: string; texto: string; html: string } {
  const plan = nombreDelPlan(v.plan, t);
  const precio = precioDelPlan(v, t, locale);
  const cuando = t.cuando(v.dias, fechaDelAviso(v.fecha_fin, locale));
  const enlace = `${sitio.replace(/\/+$/, '')}${RUTA_PARA_PAGAR}`;

  const esPrueba = v.tipo === 'prueba';
  const personal = esPersonal(v);
  // Con la tarjeta guardada y el débito al día no hay nada que renovar: el
  // correo dice qué día se cobra, cuánto y de qué tarjeta. En la prueba NO
  // (07/10/2026): una prueba nunca se cobra sola, tenga o no la tarjeta
  // guardada, así que su correo es siempre «activá tu plan» (`comoSePaga`
  // nunca da 'debito' para la prueba).
  const como = comoSePaga(v, abierto);
  const debito = como === 'debito';
  const asunto = esPrueba ? t.prueba.asunto(cuando) : t.periodo.asunto(plan, cuando);
  const frase = esPrueba
    ? (personal ? t.prueba.frasePersonal(cuando) : t.prueba.frase(cuando))
    : debito ? t.periodo.fraseDebito(plan, cuando)
    : (personal ? t.periodo.frasePersonal(plan, cuando) : t.periodo.frase(plan, cuando));
  // La frase de la personal ya dice que lo cargado queda guardado: repetirlo con
  // `guardado` en la oración siguiente sonaba a relleno (110, 28/09/2026).
  const cierre = personal || debito ? frase : `${frase} ${t.guardado}`;
  // 130: con una baja de plan programada, la línea del precio nombra el plan
  // al que pasa («Se renueva como Básico: Gs. 110.000 por mes.»), tenga o no
  // precio que mostrar. `precio` ya es el del plan nuevo (`precioDelPlan`).
  const nuevo = planQueSeRenueva(v);
  const lineaPrecio = nuevo ? t.periodo.seRenuevaComo(nombreDelPlan(nuevo, t), precio)
    : precio ? (esPrueba ? t.prueba.precio(plan, precio) : t.periodo.precio(precio)) : null;
  const boton = debito ? t.periodo.botonDebito : esPrueba ? t.prueba.boton : t.periodo.boton;
  const pie = esPrueba ? t.prueba.pie : t.periodo.pie;
  const comoPagar = como === 'debito' ? textoDelDebito(v, t, locale) : t.comoPagar[como];

  const texto = [
    t.hola(d.nombre),
    '',
    cierre,
    ...(lineaPrecio ? ['', lineaPrecio] : []),
    '',
    `${t.comoPagarTitulo}: ${comoPagar}`,
    '',
    `${boton}: ${enlace}`,
    '',
    pie,
  ].join('\n');

  const html = `<!doctype html>
<html lang="${escapar(d.idioma)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(asunto)}</title></head>
<body style="margin:0;padding:0;background:#f6f7f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${BORDE};border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <tr><td style="padding:24px 24px 4px;">
    <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${SUAVE};">
      ${escapar(v.nombre)}
    </p>
    <h1 style="margin:6px 0 0;font-size:20px;line-height:1.25;color:${TINTA};">
      ${escapar(asunto)}
    </h1>
  </td></tr>

  <tr><td style="padding:16px 24px 0;">
    <p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:${TINTA};">
      ${escapar(t.hola(d.nombre))} ${escapar(cierre)}
    </p>
    ${lineaPrecio ? `<p style="margin:0 0 12px;font-size:16px;font-weight:700;line-height:1.4;color:${TINTA};">
      ${escapar(lineaPrecio)}
    </p>` : ''}
    <p style="margin:0;font-size:13.5px;line-height:1.55;color:${TINTA};">
      <strong>${escapar(t.comoPagarTitulo)}:</strong> ${escapar(comoPagar)}
    </p>
  </td></tr>

  <tr><td style="padding:20px 24px 24px;">
    <a href="${escapar(enlace)}"
       style="display:inline-block;background:${VERDE};color:#ffffff;text-decoration:none;
              font-size:14px;font-weight:700;padding:12px 20px;border-radius:10px;">
      ${escapar(boton)}
    </a>
  </td></tr>

  <tr><td style="padding:0 24px 22px;border-top:1px solid ${BORDE};">
    <p style="margin:14px 0 0;font-size:11.5px;line-height:1.5;color:${SUAVE};">
      ${escapar(pie)}
    </p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  return { asunto, texto, html };
}

/**
 * El nombre del negocio y el de la persona los escribe la persona: sin esto,
 * un negocio llamado `</td><script>` rompería el correo.
 */
export function escapar(texto: string): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
