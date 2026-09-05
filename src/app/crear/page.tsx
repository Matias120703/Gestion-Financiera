'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { COOKIE_EMPRESA } from '@/lib/constantes';
import { LISTA_RUBROS } from '@/lib/rubros';
import CampoClave from '@/components/CampoClave';
import DatosDelNegocio from '@/components/DatosDelNegocio';
import {
  DATOS_VACIOS, guardarPendiente, limpiarPendiente, telefonoLimpio, telefonoValido,
  zonaDelNavegador, type DatosRegistro,
} from '@/lib/registro';
import { useTextos } from '@/i18n/cliente';
import { Marca } from '@/components/Marca';

/**
 * CREAR LA CUENTA, EN DOS PASOS
 *
 * El orden de estos dos pasos es la decisión de toda la pantalla.
 *
 * Antes se pedía correo y contraseña primero. O sea que lo primero que veía
 * alguien que llegó de un video de TikTok era un pedido de contraseña, sin
 * haber tocado nada todavía. Es la pregunta más cara que se puede hacer al
 * principio: quien duda, se va justo ahí.
 *
 * Ahora contesta primero cosas que ya sabe de memoria —cómo se llama, a qué
 * se dedica, cómo nos encontró—, y recién cuando ya invirtió medio minuto
 * aparece el correo y la contraseña. No es un truco: para ese momento la
 * persona ya vio que el producto entiende de qué trabaja.
 *
 * De paso, esas respuestas son las únicas que vas a tener. Un teléfono que
 * no se pregunta en el registro no se pregunta nunca.
 */
