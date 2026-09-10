import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { tieneSeccion } from '@/lib/rubros';
import { traerClientes } from '@/lib/clientes';
import { traerResumenFiado } from '@/lib/fiado';
import { PantallaClientes } from '@/components/PantallaClientes';

export const dynamic = 'force-dynamic';

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

  const [clientes, fiado] = await Promise.all([
    traerClientes(ctx.empresa.id),
    traerResumenFiado(ctx.empresa.id),
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
    />
  );
}
