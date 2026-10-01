import { contextoObligatorio } from '@/lib/sesion';
import { traerDeudas, traerResumenDeudas } from '@/lib/deudas';
import { traerCuentasParaElegir } from '@/lib/billetera';
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
  // (110, 28/09/2026) la tarjeta la pone CandadoSeccion en el layout; así no
  // se leen ni viajan datos del Pro. Para un negocio es siempre false.
  if (ctx.gratisPersonal) return null;
  const t = await textos();

  if (!ctx.esAdmin) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="tarjeta">
          <Vacio titulo={t.deudas.titulo} detalle={t.deudas.soloAdmin} />
        </div>
      </div>
    );
  }

  // Las cuentas de la billetera, para «¿De qué cuenta salió?» al pagar
  // (01/10): Matías tenía dos bancos y pagaba por transferencia sin poder
  // decir de cuál. Si falla, llega vacía y el pago va como siempre a la
  // cuenta de su forma de pago.
  const [deudas, resumen, cuentas] = await Promise.all([
    traerDeudas(ctx.empresa.id),
    traerResumenDeudas(ctx.empresa.id),
    traerCuentasParaElegir(ctx.empresa.id),
  ]);

  return (
    <PantallaDeudas
      empresaId={ctx.empresa.id}
      moneda={ctx.empresa.moneda}
      deudas={deudas}
      resumen={resumen}
      puedeEditar={ctx.esAdmin}
      cuentas={cuentas}
    />
  );
}
