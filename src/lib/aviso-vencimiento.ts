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
 */

export type TipoVencimiento = 'periodo' | 'prueba';

export interface DestinatarioVencimiento {
  user_id: string;
  idioma: string;
  nombre: string;
  email: string | null;
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
}

/**
 * CÓMO SE PAGA HOY. EL ÚNICO LUGAR QUE HAY QUE CAMBIAR CUANDO LLEGUE BANCARD.
 *
 * Hoy se paga por transferencia, arreglando por WhatsApp desde el botón
 * «Suscribirme» de /plan. Cuando entre la tarjeta guardada (Bancard vPOS),
 * se cambia este valor a 'tarjeta' y cada idioma ya tiene su texto en
 * `comoPagar.tarjeta`: los avisos y los correos cambian solos.
 */
export type ComoSePaga = 'transferencia' | 'tarjeta';
export const COMO_SE_PAGA: ComoSePaga = 'transferencia';

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
    asunto: (plan: string, cuando: string) => string;
    frase: (plan: string, cuando: string) => string;
    precio: (precio: string) => string;
    boton: string;
    pie: string;
  };
  prueba: {
    asunto: (cuando: string) => string;
    frase: (cuando: string) => string;
    precio: (plan: string, precio: string) => string;
    boton: string;
    pie: string;
  };
  hola: (nombre: string) => string;
  guardado: string;
  comoPagarTitulo: string;
  comoPagar: Record<ComoSePaga, string>;
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

/** «Gs. 190.000 por mes», o null si no hay precio que sostener. */
export function precioDelPlan(v: Vencimiento, t: TextosAvisoVencimiento, locale: string): string | null {
  const n = v.precio === null || v.precio === undefined ? NaN : Number(v.precio);
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

/** El push del período pago. La prueba no pasa por acá: su push es el de la 071. */
export function pushDeVencimiento(
  v: Vencimiento, t: TextosAvisoVencimiento, locale: string,
): { titulo: string; cuerpo: string } {
  return {
    titulo: t.periodo.titulo(v.dias),
    cuerpo: t.periodo.cuerpo(nombreDelPlan(v.plan, t), precioDelPlan(v, t, locale)),
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
): { asunto: string; texto: string; html: string } {
  const plan = nombreDelPlan(v.plan, t);
  const precio = precioDelPlan(v, t, locale);
  const cuando = t.cuando(v.dias, fechaDelAviso(v.fecha_fin, locale));
  const enlace = `${sitio.replace(/\/+$/, '')}${RUTA_PARA_PAGAR}`;

  const esPrueba = v.tipo === 'prueba';
  const asunto = esPrueba ? t.prueba.asunto(cuando) : t.periodo.asunto(plan, cuando);
  const frase = esPrueba ? t.prueba.frase(cuando) : t.periodo.frase(plan, cuando);
  const lineaPrecio = precio ? (esPrueba ? t.prueba.precio(plan, precio) : t.periodo.precio(precio)) : null;
  const boton = esPrueba ? t.prueba.boton : t.periodo.boton;
  const pie = esPrueba ? t.prueba.pie : t.periodo.pie;
  const comoPagar = t.comoPagar[COMO_SE_PAGA];

  const texto = [
    t.hola(d.nombre),
    '',
    `${frase} ${t.guardado}`,
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
      ${escapar(t.hola(d.nombre))} ${escapar(frase)} ${escapar(t.guardado)}
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
