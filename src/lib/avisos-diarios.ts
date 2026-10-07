import { clienteDeServicio } from '@/lib/supabase/servicio';
import { avisar, correoConfigurado, enviarEmail } from '@/lib/avisos';
import { sitio } from '@/lib/pagos';
import {
  claveDeEnvio, comoSePaga, correoDeVencimiento, pushDeVencimiento, RUTA_PARA_PAGAR, segunElServidor, type Vencimiento,
} from '@/lib/aviso-vencimiento';
import { abiertoATodos, configBancard } from '@/lib/bancard-servidor';
import { diccionario } from '@/i18n/diccionarios';
import { FICHA, esIdioma, IDIOMA_POR_DEFECTO } from '@/i18n/idiomas';
import { fraseDelDia, type CuentaDelDia, type Momento } from '@/lib/frases-del-dia';
import { claveDeCobros, fraseDeCobros } from '@/lib/frase-cobros';
import type { CobrosDeHoy } from '@/lib/tipos';

/**
 * ORDEN HABLA TODOS LOS DÍAS (071).
 *
 * Tres corridas diarias, una por momento, cada una con su ruta en
 * app/api/tareas/avisos-{manana,tarde,noche} (ver vercel.json):
 *
 *   · mañana → cómo fue ayer, las pruebas que se terminan, los planes
 *     pagos que se vencen (107, push y correo) y a quién toca cobrarle
 *     hoy (127, solo push);
 *   · tarde  → «todavía no cargaste nada hoy», solo a quien no cargó;
 *   · noche  → cómo fue hoy, contra ayer, solo a quien cargó.
 *
 * Cada corrida es una tarea diaria aparte: el plan Hobby de Vercel permite
 * muchas tareas pero cada una una sola vez por día, así que tres momentos son
 * tres tareas y no una que corra cada hora.
 *
 * QUÉ SE DECIDE DÓNDE
 *
 * Quién recibe y con qué números lo decide la base (`avisos_del_dia`): solo
 * cuentas vivas, de ciclo diario, que pueden cargar, y personas con el aviso
 * encendido. La frase la elige `fraseDelDia`, en el idioma de cada uno. Acá
 * solo se reparte, una vez por persona, momento y día (`reservar_envio`).
 *
 * El secreto del cron lo verifica CADA ruta antes de llamar a esto (ver
 * pruebas/publico.test.js, grupo 9): acá no se vuelve a mirar.
 */
export async function correrAvisosDiarios(momento: Momento): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {

  const supabase = clienteDeServicio();
  const { data, error } = await supabase.rpc('avisos_del_dia');
  if (error) {
    console.error('[avisos-diarios]', momento, error.message);
    return { estado: 503, cuerpo: { error: 'No se pudo leer.' } };
  }

  const cuentas = (Array.isArray(data) ? data : []) as (CuentaDelDia & {
    empresa_id: string; fecha: string;
    destinatarios: { user_id: string; idioma: string }[];
  })[];

  let enviados = 0;
  let salteados = 0;

  for (const cuenta of cuentas) {
    for (const d of cuenta.destinatarios ?? []) {
      const idioma = esIdioma(d.idioma) ? d.idioma : IDIOMA_POR_DEFECTO;
      const t = diccionario(idioma);
      const frase = fraseDelDia(momento, cuenta, t.notificaciones, FICHA[idioma].locale);
      if (!frase) { salteados += 1; continue; }

      const { data: reservado } = await supabase.rpc('reservar_envio', {
        p_tipo: `diario_${momento}`,
        p_clave: `diario:${momento}:${cuenta.empresa_id}:${d.user_id}:${cuenta.fecha}`,
        p_user: d.user_id,
        p_empresa: cuenta.empresa_id,
        p_canal: 'push',
      });
      if (!reservado) { salteados += 1; continue; }

      enviados += await avisar(d.user_id, {
        ...frase,
        // Un tag por cuenta: el de la noche reemplaza al de la tarde en la
        // pantalla, en vez de apilar tres avisos del mismo negocio.
        tag: `diario-${cuenta.empresa_id}`,
        idioma,
      });
    }
  }

  const pruebas = momento === 'manana' ? await avisarPruebasPorTerminar() : null;
  // El vencimiento del plan (y el correo del fin de la prueba) va con la
  // corrida de la mañana, igual que el push de la prueba: 107.
  const vencimientos = momento === 'manana' ? await avisarVencimientos() : null;
  // «Hoy te paga Juan» (127) también va a la mañana: es cuando se arma el
  // día. Colgado de esta corrida a propósito: sin una tarea nueva.
  const cobros = momento === 'manana' ? await avisarCobrosDeHoy() : null;

  return { estado: 200, cuerpo: { momento, cuentas: cuentas.length, enviados, salteados, pruebas, vencimientos, cobros } };
}

