'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTextos } from '@/i18n/cliente';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';

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
  bloqueada, children, empresaId, apagarLinks = false,
}: {
  bloqueada: boolean;
  children: React.ReactNode;
  empresaId?: string;
  /**
   * El dueño (o un admin) de un trainer (098): el link de rutina de cada
   * cliente sigue andando un tiempo después del vencimiento, y el candado
   * tapa la carpeta donde se apaga. Cortarlos no puede depender de pagar.
   */
  apagarLinks?: boolean;
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

      {apagarLinks && empresaId && <ApagarLinksRutina empresaId={empresaId} />}
    </div>
  );
}

/**
 * «Apagar mis links de rutina» (098).
 *
 * Con la cuenta vencida, el cliente del trainer puede seguir abriendo su
 * rutina hasta 30 días (decisión de Matías). Un trainer que no va a renovar,
 * o que mandó un link a quien no debía, tiene que poder cortarlo ya, y todo
 * lo demás de Orden está detrás del candado. Por eso vive acá.
 *
 * `apagar_enlaces_rutina` anda con la cuenta vencida: la tabla de links no
 * tiene el freno de cuenta activa, porque apagar un link es seguridad, no
 * carga de datos. Pregunta antes: después hay que prenderlos de a uno.
 */
function ApagarLinksRutina({ empresaId }: { empresaId: string }) {
  const t = useTextos();
  const p = t.pantallas;
  const [preguntando, setPreguntando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [apagados, setApagados] = useState<number | null>(null);

  async function apagar() {
    setOcupado(true);
    setError('');
    try {
      const { data, error: e } = await clienteNavegador().rpc('apagar_enlaces_rutina', { p_empresa: empresaId });
      if (e) throw e;
      setApagados(Number(data) || 0);
      setPreguntando(false);
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mt-8 w-full max-w-sm border-t border-borde pt-6 text-left">
      <p className="text-[14.5px] font-bold">{p.linksRutinaTitulo}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-tinta/60">{p.linksRutinaDetalle}</p>

      {apagados !== null ? (
        <p role="status" className="mt-3 rounded-xl bg-verde-claro px-3.5 py-3 text-[13.5px] font-semibold text-verde-fuerte aparecer">
          ✓ {p.linksApagados(apagados)}
        </p>
      ) : preguntando ? (
        <div className="mt-3 space-y-2.5 rounded-xl bg-rojo-claro px-3.5 py-3 aparecer">
          <p className="text-[13.5px] font-bold text-rojo">{p.apagarLinksPregunta}</p>
          <p className="text-[12.5px] leading-snug text-tinta/70">{p.apagarLinksDetalle}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button" className="boton-suave min-h-[44px]"
              onClick={() => { setPreguntando(false); setError(''); }} disabled={ocupado}
            >
              {t.comun.cancelar}
            </button>
            <button type="button" className="boton-peligro min-h-[44px]" onClick={apagar} disabled={ocupado}>
              {ocupado ? p.apagandoLinks : p.siApagarLinks}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="boton-suave mt-3 min-h-[44px] w-full" onClick={() => setPreguntando(true)}>
          {p.apagarLinksRutina}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>
      )}
    </div>
  );
}
