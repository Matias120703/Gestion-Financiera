import { NextResponse } from 'next/server';
import { clienteDeServicio } from '@/lib/supabase/servicio';
import { cronAutorizado, enviarEmail } from '@/lib/avisos';
import { asuntoSemanal, htmlSemanal, textoSemanal, type DatosSemana } from '@/lib/correo-semanal';
import { sitio } from '@/lib/pagos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * EL RESUMEN DEL LUNES.
 *
 * Es el aviso que más retención da por lo poco que cuesta, y el único que
 * llega a todos lados sin depender de que el navegador soporte push.
 *
 * Solo va a propietarios y administradores: el resumen trae ganancia y
 * márgenes, y un vendedor no puede verlos. Mandárselo por correo sería
 * saltarse por la puerta de atrás el permiso por columna que la migración 003
 * puso con tanto cuidado. La función `destinatarios_resumen_semanal()` ya
 * filtra por rol; acá no se afloja eso.
 *
 * Idempotente por semana ISO: si el cron se dispara dos veces el lunes, la
 * segunda no manda nada. La garantía es el índice único de `envios`, no un
 * `if` en este archivo.
 */
export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const supabase = clienteDeServicio();

  const { data: destinos, error } = await supabase.rpc('destinatarios_resumen_semanal');
  if (error) {
    console.error('[semanal] destinatarios', error.message);
    return NextResponse.json({ error: 'No se pudo leer.' }, { status: 503 });
  }

  const lista = (Array.isArray(destinos) ? destinos : []) as {
    user_id: string; email: string; nombre: string;
    empresa_id: string; empresa: string; moneda: string; zona: string; idioma: string;
  }[];

  let enviados = 0;
  let salteados = 0;
  let fallados = 0;

  for (const d of lista) {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: d.zona || 'America/Asuncion' })
      .format(new Date());
    const hasta = restarDias(hoy, 1);
    const desde = restarDias(hoy, 7);

    const { data: reservado } = await supabase.rpc('reservar_envio', {
      p_tipo: 'semanal',
      p_clave: `semanal:${d.empresa_id}:${d.user_id}:${semanaISO(hasta)}`,
      p_user: d.user_id,
      p_empresa: d.empresa_id,
      p_canal: 'email',
    });

    if (!reservado) { salteados += 1; continue; }

    const [resumen, serie, ranking] = await Promise.all([
      supabase.rpc('resumen_financiero', { p_empresa: d.empresa_id, p_desde: desde, p_hasta: hasta }),
      supabase.rpc('serie_financiera_diaria', { p_empresa: d.empresa_id, p_desde: desde, p_hasta: hasta }),
      supabase.rpc('ranking_productos', { p_empresa: d.empresa_id, p_desde: desde, p_hasta: hasta, p_limite: 1 }),
    ]);

    if (resumen.error) { fallados += 1; continue; }

    const r: any = resumen.data ?? {};
    const dias: any[] = Array.isArray(serie.data) ? serie.data : [];
    const top: any[] = Array.isArray(ranking.data) ? ranking.data : [];

    // Una semana sin una sola venta no genera correo. Escribirle a alguien
    // para decirle "vendiste cero" no ayuda a nadie a volver.
    if (Number(r.ventas ?? 0) <= 0 && Number(r.gastos ?? 0) <= 0) { salteados += 1; continue; }

    const mejor = dias.reduce<{ fecha: string; monto: number } | null>((mejorHasta, dia) => {
      const monto = Number(dia?.ventas ?? 0);
      if (!mejorHasta || monto > mejorHasta.monto) return { fecha: String(dia?.fecha ?? ''), monto };
      return mejorHasta;
    }, null);

    const datos: DatosSemana = {
      negocio: d.empresa,
      nombrePersona: d.nombre || '',
      moneda: d.moneda,
      idioma: d.idioma,
      desde,
      hasta,
      ventas: Number(r.ventas ?? 0),
      gastos: Number(r.gastos ?? 0),
      // La RPC ya devuelve null si quien pregunta no ve rentabilidad. Acá
      // corre como service_role, así que el filtro por rol lo hizo antes
      // `destinatarios_resumen_semanal()`.
      ganancia: r.ganancia_neta === null || r.ganancia_neta === undefined ? null : Number(r.ganancia_neta),
      cantidadVentas: Number(r.cantidad_ventas ?? 0),
      mejorDia: mejor && mejor.monto > 0 ? mejor : null,
      masVendido: top[0] ? { nombre: String(top[0].nombre), unidades: Number(top[0].unidades ?? 0) } : null,
      sitio: sitio(),
    };

    const salio = await enviarEmail({
      para: d.email,
      asunto: asuntoSemanal(datos),
      html: htmlSemanal(datos),
      texto: textoSemanal(datos),
    });

    if (salio) enviados += 1;
    else fallados += 1;
  }

  return NextResponse.json({ destinatarios: lista.length, enviados, salteados, fallados });
}

function restarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  base.setUTCDate(base.getUTCDate() - dias);
  return base.toISOString().slice(0, 10);
}

/** '2026-08-20' → '2026-W34'. Semana ISO: la clave de idempotencia. */
function semanaISO(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  // Al jueves de esa semana: por definición, el jueves cae siempre en el año
  // ISO al que pertenece la semana.
  const dia = fecha.getUTCDay() || 7;
  fecha.setUTCDate(fecha.getUTCDate() + 4 - dia);
  const inicioDeAnio = new Date(Date.UTC(fecha.getUTCFullYear(), 0, 1));
  const semana = Math.ceil((((fecha.getTime() - inicioDeAnio.getTime()) / 86_400_000) + 1) / 7);
  return `${fecha.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}
