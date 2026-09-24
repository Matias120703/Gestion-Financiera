import { clienteDeServicio } from '@/lib/supabase/servicio';
import { avisar, correoConfigurado, enviarEmail } from '@/lib/avisos';
import { sitio } from '@/lib/pagos';
import {
  claveDeEnvio, correoDeVencimiento, pushDeVencimiento, RUTA_PARA_PAGAR, type Vencimiento,
} from '@/lib/aviso-vencimiento';
import { diccionario } from '@/i18n/diccionarios';
import { FICHA, esIdioma, IDIOMA_POR_DEFECTO } from '@/i18n/idiomas';
import { fraseDelDia, type CuentaDelDia, type Momento } from '@/lib/frases-del-dia';

/**
 * ORDEN HABLA TODOS LOS DÍAS (071).
 *
 * Tres corridas diarias, una por momento, cada una con su ruta en
 * app/api/tareas/avisos-{manana,tarde,noche} (ver vercel.json):
 *
 *   · mañana → cómo fue ayer, las pruebas que se terminan y los planes
 *     pagos que se vencen (107, push y correo);
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

  return { estado: 200, cuerpo: { momento, cuentas: cuentas.length, enviados, salteados, pruebas, vencimientos } };
}

/**
 * LA PRUEBA SE TERMINA: faltando 3 días, 1 y el último día.
 *
 * Es el aviso que más importa: vencida la prueba, Orden se cierra hasta que
 * se pague (ver CandadoCuenta). Que la persona lo vea venir es la diferencia
 * entre un cliente que paga y uno que se entera cuando ya no puede entrar.
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

  const lista = (Array.isArray(data) ? data : []) as {
    empresa_id: string; nombre: string; fin: string; dias: number;
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
      const t = diccionario(idioma).notificaciones;
      enviados += await avisar(d.user_id, {
        titulo: t.prueba.titulo(p.dias),
        cuerpo: t.prueba.cuerpo,
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
 * `lib/aviso-vencimiento.ts`, en el idioma de cada uno; cómo se paga, un solo
 * valor ahí mismo (`COMO_SE_PAGA`). Acá solo se reparte, una vez por
 * vencimiento y canal (`reservar_envio`).
 *
 * A la administración le llega un resumen de los planes pagos que vencen: el
 * cobro hoy es a mano, así que es el aviso para estar atentos a la
 * transferencia.
 */
async function avisarVencimientos() {
  const supabase = clienteDeServicio();
  const { data, error } = await supabase.rpc('vencimientos_por_avisar');
  if (error) {
    console.error('[avisos-diarios] vencimientos', error.message);
    return { error: true };
  }

  const lista = (Array.isArray(data) ? data : []) as Vencimiento[];
  const hayCorreo = correoConfigurado();
  const web = sitio();

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
          const aviso = pushDeVencimiento(v, diccionario(idioma).avisoVencimiento, FICHA[idioma].locale);
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
      const correo = correoDeVencimiento(v, d, diccionario(idioma).avisoVencimiento, FICHA[idioma].locale, web);
      const salio = await enviarEmail({ para: d.email, asunto: correo.asunto, html: correo.html, texto: correo.texto });
      if (salio) correos += 1;
      else fallados += 1;
    }
  }

  if (nuevos.length > 0) {
    try {
      const { data: admins } = await supabase.rpc('usuarios_de_la_administracion');
      const ids: string[] = Array.isArray(admins) ? admins : [];
      // La administración es en español a propósito (ver PanelAdmin).
      const cuando = (dias: number) => (dias <= 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`);
      const detalle = nuevos.slice(0, 6).map((v) => `${v.nombre} (${cuando(v.dias)})`).join(', ');
      await Promise.all(ids.map((id) => avisar(id, {
        titulo: nuevos.length === 1 ? '1 plan pago vence pronto' : `${nuevos.length} planes pagos vencen pronto`,
        cuerpo: `${detalle}${nuevos.length > 6 ? '…' : ''}. Atentos a la transferencia.`,
        url: '/admin',
        tag: 'planes-por-vencer',
      })));
    } catch {
      // Los avisos a cada cuenta ya salieron; el resumen es el extra.
    }
  }

  return { cuentas: lista.length, push, correos, fallados, sinCorreo: !hayCorreo };
}
