import { redirect } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { traerResumenPersonal, traerCategoriasPersonales, traerTrabajosPendientes } from '@/lib/personal';
import { textos } from '@/i18n';
import { PantallaOrganizacion } from '@/components/PantallaOrganizacion';
import { Vacio } from '@/components/Piezas';
import { traerCuentasParaElegir } from '@/lib/billetera';
import { clienteServidor } from '@/lib/supabase/servidor';

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

  const [resumen, categorias, trabajos, cuentas, dondeSeCobran] = await Promise.all([
    traerResumenPersonal(ctx.empresa.id),
    traerCategoriasPersonales(ctx.empresa.id),
    // Busca por quién sos, no por esta cuenta: puede haber trabajo pendiente
    // de traer en un negocio que no tiene nada que ver con esta empresa.
    traerTrabajosPendientes(),
    // Para elegir en qué cuenta cae cada plata (075).
    traerCuentasParaElegir(ctx.empresa.id),
    // El resumen no trae la cuenta de cada ingreso fijo y no vale rehacerlo
    // entero por un campo: la tabla se lee directo, que el dueño ya puede.
    dondeSeCobra(ctx.empresa.id),
  ]);

  const conCuenta = {
    ...resumen,
    ingresos_fijos: resumen.ingresos_fijos.map((f) => ({ ...f, cuenta_id: dondeSeCobran.get(f.id) ?? null })),
  };

  return (
    <PantallaOrganizacion
      empresaId={ctx.empresa.id}
      moneda={ctx.empresa.moneda}
      resumen={conCuenta}
      categorias={categorias}
      trabajos={trabajos}
      cuentas={cuentas}
    />
  );
}

/**
 * En qué cuenta de la billetera se cobra cada ingreso fijo (075).
 *
 * Si falla, la pantalla igual se muestra: sin esto, los chips salen en «Sin
 * definir» y no se pierde nada de lo cargado.
 */
async function dondeSeCobra(empresaId: string): Promise<Map<string, string | null>> {
  try {
    const { data } = await clienteServidor()
      .from('ingresos_fijos').select('id, cuenta_id').eq('empresa_id', empresaId);
    return new Map((data ?? []).map((f) => [f.id as string, (f.cuenta_id ?? null) as string | null]));
  } catch {
    return new Map();
  }
}
