import { clienteServidor } from '@/lib/supabase/servidor';
import { CancelarTurno } from '@/components/ReservaPublica.cancelar';
import type { ReservaPorToken } from '@/lib/tipos';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi turno' };

/**
 * MI TURNO · la pantalla del enlace que el cliente guardó.
 *
 * Sin cuenta y sin sesión: el token ES la credencial. Por eso `reserva_por_token`
 * devuelve lo justo para reconocer el turno —cuándo, qué y con quién— y no el
 * teléfono ni ningún otro dato de nadie. Un token que llegue a manos ajenas no
 * puede convertirse en una filtración.
 *
 * Existe por un motivo que no es cortesía: sin una forma de avisar que no
 * viene, en dos semanas la agenda está llena de fantasmas y el barbero deja de
 * creerle. Una agenda que miente es peor que no tener agenda.
 */
export default async function PaginaTurno({ params }: { params: { token: string } }) {
  const supabase = clienteServidor();
  const { data } = await supabase.rpc('reserva_por_token', { p_token: params.token });
  const reserva = (data ?? { existe: false }) as ReservaPorToken;

  return <CancelarTurno token={params.token} reserva={reserva} />;
}