export default function PaginaCrear() {
  const router = useRouter();
  const t = useTextos();

  /**
   * EL CAMINO DEL INVITADO
   *
   * Sin esto, registrarse SIEMPRE creaba un negocio. Un barbero al que su
   * jefe le pasó un código tenía que inventarse una peluquería propia —con
   * nombre, rubro y teléfono— para poder llegar a la pantalla donde está el
   * campo del código. La mitad no lo iba a hacer, y la otra mitad iba a
   * terminar con una empresa fantasma en la base.
   *
   * Con `invitado` en verdadero no se pregunta nada del negocio y no se crea
   * ninguna empresa: se crea el acceso y se va derecho a poner el código.
   */
  const [invitado, setInvitado] = useState(false);
  const [paso, setPaso] = useState<1 | 2>(1);
  const [datos, setDatos] = useState<DatosRegistro>(DATOS_VACIOS);
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cambiar = (parcial: Partial<DatosRegistro>) =>
    setDatos((d) => ({ ...d, ...parcial }));

  /*
   * DE DÓNDE VINO: `?para=personal` o `?para=negocio`.
   *
   * Las tarjetas de la portada dicen «Para tu negocio» y «Para vos», y quien
   * toca una ya contestó esa pregunta. Volvérsela a hacer en el formulario le
   * hace dudar de si el botón hizo algo.
   *
   * Se lee de `window.location` y no con `useSearchParams` a propósito: ese
   * hook obliga a envolver la página en un Suspense para poder compilarla, y
   * no vale la pena por un parámetro opcional. Si no viene, o viene
   * cualquier otra cosa, queda el valor de siempre.
   */
  useEffect(() => {
    const para = new URLSearchParams(window.location.search).get('para');
    if (para === 'personal') cambiar({ tipoCuenta: 'personal' });
  }, []);

  function seguir(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!datos.nombre.trim()) {
      setError(datos.tipoCuenta === 'personal' ? t.registro.faltaNombreCuenta : t.registro.faltaNegocio);
      return;
    }
    if (!datos.miNombre.trim()) {
      setError(t.registro.faltaNombre);
      return;
    }
    if (!telefonoValido(datos.telefono)) {
      setError(t.registro.telefonoRaro);
      return;
    }

    // Se guarda ANTES de pasar de pantalla: si el correo pide confirmación,
    // la persona se va a su bandeja y vuelve por un enlace en otra pestaña.
    guardarPendiente(datos);
    setPaso(2);
    window.scrollTo({ top: 0 });
  }

  async function crear(e: React.FormEvent) {
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
      const { data, error: errorAlta } = await supabase.auth.signUp({
        email: email.trim(),
        password: clave,
        // Si hay confirmación por correo, el enlace tiene que volver a
        // /empezar y no al panel: la empresa todavía no existe, y /empezar
        // sabe recuperar lo que contestó en el primer paso.
        options: { emailRedirectTo: `${window.location.origin}/empezar` },
      });
      if (errorAlta) throw errorAlta;

      // Quien viene por un código no crea nada: va derecho a pegarlo. Crear
      // una empresa para él y después meterlo en otra lo dejaría con un
      // negocio vacío colgando para siempre.
      if (invitado) {
        limpiarPendiente();
        if (data.session) {
          router.push('/empezar?unirme=1');
          router.refresh();
        } else {
          setAviso(t.acceso.confirmaTuCorreo);
          setCargando(false);
        }
        return;
      }

      // Sin confirmación de correo, la sesión viene en el acto y se puede
      // crear la empresa acá mismo. Es el camino de casi todos.
      if (data.session) {
        const { data: empresaId, error: errorEmpresa } = await supabase.rpc('crear_empresa', {
          p_nombre: datos.nombre.trim(),
          p_moneda: datos.moneda,
          p_nombre_usuario: datos.miNombre.trim() || null,
          p_zona: zonaDelNavegador(),
          p_tipo_cuenta: datos.tipoCuenta,
          p_rubro: datos.tipoCuenta === 'personal' ? 'comercio' : datos.rubro,
          p_como_nos_conocio: datos.comoNosConocio,
          p_telefono: telefonoLimpio(datos.telefono),
          p_se_dedica: datos.seDedica.trim(),
        });
        if (errorEmpresa) throw errorEmpresa;

        limpiarPendiente();
        document.cookie =
          `${COOKIE_EMPRESA}=${empresaId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        router.push('/panel');
        router.refresh();
        return;
      }

      // Con confirmación: las respuestas quedan guardadas y /empezar las
      // levanta cuando vuelva por el enlace del correo.
      setAviso(t.acceso.confirmaTuCorreo);
      setCargando(false);
    } catch (err: any) {
      const mensaje: string = err?.message ?? 'No se pudo crear la cuenta.';
      if (/already registered/i.test(mensaje)) setError(t.acceso.yaRegistrado);
      else setError(mensaje);
      setCargando(false);
    }
  }

  const rubroNombre = LISTA_RUBROS.find((r) => r.clave === datos.rubro)?.nombre ?? '';

  return (
    <main className="flex min-h-screen items-center justify-center bg-tinta px-4 py-10">
      <div className="w-full max-w-[520px] aparecer">
        <Link href="/" className="mb-7 flex items-center gap-2.5 text-white">
          <Marca clase="h-10 w-10" sobreOscuro />
          <span className="text-lg font-bold tracking-tight">Orden</span>
        </Link>

        <div className="tarjeta overflow-hidden">
          {/* La barra de progreso no es adorno: dice que esto se termina, y
              cuándo. Un formulario sin final visible se abandona más. */}
          <div className="h-1 bg-arena">
            <div
              className="h-full bg-verde transition-all duration-300"
              style={{ width: invitado || paso === 2 ? '100%' : '50%' }}
            />
          </div>

          <div className="p-6">
            <p className="titulo-seccion">
              {invitado ? t.registro.sumarteAlEquipo : t.registro.paso(paso, 2)}
            </p>

            {paso === 1 && !invitado ? (
              <>
                <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight">
                  {t.registro.contanos}
                </h1>
                <p className="mt-2 text-[15px] leading-relaxed text-tinta/60">
                  {t.registro.contanosBajada}
                </p>

                <form onSubmit={seguir} className="mt-6" noValidate>
                  <DatosDelNegocio datos={datos} alCambiar={cambiar} />

                  {error && (
                    <p role="alert" className="mt-4 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
                      {error}
                    </p>
                  )}

                  <button type="submit" className="boton-principal mt-6 w-full py-3">
                    {t.comun.seguir}
                  </button>
                </form>

                {/* Para quien no viene a abrir un negocio sino a sumarse al de
                    otro. Va acá abajo y no arriba a propósito: la mayoría
                    crea su propia cuenta, y este camino es la excepción. */}
                <div className="mt-5 border-t border-borde pt-4 text-center">
                  <p className="text-[13.5px] text-tinta/55">{t.registro.teInvitaron}</p>
                  <button
                    type="button"
                    className="boton-texto mt-1"
                    onClick={() => { setInvitado(true); setPaso(2); setError(''); }}
                  >
                    {t.registro.entrarConCodigo}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight">
                  {invitado ? t.registro.sumateAlEquipo : t.registro.tuAcceso}
                </h1>
                <p className="mt-2 text-[15px] leading-relaxed text-tinta/60">
                  {invitado ? t.registro.sumateAlEquipoBajada : t.registro.tuAccesoBajada}
                </p>

                {invitado ? (
                  <div className="mt-5 rounded-xl bg-verde-claro p-3.5">
                    <p className="text-[13px] leading-relaxed text-verde-fuerte">
                      {t.registro.despuesElCodigo}
                    </p>
                    <button
                      type="button" className="boton-texto mt-1.5"
                      onClick={() => { setInvitado(false); setPaso(1); setError(''); setAviso(''); }}
                    >
                      {t.registro.prefieroCrearNegocio}
                    </button>
                  </div>
                ) : (
                  /* Lo que ya contestó, a la vista: que vea que no se perdió
                     nada de lo del paso anterior. */
                  <div className="mt-5 rounded-xl bg-arena p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="titulo-seccion">{t.registro.revisaDatos}</p>
                      <p className="mt-1 truncate text-[14.5px] font-bold">{datos.nombre}</p>
                      <p className="mt-0.5 truncate text-[12.5px] text-tinta/55">
                        {[
                          datos.miNombre,
                          datos.tipoCuenta === 'personal' ? t.pantallas.paraMi : rubroNombre,
                          datos.telefono,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button" className="boton-texto shrink-0"
                      onClick={() => { setPaso(1); setError(''); setAviso(''); }}
                    >
                      {t.registro.editar}
                    </button>
                  </div>
                </div>
                )}

                <form onSubmit={crear} className="mt-5 space-y-4" noValidate>
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
                    autoComplete="new-password"
                  />

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
                    {cargando ? t.registro.creandoCuenta : t.registro.crearMiCuenta}
                  </button>
                </form>
              </>
            )}

            <p className="mt-5 text-center text-sm text-tinta/60">
              {t.acceso.yaTenesCuenta}{' '}
              <Link href="/ingresar" className="boton-texto">{t.acceso.entrar}</Link>
            </p>
          </div>
        </div>

        <p className="mt-5 text-center text-[13px] leading-relaxed text-white/40">
          {t.acceso.separacion}
        </p>
      </div>
    </main>
  );
}
