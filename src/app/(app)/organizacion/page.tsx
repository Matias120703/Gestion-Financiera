import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { traerResumenPersonal, traerCategoriasPersonales, traerTrabajosPendientes } from '@/lib/personal';
import { textos } from '@/i18n';
import { PantallaOrganizacion } from '@/components/PantallaOrganizacion';
import { Vacio } from '@/components/Piezas';

export const dynamic = 'force-dynamic';

/**
 * ORGANIZACIÓN · la pantalla de la cuenta personal.
 *
 * Es la contracara del cierre del día. Un comercio pregunta «¿cómo me fue
 * hoy?»; alguien con sueldo pregunta «¿llego a fin de mes?». Por eso el
 * número grande no es la ganancia del día sino cuánto queda y para cuántos
 * días — y el ciclo va de cobro a cobro, no del 1 al 30.
 *
 * Solo administración, igual que Deudas: cuánto cobra alguien y cómo reparte
 * su plata es del mismo orden que sus deudas. La base ni siquiera se lo
 * devuelve a un vendedor, así que acá se comprueba el rol antes de pedirlo y
 * se muestra una explicación en vez de dejar que salte un error.
 */
export default async function PaginaOrganizacion() {
  const ctx = await contextoObligatorio();
  const t = textos();

  // Un comercio no tiene esta pantalla. Ver src/lib/rubros.ts.
  if (ctx.empresa.tipo_cuenta !== 'personal') redirect('/panel');

  if (!ctx.esAdmin) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="tarjeta">
          <Vacio titulo={t.organizacion.titulo} detalle={t.deudas.soloAdmin} />
        </div>
      </div>
    );
  }

  const [resumen, categorias, trabajos] = await Promise.all([
    traerResumenPersonal(ctx.empresa.id),
    traerCategoriasPersonales(ctx.empresa.id),
    // Busca por quién sos, no por esta cuenta: puede haber trabajo pendiente
    // de traer en un negocio que no tiene nada que ver con esta empresa.
    traerTrabajosPendientes(),
  ]);

  return (
    <PantallaOrganizacion
      empresaId={ctx.empresa.id}
      moneda={ctx.empresa.moneda}
      resumen={resumen}
      categorias={categorias}
      trabajos={trabajos}
    />
  );
}