/**
 * HOY TOCA COBRAR (127): el día que vence, a los 3 días y después una vez
 * por semana.
 *
 * Todo lo decide la base (`cobros_de_hoy`): qué cuota sigue pendiente, si
 * hoy le toca aviso (todos los días sería el aviso que se aprende a
 * ignorar) y a quién le llega: los miembros de un negocio que tiene Fiado,
 * con «Cobros con fecha» encendido en Ajustes. Fiado lo abre cualquier
 * miembro —el que fía es el que cobra—, así que no se filtra por rol. No
 * entran la cuenta vencida ni la personal en Gratis.
 *
 * Solo push: es un recordatorio de rutina, no algo que corta la cuenta. Si
 * el push no llega, la pantalla de Fiado y el panel lo muestran igual.
 *
 * Uno por persona, cuenta y día (el día de la cuenta, no el del servidor).
 */
async function avisarCobrosDeHoy() {
  const supabase = clienteDeServicio();
  const { data, error } = await supabase.rpc('cobros_de_hoy');
  if (error) {
    // Con el código nuevo y la base vieja la función no existe: se anota y
    // el resto de la corrida ya salió.
    console.error('[avisos-diarios] cobros', error.message);
    return { error: true };
  }

  const lista = (Array.isArray(data) ? data : []) as CobrosDeHoy[];

  let enviados = 0;
  let salteados = 0;

  for (const c of lista) {
    for (const d of c.destinatarios ?? []) {
      const idioma = esIdioma(d.idioma) ? d.idioma : IDIOMA_POR_DEFECTO;
      const frase = fraseDeCobros(c, diccionario(idioma).notificaciones.cobros, FICHA[idioma].locale);
      // Sin frase no se reserva: la reserva quedaría gastada por nada.
      if (!frase) { salteados += 1; continue; }

      const { data: reservado } = await supabase.rpc('reservar_envio', {
        p_tipo: 'cobros',
        p_clave: claveDeCobros(c.empresa_id, d.user_id, c.fecha),
        p_user: d.user_id,
        p_empresa: c.empresa_id,
        p_canal: 'push',
      });
      if (!reservado) { salteados += 1; continue; }

      enviados += await avisar(d.user_id, {
        ...frase,
        tag: `cobros-${c.empresa_id}`,
        idioma,
      });
    }
  }

  return { cuentas: lista.length, enviados, salteados };
}

/**
 * LA PRUEBA SE TERMINA: faltando 3 días, 1 y el último día.
 *
 * Es el aviso que más importa: vencida la prueba, un negocio se cierra hasta
 * que se pague (ver CandadoCuenta); la cuenta personal pasa al plan Gratis y
 * se le cierra lo del Pro (110, 28/09/2026), así que su aviso dice eso y no
 * «sin cortes». Que la persona lo vea venir es la diferencia entre un
 * cliente que paga y uno que se entera cuando ya no puede entrar.
 *
 * A la administración le llega un solo aviso con la lista: es el mejor
 * momento para escribirles.
 */
