import { avisar, correoConfigurado, enviarEmail } from './avisos';
import { avisarPlanActivo, type ClienteDeServicio } from './aviso-plan-activo';
import type { AvisoDePago } from './bancard-flujo';
import { diccionario } from '@/i18n/diccionarios';
import { FICHA, esIdioma, IDIOMA_POR_DEFECTO, type Idioma } from '@/i18n/idiomas';

/**
 * LOS AVISOS DE UN PAGO CON BANCARD.
 *
 * Los llama `bancard-flujo.ts` después de `bancard_confirmar`, venga la
 * respuesta de la confirmación de Bancard, de una consulta o de un cobro con
 * tarjeta guardada. Nunca lanzan: el plan ya quedó activo en la base y un
 * aviso que falla no puede deshacer un pago.
 *
 *   · Pago aprobado (la primera vez): «Tu plan está activo hasta el …» por
 *     push (y al socio, si nació su comisión) y el COMPROBANTE por correo a
 *     quienes administran la cuenta: fecha y hora, número de pedido, importe,
 *     descripción de Bancard, concepto y hasta cuándo. Sin número de
 *     autorización ni código: el manual 1.23 no deja mostrarlos.
 *   · Algo para revisar (Bancard confirmó otro importe, un pago que entró
 *     sobre uno revertido, el ingreso que no se pudo anotar, un débito que
 *     no se pudo cotizar, el bloqueo de Cloudflare, una reversa que Bancard
 *     hizo sobre un pago que en Orden quedó activo): push a la administración
 *     de Orden, una vez por pedido (o cuenta) y por día.
 *   · Los del cobro automático con la tarjeta guardada: «no pudimos cobrar»
 *     con qué hacer según el motivo; «confirmá el pago» cuando el banco pide
 *     3D Secure sin la persona delante; «tu tarjeta está por vencer».
 *
 * Cada envío se reserva antes (`reservar_envio`): si la confirmación y la
 * consulta llegan a la vez, sale uno.
 */

interface Destinatario {
  user_id: string;
  idioma: string;
  nombre: string;
  email: string | null;
}

function destinatariosDe(r: AvisoDePago): Destinatario[] {
  return (Array.isArray(r.destinatarios) ? r.destinatarios : [])
    .filter((d): d is Destinatario => typeof d === 'object' && d !== null && typeof (d as Destinatario).user_id === 'string');
}

function idiomaDe(d: Destinatario): Idioma {
  return esIdioma(d.idioma) ? (d.idioma as Idioma) : IDIOMA_POR_DEFECTO;
}

function fechaCorta(valor: unknown, idioma: Idioma): string | null {
  if (typeof valor !== 'string' || !valor) return null;
  const [a, m, d] = valor.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  return new Intl.DateTimeFormat(FICHA[idioma].locale, { timeZone: 'UTC', day: 'numeric', month: 'long' })
    .format(new Date(Date.UTC(a, m - 1, d)));
}

/** Un push a quienes administran la cuenta, una sola vez por `clave`. */
async function pushALaCuenta(
  servicio: ClienteDeServicio,
  r: AvisoDePago,
  tipo: string,
  clave: string,
  tag: string,
  armar: (t: ReturnType<typeof diccionario>, idioma: Idioma) => { titulo: string; cuerpo: string },
): Promise<void> {
  const { data: reservado } = await servicio.rpc('reservar_envio', {
    p_tipo: tipo,
    p_clave: clave,
    p_user: null,
    p_empresa: typeof r.empresa_id === 'string' ? r.empresa_id : null,
    p_canal: 'push',
  });
  if (!reservado) return;
  for (const d of destinatariosDe(r)) {
    const idioma = idiomaDe(d);
    const t = diccionario(idioma);
    await avisar(d.user_id, { ...armar(t, idioma), url: '/plan', tag, idioma });
  }
}

