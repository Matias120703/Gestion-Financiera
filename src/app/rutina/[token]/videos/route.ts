import { NextResponse } from 'next/server';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { esTokenDeRutina } from '@/components/rutinas/publico/enlace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * LAS DIRECCIONES DE LOS VIDEOS PROPIOS PARA EL ALUMNO (113).
 *
 * El bucket `videos` es privado: el alumno, que no tiene sesión, recibe
 * direcciones firmadas de 3 horas. Apagar o cambiar el link corta las
 * direcciones NUEVAS: esta ruta deja de firmar.
 *
 * Lo que NO corta (revisión del 30/09, documentación del Smart CDN de
 * Supabase, que está prendido en el plan Pro): una dirección firmada que ya
 * se usó queda guardada en el CDN y se sigue sirviendo con esa misma
 * dirección aunque la firma venza. Vencer la firma no la borra del CDN;
 * BORRAR EL ARCHIVO sí (en ~60 s). Por eso para cortar un video del todo hay
 * que quitarlo o cambiarlo (el archivo viejo se borra), y así lo dice la
 * Privacidad. Apagar el link no borra el archivo porque el trainer lo usa
 * con otros clientes. La subida manda `cacheControl` de 3 h (video.ts): el
 * navegador tampoco la guarda más que la firma.
 *
 * LA EXCEPCIÓN DE LA CLAVE DE SERVICIO (D1.12, escrita también en
 * src/lib/supabase/servicio.ts). Sin sesión no hay otra forma de firmar un
 * bucket privado. Por eso esta ruta:
 *
 *   · solo lee el token de la dirección, y si no es un uuid ni le pregunta a
 *     la base;
 *   · firma SOLO las rutas que devuelve `videos_por_token(token)`, que
 *     decide con las mismas reglas que la rutina (link activo, alumno
 *     activo, rubro, 30 días de gracia): nunca una ruta que venga del
 *     navegador. No lee la query, ni el cuerpo, ni nada más del pedido;
 *   · devuelve `{ clips: { <id>: <dirección> } }`, sin la ruta.
 *
 * Nada se guarda en caché (la firma vence) y los buscadores no la indexan.
 */
const CABECERAS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
};

/** 3 horas. El celular las recuerda 150 minutos (publico/clips.ts). */
const SEGUNDOS_FIRMA = 3 * 60 * 60;

export async function GET(_pedido: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!esTokenDeRutina(token)) {
    return NextResponse.json({ clips: {} }, { headers: CABECERAS });
  }

  try {
    const servicio = clienteDeServicio();
    const { data, error } = await servicio.rpc('videos_por_token', { p_token: token });
    if (error) throw new Error(error.message);

    const lista = (Array.isArray(data) ? data : [])
      .filter((x): x is { id: string; ruta: string } =>
        !!x && typeof x.id === 'string' && typeof x.ruta === 'string' && x.ruta === `${x.id}.mp4`);
    if (lista.length === 0) {
      return NextResponse.json({ clips: {} }, { headers: CABECERAS });
    }

    const { data: firmadas, error: errorFirma } = await servicio.storage
      .from('videos')
      .createSignedUrls(lista.map((x) => x.ruta), SEGUNDOS_FIRMA);
    if (errorFirma) throw new Error(errorFirma.message);

    const pedidas = new Set(lista.map((x) => x.ruta));
    const clips: Record<string, string> = {};
    for (const f of firmadas ?? []) {
      if (f.error || !f.signedUrl || !f.path || !pedidas.has(f.path)) continue;
      clips[f.path.replace(/\.mp4$/, '')] = f.signedUrl;
    }
    return NextResponse.json({ clips }, { headers: CABECERAS });
  } catch (e) {
    // Sin el token ni las rutas en el registro.
    console.error('[rutina-videos]', e instanceof Error ? e.message : 'error');
    return NextResponse.json({ error: 'no_disponible' }, { status: 503, headers: CABECERAS });
  }
}
