'use client';

import { useState } from 'react';
import Link from 'next/link';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useTextos } from '@/i18n/cliente';
import { Marca } from '@/components/Marca';

/**
 * PEDIR UNA CONTRASEÑA NUEVA.
 *
 * Faltaba, y era el agujero más caro que tenía Orden: alguien cargaba dos
 * semanas de ventas, se olvidaba la clave, y no había ninguna forma de
 * volver a entrar. Sus datos quedaban adentro y él afuera.
 *
 * POR QUÉ NUNCA DICE SI EL CORREO EXISTE
 *
 * La respuesta es la misma para un correo registrado que para uno inventado:
 * «si existe una cuenta, te llega». Si dijera «ese correo no está
 * registrado», cualquiera podría averiguar quién tiene cuenta en Orden
 * probando direcciones de a una. Con datos financieros, eso ya es
 * información que no corresponde dar.
 *
 * Es un poco más incómodo para quien se equivocó de correo, y mucho más
 * seguro para todos.
 */
export default function PaginaRecuperar() {
  const t = useTextos();
  const [email, setEmail] = useState('');
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState('');

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      const supabase = clienteNavegador();
      const { error: e1 } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        // A dónde vuelve la persona al tocar el enlace del correo. Tiene que
        // estar en la lista de Redirect URLs de Supabase o el enlace se
        // rechaza.
        redirectTo: `${window.location.origin}/clave-nueva`,
      });
      if (e1) throw e1;
      setListo(true);
    } catch (err: any) {
      // Un fallo de red sí se cuenta: no saber si se mandó es peor que
      // cualquier otra cosa. Lo que no se cuenta es si el correo existe.
      setError(err?.message ?? t.acceso.noSePudoEnviar);
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-tinta px-4 py-10">
      <div className="w-full max-w-[400px] aparecer">
        <div className="mb-7 flex items-center gap-2.5 text-white">
          <Marca clase="h-10 w-10" sobreOscuro />
          <span className="text-lg font-bold tracking-tight">Orden</span>
        </div>

        <div className="tarjeta p-6">
          {listo ? (
            <>
              <p className="titulo-seccion">{t.acceso.revisaCorreo}</p>
              <h1 className="mt-2 text-[24px] font-bold leading-tight tracking-tight">
                {t.acceso.enCamino}
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-tinta/65">
                {t.acceso.siHayCuenta(email.trim())}
              </p>
              <p className="mt-3 text-[13.5px] leading-relaxed text-tinta/50">
                {t.acceso.puedeTardar}
              </p>
              <Link href="/ingresar" className="boton-suave mt-6 flex w-full justify-center py-2.5">
                {t.acceso.volverAEntrar}
              </Link>
            </>
          ) : (
            <>
              <p className="titulo-seccion">{t.acceso.recuperarTitulo}</p>
              <h1 className="mt-2 text-[24px] font-bold leading-tight tracking-tight">
                {t.acceso.olvide}
              </h1>
              <p className="mt-2 text-[15px] leading-relaxed text-tinta/60">
                {t.acceso.recuperarBajada}
              </p>

              <form onSubmit={enviar} className="mt-6 space-y-4" noValidate>
                <div>
                  <label className="etiqueta" htmlFor="email">{t.acceso.correo}</label>
                  <input
                    id="email" type="email" className="campo" required autoComplete="email"
                    placeholder={t.acceso.correoEjemplo} value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {error && (
                  <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
                    {error}
                  </p>
                )}

                <button type="submit" className="boton-principal w-full py-3" disabled={cargando}>
                  {cargando ? t.acceso.mandando : t.acceso.mandarEnlace}
                </button>
              </form>

              <p className="mt-5 text-center text-sm text-tinta/60">
                <Link href="/ingresar" className="boton-texto">{t.acceso.volverAEntrar}</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
