import { NextResponse } from 'next/server';
import { clienteServidor } from '@/lib/supabase/servidor';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { avisar } from '@/lib/avisos';
import { diccionario } from '@/i18n/diccionarios';
import { FICHA, esIdioma, IDIOMA_POR_DEFECTO } from '@/i18n/idiomas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * LA ADMINISTRACIÓN RESUELVE UN RETIRO: LO PAGÓ O NO SE PUDO.
 *
 * Antes el botón llamaba a la base directo desde el navegador, y el socio no
 * se enteraba de nada hasta que miraba su cuenta del banco. Pasa por acá para
 * poder mandarle el push: «Tu pago ya fue realizado».
 *
 * EL PERMISO NO SE DECIDE ACÁ
 *
 * Las dos funciones exigen `es_superadmin()` con la sesión de quien llama.
 * Esta ruta solo pasa esa sesión; el cliente de servicio se usa después, y
 * solo para leer el idioma del socio y mandarle el aviso.
 *
 * EL AVISO VA EN EL IDIOMA DEL SOCIO
 *
 * La administración escribe en español, pero el socio puede usar Orden en
 * portugués: el texto se arma con su diccionario, no con el de quien paga.
 */
export async function POST(request: Request) {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 });

  let cuerpo: { accion?: string; retiro?: string; medio?: string; nota?: string };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'Pedido ilegible.' }, { status: 400 });
  }

  const accion = cuerpo.accion === 'rechazar' ? 'rechazar' : cuerpo.accion === 'pagar' ? 'pagar' : null;
  if (!accion || !cuerpo.retiro) {
    return NextResponse.json({ error: 'Pedido ilegible.' }, { status: 400 });
  }

  const { data, error } = accion === 'pagar'
    ? await supabase.rpc('marcar_retiro_pagado', {
      p_retiro: cuerpo.retiro, p_medio: cuerpo.medio ?? '', p_nota: cuerpo.nota ?? '',
    })
    : await supabase.rpc('rechazar_retiro', { p_retiro: cuerpo.retiro, p_nota: cuerpo.nota ?? '' });

  if (error) {
    return NextResponse.json({ error: error.message || 'No se pudo hacer el cambio.' }, { status: 400 });
  }

  const r = data as {
    ok: boolean; monto: number; socio: string; socio_user_id: string | null;
    motivo?: string; aviso?: string | null;
  };

  let avisados = 0;

  // Un socio cargado a mano puede no tener cuenta en Orden: no hay a quién
  // avisarle, y eso no es un error.
  if (r.socio_user_id) {
    try {
      const servicio = clienteDeServicio();
      const { data: pref } = await servicio
        .from('preferencias')
        .select('idioma')
        .eq('user_id', r.socio_user_id)
        .maybeSingle();

      const idioma = pref?.idioma ?? IDIOMA_POR_DEFECTO;
      const t = diccionario(idioma).recomendar;
      const locale = FICHA[esIdioma(idioma) ? idioma : IDIOMA_POR_DEFECTO].locale;
      const monto = `Gs. ${Number(r.monto).toLocaleString(locale, { maximumFractionDigits: 0 })}`;

      avisados = await avisar(r.socio_user_id, accion === 'pagar'
        ? {
          titulo: t.pushPagadoTitulo,
          cuerpo: t.pushPagadoCuerpo(monto),
          url: '/recomendar',
          tag: 'retiro',
          idioma,
        }
        : {
          titulo: t.pushRechazadoTitulo,
          cuerpo: t.pushRechazadoCuerpo(monto, r.motivo ?? ''),
          url: '/recomendar',
          tag: 'retiro',
          idioma,
        });
    } catch {
      // El retiro ya quedó resuelto en la base. El aviso es el extra.
    }
  }

  return NextResponse.json({ ok: true, aviso: r.aviso ?? null, avisados });
}