/** El cobro automático no pasó: qué pasó y qué hacer, según el motivo. */
async function avisarRechazo(servicio: ClienteDeServicio, r: AvisoDePago): Promise<void> {
  const operacion = String(r.operacion ?? '');
  await pushALaCuenta(servicio, r, 'bancard_rechazo', `bancard_rechazo:${operacion}`, `bancard-rechazo-${r.empresa_id ?? ''}`, (t, idioma) => {
    const a = t.bancard.avisos;
    const detalle = typeof r.descripcion === 'string' && r.descripcion.trim() ? r.descripcion.trim() : null;
    const proximo = fechaCorta(r.proximo_intento, idioma);
    const que = proximo ? a.rechazoReintento(proximo)
      : r.clase === 'tarjeta' ? a.rechazoTarjeta
      : r.clase === 'titular' ? a.rechazoTitular
      : a.rechazoUltimo(fechaCorta(r.ciclo_fin, idioma));
    return { titulo: a.rechazoTitulo, cuerpo: `${a.rechazo(detalle)} ${que}` };
  });
}

/** El banco pide 3D Secure en un cobro sin la persona delante. */
async function avisarTresDs(servicio: ClienteDeServicio, r: AvisoDePago): Promise<void> {
  const operacion = String(r.operacion ?? '');
  await pushALaCuenta(servicio, r, 'bancard_3ds', `bancard_3ds:${operacion}`, `bancard-3ds-${r.empresa_id ?? ''}`, (t) => ({
    titulo: t.bancard.avisos.tresDsTitulo,
    cuerpo: t.bancard.avisos.tresDs,
  }));
}

/** La tarjeta guardada vence antes del próximo cobro: una vez por vencimiento. */
async function avisarTarjetaPorVencer(servicio: ClienteDeServicio, r: AvisoDePago): Promise<void> {
  const clave = `bancard_vence_tarjeta:${String(r.empresa_id ?? '')}:${String(r.fecha_fin ?? '')}`;
  await pushALaCuenta(servicio, r, 'bancard_vence_tarjeta', clave, `bancard-tarjeta-${r.empresa_id ?? ''}`, (t) => ({
    titulo: t.bancard.avisos.tarjetaVenceTitulo,
    cuerpo: t.bancard.avisos.tarjetaVence(
      typeof r.marca === 'string' && r.marca ? r.marca : t.bancard.tarjeta.sinMarca,
      typeof r.ultimos4 === 'string' && r.ultimos4 ? r.ultimos4 : '····',
    ),
  }));
}

function nombreDelPlan(plan: unknown, t: ReturnType<typeof diccionario>): string {
  return plan === 'basico' || plan === 'pro' || plan === 'negocio' ? t.plan[plan] : String(plan ?? '');
}

function guaranies(n: unknown, idioma: Idioma): string {
  const v = Number(n);
  return `Gs. ${(Number.isFinite(v) ? v : 0).toLocaleString(FICHA[idioma].locale, { maximumFractionDigits: 0 })}`;
}

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

