import webpush from 'web-push';
import { clienteDeServicio } from './supabase/servicio';

/**
 * ============================================================
 * AVISOS · push y email
 * ============================================================
 *
 * QUÉ CANAL PARA QUÉ
 *
 *   PUSH   para lo urgente y corto: "todavía no cargaste nada hoy". Llega al
 *          instante en Android y en escritorio. En iPhone solo funciona si la
 *          persona agregó Orden a la pantalla de inicio (iOS 16.4+), así que
 *          nunca puede ser el único canal de algo importante.
 *
 *   EMAIL  para lo que se lee con calma: el resumen del lunes. Llega a todos
 *          lados y cuesta casi nada.
 *
 * REGLA QUE NO SE ROMPE: un aviso por día como máximo, y solo si hay algo
 * concreto que decir. La app que manda tres notificaciones diarias se
 * desinstala en una semana; peor todavía, enseña a ignorar las que sí
 * importan.
 */

let vapidListo = false;

/** Devuelve false si faltan las claves. Sin ellas, push queda apagado y ya. */
function prepararVapid(): boolean {
  if (vapidListo) return true;

  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLICA;
  const privada = process.env.VAPID_PRIVADA;
  const contacto = process.env.VAPID_CONTACTO || 'mailto:hola@orden.app';
  if (!publica || !privada) return false;

  webpush.setVapidDetails(contacto, publica, privada);
  vapidListo = true;
  return true;
}

export interface Aviso {
  titulo: string;
  cuerpo: string;
  url?: string;
  tag?: string;
  idioma?: string;
}

/**
 * Manda un aviso a todos los dispositivos de una persona.
 *
 * Devuelve cuántos llegaron. Un endpoint que responde 404 o 410 está muerto
 * —el navegador se desinstaló, se limpiaron los datos— y se borra: sin eso,
 * la tabla se llena de suscripciones fantasma que se reintentan para siempre.
 */
export async function avisar(userId: string, aviso: Aviso): Promise<number> {
  if (!prepararVapid()) return 0;

  const supabase = clienteDeServicio();
  const { data, error } = await supabase
    .from('push_dispositivos')
    .select('endpoint, p256dh, auth_clave')
    .eq('user_id', userId);

  if (error || !data?.length) return 0;

  const carga = JSON.stringify({
    titulo: aviso.titulo,
    cuerpo: aviso.cuerpo,
    url: aviso.url ?? '/cierre',
    tag: aviso.tag ?? 'orden',
    idioma: aviso.idioma ?? 'es',
  });

  let entregados = 0;

  await Promise.all(data.map(async (d) => {
    try {
      await webpush.sendNotification(
        { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth_clave } },
        carga,
        { TTL: 6 * 60 * 60 },  // seis horas: pasado eso el recordatorio ya no sirve
      );
      entregados += 1;
    } catch (e: any) {
      const codigo = e?.statusCode;
      if (codigo === 404 || codigo === 410) {
        await supabase.rpc('purgar_dispositivo', { p_endpoint: d.endpoint });
      } else {
        console.error('[push]', codigo, e?.message ?? e);
      }
    }
  }));

  return entregados;
}

/**
 * Manda un email por la API de Resend.
 *
 * Con `fetch` y no con su SDK: es una sola llamada en toda la aplicación, y
 * una dependencia menos es una dependencia menos que actualizar.
 */
export async function enviarEmail(
  { para, asunto, html, texto }: { para: string; asunto: string; html: string; texto: string },
): Promise<boolean> {
  const clave = process.env.RESEND_API_KEY;
  const remitente = process.env.EMAIL_REMITENTE;
  if (!clave || !remitente) return false;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: remitente, to: [para], subject: asunto, html, text: texto }),
  });

  if (!r.ok) {
    console.error('[email]', r.status, await r.text().catch(() => ''));
    return false;
  }
  return true;
}

/**
 * Autoriza una tarea programada.
 *
 * Estas rutas mandan correos y usan la clave de servicio, así que no pueden
 * quedar abiertas a quien adivine la URL. Vercel Cron manda un Bearer con
 * CRON_SECRET; aceptamos también el nuestro para poder dispararlas a mano.
 */
export function cronAutorizado(request: Request): boolean {
  const esperado = process.env.CRON_SECRETO || process.env.CRON_SECRET;
  if (!esperado) return false;

  const cabecera = request.headers.get('authorization') ?? '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : cabecera;
  if (!token) return false;

  // Longitudes distintas ya no coinciden; compararlas con timingSafeEqual
  // lanzaría, así que se descarta antes.
  if (token.length !== esperado.length) return false;

  let diferencia = 0;
  for (let i = 0; i < token.length; i++) {
    diferencia |= token.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferencia === 0;
}
