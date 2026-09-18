import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { avisar, nombreDeLaPersona } from '@/lib/avisos';
import { diccionario } from '@/i18n/diccionarios';
import { FICHA, esIdioma, IDIOMA_POR_DEFECTO } from '@/i18n/idiomas';

const NOMBRE_DEL_PLAN: Record<string, string> = { basico: 'Básico', pro: 'Pro', negocio: 'Premium' };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SE ACTIVÓ UN PLAN: SE AVISA AL CLIENTE, Y AL SOCIO SI GANÓ SU COMISIÓN.
 *
 * La llama el panel de administración justo después de `cambiar_plan_cuenta`.
 * El plan ya quedó activo en la base; esto es solo el aviso.
 *
 *   · Al dueño de la cuenta: «Tu plan Pro está activo hasta el …».
 *   · Al socio que la trajo, si ese cobro le generó la comisión: «Pizzería
 *     Sur pagó su primer mes. Ganaste Gs. 95.000».
 *
 * Solo la administración puede pedirlo (se pregunta a la base con la sesión
 * de quien llama), y cada aviso sale una sola vez: el de plan por período, y
 * el de comisión por comisión.
 */
export async function POST(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: esAdmin } = await supabase.rpc('es_superadmin');
  if (esAdmin !== true) return NextResponse.json({ ok: false }, { status: 403 });

  let empresaId = '';
  try {
    empresaId = String((await request.json())?.empresa ?? '');
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) return NextResponse.json({ ok: false }, { status: 400 });

  const servicio = clienteDeServicio();

  const [{ data: empresa }, { data: suscripcion }, { data: dueños }, { data: promoCruda }] = await Promise.all([
    servicio.from('empresas').select('nombre').eq('id', empresaId).maybeSingle(),
    servicio.from('suscripciones').select('plan, estado, periodo_fin').eq('empresa_id', empresaId).maybeSingle(),
    servicio.from('miembros').select('user_id').eq('empresa_id', empresaId).in('rol', ['propietario', 'admin']),
    // Los números salen de `ajustes_orden`, no del código: si mañana la promo
    // cambia, el aviso lo dice sin desplegar nada (079).
    servicio.rpc('promo_de_la_prueba'),
  ]);

  const crudo = promoCruda as { constancia_porcentaje?: number; constancia_dias?: number } | null;
  const promo = crudo && Number(crudo.constancia_porcentaje) > 0
    ? { porcentaje: Math.round(Number(crudo.constancia_porcentaje)), dias: Number(crudo.constancia_dias) }
    : null;

  let avisados = 0;

  const activa = suscripcion && suscripcion.estado === 'activa' && suscripcion.plan !== 'gratis' && suscripcion.periodo_fin;
  if (empresa && activa) {
    const { data: reservado } = await servicio.rpc('reservar_envio', {
      p_tipo: 'plan_activo',
      p_clave: `plan_activo:${empresaId}:${suscripcion.plan}:${suscripcion.periodo_fin}`,
      p_user: null,
      p_empresa: empresaId,
      p_canal: 'push',
    });

    if (reservado) {
      for (const d of dueños ?? []) {
        const { data: pref } = await servicio
          .from('preferencias').select('idioma').eq('user_id', d.user_id).maybeSingle();
        const idioma = esIdioma(pref?.idioma) ? pref!.idioma : IDIOMA_POR_DEFECTO;
        const t = diccionario(idioma).notificaciones.planActivo;
        const fecha = new Date(suscripcion.periodo_fin as string).toLocaleDateString(FICHA[idioma as keyof typeof FICHA].locale, {
          day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Asuncion',
        });
        avisados += await avisar(d.user_id, {
          titulo: t.titulo(NOMBRE_DEL_PLAN[suscripcion.plan as string] ?? 'Pro'),
          // Apenas pagó es el mejor momento para contarle cómo pagar menos el
          // mes que viene: mantener la racha (079).
          cuerpo: t.cuerpo(fecha) + (promo ? t.conRacha(promo.porcentaje, promo.dias) : ''),
          url: '/panel',
          tag: `plan-${empresaId}`,
          idioma,
        });
      }
    }
  }

  // La comisión de este cobro, si se acaba de generar.
  const { data: comision } = await servicio
    .from('comisiones')
    .select('id, monto, created_at, socios(user_id)')
    .eq('empresa_id', empresaId)
    .eq('estado', 'por_pagar')
    .maybeSingle();
  const socioUser = (comision as any)?.socios?.user_id as string | null | undefined;
  const reciente = comision && Date.now() - new Date(comision.created_at).getTime() < 30 * 60 * 1000;

  if (empresa && comision && socioUser && reciente) {
    const { data: reservado } = await servicio.rpc('reservar_envio', {
      p_tipo: 'comision_ganada',
      p_clave: `comision:${comision.id}`,
      p_user: socioUser,
      p_empresa: empresaId,
      p_canal: 'push',
    });
    if (reservado) {
      const { data: pref } = await servicio
        .from('preferencias').select('idioma').eq('user_id', socioUser).maybeSingle();
      const idioma = esIdioma(pref?.idioma) ? pref!.idioma : IDIOMA_POR_DEFECTO;
      const t = diccionario(idioma).notificaciones.socio;
      const monto = `Gs. ${Number(comision.monto).toLocaleString(FICHA[idioma as keyof typeof FICHA].locale, { maximumFractionDigits: 0 })}`;
      // El nombre de la persona que pagó, no el de su cuenta: el socio la
      // trajo por conocerla. Ver `nombreDeLaPersona`.
      const persona = await nombreDeLaPersona(empresaId, empresa.nombre);
      avisados += await avisar(socioUser, {
        titulo: t.comisionTitulo(persona),
        cuerpo: t.comisionCuerpo(monto),
        url: '/recomendar',
        tag: `comision-${comision.id}`,
        idioma,
      });
    }
  }

  return NextResponse.json({ ok: true, avisados });
}