async function mandarComprobante(servicio: ClienteDeServicio, r: AvisoDePago): Promise<void> {
  if (!correoConfigurado()) return;
  const destinatarios = Array.isArray(r.destinatarios) ? r.destinatarios : [];
  const operacion = String(r.operacion ?? '');
  const empresaId = String(r.empresa_id ?? '');

  for (const d of destinatarios as Array<Record<string, unknown>>) {
    const email = typeof d.email === 'string' ? d.email.trim() : '';
    const userId = typeof d.user_id === 'string' ? d.user_id : null;
    if (!email || !userId) continue;

    const { data: reservado } = await servicio.rpc('reservar_envio', {
      p_tipo: 'bancard_pago',
      p_clave: `bancard_pago:${operacion}:${userId}`,
      p_user: userId,
      p_empresa: empresaId || null,
      p_canal: 'email',
    });
    if (!reservado) continue;

    const idioma: Idioma = esIdioma(d.idioma) ? (d.idioma as Idioma) : IDIOMA_POR_DEFECTO;
    const t = diccionario(idioma);
    const c = t.bancard.comprobante;
    const locale = FICHA[idioma].locale;
    const cuando = new Date(typeof r.fecha === 'string' ? r.fecha : Date.now());
    const fechaYHora = cuando.toLocaleString(locale, {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Asuncion',
    });
    const vence = typeof r.vence === 'string'
      ? new Date(r.vence).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Asuncion' })
      : '';
    // Un cambio de plan (130) dice de qué plan a cuál: `plan_antes` viene en
    // lo que devuelve `bancard_confirmar` para todo cambio.
    const personas = typeof r.personas === 'number' ? r.personas : null;
    const planAntes = r.plan_antes === 'basico' || r.plan_antes === 'pro' || r.plan_antes === 'negocio'
      ? nombreDelPlan(r.plan_antes, t) : null;
    const concepto = r.tipo === 'personas'
      ? c.conceptoPersonas(personas)
      : r.tipo === 'cambio'
        ? c.conceptoCambio(planAntes, nombreDelPlan(r.plan, t), r.plan === 'negocio' ? personas : null)
        : c.conceptoPlan(nombreDelPlan(r.plan, t), r.periodo === 'anual', personas);
    const tarjeta = r.tarjeta && typeof r.tarjeta === 'object'
      ? (r.tarjeta as { marca?: string; ultimos4?: string }) : null;

    const filas: [string, string][] = [
      [c.fechaYHora, fechaYHora],
      [c.pedido, operacion],
      [c.importe, guaranies(r.importe, idioma)],
      [c.descripcion, typeof r.descripcion_respuesta === 'string' && r.descripcion_respuesta ? r.descripcion_respuesta : c.titulo],
      [c.concepto, concepto],
      ...(vence ? [[c.activoHasta, vence] as [string, string]] : []),
      ...(tarjeta?.marca && tarjeta?.ultimos4 ? [[c.pagadoCon, c.tarjeta(tarjeta.marca, tarjeta.ultimos4)] as [string, string]] : []),
    ];
    const intro = t.bancard.avisos.comprobanteIntro(String(r.nombre ?? ''));
    const pie = t.bancard.avisos.comprobantePie;

    const texto = [c.titulo, '', intro, '', ...filas.map(([k, v]) => `${k}: ${v}`), '', pie, c.sitio].join('\n');
    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0e0f0c;line-height:1.5">`
      + `<h2 style="margin:0 0 8px">${escapar(c.titulo)}</h2>`
      + `<p style="margin:0 0 16px">${escapar(intro)}</p>`
      + `<table cellpadding="6" style="border-collapse:collapse">`
      + filas.map(([k, v]) => `<tr><td style="color:#454742">${escapar(k)}</td><td style="font-weight:bold">${escapar(v)}</td></tr>`).join('')
      + `</table>`
      + `<p style="margin:16px 0 4px;color:#454742">${escapar(pie)}</p>`
      + `<p style="margin:0;color:#454742">${escapar(c.sitio)}</p>`
      + `</body></html>`;

    await enviarEmail({ para: email, asunto: t.bancard.avisos.comprobanteAsunto, html, texto });
  }
}

/**
 * A la administración de Orden: algo de un pago (o de una cuenta) hay que mirarlo a mano.
 *
 * `asunto` separa un aviso de otro del mismo pedido en el mismo día: la
 * reversa sobre un pago activo tiene que salir aunque ese pedido ya haya
 * avisado otra cosa hoy (un pago tardío, por ejemplo).
 */
