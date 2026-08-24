'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { COOKIE_EMPRESA } from '@/lib/constantes';

export default function PaginaEmpezar() {
  const router = useRouter();
  const [pestania, setPestania] = useState<'crear' | 'unirme'>('crear');
  const [nombre, setNombre] = useState('');
  const [moneda, setMoneda] = useState('PYG');
  const [codigo, setCodigo] = useState('');
  const [miNombre, setMiNombre] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  function activar(empresaId: string) {
    document.cookie = `${COOKIE_EMPRESA}=${empresaId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.push('/panel');
    router.refresh();
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const supabase = clienteNavegador();
      const { data, error } = await supabase.rpc('crear_empresa', {
        p_nombre: nombre.trim(),
        p_moneda: moneda,
        p_nombre_usuario: miNombre.trim() || null,
        // La zona del navegador. Decide qué día es "hoy" para el cierre y la
        // racha: un negocio en São Paulo con la hora de Asunción vería el
        // cierre del día equivocado durante una hora todas las noches. Si el
        // navegador no la sabe, la base pone Asunción y se corrige en Ajustes.
        p_zona: zonaDelNavegador(),
      });
      if (error) throw error;
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
      const { data, error } = await supabase.rpc('unirse_empresa', {
        p_codigo: codigo.trim().toUpperCase(),
        p_nombre_usuario: miNombre.trim() || null,
      });
      if (error) throw error;
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
      <div className="w-full max-w-[440px] aparecer">
        <div className="mb-7 flex items-center gap-2.5 text-white">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-verde text-lg font-black">o</span>
          <span className="text-lg font-bold tracking-tight">orden</span>
        </div>

        <div className="tarjeta p-6">
          <p className="titulo-seccion">Primer paso</p>
          <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight">Conectá tu negocio.</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-tinta/60">
            Creá tu empresa o sumate a una con el código que te pasaron.
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
                {p === 'crear' ? 'Crear empresa' : 'Unirme con código'}
              </button>
            ))}
          </div>

          {pestania === 'crear' ? (
            <form onSubmit={crear} className="mt-5 space-y-4">
              <div>
                <label className="etiqueta" htmlFor="nombre">Nombre del negocio</label>
                <input id="nombre" className="campo" required maxLength={60}
                  placeholder="Ej. Perfumería Aurora" value={nombre}
                  onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div>
                <label className="etiqueta" htmlFor="moneda">Moneda</label>
                <select id="moneda" className="campo" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                  <option value="PYG">Guaraníes (Gs.)</option>
                  <option value="USD">Dólares (US$)</option>
                  <option value="ARS">Pesos argentinos ($)</option>
                  <option value="BRL">Reales (R$)</option>
                  <option value="EUR">Euros (€)</option>
                </select>
              </div>
              <div>
                <label className="etiqueta" htmlFor="mi-nombre">Tu nombre</label>
                <input id="mi-nombre" className="campo" maxLength={40} placeholder="Cómo te ven tus colaboradores"
                  value={miNombre} onChange={(e) => setMiNombre(e.target.value)} />
              </div>
              {error && <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}
              <button className="boton-principal w-full py-3" disabled={cargando}>
                {cargando ? 'Creando…' : 'Crear y empezar'}
              </button>
            </form>
          ) : (
            <form onSubmit={unirme} className="mt-5 space-y-4">
              <div>
                <label className="etiqueta" htmlFor="codigo">Código de la empresa</label>
                <input id="codigo" className="campo font-mono uppercase tracking-widest" required maxLength={12}
                  placeholder="A7F2K9P1" autoCapitalize="characters" value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className="etiqueta" htmlFor="mi-nombre-2">Tu nombre</label>
                <input id="mi-nombre-2" className="campo" maxLength={40} placeholder="Para que sepan quién cargó cada venta"
                  value={miNombre} onChange={(e) => setMiNombre(e.target.value)} />
              </div>
              {error && <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}
              <button className="boton-principal w-full py-3" disabled={cargando}>
                {cargando ? 'Entrando…' : 'Unirme'}
              </button>
            </form>
          )}

          <button type="button" onClick={salir} className="mt-5 w-full text-center text-[13px] font-semibold text-tinta/45 hover:text-tinta">
            Cerrar sesión
          </button>
        </div>
      </div>
    </main>
  );
}

/**
 * La zona horaria que informa el navegador, o Asunción si no la sabe.
 *
 * Se manda al crear la empresa. La persona la puede corregir después en
 * Ajustes; esto solo evita que el 99% de los casos tengan que hacerlo.
 */
function zonaDelNavegador(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Asuncion';
  } catch {
    return 'America/Asuncion';
  }
}
