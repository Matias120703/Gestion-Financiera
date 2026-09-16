'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTextos } from '@/i18n/cliente';

/**
 * El candado de pantalla completa para cuando la cuenta está vencida.
 *
 * Decisión explícita de Matías (2026-09-15), que reemplaza la de la
 * migración 018: Orden dejó de ser un sistema que se puede seguir mirando
 * gratis después de la prueba. Vencida la cuenta, no se ve nada de
 * ninguna pantalla — ni el panel, ni el historial, ni el Excel — salvo
 * /plan, que es adonde hay que ir para pagar.
 *
 * Va en el layout de `(app)` y no en cada pantalla, por lo mismo que
 * `AvisoCuenta`: la cuenta vencida no es un asunto del panel ni de
 * gastos, es del sistema entero.
 */
export function CandadoCuenta({
  bloqueada, children,
}: {
  bloqueada: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Los dos hooks van antes de cualquier salida: React los cuenta por
  // orden, y saltearlos en algunas pasadas rompe el componente.
  const t = useTextos();

  // /plan es la única puerta que queda abierta: sin ella, nadie podría
  // llegar a pagar.
  if (!bloqueada || pathname?.startsWith('/plan')) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-arena bg-superficie px-6 py-16 text-center">
      <svg viewBox="0 0 24 24" className="mb-4 h-10 w-10 text-tinta/30"
           fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="10" width="16" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
      <p className="text-[17px] font-bold">{t.pantallas.cuentaBloqueadaTitulo}</p>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-tinta/60">
        {t.pantallas.cuentaBloqueadaDetalle}
      </p>
      <Link href="/plan" className="boton-principal mt-5 px-5 py-2.5 text-[14px]">
        {t.pantallas.cuentaBloqueadaBoton}
      </Link>
    </div>
  );
}
