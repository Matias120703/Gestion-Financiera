'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useTextos } from '@/i18n/cliente';

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTextos();
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');

    if (clave.length < 6) {
      setError(t.acceso.claveCorta);
      return;
    }

    setCargando(true);
    const supabase = clienteNavegador();

    try {
      if (modo === 'crear') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: clave,
          options: { emailRedirectTo: `${window.location.origin}/panel` },
        });
        if (error) throw error;

        /**
         * Si la confirmación por correo está apagada, Supabase devuelve la
         * sesión al instante: hay que entrar, no mandar a la persona a
         * revisar un correo que nunca va a llegar.
         *
         * El aviso anterior decía «si Supabase pide confirmación…», que le
         * pasaba a la persona una duda nuestra: nadie que se registra sabe
         * ni tiene por qué saber qué es Supabase. Ahora se mira la respuesta
         * y se dice lo que de verdad corresponde.
         */
        if (data.session) {
          router.push(params.get('volver') || '/empezar');
          router.refresh();
          return;
        }

        setAviso(t.acceso.confirmaTuCorreo);
        setModo('entrar');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: clave,
        });
        if (error) throw error;
        router.push(params.get('volver') || '/panel');
        router.refresh();
      }
    } catch (err: any) {
      const mensaje: string = err?.message ?? 'No se pudo completar la operación.';
      if (/invalid login/i.test(mensaje)) setError(t.acceso.credencialesMal);
      else if (/already registered/i.test(mensaje)) setError(t.acceso.yaRegistrado);
      else if (/email not confirmed/i.test(mensaje)) setError(t.acceso.sinConfirmar);
      else setError(mensaje);
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
          <p className="titulo-seccion">{t.acceso.marca}</p>
          <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight">
            {modo === 'entrar' ? t.acceso.entrarTitulo : t.acceso.crearTitulo}
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
            <div>
              <label className="etiqueta" htmlFor="clave">{t.acceso.contrasena}</label>
              <input
                id="clave" type="password" className="campo" required minLength={6}
                autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
                placeholder={t.acceso.minimoSeis} value={clave}
                onChange={(e) => setClave(e.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
                {error}
              </p>
            )}
            {aviso && (
              <p role="status" className="rounded-xl bg-verde-claro px-3 py-2.5 text-[13px] font-medium text-verde-fuerte">
                {aviso}
              </p>
            )}

            <button type="submit" className="boton-principal w-full py-3" disabled={cargando}>
              {cargando ? t.acceso.unMomento : modo === 'entrar' ? t.acceso.entrar : t.acceso.crearCuenta}
            </button>
          </form>

          {/* Solo al entrar: a quien se está registrando no le sirve de nada
              y le agrega una decisión más en el peor momento. */}
          {modo === 'entrar' && (
            <p className="mt-4 text-center">
              <Link href="/recuperar" className="text-[13.5px] font-semibold text-tinta/50 hover:text-tinta">
                {t.acceso.olvide}
              </Link>
            </p>
          )}

          <p className="mt-5 text-center text-sm text-tinta/60">
            {modo === 'entrar' ? t.acceso.sinCuenta : t.acceso.yaTenesCuenta}{' '}
            <button
              type="button" className="boton-texto"
              onClick={() => { setModo(modo === 'entrar' ? 'crear' : 'entrar'); setError(''); setAviso(''); }}
            >
              {modo === 'entrar' ? t.acceso.crearUna : t.acceso.entrar}
            </button>
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
