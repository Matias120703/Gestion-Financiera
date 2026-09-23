import { contextoObligatorio } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { PantallaRecomendar } from '@/components/PantallaRecomendar';
import type { PanelSocio } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

/**
 * RECOMENDAR ORDEN.
 *
 * La idea es del dueño, y es simple: quien trae un cliente nuevo se lleva la
 * mitad del precio de lista de un mes de su plan, con su primer pago (102:
 * antes era la mitad de lo que entraba, y un descuento o un pago anual lo
 * movían). Una sola vez. Lo que ese negocio pague después queda entero para
 * Orden.
 *
 * Está adentro de la app y no en la web pública porque el que recomienda con
 * ganas es el que ya lo usa. Alguien que nunca vio el sistema no convence a
 * nadie, y un programa de referidos abierto a cualquiera termina lleno de
 * enlaces pegados en lugares que no queremos.
 *
 * La lectura no se cae si falla: es una pantalla de extra, no las finanzas de
 * nadie. Si no llega el dato, se muestra la invitación a pedir el código.
 */
export default async function PaginaRecomendar() {
  await contextoObligatorio();

  const supabase = clienteServidor();
  const { data } = await supabase.rpc('mi_panel_socio');
  const panel = (data ?? { tiene_codigo: false }) as PanelSocio;

  return <PantallaRecomendar panel={panel} />;
}
