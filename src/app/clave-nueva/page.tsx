'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useTextos } from '@/i18n/cliente';

/**
 * PONER LA CONTRASEÑA NUEVA.
 *
 * Acá cae la persona al tocar el enlace del correo. Supabase ya la dejó con
 * una sesión temporal al llegar: por eso alcanza con `updateUser`.
 *
 * ESPERAR ANTES DE DECIR QUE EL ENLACE NO SIRVE
 *
 * La sesión no está lista en el primer render — el cliente todavía está
 * leyendo el token que viene en el fragmento de la URL. Si se comprobara al
 * instante, TODOS verían «enlace vencido» durante un parpadeo, incluso con
 * un enlace perfecto. Por eso se escucha el evento y solo se da por vencido
 * cuando Supabase terminó de mirar.
 *
 * Y si de verdad venció, no se deja a la persona en un callejón: se le
 * ofrece pedir otro enlace.
 */
export default function PaginaClaveNueva() {
  const router = useRouter();
  const t = useTextos();
  const [estado, setEstado] = useState<'mirando' | 'listo' | 'sinSesion'>('mirando');
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState(false);

  useEffect(() => {
    const supabase = clienteNavegador();
    let vivo = true;

    // El evento llega cuando el cliente terminó de procesar el enlace.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (!vivo) return;
      if (sesion) setEstado('listo');
    });

    // Y por si la sesión ya estaba lista antes de suscribirnos.
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      if (data.session) setEstado('listo');
      else setTimeout(() => { if (vivo) setEstado((e) => (e === 'mirando' ? 'sinSesion' : e)); }, 2500);
    });

    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (clave.length < 6) {
      setError(t.acceso.claveCorta);
      return;
    }
    // Se piden dos veces porque acá no hay forma de corregir un error de
    // tipeo: si se guarda mal, la persona queda afuera otra vez.
    if (clave !== repetida) {
      setError(t.acceso.noCoinciden);
      return;
    }

    setCargando(true);
    try {
      const supabase = clienteNavegador();
      const { error: e1 } = await supabase.auth.updateUser({ password: clave });
      if (e1) throw e1;
      setHecho(true);
      // Se entra derecho: ya tiene sesión, mandarla a iniciar de nuevo sería
      // pedirle que escriba la clave que acaba de escribir.
      setTimeout(() => { router.push('/panel'); router.refresh(); }, 1400);
    } catch (err: any) {
      const m: string = err?.message ?? 'No se pudo guardar.';
      if (/should be different/i.test(m)) setError(t.acceso.esLaMisma);
      else if (/session/i.test(m)) setError(t.acceso.sesionVencida);
      else setError(m);
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
          {estado === 'mirando' && (
            <p className="py-6 text-center text-[14px] text-tinta/55">{t.acceso.unMomento}</p>
          )}

          {estado === 'sinSesion' && (
            <>
              <p className="titulo-seccion">{t.acceso.enlaceVencido}</p>
              <h1 className="mt-2 text-[24px] font-bold leading-tight tracking-tight">
                {t.acceso.enlaceVencidoTitulo}
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-tinta/65">
                {t.acceso.enlaceVencidoDetalle}
              </p>
              <Link href="/recuperar" className="boton-principal mt-6 flex w-full justify-center py-3">
                {t.acceso.pedirOtro}
              </Link>
            </>
          )}

          {estado === 'listo' && (hecho ? (
            <>
              <p className="titulo-seccion">{t.comun.listo}</p>
              <h1 className="mt-2 text-[24px] font-bold leading-tight tracking-tight">
                {t.acceso.cambiada}
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-tinta/65">
                {t.acceso.entrando}
              </p>
            </>
          ) : (
            <>
              <p className="titulo-seccion">{t.acceso.casi}</p>
              <h1 className="mt-2 text-[24px] font-bold leading-tight tracking-tight">
                {t.acceso.ponerNueva}
              </h1>

              <form onSubmit={guardar} className="mt-6 space-y-4" noValidate>
                <div>
                  <label className="etiqueta" htmlFor="clave">{t.acceso.claveNueva}</label>
                  <input
                    id="clave" type="password" className="campo" required minLength={6}
                    autoComplete="new-password" placeholder={t.acceso.minimoSeis}
                    value={clave} onChange={(e) => setClave(e.target.value)}
                  />
                </div>
                <div>
                  <label className="etiqueta" htmlFor="repetida">{t.acceso.repetila}</label>
                  <input
                    id="repetida" type="password" className="campo" required minLength={6}
                    autoComplete="new-password" placeholder={t.acceso.laMismaDeArriba}
                    value={repetida} onChange={(e) => setRepetida(e.target.value)}
                  />
                </div>

                {error && (
                  <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
                    {error}
                  </p>
                )}

                <button type="submit" className="boton-principal w-full py-3" disabled={cargando}>
                  {cargando ? t.comun.guardando : t.acceso.guardarYEntrar}
                </button>
              </form>
            </>
          ))}
        </div>
      </div>
    </main>
  );
}
