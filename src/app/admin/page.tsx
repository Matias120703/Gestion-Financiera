import Link from 'next/link';
import { redirect } from 'next/navigation';
import { clienteServidor } from '@/lib/supabase/servidor';
import {
  esSuperadmin, traerCuentas, traerFinanzasOrden, traerMisEmpresas, traerResumenPanel,
} from '@/lib/admin';
import { PanelAdmin } from '@/components/PanelAdmin';

export const dynamic = 'force-dynamic';

/**
 * PANEL DE QUIEN ADMINISTRA ORDEN.
 *
 * Vive fuera del grupo (app) a propósito: no pertenece a ninguna empresa y no
 * debe tener la navegación del negocio ni el botón de captura. Es otra cosa,
 * y conviene que se note.
 *
 * NO SE ANUNCIA EN NINGÚN LADO. No hay enlace en la portada, ni en el ingreso,
 * ni en la pantalla de crear cuenta. Se llega escribiendo la dirección. Una
 * puerta que anuncia que está cerrada invita a golpearla, y no hay motivo
 * para que un cliente sepa siquiera que este panel existe.
 *
 * Sobre el permiso: esta comprobación es para no mostrar una pantalla rota,
 * NO es la seguridad. La seguridad está en cada función de PostgreSQL, que
 * exige `es_superadmin()` y rechaza a cualquier otro aunque llame directo a
 * la API sin pasar por acá.
 *
 * Y a quien no administra se lo manda a su propio panel, sin decirle que esto
 * existe: ni un «no tenés permiso», que ya sería contarle algo.
 */
export default async function PaginaAdmin() {
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/ingresar');

  if (!(await esSuperadmin())) redirect('/panel');

  const [cuentas, resumen, finanzas, misEmpresas] = await Promise.all([
    traerCuentas(),
    traerResumenPanel(),
    traerFinanzasOrden(),
    traerMisEmpresas(),
  ]);

  // Sin número configurado el botón de WhatsApp simplemente no aparece.
  const whatsapp = (process.env.NEXT_PUBLIC_WHATSAPP ?? '').replace(/\D/g, '') || null;

  return (
    <div className="min-h-screen bg-arena/40">
      <header className="sticky top-0 z-20 border-b border-borde bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 lg:px-7">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-tinta text-[13px] font-black text-white">
              o
            </span>
            <div className="min-w-0">
              <p className="text-[14.5px] font-bold leading-tight tracking-tight">Administración</p>
              <p className="text-[11.5px] leading-tight text-tinta/45">Solo vos ves esta pantalla</p>
            </div>
          </div>
          <Link href="/panel" className="boton-suave shrink-0 px-4 py-2 text-[13.5px]">
            Ir a mi negocio
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-7 lg:px-7">
        <PanelAdmin
          cuentas={cuentas}
          resumen={resumen}
          finanzas={finanzas}
          misEmpresas={misEmpresas}
          whatsapp={whatsapp}
        />
      </main>
    </div>
  );
}
