import { contextoObligatorio } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { PantallaRecomendar } from '@/components/PantallaRecomendar';
import type { PanelSocio, PromoInvitacion } from '@/lib/tipos';

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
 *
 * EL GANCHO DE LAS IDEAS (123, 02/10/2026). Los mensajes para mandar dicen
 * qué gana el que entra: el descuento de la racha de la prueba. Los números
 * —el porcentaje y los días de un negocio y los de una cuenta personal— salen
 * de `promo_de_la_prueba()`, la misma lectura de la portada. Si falla o
 * devuelve algo que no es un número, no se manda nada y los mensajes salen
 * sin gancho: nunca con un porcentaje escrito acá.
 */
export default async function PaginaRecomendar() {
  await contextoObligatorio();

  const supabase = clienteServidor();
  const [{ data }, promo] = await Promise.all([
    supabase.rpc('mi_panel_socio'),
    Promise.resolve(supabase.rpc('promo_de_la_prueba'))
      .then((r) => promoDeInvitacion(r.error ? null : r.data))
      .catch(() => null),
  ]);
  const panel = (data ?? { tiene_codigo: false }) as PanelSocio;

  return <PantallaRecomendar panel={panel} promo={promo} />;
}

/** Los cuatro números del gancho, o null si alguno no vino bien. */
function promoDeInvitacion(leida: unknown): PromoInvitacion | null {
  if (!leida || typeof leida !== 'object') return null;
  const j = leida as Record<string, unknown>;
  const entero = (v: unknown) => {
    const n = v == null ? NaN : Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const porcentaje = entero(j.porcentaje);
  const porcentajePersonal = entero(j.porcentaje_personal);
  const negocio = entero(j.negocio);
  const personal = entero(j.personal);
  if (porcentaje === null || porcentajePersonal === null || negocio === null || personal === null) return null;
  return {
    negocio: { porcentaje, dias: negocio },
    personal: { porcentaje: porcentajePersonal, dias: personal },
  };
}
