import Link from 'next/link';
import { notFound } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { clienteServidor } from '@/lib/supabase/servidor';
import { textos } from '@/i18n';
import { FICHA } from '@/i18n/idiomas';
import { ResultadoDelPago } from '@/components/bancard/EstadoDelPago';
import type { OperacionVista } from '@/components/bancard/tipos';

export const dynamic = 'force-dynamic';

/**
 * LA PANTALLA DE VUELTA DE UN PAGO CON BANCARD (el `return_url` del pedido) Y
 * SU COMPROBANTE.
 *
 * Bancard puede mandar a la persona acá con `?status=…&description=…` en la
 * dirección. ESTA PÁGINA NO LEE NADA DE LA DIRECCIÓN salvo el número de
 * pedido: un «payment_success» se puede escribir a mano. El estado lo dice
 * la base (`bancard_operacion_ver`, con la sesión de quien mira: si el pago
 * no es de una cuenta que administra, «no existe»), y si todavía no se sabe,
 * el componente le pregunta al servidor, que le pregunta a Bancard.
 *
 * Queda fuera del candado de la cuenta vencida porque empieza con /plan
 * (CandadoCuenta): quien vuelve de pagar tiene que poder ver su comprobante.
 */
export default async function PaginaPagoBancard({ params }: { params: Promise<{ op: string }> }) {
  const { op } = await params;
  if (!/^[0-9]{1,15}$/.test(op)) notFound();

  const ctx = await contextoObligatorio();
  const t = await textos();
  const operacion = Number(op);

  const { data, error } = await clienteServidor().rpc('bancard_operacion_ver', { p_operacion: operacion });
  if (error || !data) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <header>
        <h1 className="text-[22px] font-titulo font-extrabold tracking-tight">{t.plan.titulo}</h1>
      </header>
      <div className="tarjeta p-5">
        <ResultadoDelPago
          operacion={operacion}
          inicial={data as OperacionVista}
          locale={FICHA[ctx.idioma].locale}
          zona={ctx.zonaHoraria}
        />
      </div>
      <Link href="/plan" className="boton-suave inline-flex">{t.bancard.hoja.volver}</Link>
    </div>
  );
}