async function avisarAdministracion(servicio: ClienteDeServicio, r: AvisoDePago, motivo: string, asunto = ''): Promise<void> {
  const operacion = String(r.operacion ?? '');
  const referencia = operacion || String(r.empresa_id ?? '');
  const dia = new Date().toISOString().slice(0, 10);
  const { data: reservado } = await servicio.rpc('reservar_envio', {
    p_tipo: 'bancard_revisar',
    p_clave: `bancard_revisar:${referencia}:${dia}${asunto ? `:${asunto}` : ''}`,
    p_user: null,
    p_empresa: typeof r.empresa_id === 'string' ? r.empresa_id : null,
    p_canal: 'push',
  });
  if (!reservado) return;

  const { data: admins } = await servicio.rpc('usuarios_de_la_administracion');
  const ids: string[] = Array.isArray(admins) ? admins : [];
  await Promise.all(ids.map((id) => avisar(id, {
    titulo: operacion ? `Bancard · pedido ${operacion} para revisar` : 'Bancard · una cuenta para revisar',
    cuerpo: [String(r.nombre ?? ''), motivo].filter(Boolean).join(' · '),
    url: '/admin',
    tag: `bancard-${referencia}`,
  })));
}

/** El mismo texto que la base deja en `bancard_operaciones.revisar` (125, bancard_cerrar_operacion). */
const MOTIVO_REVERSA_SOBRE_PAGADA = 'Bancard devolvió este pago (reversa) y el plan quedó activo: revertirlo a mano';

export async function avisarResultado(servicio: ClienteDeServicio, r: AvisoDePago): Promise<void> {
  try {
    // Los avisos que no salen de bancard_confirmar.
    if (r.aviso === 'tres_ds') { await avisarTresDs(servicio, r); return; }
    if (r.aviso === 'tarjeta_vence') { await avisarTarjetaPorVencer(servicio, r); return; }
    if (r.aviso === 'pausada') {
      await avisarAdministracion(servicio, r, `Débito pausado: no se pudo cotizar la renovación (${String(r.motivo ?? '')})`);
      return;
    }
    // Revisión 07/10: Bancard devolvió la plata de un pago que en Orden
    // quedó pagado (la reversa y la confirmación se cruzaron). La base dejó
    // el «para revisar» y no tocó nada: el plan sigue activo y el ingreso
    // anotado hasta que alguien lo revierta desde /admin.
    if (r.aviso === 'reversa_sobre_pagada') {
      await avisarAdministracion(servicio, r, MOTIVO_REVERSA_SOBRE_PAGADA, 'reversa');
      return;
    }
    if (r.aviso === 'bloqueo') {
      await avisarAdministracion(servicio, r, 'Bancard contestó una página en vez de datos (bloqueo). Probar la conexión desde /admin; si sigue, BANCARD_HTTP=2 en Vercel');
      return;
    }

    // El cobro automático rechazado: a la persona, con qué hacer.
    if (r.ok === true && r.aprobada === false && r.ya === false && r.origen === 'automatico') {
      await avisarRechazo(servicio, r);
      return;
    }

    if (r.ok === true && r.aprobada === true && r.ya === false) {
      // Un conflicto (revisión 03/10: una operación vieja que hoy vale más,
      // otro plan, otro período) anota la plata pero no activa nada: no se
      // le dice a nadie «tu plan está activo»; el comprobante sí sale, y la
      // administración lo resuelve.
      if (r.conflicto !== true && typeof r.empresa_id === 'string' && r.empresa_id) {
        await avisarPlanActivo(servicio, r.empresa_id).catch(() => 0);
      }
      await mandarComprobante(servicio, r).catch(() => undefined);
      if (typeof r.revisar === 'string' && r.revisar) await avisarAdministracion(servicio, r, r.revisar);
      return;
    }
    if (r.ok === false && r.motivo === 'importe') {
      await avisarAdministracion(servicio, r, 'Bancard confirmó otro importe o moneda: no se activó nada');
      return;
    }
    if (r.ok === false && r.motivo === 'revertida') {
      await avisarAdministracion(servicio, r, 'Llegó una aprobación sobre un pago ya revertido');
    }
    // Un rechazo con la persona delante no se avisa: lo está viendo en pantalla.
  } catch (e) {
    console.error('[bancard] aviso', e instanceof Error ? e.message : '');
  }
}
