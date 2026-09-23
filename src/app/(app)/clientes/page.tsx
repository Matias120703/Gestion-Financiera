import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { fichaDe, palabra, tieneSeccion } from '@/lib/rubros';
import { textos, idiomaActual } from '@/i18n';
import { traerClientes } from '@/lib/clientes';
import { traerResumenFiado } from '@/lib/fiado';
import { clienteServidor } from '@/lib/supabase/servidor';
import { PantallaClientes, type RutinaEnClientes } from '@/components/PantallaClientes';
import type { RutinasDelNegocio } from '@/lib/tipos-rutinas';

export const dynamic = 'force-dynamic';

/**
 * La rutina de cada cliente del trainer, por id (098).
 *
 * Es contexto de la ficha, no el dato de esta pantalla: si falla, la lista
 * se muestra igual y devuelve null. Null no es «nadie tiene rutina»: la
 * ficha entonces no dice «Sin rutina», solo ofrece ir a la carpeta.
 */
async function rutinasPorCliente(empresaId: string): Promise<Record<string, RutinaEnClientes> | null> {
  try {
    const { data, error } = await clienteServidor().rpc('rutinas_de', { p_empresa: empresaId, p_todos: true });
    const lista = (data as RutinasDelNegocio | null)?.clientes;
    if (error || !Array.isArray(lista)) return null;
    const mapa: Record<string, RutinaEnClientes> = {};
    for (const c of lista) {
      mapa[c.id] = {
        vigente: c.vigente
          ? { nombre: c.vigente.nombre, desde: c.vigente.desde, cambia_el: c.vigente.cambia_el }
          : null,
        proxima: Boolean(c.borrador_id),
        enlace: c.enlace ?? null,
      };
    }
    return mapa;
  } catch {
    return null;
  }
}

/**
 * CLIENTES · a quién le vendés.
 *
 * Una lista que solo se mira no vale el trabajo de mantenerla. Lo que la
 * vuelve útil es lo de al lado de cada nombre: si te debe, cuándo vino por
 * última vez y cuánto dejó. Por eso se lee junto con el fiado, en paralelo.
 *
 * No existe en una cuenta personal: una persona no tiene clientes, y a quien
 * le debe plata lo lleva en «Me deben».
 */
export default async function PaginaClientes() {
  const ctx = await contextoObligatorio();
  if (!tieneSeccion(ctx.empresa.rubro, ctx.empresa.tipo_cuenta, '/clientes')) redirect('/panel');

  // El trainer ve la rutina de cada cliente en su ficha (098). Solo él la pide.
  const conRutinas = tieneSeccion(ctx.empresa.rubro, ctx.empresa.tipo_cuenta, '/rutinas');

  const [clientes, fiado, rutinas] = await Promise.all([
    traerClientes(ctx.empresa.id),
    traerResumenFiado(ctx.empresa.id),
    conRutinas ? rutinasPorCliente(ctx.empresa.id) : Promise.resolve(null),
  ]);

  const saldos: Record<string, number> = {};
  for (const d of fiado.clientes) saldos[d.cliente_id] = d.saldo;

  return (
    <PantallaClientes
      empresaId={ctx.empresa.id}
      moneda={ctx.empresa.moneda}
      zona={ctx.zonaHoraria}
      negocio={ctx.empresa.nombre}
      clientes={clientes}
      saldos={saldos}
      // Eliminar esconde historia, y eso lo decide quien administra. La base
      // lo vuelve a verificar (058).
      puedeEliminar={ctx.esAdmin}
      // Visitas y turnos solo significan algo donde hay agenda. En un almacén
      // «0 visitas» al lado de cada nombre sería ruido con cara de dato.
      tieneAgenda={tieneSeccion(ctx.empresa.rubro, ctx.empresa.tipo_cuenta, '/agenda')}
      // Los paquetes de clases, solo donde se venden así (088).
      tienePaquetes={fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta).paquetes}
      // Un profe inscribe alumnos y cobra períodos, no fía (091).
      deAlumnos={fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta).agendaDeAlumnos}
      notasALaVista={fichaDe(ctx.empresa.rubro, ctx.empresa.tipo_cuenta).notasALaVista}
      conRutinas={conRutinas}
      rutinas={rutinas}
      titulo={palabra(ctx.empresa.rubro, ctx.empresa.tipo_cuenta, 'clientes',
        (await textos()).clientes.titulo, await idiomaActual())}
    />
  );
}
