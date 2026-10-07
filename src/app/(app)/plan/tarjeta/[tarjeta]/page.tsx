import Link from 'next/link';
import { notFound } from 'next/navigation';
import { contextoObligatorio } from '@/lib/sesion';
import { textos } from '@/i18n';
import { VueltaDeTarjeta } from '@/components/bancard/VueltaDeTarjeta';

export const dynamic = 'force-dynamic';

/**
 * LA VUELTA DEL CATASTRO DE UNA TARJETA (el `return_url` de cards/new).
 *
 * Bancard puede mandar a la persona acá con un `?status=` en la dirección.
 * ESTA PÁGINA NO LEE NADA DE LA DIRECCIÓN salvo el número de tarjeta: lo que
 * cuenta es si Bancard lista la tarjeta, y eso se lo pregunta el servidor
 * (`/api/pagos/bancard/tarjeta/verificar`, que además comprueba que la
 * tarjeta sea de la cuenta de quien mira). Después vuelve a /plan.
 *
 * Queda fuera del candado de la cuenta vencida porque empieza con /plan
 * (CandadoCuenta): una cuenta vencida tiene que poder guardar su tarjeta.
 */
export default async function PaginaVueltaDeTarjeta({ params }: { params: Promise<{ tarjeta: string }> }) {
  const { tarjeta } = await params;
  if (!/^[0-9]{1,15}$/.test(tarjeta)) notFound();

  const ctx = await contextoObligatorio();
  const t = await textos();

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <header>
        <h1 className="text-[22px] font-titulo font-extrabold tracking-tight">{t.plan.titulo}</h1>
      </header>
      <div className="tarjeta p-5">
        <VueltaDeTarjeta tarjeta={Number(tarjeta)} empresaId={ctx.empresa.id} />
      </div>
      <Link href="/plan" className="boton-suave inline-flex">{t.bancard.hoja.volver}</Link>
    </div>
  );
}
