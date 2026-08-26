import { contextoObligatorio } from '@/lib/sesion';
import { traerDeudas, traerResumenDeudas } from '@/lib/deudas';
import { textos } from '@/i18n';
import { PantallaDeudas } from '@/components/PantallaDeudas';
import { Vacio } from '@/components/Piezas';

export const dynamic = 'force-dynamic';

/**
 * DEUDAS · lo que el negocio debe.
 *
 * Solo administración. Cuánto debe el negocio es del mismo orden que los
 * costos: la base ni siquiera se lo devuelve a un vendedor, así que esta
 * pantalla comprueba el rol antes de pedirlo y muestra una explicación en
 * vez de dejar que salte un error.
 */
export default async function PaginaDeudas() {
  const ctx = await contextoObligatorio();
  const t = textos();

  if (!ctx.esAdmin) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="tarjeta">
          <Vacio titulo={t.deudas.titulo} detalle={t.deudas.soloAdmin} />
        </div>
      </div>
    );
  }

  const [deudas, resumen] = await Promise.all([
    traerDeudas(ctx.empresa.id),
    traerResumenDeudas(ctx.empresa.id),
  ]);

  return (
    <PantallaDeudas
      empresaId={ctx.empresa.id}
      moneda={ctx.empresa.moneda}
      deudas={deudas}
      resumen={resumen}
      puedeEditar={ctx.esAdmin}
    />
  );
}
