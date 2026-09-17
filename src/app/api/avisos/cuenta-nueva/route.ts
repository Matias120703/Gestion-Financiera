import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { avisar, nombreDeLaPersona } from '@/lib/avisos';
import { diccionario } from '@/i18n/diccionarios';
import { fichaDe } from '@/lib/rubros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * UNA CUENTA NUEVA: SE AVISA A LA ADMINISTRACIÓN Y A QUIEN LA TRAJO.
 *
 * La llama la pantalla de registro apenas se creó la empresa (y después de
 * anotar el código del socio, si vino con uno). La cuenta ya existe: esto es
 * solo el aviso, y si falla no frena nada.
 *
 * POR QUÉ NO SE PUEDE USAR PARA MOLESTAR
 *
 *   · Solo el propietario de la empresa puede pedirlo, con su sesión.
 *   · Solo para una empresa creada en las últimas dos horas.
 *   · Una sola vez por empresa (`reservar_envio`): llamarla cien veces manda
 *     un aviso.
 */
export async function POST(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let empresaId = '';
  try {
    empresaId = String((await request.json())?.empresa ?? '');
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) return NextResponse.json({ ok: false }, { status: 400 });

  const servicio = clienteDeServicio();

  const { data: dueno } = await servicio
    .from('miembros')
    .select('rol, nombre')
    .eq('empresa_id', empresaId)
    .eq('user_id', user.id)
    .eq('rol', 'propietario')
    .maybeSingle();
  if (!dueno) return NextResponse.json({ ok: false }, { status: 403 });

  const { data: empresa } = await servicio
    .from('empresas')
    .select('nombre, tipo_cuenta, rubro, created_at')
    .eq('id', empresaId)
    .maybeSingle();
  if (!empresa || Date.now() - new Date(empresa.created_at).getTime() > 2 * 60 * 60 * 1000) {
    return NextResponse.json({ ok: false, motivo: 'vieja' });
  }

  const { data: reservado } = await servicio.rpc('reservar_envio', {
    p_tipo: 'cuenta_nueva',
    p_clave: `cuenta_nueva:${empresaId}`,
    p_user: user.id,
    p_empresa: empresaId,
    p_canal: 'push',
  });
  if (!reservado) return NextResponse.json({ ok: true, ya: true });

  // Quién la trajo, si vino con el enlace de alguien.
  const { data: referido } = await servicio
    .from('referidos')
    .select('socio_id, socios(nombre, user_id)')
    .eq('empresa_id', empresaId)
    .maybeSingle();
  const socio = (referido as any)?.socios as { nombre: string; user_id: string | null } | undefined;

  // Quién se registró. El nombre lo dejó en el primer paso del registro; si
  // no lo dejó, queda el nombre de la cuenta.
  const persona = (dueno.nombre ?? '').trim() || await nombreDeLaPersona(empresaId, empresa.nombre);

  let avisados = 0;

  try {
    const { data: admins } = await servicio.rpc('usuarios_de_la_administracion');
    const ids: string[] = Array.isArray(admins) ? admins : [];
    const que = empresa.tipo_cuenta === 'personal'
      ? 'Cuenta personal'
      : `Negocio · ${fichaDe(empresa.rubro, 'emprendedor').nombre}`;
    const cuerpo = [que, `«${empresa.nombre}»`, 'en prueba', socio ? `vino con el enlace de ${socio.nombre}` : '']
      .filter(Boolean).join(' · ');
    const entregas = await Promise.all(ids.map((id) => avisar(id, {
      // El nombre de la persona y no el de la cuenta: ver `nombreDeLaPersona`.
      titulo: `Se registró ${persona}`,
      cuerpo,
      url: '/admin',
      tag: `cuenta-${empresaId}`,
    })));
    avisados += entregas.reduce((s, x) => s + x, 0);
  } catch {
    // La cuenta ya está creada; el aviso es el extra.
  }

  if (socio?.user_id) {
    try {
      const { data: pref } = await servicio
        .from('preferencias').select('idioma').eq('user_id', socio.user_id).maybeSingle();
      const idioma = pref?.idioma ?? 'es';
      const t = diccionario(idioma).notificaciones.socio;
      avisados += await avisar(socio.user_id, {
        // Al socio le sirve el nombre de quien entró: recomienda a gente que
        // conoce, y «Mis finanzas» no le dice nada.
        titulo: t.entroTitulo(persona),
        cuerpo: t.entroCuerpo,
        url: '/recomendar',
        tag: `referido-${empresaId}`,
        idioma,
      });
    } catch {
      // Igual que arriba.
    }
  }

  return NextResponse.json({ ok: true, avisados });
}
