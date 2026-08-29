'use client';

import { useState } from 'react';
import Link from 'next/link';
import { clienteNavegador } from '@/lib/supabase/cliente';

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
      setError(err?.message ?? 'No se pudo enviar. Probá de nuevo en un momento.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-tinta px-4 py-10">
      <div className="w-full max-w-[400px] aparecer">
        <div className="mb-7 flex items-center gap-2.5 text-white">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-verde text-lg font-black">o</span>
          <span className="text-lg font-bold tracking-tight">orden</span>
        </div>

        <div className="tarjeta p-6">
          {listo ? (
            <>
              <p className="titulo-seccion">Revisá tu correo</p>
              <h1 className="mt-2 text-[24px] font-bold leading-tight tracking-tight">
                Ya está en camino.
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-tinta/65">
                Si hay una cuenta con <strong className="text-tinta">{email.trim()}</strong>, te
                acabamos de mandar un enlace para poner una contraseña nueva.
              </p>
              <p className="mt-3 text-[13.5px] leading-relaxed text-tinta/50">
                Puede tardar un par de minutos. Si no lo ves, mirá en spam o correo no deseado.
              </p>
              <Link href="/ingresar" className="boton-suave mt-6 flex w-full justify-center py-2.5">
                Volver a entrar
              </Link>
            </>
          ) : (
            <>
              <p className="titulo-seccion">Recuperar el acceso</p>
              <h1 className="mt-2 text-[24px] font-bold leading-tight tracking-tight">
                ¿Te olvidaste la contraseña?
              </h1>
              <p className="mt-2 text-[15px] leading-relaxed text-tinta/60">
                Poné tu correo y te mandamos un enlace para poner una nueva. Tus datos quedan
                exactamente donde están.
              </p>

              <form onSubmit={enviar} className="mt-6 space-y-4" noValidate>
                <div>
                  <label className="etiqueta" htmlFor="email">Correo electrónico</label>
                  <input
                    id="email" type="email" className="campo" required autoComplete="email"
                    placeholder="nombre@correo.com" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {error && (
                  <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
                    {error}
                  </p>
                )}

                <button type="submit" className="boton-principal w-full py-3" disabled={cargando}>
                  {cargando ? 'Mandando…' : 'Mandarme el enlace'}
                </button>
              </form>

              <p className="mt-5 text-center text-sm text-tinta/60">
                <Link href="/ingresar" className="boton-texto">Volver a entrar</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