async function avisarPruebasPorTerminar() {
  const supabase = clienteDeServicio();
  const { data, error } = await supabase.rpc('pruebas_por_terminar');
  if (error) {
    console.error('[avisos-diarios] pruebas', error.message);
    return { error: true };
  }

  // `tipo_cuenta` ya viene de la 071 (pruebas_por_terminar).
  const lista = (Array.isArray(data) ? data : []) as {
    empresa_id: string; nombre: string; tipo_cuenta: string; fin: string; dias: number;
    destinatarios: { user_id: string; idioma: string }[];
  }[];

  let enviados = 0;
  const nuevas: typeof lista = [];

  for (const p of lista) {
    const { data: reservado } = await supabase.rpc('reservar_envio', {
      p_tipo: 'prueba_termina',
      p_clave: `prueba:${p.empresa_id}:${p.dias}:${p.fin}`,
      p_user: null,
      p_empresa: p.empresa_id,
      p_canal: 'push',
    });
    if (!reservado) continue;
    nuevas.push(p);

    for (const d of p.destinatarios ?? []) {
      const idioma = esIdioma(d.idioma) ? d.idioma : IDIOMA_POR_DEFECTO;
      const dic = diccionario(idioma);
      const t = dic.notificaciones;
      enviados += await avisar(d.user_id, {
        titulo: t.prueba.titulo(p.dias),
        cuerpo: p.tipo_cuenta === 'personal' ? dic.planGratis.notificaciones.pruebaCuerpo : t.prueba.cuerpo,
        url: '/plan',
        tag: `prueba-${p.empresa_id}`,
        idioma,
      });
    }
  }

  if (nuevas.length > 0) {
    try {
      const { data: admins } = await supabase.rpc('usuarios_de_la_administracion');
      const ids: string[] = Array.isArray(admins) ? admins : [];
      // La administración es en español a propósito (ver PanelAdmin).
      const cuando = (dias: number) => (dias <= 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`);
      const detalle = nuevas.slice(0, 6).map((p) => `${p.nombre} (${cuando(p.dias)})`).join(', ');
      await Promise.all(ids.map((id) => avisar(id, {
        titulo: nuevas.length === 1 ? '1 prueba termina pronto' : `${nuevas.length} pruebas terminan pronto`,
        cuerpo: `${detalle}${nuevas.length > 6 ? '…' : ''}. Buen momento para escribirles.`,
        url: '/admin',
        tag: 'pruebas-por-terminar',
      })));
    } catch {
      // Los avisos a cada cuenta ya salieron; el resumen es el extra.
    }
  }

  return { cuentas: lista.length, nuevas: nuevas.length, enviados };
}

/**
 * SE VENCE EL PLAN (107): faltando 3 días, 1 y el día.
 *
 * Hasta la 107 al que PAGA no se le avisaba nada: el día que se le vencía el
 * período la cuenta se cortaba y se enteraba cuando ya no podía cargar. Y la
 * prueba se avisaba solo por push, que en iPhone llega únicamente si Orden
 * está en la pantalla de inicio.
 *
 *   · Período pago → push (uno por cuenta) y correo (uno por persona).
 *   · Prueba       → solo el correo: el push es el de `avisarPruebasPorTerminar`.
 *
 * Quién y cuándo lo decide la base (`vencimientos_por_avisar`); qué se dice,
 * `lib/aviso-vencimiento.ts`, en el idioma de cada uno; cómo se paga, fila
 * por fila (`comoSePaga`, desde Bancard: débito, tarjeta o transferencia).
 * Acá solo se reparte, una vez por vencimiento y canal (`reservar_envio`).
 *
 * A la administración le llega un resumen de los planes pagos que vencen y
 * que paga la persona: el aviso para estar atentos a la transferencia. Las
 * cuentas con el débito al día no entran: se cobran solas.
 *
 * NO SE PROMETE UN COBRO QUE NO VA A SALIR (07/10/2026). Antes de usar cada
 * fila se pasa por `segunElServidor`: si Bancard no está configurado en
 * este servidor, o la tarjeta guardada es del otro ambiente, la fila queda
 * sin débito (y sin configuración, sin «pagá con tarjeta o QR»). El push, el
 * correo y el aviso a la administración caen así al camino de siempre.
 */
async function avisarVencimientos() {
  const supabase = clienteDeServicio();
  const { data, error } = await supabase.rpc('vencimientos_por_avisar');
  if (error) {
    console.error('[avisos-diarios] vencimientos', error.message);
    return { error: true };
  }

  // Bancard, leído UNA vez para toda la corrida: null si está apagado o mal cargado.
  const entornoBancard = configBancard()?.entorno ?? null;
  const lista = ((Array.isArray(data) ? data : []) as Vencimiento[])
    .map((v) => segunElServidor(v, entornoBancard));
  const hayCorreo = correoConfigurado();
  const web = sitio();
  // «Pagá con tarjeta o QR» solo si de verdad ve el botón: abierto a todos
  // y en producción (en staging el interruptor general no cuenta).
  const abierto = abiertoATodos() && entornoBancard === 'produccion';

  let push = 0;
  let correos = 0;
  let fallados = 0;
  const nuevos: Vencimiento[] = [];

  for (const v of lista) {
    // El push, solo para el período pago: el de la prueba ya salió arriba.
    if (v.tipo === 'periodo') {
      const { data: reservado } = await supabase.rpc('reservar_envio', {
        p_tipo: 'vence_plan',
        p_clave: claveDeEnvio(v, 'push'),
        p_user: null,
        p_empresa: v.empresa_id,
        p_canal: 'push',
      });
      if (reservado) {
        nuevos.push(v);
        for (const d of v.destinatarios ?? []) {
          const idioma = esIdioma(d.idioma) ? d.idioma : IDIOMA_POR_DEFECTO;
          const aviso = pushDeVencimiento(v, diccionario(idioma).avisoVencimiento, FICHA[idioma].locale, abierto);
          push += await avisar(d.user_id, {
            ...aviso,
            url: RUTA_PARA_PAGAR,
            tag: `vence-${v.empresa_id}`,
            idioma,
          });
        }
      }
    }

    // Sin Resend configurado no se reserva: la reserva quedaría gastada por
    // un correo que nunca salió.
    if (!hayCorreo) continue;

    for (const d of v.destinatarios ?? []) {
      if (!d.email) continue;
      const { data: reservado } = await supabase.rpc('reservar_envio', {
        p_tipo: v.tipo === 'prueba' ? 'prueba_termina_correo' : 'vence_plan_correo',
        p_clave: claveDeEnvio(v, 'email', d.user_id),
        p_user: d.user_id,
        p_empresa: v.empresa_id,
        p_canal: 'email',
      });
      if (!reservado) continue;

      const idioma = esIdioma(d.idioma) ? d.idioma : IDIOMA_POR_DEFECTO;
      const correo = correoDeVencimiento(v, d, diccionario(idioma).avisoVencimiento, FICHA[idioma].locale, web, abierto);
      const salio = await enviarEmail({ para: d.email, asunto: correo.asunto, html: correo.html, texto: correo.texto });
      if (salio) correos += 1;
      else fallados += 1;
    }
  }

  // Las que se cobran solas de la tarjeta guardada no necesitan a nadie atento.
  const aMano = nuevos.filter((v) => comoSePaga(v, abierto) !== 'debito');
  if (aMano.length > 0) {
    try {
      const { data: admins } = await supabase.rpc('usuarios_de_la_administracion');
      const ids: string[] = Array.isArray(admins) ? admins : [];
      // La administración es en español a propósito (ver PanelAdmin).
      const cuando = (dias: number) => (dias <= 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`);
      const detalle = aMano.slice(0, 6).map((v) => `${v.nombre} (${cuando(v.dias)})`).join(', ');
      await Promise.all(ids.map((id) => avisar(id, {
        titulo: aMano.length === 1 ? '1 plan pago vence pronto' : `${aMano.length} planes pagos vencen pronto`,
        cuerpo: `${detalle}${aMano.length > 6 ? '…' : ''}. Atentos a la transferencia.`,
        url: '/admin',
        tag: 'planes-por-vencer',
      })));
    } catch {
      // Los avisos a cada cuenta ya salieron; el resumen es el extra.
    }
  }

  return { cuentas: lista.length, push, correos, fallados, sinCorreo: !hayCorreo };
}
