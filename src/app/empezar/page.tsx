'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { COOKIE_EMPRESA } from '@/lib/constantes';
import DatosDelNegocio from '@/components/DatosDelNegocio';
import {
  DATOS_VACIOS, leerPendiente, limpiarPendiente, telefonoLimpio, telefonoValido,
  zonaDelNavegador, type DatosRegistro,
} from '@/lib/registro';
import { useTextos } from '@/i18n/cliente';
import { Marca } from '@/components/Marca';

/**
 * ARMAR LA EMPRESA DE ALGUIEN QUE YA TIENE SESIÓN
 *
 * Registrarse de cero pasa por `/crear`, que pregunta todo esto ANTES del
 * correo y la contraseña. Esta pantalla es la que queda para los tres casos
 * en que la persona ya entró pero todavía no tiene empresa:
 *
 *   · volvió por el enlace de confirmación del correo, así que la sesión
 *     recién existe ahora;
 *   · se suma a una empresa que ya existe con un código;
 *   · algo se cortó en el medio y quedó con cuenta pero sin negocio.
 *
 * En el primer caso las respuestas del primer paso están guardadas en el
 * navegador: se levantan y el formulario aparece completo. Volver a
 * preguntarle lo mismo a alguien que ya lo contestó es la forma más segura
 * de que abandone.
 */
export default function PaginaEmpezar() {
  const router = useRouter();
  const t = useTextos();
  const [pestania, setPestania] = useState<'crear' | 'unirme'>('crear');
  const [datos, setDatos] = useState<DatosRegistro>(DATOS_VACIOS);
  const [codigo, setCodigo] = useState('');
  const [nombreParaUnirse, setNombreParaUnirse] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  // Lo que contestó antes de confirmar el correo, si llegó por ese camino.
  useEffect(() => {
    const guardado = leerPendiente();
    if (guardado) setDatos(guardado);

    // Quien viene de registrarse como invitado ya dijo a qué vino: se abre
    // directo en la pestaña del código. Se lee de la URL y no con
    // useSearchParams para no obligar a envolver la página en un Suspense.
    if (new URLSearchParams(window.location.search).get('unirme')) {
      setPestania('unirme');
    }
  }, []);

  const cambiar = (parcial: Partial<DatosRegistro>) =>
    setDatos((d) => ({ ...d, ...parcial }));

  function activar(empresaId: string) {
    limpiarPendiente();
    document.cookie = `${COOKIE_EMPRESA}=${empresaId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.push('/panel');
    router.refresh();
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!datos.nombre.trim()) {
      setError(datos.tipoCuenta === 'personal' ? t.registro.faltaNombreCuenta : t.registro.faltaNegocio);
      return;
    }
    if (!telefonoValido(datos.telefono)) {
      setError(t.registro.telefonoRaro);
      return;
    }

    setCargando(true);
    try {
      const supabase = clienteNavegador();
      const { data, error: fallo } = await supabase.rpc('crear_empresa', {
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
      if (fallo) throw fallo;
      activar(data as string);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo crear la empresa.');
      setCargando(false);
    }
  }

  async function unirme(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const supabase = clienteNavegador();
      const { data, error: fallo } = await supabase.rpc('unirse_empresa', {
        p_codigo: codigo.trim().toUpperCase(),
        p_nombre_usuario: nombreParaUnirse.trim() || null,
      });
      if (fallo) throw fallo;
      activar(data as string);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo unir a la empresa.');
      setCargando(false);
    }
  }

  async function salir() {
    const supabase = clienteNavegador();
    await supabase.auth.signOut();
    router.push('/ingresar');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-tinta px-4 py-10">
      <div className="w-full max-w-[520px] aparecer">
        <div className="mb-7 flex items-center gap-2.5 text-white">
          <Marca clase="h-10 w-10" sobreOscuro />
          <span className="text-lg font-bold tracking-tight">Orden</span>
        </div>

        <div className="tarjeta p-6">
          <p className="titulo-seccion">{t.pantallas.primerPaso}</p>
          <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight">{t.pantallas.empecemos}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-tinta/60">
            {t.pantallas.creaTuCuenta}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-arena p-1">
            {(['crear', 'unirme'] as const).map((p) => (
              <button
                key={p} type="button"
                onClick={() => { setPestania(p); setError(''); }}
                className={`rounded-lg py-2 text-sm font-semibold transition ${
                  pestania === p ? 'bg-white text-tinta shadow-sm' : 'text-tinta/55'
                }`}
              >
                {p === 'crear' ? t.pantallas.crearEmpresa : t.pantallas.unirmeConCodigo}
              </button>
            ))}
          </div>

          {pestania === 'crear' ? (
            <form onSubmit={crear} className="mt-5" noValidate>
              <DatosDelNegocio datos={datos} alCambiar={cambiar} />

              {error && (
                <p role="alert" className="mt-4 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">
                  {error}
                </p>
              )}

              <button className="boton-principal mt-6 w-full py-3" disabled={cargando}>
                {cargando ? t.registro.creandoCuenta : t.pantallas.crearYEmpezar}
              </button>
            </form>
          ) : (
            <form onSubmit={unirme} className="mt-5 space-y-4">
              <div>
                <label className="etiqueta" htmlFor="codigo">{t.pantallas.codigoEmpresa}</label>
                <input id="codigo" className="campo font-mono uppercase tracking-widest" required maxLength={12}
                  placeholder="A7F2K9P1"  /* un código, no un texto: no se traduce */ autoCapitalize="characters" value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="etiqueta" htmlFor="mi-nombre-2">{t.pantallas.tuNombre}</label>
                <input id="mi-nombre-2" className="campo" maxLength={40} placeholder={t.pantallas.quienCargo}
                  value={nombreParaUnirse} onChange={(e) => setNombreParaUnirse(e.target.value)} />
              </div>
              {error && <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}
              <button className="boton-principal w-full py-3" disabled={cargando}>
                {cargando ? t.pantallas.entrando : t.pantallas.unirme}
              </button>
            </form>
          )}

          <button type="button" onClick={salir} className="mt-5 w-full text-center text-[13px] font-semibold text-tinta/45 hover:text-tinta">
            {t.pantallas.cerrarSesion}
          </button>
        </div>
      </div>
    </main>
  );
}
