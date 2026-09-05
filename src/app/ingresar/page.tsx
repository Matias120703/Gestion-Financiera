'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import CampoClave from '@/components/CampoClave';
import { useTextos } from '@/i18n/cliente';
import { Marca } from '@/components/Marca';

/**
 * ENTRAR
 *
 * Esta pantalla es SOLO para quien ya tiene cuenta. Antes hacía las dos
 * cosas con un botoncito que cambiaba de modo, y eso tenía un problema
 * concreto: el botón principal de la portada —«Probar 20 días gratis»—
 * apuntaba acá con `?crear=1`, pero el parámetro no se leía. O sea que a
 * quien nunca tuvo cuenta lo dejaba parado en un login, pidiéndole una
 * contraseña que todavía no existía. La mitad de esa gente se iba ahí.
 *
 * Registrarse ahora vive en `/crear`, que es otra pantalla y otro recorrido.
 * Acá quedó una sola cosa, bien hecha.
 */
function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTextos();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const volver = params.get('volver');
  const quiereCrear = params.get('crear');

  // Los enlaces viejos con ?crear=1 —y cualquiera que ande dando vueltas por
  // WhatsApp— tienen que seguir llevando a registrarse, no a un login.
  useEffect(() => {
    if (quiereCrear) router.replace('/crear');
  }, [quiereCrear, router]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (clave.length < 6) {
      setError(t.acceso.claveCorta);
      return;
    }

    setCargando(true);
    try {
      const supabase = clienteNavegador();
      const { error: fallo } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: clave,
      });
      if (fallo) throw fallo;
      router.push(volver || '/panel');
      router.refresh();
    } catch (err: any) {
      const mensaje: string = err?.message ?? 'No se pudo completar la operación.';
      if (/invalid login/i.test(mensaje)) setError(t.acceso.credencialesMal);
      else if (/email not confirmed/i.test(mensaje)) setError(t.acceso.sinConfirmar);
      else setError(mensaje);
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-tinta px-4 py-10">
      <div className="w-full max-w-[400px] aparecer">
        <Link href="/" className="mb-7 flex items-center gap-2.5 text-white">
          <Marca clase="h-10 w-10" sobreOscuro />
          <span className="text-lg font-bold tracking-tight">Orden</span>
        </Link>

        <div className="tarjeta p-6">
          <p className="titulo-seccion">{t.acceso.marca}</p>
          <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight">
            {t.acceso.entrarTitulo}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-tinta/60">
            {t.acceso.bajada}
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

            <CampoClave
              id="clave"
              etiqueta={t.acceso.contrasena}
              valor={clave}
              alCambiar={setClave}
              autoComplete="current-password"
            />

            {error && (
              <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
                {error}
              </p>
            )}

            <button type="submit" className="boton-principal w-full py-3" disabled={cargando}>
              {cargando ? t.acceso.unMomento : t.acceso.entrar}
            </button>
          </form>

          <p className="mt-4 text-center">
            <Link href="/recuperar" className="text-[13.5px] font-semibold text-tinta/50 hover:text-tinta">
              {t.acceso.olvide}
            </Link>
          </p>

          <hr className="my-5 border-borde" />

          <p className="text-center text-sm text-tinta/60">
            {t.registro.sinCuentaAun}{' '}
            <Link href="/crear" className="boton-texto">{t.registro.empezarAhora}</Link>
          </p>
        </div>

        <p className="mt-5 text-center text-[13px] leading-relaxed text-white/40">
          {t.acceso.separacion}
        </p>
      </div>
    </main>
  );
}

export default function PaginaIngresar() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-tinta" />}>
      <Formulario />
    </Suspense>
  );
}
