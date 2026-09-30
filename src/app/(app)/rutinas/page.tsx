import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { tieneSeccion } from '@/lib/rubros';
import { clienteServidor } from '@/lib/supabase/servidor';
import { exigir, exigirLista } from '@/lib/lectura';
import { hoyISO } from '@/lib/fechas';
import { PantallaRutinas, type VistaRutinas } from '@/components/rutinas/PantallaRutinas';
import type { CupoVideos, EjercicioBiblioteca, RutinasDelNegocio } from '@/lib/tipos-rutinas';

export const dynamic = 'force-dynamic';

/**
 * RUTINAS · las rutinas del personal trainer (098).
 *
 * Solo existe en el rubro entrenamiento: en cualquier otro, la dirección
 * escrita a mano vuelve al panel, como el resto de las secciones.
 *
 * La pestaña vive en la dirección (?ver=clientes|plantillas|ejercicios) y
 * «Ver todos» también (?todos=1): así «atrás» vuelve a donde estaba, y el
 * servidor pide solo lo de la pestaña abierta. La biblioteca de ejercicios
 * no se lee si nadie la está mirando.
 */
export default async function PaginaRutinas({
  searchParams: busqueda,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await busqueda;
  const ctx = await contextoObligatorio();
  if (!tieneSeccion(ctx.empresa.rubro, ctx.empresa.tipo_cuenta, '/rutinas')) redirect('/panel');

  const ver: VistaRutinas = searchParams.ver === 'plantillas' || searchParams.ver === 'ejercicios'
    ? searchParams.ver
    : 'clientes';
  const todos = searchParams.todos === '1';

  const supabase = clienteServidor();
  const [respuesta, biblioteca, cupo] = await Promise.all([
    supabase.rpc('rutinas_de', { p_empresa: ctx.empresa.id, p_todos: todos }),
    ver === 'ejercicios' ? supabase.rpc('ejercicios_de', { p_empresa: ctx.empresa.id }) : Promise.resolve(null),
    // «Videos propios: N de 100» (113). Si no se puede leer, la pantalla no
    // muestra el cupo y la base igual controla el tope.
    ver === 'ejercicios' ? supabase.rpc('videos_de_la_cuenta', { p_empresa: ctx.empresa.id }) : Promise.resolve(null),
  ]);

  const crudo = exigir(respuesta, 'rutinas') as RutinasDelNegocio;
  // Las listas vacías llegan como [] (coalesce en la base); igual se asegura
  // la forma, para que un null no rompa la pantalla entera.
  const datos: RutinasDelNegocio = {
    clientes: Array.isArray(crudo.clientes) ? crudo.clientes : [],
    para_atender: Array.isArray(crudo.para_atender) ? crudo.para_atender : [],
    plantillas: Array.isArray(crudo.plantillas) ? crudo.plantillas : [],
  };
  const ejercicios = biblioteca
    ? (exigirLista(biblioteca as { data: EjercicioBiblioteca[] | null; error: { message: string } | null }, 'ejercicios'))
    : null;
  const cupoVideos = leerCupo(cupo);

  return (
    <PantallaRutinas
      empresaId={ctx.empresa.id}
      zona={ctx.zonaHoraria}
      hoy={hoyISO(ctx.zonaHoraria)}
      // Borrar plantillas y juntar ejercicios es del dueño o de un admin; la
      // base lo vuelve a verificar.
      esAdmin={ctx.esAdmin}
      ver={ver}
      todos={todos}
      datos={datos}
      ejercicios={ejercicios}
      cupoVideos={cupoVideos}
    />
  );
}

/** {usados, tope, topePlan} de videos_de_la_cuenta, o null si no llegó bien. */
function leerCupo(r: { data: unknown; error: unknown } | null): CupoVideos | null {
  if (!r || r.error || !r.data || typeof r.data !== 'object') return null;
  const d = r.data as { usados?: unknown; tope?: unknown; tope_plan?: unknown };
  if (typeof d.usados !== 'number' || typeof d.tope !== 'number') return null;
  return typeof d.tope_plan === 'number' ? { usados: d.usados, tope: d.tope, topePlan: d.tope_plan } : { usados: d.usados, tope: d.tope };
}
